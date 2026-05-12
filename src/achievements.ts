import type {
  AchievementDefinition,
  AchievementProgress,
  ApiListResponse,
  ApiResponse,
} from '@layers/amba-shared';
import type { HttpClient } from './http.js';

export interface AchievementWithProgress extends AchievementDefinition {
  unlocked_at: string | null;
  progress: AchievementProgress;
}

export class AchievementModule {
  constructor(private readonly http: HttpClient) {}

  /** Get all achievements with user progress (locked + unlocked). Hidden achievements only appear once unlocked. */
  async getAll(): Promise<AchievementWithProgress[]> {
    const { data } =
      await this.http.get<ApiListResponse<AchievementWithProgress>>('/client/achievements');
    return data.data;
  }

  /** Get a specific achievement with user progress. */
  async get(achievementId: string): Promise<AchievementWithProgress> {
    const { data } = await this.http.get<ApiResponse<AchievementWithProgress>>(
      `/client/achievements/${achievementId}`,
    );
    return data.data;
  }
}
