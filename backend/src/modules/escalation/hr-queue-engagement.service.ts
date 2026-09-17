import { Injectable } from '@nestjs/common';

export const QUEUE_ENGAGEMENT_DISABLED = true;

/**
 * Queue engagement messaging is intentionally disabled.
 *
 * Escalations remain in the HR queue and are handled through the HR
 * dashboard. This service no longer schedules, sends, or persists any
 * employee-facing queue engagement messages.
 */
@Injectable()
export class HrQueueEngagementService {
  /**
   * Kept as the existing service entry point so the scheduler/module
   * integration remains stable without producing outbound WhatsApp
   * messages.
   */
  async processWaitingEscalations(_now = new Date()): Promise<number> {
    return 0;
  }
}
