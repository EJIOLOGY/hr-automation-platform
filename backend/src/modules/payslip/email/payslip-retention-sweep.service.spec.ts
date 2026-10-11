import { PayslipRetentionSweepService } from './payslip-retention-sweep.service';

describe('PayslipRetentionSweepService', () => {
  function build() {
    const tx = {
      payslipPdf: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      payslipPdfBlob: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      payslipDeliveryAttempt: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payslipDelivery: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      sesNotificationEvent: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma: any = {
      payslipPdf: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'p1' }, { id: 'p2' }])
          .mockResolvedValue([]),
      },
      payslipPdfBlob: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'b1' }, { id: 'b2' }])
          .mockResolvedValue([]),
      },
      payslipDelivery: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'd1' }])
          .mockResolvedValue([]),
      },
      sesNotificationEvent: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'e1' }])
          .mockResolvedValue([]),
      },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    return {
      service: new PayslipRetentionSweepService(prisma, audit as any),
      prisma,
      tx,
      audit,
    };
  }

  it('deletes the stored PDF bytes (blobs) as well as the PDF rows', async () => {
    const { service, tx } = build();
    const result = await service.runSweep();
    expect(tx.payslipPdf.deleteMany).toHaveBeenCalled();
    expect(tx.payslipPdfBlob.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['b1', 'b2'] }, pdfs: { none: {} } },
    });
    expect(result.deletedBlobs).toBe(2);
  });

  it('only selects unreferenced, expired blobs', async () => {
    const { service, prisma } = build();
    await service.runSweep();
    const where = prisma.payslipPdfBlob.findMany.mock.calls[0][0].where;
    expect(where.pdfs).toEqual({ none: {} });
    expect(where.createdAt.lt).toBeInstanceOf(Date);
  });

  it('removes delivery records in every final state but never in-flight or unresolved ones', async () => {
    const { service, prisma } = build();
    await service.runSweep();
    const statuses: string[] =
      prisma.payslipDelivery.findMany.mock.calls[0][0].where.status.in;
    for (const s of [
      'DELIVERED',
      'BOUNCED_HARD',
      'COMPLAINED',
      'REJECTED',
      'SUBMITTED',
      'FAILED',
    ]) {
      expect(statuses).toContain(s);
    }
    for (const s of [
      'PENDING',
      'PROCESSING',
      'RETRY_SCHEDULED',
      'SUBMISSION_UNKNOWN',
    ]) {
      expect(statuses).not.toContain(s);
    }
  });

  it('writes one audit entry per sweep', async () => {
    const { service, audit } = build();
    await service.runSweep();
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log.mock.calls[0][0].action).toBe(
      'PAYSLIP_RETENTION_SWEEP_EXECUTED',
    );
  });
});
