import type { ReferralCode, ReferralClaim, ApiResponse } from '@layers/amba-shared';
import type { HttpClient } from './http.js';

export class ReferralModule {
  constructor(private readonly http: HttpClient) {}

  /** Get or create the current user's referral code. */
  async getMyCode(): Promise<ReferralCode> {
    const { data } = await this.http.get<ApiResponse<ReferralCode>>('/client/referrals/my-code');
    return data.data;
  }

  /** Claim a referral code. Grants rewards to both referee and referrer. */
  async claim(code: string): Promise<ReferralClaim> {
    const { data } = await this.http.post<ApiResponse<ReferralClaim>>('/client/referrals/claim', {
      code,
    });
    return data.data;
  }
}
