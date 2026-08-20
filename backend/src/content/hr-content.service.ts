import { Injectable } from '@nestjs/common';
import hrContent from './hr-content.json';
import type { HrContentConfig, HrContentItem } from './hr-content.types';

@Injectable()
export class HrContentService {
  private readonly content: HrContentConfig = hrContent as HrContentConfig;

  /**
   * Returns a content item from a specific HR content section.
   */
  get(
    section: keyof HrContentConfig,
    contentId: string,
  ): HrContentItem | undefined {
    return this.content[section][contentId];
  }

  /**
   * Returns the approved answer for a content item.
   *
   * Placeholder content is intentionally returned during development.
   * HR approval status is exposed so the caller can decide how to
   * handle non-approved content.
   */
  getAnswer(
    section: keyof HrContentConfig,
    contentId: string,
  ): string | undefined {
    return this.get(section, contentId)?.answer;
  }

  /**
   * Checks whether a content item exists.
   */
  exists(section: keyof HrContentConfig, contentId: string): boolean {
    return Boolean(this.get(section, contentId));
  }
}
