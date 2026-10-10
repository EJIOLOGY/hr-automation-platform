import { Test, TestingModule } from '@nestjs/testing';
import { PayslipCatalogController } from './payslip-catalog.controller';
import { PayslipCatalogService } from './payslip-catalog.service';
import { HrOfficerRole } from '../../../generated/prisma/enums';

describe('PayslipCatalogController', () => {
  let controller: PayslipCatalogController;
  let service: any;

  beforeEach(async () => {
    const serviceMock = {
      listCompanies: jest.fn().mockResolvedValue([{ id: 'c1', name: 'Alpha' }]),
      createCompany: jest.fn().mockResolvedValue({ id: 'c1', name: 'Alpha' }),
      listPeriods: jest.fn().mockResolvedValue([{ id: 'p1' }]),
      createPeriod: jest.fn().mockResolvedValue({ id: 'p1' }),
      getPeriodClaim: jest.fn().mockResolvedValue({ claimedById: 'u1' }),
      reassignClaim: jest.fn().mockResolvedValue({ id: 'cl1' }),
      getMyClaims: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PayslipCatalogController],
      providers: [{ provide: PayslipCatalogService, useValue: serviceMock }],
    }).compile();

    controller = module.get<PayslipCatalogController>(PayslipCatalogController);
    service = module.get(PayslipCatalogService);
  });

  it('delegates listCompanies', async () => {
    const res = await controller.listCompanies();
    expect(res).toEqual([{ id: 'c1', name: 'Alpha' }]);
    expect(service.listCompanies).toHaveBeenCalled();
  });

  it('delegates createCompany', async () => {
    const user = { id: 'admin-1', role: HrOfficerRole.ADMIN, email: 'admin@test.com' };
    await controller.createCompany({ name: 'Alpha', code: 'ALPHA' }, user);
    expect(service.createCompany).toHaveBeenCalledWith({ name: 'Alpha', code: 'ALPHA' }, user);
  });

  it('delegates listPeriods', async () => {
    await controller.listPeriods('c1');
    expect(service.listPeriods).toHaveBeenCalledWith('c1');
  });

  it('delegates createPeriod', async () => {
    const user = { id: 'admin-1', role: HrOfficerRole.ADMIN, email: 'admin@test.com' };
    const dto = {
      accountingCompanyId: 'c1',
      name: 'Oct 2026',
      startDate: new Date(),
      endDate: new Date(),
    };
    await controller.createPeriod(dto, user);
    expect(service.createPeriod).toHaveBeenCalledWith(dto, user);
  });

  it('delegates getPeriodClaim', async () => {
    const user = { id: 'u1', role: HrOfficerRole.OFFICER, email: 'u1@test.com' };
    await controller.getPeriodClaim('c1', 'p1', user);
    expect(service.getPeriodClaim).toHaveBeenCalledWith('c1', 'p1', 'u1');
  });

  it('delegates reassignClaim', async () => {
    const user = { id: 'admin-1', role: HrOfficerRole.ADMIN, email: 'admin@test.com' };
    await controller.reassignClaim('c1', 'p1', { officerId: 'u2' }, user);
    expect(service.reassignClaim).toHaveBeenCalledWith('c1', 'p1', { officerId: 'u2' }, user);
  });

  it('delegates getMyClaims', async () => {
    const user = { id: 'u1', role: HrOfficerRole.OFFICER, email: 'u1@test.com' };
    await controller.getMyClaims(user);
    expect(service.getMyClaims).toHaveBeenCalledWith(user);
  });
});
