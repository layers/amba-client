import type { ApiResponse } from '@layers/amba-shared';
import type { OnboardingFlow, UserOnboarding } from '@layers/amba-shared/platform-types';
import type { HttpClient } from './http.js';

export class OnboardingModule {
  constructor(private readonly http: HttpClient) {}

  /** Get the current onboarding flow and user progress. */
  async getCurrent(): Promise<{ flow: OnboardingFlow | null; progress: UserOnboarding | null }> {
    const { data } =
      await this.http.get<
        ApiResponse<{ flow: OnboardingFlow | null; progress: UserOnboarding | null }>
      >('/client/onboarding');
    return data.data;
  }

  /** Start an onboarding flow. */
  async start(flowId: string): Promise<UserOnboarding> {
    const { data } = await this.http.post<ApiResponse<UserOnboarding>>(
      `/client/onboarding/${flowId}/start`,
    );
    return data.data;
  }

  /** Advance to the next step in the onboarding flow. */
  async advance(flowId: string): Promise<UserOnboarding> {
    const { data } = await this.http.post<ApiResponse<UserOnboarding>>(
      `/client/onboarding/${flowId}/advance`,
    );
    return data.data;
  }

  /** Skip the onboarding flow. */
  async skip(flowId: string): Promise<UserOnboarding> {
    const { data } = await this.http.post<ApiResponse<UserOnboarding>>(
      `/client/onboarding/${flowId}/skip`,
    );
    return data.data;
  }

  /** Mark the onboarding flow as complete. */
  async complete(flowId: string): Promise<UserOnboarding> {
    const { data } = await this.http.post<ApiResponse<UserOnboarding>>(
      `/client/onboarding/${flowId}/complete`,
    );
    return data.data;
  }
}
