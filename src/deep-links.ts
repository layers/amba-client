import type { ApiResponse } from '@layers/amba-shared';
import type { TrackedLink, DeepLinkConfig } from '@layers/amba-shared/platform-types';
import type { HttpClient } from './http.js';

export class DeepLinkModule {
  constructor(private readonly http: HttpClient) {}

  /** Resolve a tracked link by its slug. Returns the destination and metadata. */
  async resolve(
    slug: string,
  ): Promise<Pick<TrackedLink, 'id' | 'slug' | 'destination_url' | 'metadata'>> {
    const { data } = await this.http.get<
      ApiResponse<Pick<TrackedLink, 'id' | 'slug' | 'destination_url' | 'metadata'>>
    >(`/client/deep-links/resolve/${encodeURIComponent(slug)}`);
    return data.data;
  }

  /** Track a click on a tracked link. */
  async trackClick(trackedLinkId: string, platform?: string): Promise<void> {
    await this.http.post('/client/deep-links/click', {
      tracked_link_id: trackedLinkId,
      platform,
    });
  }

  /** Get deep link configuration for the current project. */
  async getConfig(): Promise<DeepLinkConfig | null> {
    const { data } = await this.http.get<ApiResponse<DeepLinkConfig | null>>(
      '/client/deep-links/config',
    );
    return data.data;
  }
}
