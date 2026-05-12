import type { UserChallengeWithDefinition, ApiListResponse, ApiResponse } from '@layers/amba-shared';
import type { HttpClient } from './http.js';

export interface ChallengeWithProgress {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  start_at: string;
  end_at: string;
  goal_type: string;
  goal_value: number;
  reward_xp: number;
  reward_achievement_id: string | null;
  user_progress: number;
  user_status: string | null;
  user_completed_at: string | null;
  is_joined: boolean;
}

export class ChallengeModule {
  constructor(private readonly http: HttpClient) {}

  /** Get all active challenges with the current user's progress. */
  async getActive(): Promise<ChallengeWithProgress[]> {
    const { data } =
      await this.http.get<ApiListResponse<ChallengeWithProgress>>('/client/challenges');
    return data.data;
  }

  /** Join an active challenge. Returns the user's challenge record. */
  async join(challengeId: string): Promise<UserChallengeWithDefinition> {
    const { data } = await this.http.post<ApiResponse<UserChallengeWithDefinition>>(
      `/client/challenges/${challengeId}/join`,
    );
    return data.data;
  }

  /** Get all challenges the current user has joined (active + completed + failed). */
  async getMine(): Promise<UserChallengeWithDefinition[]> {
    const { data } =
      await this.http.get<ApiListResponse<UserChallengeWithDefinition>>('/client/challenges/mine');
    return data.data;
  }
}
