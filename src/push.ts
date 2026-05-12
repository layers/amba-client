import type { HttpClient } from './http.js';

export class PushModule {
  constructor(private readonly http: HttpClient) {}

  /** Register a device push token with the server. */
  async registerToken(token: string, platform: 'ios' | 'android'): Promise<void> {
    // API: POST /client/users/me/push-token { token, platform }
    await this.http.post('/client/users/me/push-token', { token, platform });
  }

  /** Remove a previously registered push token. */
  async unregisterToken(token: string): Promise<void> {
    // API: DELETE /client/users/me/push-token (token travels in the body,
    // not the URL, because Hono strips bodies off DELETE by default on
    // some runtimes — match the server contract). HttpClient.delete()
    // doesn't take a body, so reach for the generic request() helper.
    await this.http.request('/client/users/me/push-token', {
      method: 'DELETE',
      body: { token },
    });
  }
}
