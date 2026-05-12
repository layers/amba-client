import type { ApiResponse } from '@layers/amba-shared';
import type { SyncChange, SyncPushResponse, SyncPullResponse } from '@layers/amba-shared/platform-types';
import type { HttpClient } from './http.js';

export class SyncModule {
  private queue: SyncChange[] = [];
  private checkpoints: Map<string, string> = new Map();

  constructor(private readonly http: HttpClient) {}

  /** Queue a change for offline sync. Will be sent on next push(). */
  queueChange(change: SyncChange): void {
    this.queue.push(change);
  }

  /** Get the number of queued changes. */
  getQueueSize(): number {
    return this.queue.length;
  }

  /** Push all queued local changes to the server. */
  async push(): Promise<SyncPushResponse> {
    if (this.queue.length === 0) {
      return { applied: 0, conflicts: [], checkpoint_token: '' };
    }

    const changes = [...this.queue];
    this.queue = [];

    const { data } = await this.http.post<ApiResponse<SyncPushResponse>>('/client/sync', {
      changes,
    });

    const result = data.data;

    // Update local checkpoints
    const entityTypes = [...new Set(changes.map((c) => c.entity_type))];
    for (const entityType of entityTypes) {
      this.checkpoints.set(entityType, result.checkpoint_token);
    }

    return result;
  }

  /** Pull remote changes since the last checkpoint for an entity type. */
  async pull(entityType: string): Promise<SyncPullResponse> {
    const checkpointToken = this.checkpoints.get(entityType);

    const params = new URLSearchParams({ entity_type: entityType });
    if (checkpointToken) params.set('checkpoint_token', checkpointToken);

    const { data } = await this.http.get<ApiResponse<SyncPullResponse>>(
      `/client/sync?${params.toString()}`,
    );

    const result = data.data;
    this.checkpoints.set(entityType, result.checkpoint_token);

    return result;
  }

  /** Convenience: push queued changes then pull remote changes for given entity types. */
  async sync(entityTypes: string[]): Promise<{
    pushed: SyncPushResponse;
    pulled: Map<string, SyncPullResponse>;
  }> {
    const pushed = await this.push();

    const pulled = new Map<string, SyncPullResponse>();
    for (const entityType of entityTypes) {
      const pullResult = await this.pull(entityType);
      pulled.set(entityType, pullResult);
    }

    return { pushed, pulled };
  }

  /** Clear all queued changes without sending them. */
  clearQueue(): void {
    this.queue = [];
  }

  /** Reset all checkpoints. Next pull will fetch all data. */
  resetCheckpoints(): void {
    this.checkpoints.clear();
  }
}
