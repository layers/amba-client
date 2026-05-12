import type { FeedItem, ApiListResponse } from '@layers/amba-shared';
import type { HttpClient } from './http.js';

export interface FeedListOptions {
  limit?: number;
  offset?: number;
}

export class FeedModule {
  constructor(private readonly http: HttpClient) {}

  /** Get the current user's feed (own + friends' activity). */
  async getFeed(options: FeedListOptions = {}): Promise<FeedItem[]> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));

    const query = params.toString();
    const path = `/client/feeds${query ? `?${query}` : ''}`;

    const { data } = await this.http.get<ApiListResponse<FeedItem>>(path);
    return data.data;
  }

  /** Get only the current user's own activity feed. */
  async getMyFeed(options: FeedListOptions = {}): Promise<FeedItem[]> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));

    const query = params.toString();
    const path = `/client/feeds/me${query ? `?${query}` : ''}`;

    const { data } = await this.http.get<ApiListResponse<FeedItem>>(path);
    return data.data;
  }

  /** Get a group's activity feed. Requires group membership. */
  async getGroupFeed(groupId: string, options: FeedListOptions = {}): Promise<FeedItem[]> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));

    const query = params.toString();
    const path = `/client/feeds/group/${groupId}${query ? `?${query}` : ''}`;

    const { data } = await this.http.get<ApiListResponse<FeedItem>>(path);
    return data.data;
  }
}
