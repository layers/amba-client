import type { AppSession, ApiResponse } from '@layers/amba-shared';
import type { StartSessionInput } from '@layers/amba-shared/platform-types';
import type { HttpClient } from './http.js';

export class SessionModule {
  private currentSessionId: string | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly http: HttpClient) {}

  /** Start a new session. Called automatically on SDK init. */
  async start(input?: Partial<Omit<StartSessionInput, 'session_id'>>): Promise<AppSession> {
    const sessionId = randomUUID();
    this.currentSessionId = sessionId;

    const { data } = await this.http.post<ApiResponse<AppSession>>('/client/sessions/start', {
      session_id: sessionId,
      platform: input?.platform,
      app_version: input?.app_version,
      device_model: input?.device_model,
      metadata: input?.metadata,
    });

    // Start heartbeat every 30 seconds
    this.startHeartbeat();

    return data.data;
  }

  /** End the current session. Called automatically on app background. */
  async end(): Promise<AppSession | null> {
    if (!this.currentSessionId) return null;

    this.stopHeartbeat();

    const { data } = await this.http.post<ApiResponse<AppSession>>('/client/sessions/end', {
      session_id: this.currentSessionId,
    });

    this.currentSessionId = null;
    return data.data;
  }

  /** Send a heartbeat to keep the session alive and update duration. */
  async heartbeat(): Promise<void> {
    if (!this.currentSessionId) return;

    await this.http.post('/client/sessions/heartbeat', {
      session_id: this.currentSessionId,
    });
  }

  /** Get the current session ID. */
  getSessionId(): string | null {
    return this.currentSessionId;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.heartbeat().catch(() => {
        // Silently ignore heartbeat errors
      });
    }, 30_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

function randomUUID(): string {
  // React Native does NOT expose `globalThis.crypto` by default — Expo Go,
  // bare RN, and Hermes all lack it. So we can't rely on `crypto.randomUUID`
  // even though Node 19+ and modern browsers have it. The values minted here
  // are client-side identifiers (session/device IDs), not auth secrets —
  // server-issued JWTs do the actual authentication — so a Math.random-backed
  // UUIDv4 is acceptable. (~52 bits of entropy on V8/Hermes; collision
  // probability for 1M IDs ≈ 1e-15.)
  const g = globalThis as unknown as { crypto?: { randomUUID?(): string } };
  if (typeof g.crypto?.randomUUID === 'function') return g.crypto.randomUUID();
  // RFC 4122 v4: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx, y ∈ {8,9,a,b}
  const hex = (n: number): string => Math.floor(Math.random() * n).toString(16);
  const part = (len: number): string => Array.from({ length: len }, () => hex(16)).join('');
  return `${part(8)}-${part(4)}-4${part(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${part(3)}-${part(12)}`;
}
