import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PayslipAuthorizationService } from '../payslip-authorization.service';
import { PayslipEmailSenderService } from './payslip-email-sender.service';
import { PayslipDeliveryWorkerService } from './payslip-delivery-worker.service';
import { PayslipPdfRetentionPin } from '../pdf/payslip-pdf-reader.interface';
import { PayslipEmailDispatchController } from './payslip-email-dispatch.controller';
import {
  HrOfficerRole,
  PayslipPdfStatus,
  PayslipStatus,
} from '../../../generated/prisma/client';

describe('PayslipEmailDispatchController & PDF Gates', () => {
  let controller: PayslipEmailDispatchController;
  let prisma: any;
  let pinMock: any;
  let senderMock: any;

  beforeEach(async () => {
    prisma = {
      payslipBatch: { findUnique: jest.fn() },
      payslip: { findMany: jest.fn() },
      payslipPdf: { groupBy: jest.fn() },
      emailSuppression: { findMany: jest.fn().mockResolvedValue([]) },
      payslipEmailDispatch: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      payslipDelivery: { createMany: jest.fn() },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    pinMock = { pin: jest.fn().mockResolvedValue(undefined) };
    senderMock = {
      isProductionAccessEnabled: jest.fn().mockResolvedValue(true),
      getIsConfigured: jest.fn().mockReturnValue(true),
      isRecipientVerifiedInSandbox: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PayslipEmailDispatchController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: PayslipAuthorizationService, useValue: { assertBatch: jest.fn() } },
        { provide: PayslipEmailSenderService, useValue: senderMock },
        { provide: PayslipDeliveryWorkerService, useValue: { claimAndProcessBatch: jest.fn() } },
        { provide: PayslipPdfRetentionPin, useValue: pinMock },
      ],
    }).compile();

    controller = module.get<PayslipEmailDispatchController>(
      PayslipEmailDispatchController,
    );
  });

  describe('PDF-Ready Gate on creation', () => {
    it('throws 409 PDF_NOT_READY with counts and capped staffIds if any PDF is not ready', async () => {
      prisma.payslipBatch.findUnique.mockResolvedValue({
        id: 'batch-1',
        accountingCompanyId: 'comp-1',
        payrollPeriodId: 'per-1',
      });

      prisma.payslip.findMany.mockImplementation((args: any) => {
        if (args?.select?.staffId) {
          // Returning non-ready staffIds
          return Promise.resolve([{ staffId: 'EMP002' }]);
        }
        return Promise.resolve([
          { id: 'slip-1', status: PayslipStatus.APPROVED, employeeId: 'emp-1' },
          { id: 'slip-2', status: PayslipStatus.APPROVED, employeeId: 'emp-2' },
        ]);
      });

      prisma.payslipPdf.groupBy.mockResolvedValue([
        { status: PayslipPdfStatus.READY, _count: { id: 1 } },
        { status: PayslipPdfStatus.PENDING, _count: { id: 1 } },
      ]);

      await expect(
        controller.createDispatch(
          'batch-1',
          {},
          { id: 'admin-1', role: HrOfficerRole.ADMIN, email: 'a@test.com', fullName: 'Admin' },
        ),
      ).rejects.toMatchObject({
        response: {
          statusCode: HttpStatus.CONFLICT,
          code: 'PDF_NOT_READY',
          details: {
            counts: { total: 2, ready: 1, pending: 1, failed: 0, missing: 0 },
            staffIds: ['EMP002'],
          },
        },
      });
    });
  });

  describe('Release endpoint', () => {
    it('calls pin once with right ids and minDays on successful release', async () => {
      prisma.payslipEmailDispatch.findUnique.mockResolvedValue({
        id: 'disp-1',
        payslipBatchId: 'batch-1',
        status: 'PENDING_APPROVAL',
        deliveries: [
          { payslipId: 'slip-1', recipientEmailSnapshot: 'emp1@test.com', status: 'PENDING' },
          { payslipId: 'slip-2', recipientEmailSnapshot: 'emp2@test.com', status: 'PENDING' },
        ],
      });

      // All PDFs READY
      prisma.payslipPdf.groupBy.mockResolvedValue([
        { status: PayslipPdfStatus.READY, _count: { id: 2 } },
      ]);

      prisma.payslipEmailDispatch.update.mockResolvedValue({ id: 'disp-1', status: 'APPROVED' });

      await controller.releaseDispatch(
        'batch-1',
        'disp-1',
        { id: 'admin-1', role: HrOfficerRole.ADMIN, email: 'a@test.com', fullName: 'Admin' },
      );

      expect(pinMock.pin).toHaveBeenCalledWith(['slip-1', 'slip-2'], 3);
      expect(prisma.payslipEmailDispatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'APPROVED' }),
        }),
      );
    });
  });
});
