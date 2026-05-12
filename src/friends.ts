import type { Friendship, ApiResponse, ApiListResponse } from '@layers/amba-shared';
import type { HttpClient } from './http.js';

export class FriendModule {
  constructor(private readonly http: HttpClient) {}

  /** Send a friend request to another user. */
  async sendRequest(addresseeId: string): Promise<Friendship> {
    const { data } = await this.http.post<ApiResponse<Friendship>>('/client/friends/request', {
      addressee_id: addresseeId,
    });
    return data.data;
  }

  /** Accept a pending friend request. */
  async accept(friendshipId: string): Promise<Friendship> {
    const { data } = await this.http.post<ApiResponse<Friendship>>(
      `/client/friends/${friendshipId}/accept`,
    );
    return data.data;
  }

  /** Reject a pending friend request. */
  async reject(friendshipId: string): Promise<void> {
    await this.http.post(`/client/friends/${friendshipId}/reject`);
  }

  /** Block a user (via their friendship record). */
  async block(friendshipId: string): Promise<Friendship> {
    const { data } = await this.http.post<ApiResponse<Friendship>>(
      `/client/friends/${friendshipId}/block`,
    );
    return data.data;
  }

  /** Unblock a user (removes the friendship). */
  async unblock(friendshipId: string): Promise<void> {
    await this.http.post(`/client/friends/${friendshipId}/unblock`);
  }

  /** List the current user's accepted friends. */
  async getAll(): Promise<Friendship[]> {
    const { data } = await this.http.get<ApiListResponse<Friendship>>('/client/friends');
    return data.data;
  }

  /** List pending friend requests for the current user. */
  async getPending(): Promise<Friendship[]> {
    const { data } = await this.http.get<ApiListResponse<Friendship>>('/client/friends/pending');
    return data.data;
  }
}
