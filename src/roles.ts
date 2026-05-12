import type { ApiResponse, ApiListResponse } from '@layers/amba-shared';
import type { UserRole, PermissionCheck } from '@layers/amba-shared/platform-types';
import type { HttpClient } from './http.js';

export class RoleModule {
  constructor(private readonly http: HttpClient) {}

  /** Get the current user's roles with full role details. */
  async getMyRoles(): Promise<UserRole[]> {
    const { data } = await this.http.get<ApiListResponse<UserRole>>('/client/roles');
    return data.data;
  }

  /** Get all aggregated permissions for the current user. */
  async getMyPermissions(): Promise<string[]> {
    const { data } = await this.http.get<ApiResponse<{ permissions: string[] }>>(
      '/client/roles/permissions',
    );
    return data.data.permissions;
  }

  /** Check if the current user has a specific permission. */
  async checkPermission(permission: string): Promise<PermissionCheck> {
    const { data } = await this.http.get<ApiResponse<PermissionCheck>>(
      `/client/roles/check/${encodeURIComponent(permission)}`,
    );
    return data.data;
  }
}
