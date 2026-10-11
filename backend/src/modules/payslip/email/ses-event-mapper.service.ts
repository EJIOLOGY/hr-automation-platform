import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import {
  EmailSuppressionReason,
  EmailSuppressionStatus,
  PayslipDeliveryStatus,
} from '../../../generated/prisma/client';
import { maskEmail } from '../../employee/email-utils';

type DeliveryWithEmployee = Prisma.PayslipDeliveryGetPayload<{
  include: { employee: true };
}>;

// State precedence hierarchy: higher number = more advanced terminal/live state
// Never move backwards (e.g. DELIVERED -> SUBMITTED)
const STATUS_PRECEDENCE: Record<PayslipDeliveryStatus, number> = {
  PENDING: 1,
  PROCESSING: 2,
  SUBMISSION_UNKNOWN: 2,
  RETRY_SCHEDULED: 2,
  SUBMITTED: 3,
  DELIVERY_DELAYED: 3,
  DELIVERED: 4,
  BOUNCED_SOFT: 4,
  BOUNCED_HARD: 4,
  COMPLAINED: 4,
  REJECTED: 4,
  FAILED: 4,
  SKIPPED: 4,
  CANCELLED: 4,
};

@Injectable()
export class SesEventMapperService {
  private readonly logger = new Logger(SesEventMapperService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Applies an SES notification event to PayslipDelivery and EmailSuppression.
   */
  async processEvent(sesNotificationEventId: string): Promise<void> {
    const event = await this.prisma.sesNotificationEvent.findUnique({
      where: { id: sesNotificationEventId },
    });

    if (!event || event.processedAt) {
      return;
    }

    const payload = event.minimalPayload as any;
    const sesEvent = payload?.eventType ? payload : payload?.mail ? payload : null;
    const eventType = event.eventType;

    // Locate delivery by deliveryId tag first, then by sesMessageId
    let deliveryId = event.deliveryId;
    const sesMessageId = event.sesMessageId;

    if (!deliveryId && sesEvent?.mail?.tags?.deliveryId) {
      const tagVal = sesEvent.mail.tags.deliveryId;
      deliveryId = Array.isArray(tagVal) ? tagVal[0] : tagVal;
    }

    let delivery: DeliveryWithEmployee | null = null;
    if (deliveryId) {
      delivery = await this.prisma.payslipDelivery.findUnique({
        where: { id: deliveryId },
        include: { employee: true },
      });
    }

    if (!delivery && sesMessageId) {
      delivery = await this.prisma.payslipDelivery.findFirst({
        where: { sesMessageId },
        include: { employee: true },
      });
    }

    if (!delivery) {
      // Unknown delivery; mark processed and return
      await this.prisma.sesNotificationEvent.update({
        where: { id: event.id },
        data: {
          processedAt: new Date(),
          processingOutcome: 'DELIVERY_NOT_FOUND',
        },
      });
      return;
    }

    // Determine target status and side effects
    let targetStatus: PayslipDeliveryStatus | null = null;
    let deliveredAt: Date | null = null;
    let bouncedAt: Date | null = null;
    let addSuppression: { reason: EmailSuppressionReason; detail?: string } | null = null;

    if (eventType === 'Delivery') {
      if (
        delivery.status === PayslipDeliveryStatus.SUBMITTED ||
        delivery.status === PayslipDeliveryStatus.DELIVERY_DELAYED ||
        delivery.status === PayslipDeliveryStatus.SUBMISSION_UNKNOWN
      ) {
        targetStatus = PayslipDeliveryStatus.DELIVERED;
        deliveredAt = new Date(event.eventTimestamp || Date.now());
      }
    } else if (eventType === 'DeliveryDelay') {
      if (delivery.status === PayslipDeliveryStatus.SUBMITTED) {
        targetStatus = PayslipDeliveryStatus.DELIVERY_DELAYED;
      }
    } else if (eventType === 'Bounce') {
      const bounceType = sesEvent?.bounce?.bounceType || payload?.bounce?.bounceType;
      bouncedAt = new Date(event.eventTimestamp || Date.now());

      if (bounceType === 'Permanent') {
        targetStatus = PayslipDeliveryStatus.BOUNCED_HARD;
        addSuppression = {
          reason: EmailSuppressionReason.HARD_BOUNCE,
          detail: sesEvent?.bounce?.bounceSubType || 'Permanent bounce',
        };
      } else {
        targetStatus = PayslipDeliveryStatus.BOUNCED_SOFT;
      }
    } else if (eventType === 'Complaint') {
      targetStatus = PayslipDeliveryStatus.COMPLAINED;
      addSuppression = {
        reason: EmailSuppressionReason.COMPLAINT,
        detail: sesEvent?.complaint?.complaintFeedbackType || 'Spam complaint',
      };
    } else if (eventType === 'Reject') {
      targetStatus = PayslipDeliveryStatus.REJECTED;
    } else if (eventType === 'RenderingFailure') {
      targetStatus = PayslipDeliveryStatus.FAILED;
    }

    // Check precedence rule: never move backwards
    const currentPrecedence = STATUS_PRECEDENCE[delivery.status] || 0;
    const targetPrecedence = targetStatus ? STATUS_PRECEDENCE[targetStatus] || 0 : 0;

    const canTransition = targetStatus && targetPrecedence >= currentPrecedence;

    if (canTransition && targetStatus) {
      await this.prisma.payslipDelivery.update({
        where: { id: delivery.id },
        data: {
          status: targetStatus,
          lastEventAt: new Date(),
          ...(deliveredAt ? { deliveredAt } : {}),
          ...(bouncedAt ? { bouncedAt } : {}),
        },
      });

      // Handle active suppression addition/refresh
      if (addSuppression) {
        const email = delivery.recipientEmailSnapshot || delivery.employee?.email;
        if (email) {
          const emailNormalized = email.trim().toLowerCase();
          const existingSup = await this.prisma.emailSuppression.findFirst({
            where: {
              emailNormalized,
              status: EmailSuppressionStatus.ACTIVE,
            },
          });

          if (!existingSup) {
            await this.prisma.emailSuppression.create({
              data: {
                emailNormalized,
                emailMasked: maskEmail(emailNormalized),
                reason: addSuppression.reason,
                status: EmailSuppressionStatus.ACTIVE,
                detail: addSuppression.detail,
                createdFromDeliveryId: delivery.id,
              },
            });
          }
        }
      }
    }

    await this.prisma.sesNotificationEvent.update({
      where: { id: event.id },
      data: {
        deliveryId: delivery.id,
        processedAt: new Date(),
        processingOutcome: canTransition ? `APPLIED_${targetStatus}` : 'IGNORED_PRECEDENCE',
      },
    });

    // Refresh dispatch status if finished
    if (delivery.dispatchId) {
      await this.refreshDispatchCountersAndStatus(delivery.dispatchId);
    }
  }

  /**
   * Refreshes dispatch counters set-based and marks finished if all deliveries are terminal.
   */
  async refreshDispatchCountersAndStatus(dispatchId: string): Promise<void> {
    const counts = await this.prisma.payslipDelivery.groupBy({
      by: ['status'],
      where: { dispatchId },
      _count: { id: true },
    });

    const activeStatuses: PayslipDeliveryStatus[] = [
      PayslipDeliveryStatus.PENDING,
      PayslipDeliveryStatus.PROCESSING,
      PayslipDeliveryStatus.RETRY_SCHEDULED,
    ];

    const hasActive = counts.some((c) => activeStatuses.includes(c.status));
    if (hasActive) {
      return;
    }

    const failureStatuses: PayslipDeliveryStatus[] = [
      PayslipDeliveryStatus.FAILED,
      PayslipDeliveryStatus.BOUNCED_HARD,
      PayslipDeliveryStatus.REJECTED,
      PayslipDeliveryStatus.SUBMISSION_UNKNOWN,
    ];
    const hasFailures = counts.some((c) => failureStatuses.includes(c.status));

    await this.prisma.payslipEmailDispatch.update({
      where: { id: dispatchId },
      data: {
        status: hasFailures ? 'COMPLETED_WITH_FAILURES' : 'COMPLETED',
        completedAt: new Date(),
      },
    });
  }
}
