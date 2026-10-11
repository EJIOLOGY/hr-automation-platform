import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { SendOutcome } from './payslip-email-sender.service';

export interface DispatchHealthConfig {
  cbWindow: number; // default 20
  cbThreshold: number; // default 0.5 (50%)
}

@Injectable()
export class DispatchHealthService {
  private readonly logger = new Logger(DispatchHealthService.name);

  // In-memory rolling window of last N attempts per dispatchId
  private dispatchAttempts: Map<string, Array<{ outcome: SendOutcome['kind']; timestamp: number }>> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Records a send attempt outcome and checks if the circuit breaker threshold is breached.
   * If breached (>= 50% failures across at least 10 attempts in a window of 20), pauses the dispatch.
   */
  async recordOutcomeAndCheckCircuitBreaker(
    dispatchId: string,
    outcome: SendOutcome,
    config: DispatchHealthConfig = { cbWindow: 20, cbThreshold: 0.5 },
  ): Promise<boolean> {
    if (!dispatchId) return false;

    let windowList = this.dispatchAttempts.get(dispatchId);
    if (!windowList) {
      windowList = [];
      this.dispatchAttempts.set(dispatchId, windowList);
    }

    windowList.push({ outcome: outcome.kind, timestamp: Date.now() });
    if (windowList.length > config.cbWindow) {
      windowList.shift();
    }

    if (windowList.length >= 10) {
      const failureCount = windowList.filter(
        (a) => a.outcome === 'TRANSIENT' || a.outcome === 'UNKNOWN' || a.outcome === 'CONFIG_ERROR',
      ).length;
      const failureRate = failureCount / windowList.length;

      if (failureRate >= config.cbThreshold) {
        this.logger.warn(
          `Circuit breaker triggered for dispatch ${dispatchId}: ${failureCount}/${windowList.length} (${(
            failureRate * 100
          ).toFixed(1)}%) failures. Pausing dispatch.`,
        );

        await this.prisma.payslipEmailDispatch.update({
          where: { id: dispatchId },
          data: {
            status: 'PAUSED',
            pauseReason: 'CIRCUIT_BREAKER',
          },
        });

        await this.auditService.log({
          actorType: 'SYSTEM',
          action: 'PAYSLIP_EMAIL_DISPATCH_PAUSED',
          entityType: 'PAYSLIP_EMAIL_DISPATCH',
          entityId: dispatchId,
          metadata: {
            reason: 'CIRCUIT_BREAKER',
            failureCount,
            totalAttemptsInWindow: windowList.length,
            failureRate,
          },
        });

        return true;
      }
    }

    return false;
  }

  /**
   * Checks bounce / complaint rates from SesNotificationEvent table.
   * Pauses on bounce rate >= 5% or complaint rate >= 0.1% of (delivered + bounced) events.
   */
  async checkBounceAndComplaintRates(dispatchId: string): Promise<boolean> {
    if (!dispatchId) return false;

    const deliveryIds = await this.prisma.payslipDelivery.findMany({
      where: { dispatchId },
      select: { id: true },
    });
    const ids = deliveryIds.map((d) => d.id);
    if (ids.length === 0) return false;

    const events = await this.prisma.sesNotificationEvent.findMany({
      where: { deliveryId: { in: ids } },
      select: { eventType: true },
    });

    const deliveredCount = events.filter((e) => e.eventType === 'Delivery').length;
    const bounceCount = events.filter((e) => e.eventType === 'Bounce').length;
    const complaintCount = events.filter((e) => e.eventType === 'Complaint').length;

    const totalBase = deliveredCount + bounceCount;
    if (totalBase < 10) return false;

    const bounceRate = bounceCount / totalBase;
    const complaintRate = complaintCount / totalBase;

    if (bounceRate >= 0.05 || complaintRate >= 0.001) {
      const reason = bounceRate >= 0.05 ? 'HIGH_BOUNCE_RATE' : 'HIGH_COMPLAINT_RATE';
      this.logger.warn(`Dispatch ${dispatchId} paused due to ${reason}: bounce=${bounceRate}, complaint=${complaintRate}`);

      await this.prisma.payslipEmailDispatch.update({
        where: { id: dispatchId },
        data: {
          status: 'PAUSED',
          pauseReason: reason,
        },
      });

      await this.auditService.log({
        actorType: 'SYSTEM',
        action: 'PAYSLIP_EMAIL_DISPATCH_PAUSED',
        entityType: 'PAYSLIP_EMAIL_DISPATCH',
        entityId: dispatchId,
        metadata: {
          reason,
          bounceRate,
          complaintRate,
          deliveredCount,
          bounceCount,
          complaintCount,
        },
      });

      return true;
    }

    return false;
  }
}
