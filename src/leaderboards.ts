import type {
  LeaderboardDefinition,
  LeaderboardEntryWithUser,
  LeaderboardEntry,
  ApiResponse,
  ApiListResponse,
} from '@layers/amba-shared';
import type { HttpClient } from './http.js';

export class LeaderboardModule {
  constructor(private readonly http: HttpClient) {}

  /** List all active leaderboard definitions for the project. */
  async getAll(): Promise<LeaderboardDefinition[]> {
    const { data } =
      await this.http.get<ApiListResponse<LeaderboardDefinition>>('/client/leaderboards');
    return data.data;
  }

  /** Get leaderboard entries (paginated, ranked). */
  async getEntries(
    leaderboardId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<LeaderboardEntryWithUser[]> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));

    const query = params.toString();
    const path = `/client/leaderboards/${leaderboardId}${query ? `?${query}` : ''}`;

    const { data } = await this.http.get<ApiListResponse<LeaderboardEntryWithUser>>(path);
    return data.data;
  }

  /** Get the current user's rank on a specific leaderboard. */
  async getMyRank(leaderboardId: string): Promise<LeaderboardEntry> {
    const { data } = await this.http.get<ApiResponse<LeaderboardEntry>>(
      `/client/leaderboards/${leaderboardId}/me`,
    );
    return data.data;
  }
}
