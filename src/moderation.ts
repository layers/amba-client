import type { ApiResponse, ApiListResponse } from '@layers/amba-shared';
import type { ModerationQueueItem, ModerationContentType } from '@layers/amba-shared/platform-types';
import type { HttpClient } from './http.js';

export class ModerationModule {
  constructor(private readonly http: HttpClient) {}

  /** Report content for moderation review. */
  async report(input: {
    contentType: ModerationContentType;
    contentId: string;
    reason?: string;
  }): Promise<ModerationQueueItem> {
    const { data } = await this.http.post<ApiResponse<ModerationQueueItem>>(
      '/client/moderation/report',
      {
        content_type: input.contentType,
        content_id: input.contentId,
        reason: input.reason,
      },
    );
    return data.data;
  }

  /** Get the current user's submitted reports. */
  async getMyReports(): Promise<ModerationQueueItem[]> {
    const { data } = await this.http.get<ApiListResponse<ModerationQueueItem>>(
      '/client/moderation/reports',
    );
    return data.data;
  }
}
