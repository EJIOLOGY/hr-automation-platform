import { Test, TestingModule } from '@nestjs/testing';
import { DashboardAuditLogsController } from './dashboard-audit-logs.controller';
import { AuditService } from '../audit/audit.service';

describe('DashboardAuditLogsController', () => {
  let controller: DashboardAuditLogsController;

  const auditServiceMock = {
    list: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardAuditLogsController],
      providers: [
        {
          provide: AuditService,
          useValue: auditServiceMock,
        },
      ],
    }).compile();

    controller = module.get<DashboardAuditLogsController>(
      DashboardAuditLogsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should forward list query to AuditService', async () => {
    const mockResponse = {
      items: [],
      nextCursor: null,
    };
    auditServiceMock.list.mockResolvedValue(mockResponse);

    const result = await controller.list({ limit: 25, cursor: 'abc' });

    expect(auditServiceMock.list).toHaveBeenCalledWith({
      limit: 25,
      cursor: 'abc',
    });
    expect(result).toEqual(mockResponse);
  });
});
