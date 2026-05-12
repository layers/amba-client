import type { UserStreak, ApiResponse, ApiListResponse } from '@layers/amba-shared';
import type { HttpClient } from './http.js';

export class StreakModule {
  constructor(private readonly http: HttpClient) {}

  /** Fetch all streak records for the current user. */
  async getAll(): Promise<UserStreak[]> {
    const { data } = await this.http.get<ApiListResponse<UserStreak>>('/client/streaks');
    return data.data;
  }

  /** Mark the current user as qualifying for the given streak today. */
  async qualify(streakId: string): Promise<UserStreak> {
    const { data } = await this.http.post<ApiResponse<UserStreak>>(
      `/client/streaks/${streakId}/qualify`,
    );
    return data.data;
  }
}
