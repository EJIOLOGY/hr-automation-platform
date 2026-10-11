import { BadRequestException } from '@nestjs/common';
import { PayslipReadController } from './payslip-read.controller';

describe('PayslipReadController', () => {
  const actor: any = { id: 'u-1', fullName: 'Admin User', role: 'ADMIN' };

  function build() {
    const prisma: any = {
      payslipSettings: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockImplementation(async ({ create }: any) => ({
          ...create,
          updatedAt: new Date('2026-10-11T10:00:00Z'),
        })),
      },
      payslipEmailDispatch: {
        findMany: jest.fn().mockResolvedValue([{ id: 'disp-1' }]),
      },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const authorization = {
      assertBatch: jest.fn().mockResolvedValue(undefined),
    };
    return {
      controller: new PayslipReadController(
        prisma,
        audit as any,
        authorization as any,
      ),
      prisma,
      audit,
      authorization,
    };
  }

  it('returns the default variance threshold when nothing is saved', async () => {
    const { controller } = build();
    await expect(controller.getSettings()).resolves.toMatchObject({
      varianceThresholdPercent: 20,
    });
  });

  it.each([0, 101, 12.5, NaN])(
    'rejects variance threshold %p',
    async (value) => {
      const { controller } = build();
      await expect(
        controller.updateSettings(
          { varianceThresholdPercent: value as number },
          actor,
        ),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it('saves a valid threshold and writes an audit entry with before/after', async () => {
    const { controller, audit } = build();
    const res = await controller.updateSettings(
      { varianceThresholdPercent: 30 },
      actor,
    );
    expect(res.varianceThresholdPercent).toBe(30);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PAYSLIP_SETTINGS_UPDATED',
        metadata: { before: 20, after: 30 },
      }),
    );
  });

  it('activity trail covers the batch and its dispatches and drops non-whitelisted metadata', async () => {
    const { controller, prisma, authorization } = build();
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'a-1',
        actorType: 'HR_OFFICER',
        action: 'PAYSLIP_EMAIL_DISPATCH_CREATED',
        entityType: 'PAYSLIP_EMAIL_DISPATCH',
        entityId: 'disp-1',
        createdAt: new Date(),
        metadata: {
          recipientCount: 580,
          netServiceFee: 123456,
          batchId: 'b-1',
        },
        actorHrOfficer: { id: 'u-1', fullName: 'Admin User', role: 'ADMIN' },
      },
    ]);
    const res = await controller.getBatchActivity('b-1', 50, undefined, actor);
    expect(authorization.assertBatch).toHaveBeenCalledWith('b-1', actor);
    const where = prisma.auditLog.findMany.mock.calls[0][0].where;
    expect(where.OR[0].entityId.in).toEqual(['b-1', 'disp-1']);
    expect(res.items[0].details).toEqual({
      recipientCount: 580,
      batchId: 'b-1',
    });
    expect(res.nextCursor).toBeNull();
  });
});
