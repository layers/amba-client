import type { Group, GroupMember, ApiResponse, ApiListResponse } from '@layers/amba-shared';
import type { HttpClient } from './http.js';

export interface CreateGroupOptions {
  name: string;
  description?: string;
  avatar_url?: string;
  is_public?: boolean;
  max_members?: number;
  metadata?: Record<string, unknown>;
}

export interface GroupSearchOptions {
  q?: string;
  limit?: number;
  offset?: number;
}

export class GroupModule {
  constructor(private readonly http: HttpClient) {}

  /** Create a new group (current user becomes owner). */
  async create(options: CreateGroupOptions): Promise<Group> {
    const { data } = await this.http.post<ApiResponse<Group>>('/client/groups', options);
    return data.data;
  }

  /** List groups the current user belongs to. */
  async getMine(): Promise<Array<{ role: string; groups: Group }>> {
    const { data } =
      await this.http.get<ApiListResponse<{ role: string; groups: Group }>>('/client/groups/mine');
    return data.data;
  }

  /** Search public groups. */
  async search(options: GroupSearchOptions = {}): Promise<Group[]> {
    const params = new URLSearchParams();
    if (options.q) params.set('q', options.q);
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));

    const query = params.toString();
    const path = `/client/groups/search${query ? `?${query}` : ''}`;

    const { data } = await this.http.get<ApiListResponse<Group>>(path);
    return data.data;
  }

  /** Join a public group. */
  async join(groupId: string): Promise<GroupMember> {
    const { data } = await this.http.post<ApiResponse<GroupMember>>(
      `/client/groups/${groupId}/join`,
    );
    return data.data;
  }

  /** Leave a group. */
  async leave(groupId: string): Promise<void> {
    await this.http.post(`/client/groups/${groupId}/leave`);
  }

  /** List members of a group. */
  async getMembers(groupId: string): Promise<GroupMember[]> {
    const { data } = await this.http.get<ApiListResponse<GroupMember>>(
      `/client/groups/${groupId}/members`,
    );
    return data.data;
  }
}
