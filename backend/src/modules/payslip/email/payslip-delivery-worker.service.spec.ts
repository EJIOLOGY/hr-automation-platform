import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { PayslipDeliveryWorkerService } from './payslip-delivery-worker.service';
import { PayslipEmailSenderService } from './payslip-email-sender.service';
import { DispatchHealthService } from './dispatch-health.service';
import { PayslipDeliveryStatus } from '../../../generated/prisma/client';

describe('PayslipDeliveryWorkerService', () => {
  let worker: PayslipDeliveryWorkerService;
  let prisma: any;
  let sender: any;
  let health: any;

  beforeEach(async () => {
    prisma = {
      payslipDelivery: {
        updateMany: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      payslipEmailDispatch: {
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn(),
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    sender = {
      sendDelivery: jest.fn(),
    };

    health = {
      recordOutcomeAndCheckCircuitBreaker: jest.fn().mockResolvedValue(false),
      checkBounceAndComplaintRates: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayslipDeliveryWorkerService,
        { provide: PrismaService, useValue: prisma },
        { provide: PayslipEmailSenderService, useValue: sender },
        { provide: DispatchHealthService, useValue: health },
      ],
    }).compile();

    worker = module.get<PayslipDeliveryWorkerService>(
      PayslipDeliveryWorkerService,
    );
  });

  describe('recoverStuckProcessing', () => {
    it('recovers stuck PROCESSING deliveries to SUBMISSION_UNKNOWN, never PENDING', async () => {
      prisma.payslipDelivery.updateMany.mockResolvedValue({ count: 2 });

      await worker.recoverStuckProcessing();

      expect(prisma.payslipDelivery.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: PayslipDeliveryStatus.PROCESSING,
          }),
          data: expect.objectContaining({
            status: PayslipDeliveryStatus.SUBMISSION_UNKNOWN,
          }),
        }),
      );
    });
  });

  describe('applyOutcome', () => {
    it('sets SUBMISSION_UNKNOWN and does not reschedule on UNKNOWN outcome', async () => {
      prisma.payslipDelivery.findUnique.mockResolvedValue({ autoRetryCount: 0 });

      await worker.applyOutcome('del-1', 'disp-1', { kind: 'UNKNOWN', code: 'TIMEOUT' });

      expect(prisma.payslipDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'del-1' },
          data: expect.objectContaining({
            status: PayslipDeliveryStatus.SUBMISSION_UNKNOWN,
            nextAttemptAt: null,
          }),
        }),
      );
    });

    it('marks FAILED and does not retry on PERMANENT outcome', async () => {
      prisma.payslipDelivery.findUnique.mockResolvedValue({ autoRetryCount: 0 });

      await worker.applyOutcome('del-1', 'disp-1', { kind: 'PERMANENT', code: 'REJECTED' });

      expect(prisma.payslipDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'del-1' },
          data: expect.objectContaining({
            status: PayslipDeliveryStatus.FAILED,
            nextAttemptAt: null,
          }),
        }),
      );
    });

    it('marks a SUPPRESSED outcome SKIPPED (not FAILED), without retry, and moves it to the skipped count', async () => {
      prisma.payslipDelivery.findUnique.mockResolvedValue({ autoRetryCount: 0 });

      await worker.applyOutcome('del-1', 'disp-1', { kind: 'SUPPRESSED', code: 'SUPPRESSED_ADDRESS' });

      expect(prisma.payslipDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'del-1' },
          data: expect.objectContaining({
            status: PayslipDeliveryStatus.SKIPPED,
            skipReason: 'SUPPRESSED',
            nextAttemptAt: null,
          }),
        }),
      );
      expect(prisma.payslipEmailDispatch.updateMany).toHaveBeenCalledWith({
        where: { id: 'disp-1', recipientCount: { gt: 0 } },
        data: { recipientCount: { decrement: 1 }, skippedCount: { increment: 1 } },
      });
    });

    it('a suppressed-only dispatch completes WITHOUT failures', async () => {
      prisma.payslipDelivery.groupBy.mockResolvedValue([{ status: PayslipDeliveryStatus.SKIPPED, _count: { id: 2 } }]);
      await worker.updateDispatchStatusIfFinished('disp-1');
      expect(prisma.payslipEmailDispatch.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
      );
    });

    it('schedules retry for TRANSIENT outcome and marks FAILED after 3 retries', async () => {
      // First attempt (0 retries -> 1 min)
      prisma.payslipDelivery.findUnique.mockResolvedValue({ autoRetryCount: 0 });
      await worker.applyOutcome('del-1', 'disp-1', { kind: 'TRANSIENT', code: 'THROTTLED' });
      expect(prisma.payslipDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PayslipDeliveryStatus.RETRY_SCHEDULED,
            autoRetryCount: { increment: 1 },
          }),
        }),
      );

      // Third attempt (3 retries -> FAILED)
      prisma.payslipDelivery.findUnique.mockResolvedValue({ autoRetryCount: 3 });
      await worker.applyOutcome('del-1', 'disp-1', { kind: 'TRANSIENT', code: 'THROTTLED' });
      expect(prisma.payslipDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PayslipDeliveryStatus.FAILED,
            nextAttemptAt: null,
          }),
        }),
      );
    });
  });
});
