import { PayslipSchedulerService } from './payslip-scheduler.service';

describe('PayslipSchedulerService', () => {
  const makeService = () => {
    const mapper = { processPendingEvents: jest.fn().mockResolvedValue(3) };
    const retention = {
      runSweep: jest.fn().mockResolvedValue({
        deletedPdfs: 1,
        deletedBlobs: 2,
        deletedDeliveries: 3,
        deletedAttempts: 0,
        deletedEvents: 4,
      }),
    };
    const service = new PayslipSchedulerService(
      mapper as any,
      retention as any,
    );
    return { service, mapper, retention };
  };

  it('reconcile applies pending SES events', async () => {
    const { service, mapper } = makeService();
    await expect(service.runReconcile()).resolves.toBe(3);
    expect(mapper.processPendingEvents).toHaveBeenCalledWith(200);
  });

  it('retention runs the sweep and reports the rows removed', async () => {
    const { service, retention } = makeService();
    await expect(service.runRetention()).resolves.toBe(10);
    expect(retention.runSweep).toHaveBeenCalledTimes(1);
  });

  it('does not start a second run of the same job while one is still running', async () => {
    const { service, mapper } = makeService();
    let release!: () => void;
    mapper.processPendingEvents.mockImplementation(
      () => new Promise<number>((resolve) => (release = () => resolve(1))),
    );
    const first = service.runReconcile();
    await expect(service.runReconcile()).resolves.toBeNull();
    release();
    await expect(first).resolves.toBe(1);
  });

  it('swallows job failures and allows the next run', async () => {
    const { service, retention } = makeService();
    retention.runSweep.mockRejectedValueOnce(new Error('db down'));
    await expect(service.runRetention()).resolves.toBeNull();
    await expect(service.runRetention()).resolves.toBe(10);
  });

  it('does not start timers under NODE_ENV=test', () => {
    const { service } = makeService();
    service.onApplicationBootstrap();
    expect((service as any).timers).toHaveLength(0);
  });
});
