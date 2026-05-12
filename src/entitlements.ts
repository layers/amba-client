import type { UserEntitlement, ApiListResponse } from '@layers/amba-shared';
import type { HttpClient } from './http.js';

export class EntitlementModule {
  constructor(private readonly http: HttpClient) {}

  /** Fetch all entitlements for the current user. */
  async getAll(): Promise<UserEntitlement[]> {
    const { data } = await this.http.get<ApiListResponse<UserEntitlement>>('/client/entitlements');
    return data.data;
  }

  /** Check whether a specific entitlement is currently active. */
  async isActive(entitlementId: string): Promise<boolean> {
    const all = await this.getAll();
    return all.some((e) => e.entitlement_id === entitlementId && e.is_active);
  }
}
