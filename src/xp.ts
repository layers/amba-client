import type { UserXp, XpLedgerEntry, XpRule, ApiResponse, ApiListResponse } from '@layers/amba-shared';
import type { HttpClient } from './http.js';

export class XpModule {
  constructor(private readonly http: HttpClient) {}

  /** Get the current user's XP total, level, and period XP. */
  async getMyXp(): Promise<UserXp> {
    const { data } = await this.http.get<ApiResponse<UserXp>>('/client/xp');
    return data.data;
  }

  /** Get the current user's XP history (ledger entries). */
  async getHistory(options: { limit?: number; offset?: number } = {}): Promise<XpLedgerEntry[]> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));

    const query = params.toString();
    const path = `/client/xp/history${query ? `?${query}` : ''}`;

    const { data } = await this.http.get<ApiListResponse<XpLedgerEntry>>(path);
    return data.data;
  }

  /** Get all active XP rules for the project. */
  async getRules(): Promise<XpRule[]> {
    const { data } = await this.http.get<ApiListResponse<XpRule>>('/client/xp/rules');
    return data.data;
  }
}
