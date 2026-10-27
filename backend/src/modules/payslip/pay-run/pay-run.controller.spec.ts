import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PayRunController } from './pay-run.controller';
import { PayRunService } from './pay-run.service';
import { PayslipAuthorizationService } from '../payslip-authorization.service';

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const P1 = '33333333-3333-4333-8333-333333333333';
const OFFICER = { id: 'o1', role: 'OFFICER' } as never;
const ADMIN = { id: 'a1', role: 'ADMIN' } as never;

function build(
  opts: {
    claim?: { claimedById: string } | null;
    periodCompany?: string | null;
  } = {},
) {
  const prisma = {
    payslipWorkloadClaim: {
      findUnique: jest.fn().mockResolvedValue(opts.claim ?? null),
    },
    accountingCompany: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id }),
      ),
    },
    payrollPeriod: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          opts.periodCompany === null
            ? null
            : { id: P1, accountingCompanyId: opts.periodCompany ?? C1 },
        ),
    },
    billingRateUpload: { findFirst: jest.fn().mockResolvedValue(null) },
    payslipBatch: { findFirst: jest.fn().mockResolvedValue(null) },
    payslip: {
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
  };
  const authorization = new PayslipAuthorizationService(
    prisma as never,
    {} as never,
  );
  const service = new PayRunService(prisma as never);
  return { controller: new PayRunController(service, authorization), prisma };
}

describe('PayRunController.getPayRunState authorization', () => {
  it('rejects an Officer without a claim (403) before touching pay-run data', async () => {
    const { controller, prisma } = build({ claim: null });
    await expect(
      controller.getPayRunState(C1, P1, OFFICER),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.payrollPeriod.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an Officer whose claim belongs to someone else', async () => {
    const { controller } = build({ claim: { claimedById: 'other' } });
    await expect(
      controller.getPayRunState(C1, P1, OFFICER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets an Officer with the exact claim read the state', async () => {
    const { controller } = build({ claim: { claimedById: 'o1' } });
    await expect(
      controller.getPayRunState(C1, P1, OFFICER),
    ).resolves.toMatchObject({ companyId: C1, periodId: P1 });
  });

  it('lets an Admin read without a claim', async () => {
    const { controller } = build();
    await expect(
      controller.getPayRunState(C1, P1, ADMIN),
    ).resolves.toMatchObject({ companyId: C1 });
  });

  it('404s when the period belongs to a different company (even for Admin)', async () => {
    const { controller } = build({ periodCompany: C2 });
    await expect(
      controller.getPayRunState(C1, P1, ADMIN),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s when the period does not exist', async () => {
    const { controller } = build({ periodCompany: null });
    await expect(
      controller.getPayRunState(C1, P1, ADMIN),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
