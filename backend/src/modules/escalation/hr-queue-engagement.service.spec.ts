import { HrQueueEngagementService } from './hr-queue-engagement.service';

describe('HrQueueEngagementService', () => {
  let service: HrQueueEngagementService;

  beforeEach(() => {
    service = new HrQueueEngagementService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('does not process or send queue engagement messages', async () => {
    const processed = await service.processWaitingEscalations(
      new Date('2026-08-20T10:05:00.000Z'),
    );

    expect(processed).toBe(0);
  });

  it('remains disabled regardless of the supplied time', async () => {
    const processed = await service.processWaitingEscalations(
      new Date('2026-08-20T11:00:00.000Z'),
    );

    expect(processed).toBe(0);
  });
});
