import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { SesEventMapperService } from './ses-event-mapper.service';
import { PayslipRetentionSweepService } from './payslip-retention-sweep.service';

/**
 * Runs the two housekeeping jobs without any extra dependency (no @nestjs/schedule):
 *  - reconcile: applies stored-but-unprocessed SES events (every PAYSLIP_RECONCILE_INTERVAL_MINUTES, default 15)
 *  - retention sweep: deletes expired PDFs, PDF bytes, delivery records and events
 *    (every PAYSLIP_RETENTION_SWEEP_INTERVAL_HOURS, default 24; first run PAYSLIP_RETENTION_SWEEP_START_DELAY_MINUTES
 *    after boot, default 10)
 * Set PAYSLIP_SCHEDULER_ENABLED=false on instances that must not run them. Both jobs are idempotent, so running
 * on several instances is safe (at worst a job runs twice); a per-process guard stops overlapping runs.
 */
@Injectable()
export class PayslipSchedulerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(PayslipSchedulerService.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly mapper: SesEventMapperService,
    private readonly retention: PayslipRetentionSweepService,
  ) {}

  onApplicationBootstrap(): void {
    if (
      process.env.PAYSLIP_SCHEDULER_ENABLED === 'false' ||
      process.env.NODE_ENV === 'test'
    ) {
      return;
    }

    const reconcileMs =
      (Number(process.env.PAYSLIP_RECONCILE_INTERVAL_MINUTES) || 15) *
      60 *
      1000;
    const sweepMs =
      (Number(process.env.PAYSLIP_RETENTION_SWEEP_INTERVAL_HOURS) || 24) *
      60 *
      60 *
      1000;
    const sweepDelayMs =
      (Number(process.env.PAYSLIP_RETENTION_SWEEP_START_DELAY_MINUTES) || 10) *
      60 *
      1000;

    this.timers.push(setInterval(() => void this.runReconcile(), reconcileMs));
    this.timers.push(
      setTimeout(() => {
        void this.runRetention();
        this.timers.push(setInterval(() => void this.runRetention(), sweepMs));
      }, sweepDelayMs),
    );
    for (const t of this.timers) t.unref?.();
    this.logger.log(
      `Payslip scheduler started (reconcile every ${reconcileMs / 60000} min, retention sweep every ${sweepMs / 3600000} h).`,
    );
  }

  onApplicationShutdown(): void {
    for (const t of this.timers) {
      clearTimeout(t);
      clearInterval(t);
    }
    this.timers = [];
  }

  async runReconcile(): Promise<number | null> {
    return this.guarded('reconcile', async () => {
      const processed = await this.mapper.processPendingEvents(200);
      if (processed > 0)
        this.logger.log(`Reconcile applied ${processed} stored SES events.`);
      return processed;
    });
  }

  async runRetention(): Promise<number | null> {
    return this.guarded('retention', async () => {
      const r = await this.retention.runSweep();
      return (
        r.deletedPdfs + r.deletedBlobs + r.deletedDeliveries + r.deletedEvents
      );
    });
  }

  private readonly running = new Set<string>();

  /** Skips the run if the same job is still running in this process; logs and swallows failures. */
  private async guarded(
    name: string,
    fn: () => Promise<number>,
  ): Promise<number | null> {
    if (this.running.has(name)) return null;
    this.running.add(name);
    try {
      return await fn();
    } catch (err: unknown) {
      this.logger.error(
        `Scheduled job "${name}" failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    } finally {
      this.running.delete(name);
    }
  }
}
