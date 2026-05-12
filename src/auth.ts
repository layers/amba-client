import type { AuthResult, AppUser, ApiResponse } from '@layers/amba-shared';
import type { HttpClient } from './http.js';
import type { AmbaStorage } from './key-value-storage.js';

// ─── Types ─────────────────────────────────────────────────────────────

export interface Session {
  sessionToken: string;
  refreshToken: string;
  user: AppUser;
  expiresAt: string;
}

export type AuthStateCallback = (session: Session | null) => void;
export type Unsubscribe = () => void;

// ─── Storage Keys ──────────────────────────────────────────────────────

const KEY_SESSION = 'amba_session';
const KEY_ANONYMOUS_ID = 'amba_anonymous_id';

// ─── AuthModule ────────────────────────────────────────────────────────

export class AuthModule {
  private session: Session | null = null;
  private listeners = new Set<AuthStateCallback>();

  constructor(
    private readonly http: HttpClient,
    private readonly storage: AmbaStorage,
  ) {}

  // ── Anonymous identity ──────────────────────────────────────────────

  /** Returns the persisted anonymous id, creating one if none exists. */
  async getAnonymousId(): Promise<string> {
    const existing = await this.storage.getItem(KEY_ANONYMOUS_ID);
    if (existing) return existing;

    const id = generateId();
    await this.storage.setItem(KEY_ANONYMOUS_ID, id);
    return id;
  }

  // ── Anonymous session ───────────────────────────────────────────────

  /**
   * Mint an anonymous server-side session by calling
   * `POST /client/auth/anonymous`. Returns the freshly-issued session
   * token + a synthetic user record (no email, just an `anonymous_id`
   * the server picked).
   *
   * Use this when an app needs to track / persist data BEFORE the user
   * has agreed to create an account. The client-side `getAnonymousId()`
   * gets you a stable local id but does NOT mint a server session — so
   * `Amba.track()` etc would 401 until you call this (or one of the
   * email/social signups).
   *
   * Calling this when a session already exists is harmless — it overwrites
   * the persisted session with the new anonymous one. To link an existing
   * anonymous session to email/social later, use {@link signUpWithEmail}
   * (which on the server side recognises the anonymous_id and migrates
   * data) or {@link linkAccount}.
   */
  async signInAnonymously(): Promise<AuthResult> {
    const { data } = await this.http.post<ApiResponse<AuthResult>>('/client/auth/anonymous', {});
    await this.persistSession(data.data);
    return data.data;
  }

  // ── Social auth ─────────────────────────────────────────────────────

  // The API exposes a single `/client/auth/social` endpoint that takes
  // `{ provider, token }`; we keep two surface helpers on the SDK because
  // Apple and Google issue structurally different tokens (Apple identity
  // token vs. Google id_token) and callers shouldn't have to know they
  // happen to collapse to the same server route.
  async loginWithApple(identityToken: string): Promise<AuthResult> {
    const { data } = await this.http.post<ApiResponse<AuthResult>>('/client/auth/social', {
      provider: 'apple',
      token: identityToken,
    });
    await this.persistSession(data.data);
    return data.data;
  }

  async loginWithGoogle(idToken: string): Promise<AuthResult> {
    const { data } = await this.http.post<ApiResponse<AuthResult>>('/client/auth/social', {
      provider: 'google',
      token: idToken,
    });
    await this.persistSession(data.data);
    return data.data;
  }

  // ── Email auth ──────────────────────────────────────────────────────

  async signUpWithEmail(email: string, password: string): Promise<AuthResult> {
    const { data } = await this.http.post<ApiResponse<AuthResult>>('/client/auth/email/signup', {
      email,
      password,
    });
    await this.persistSession(data.data);
    return data.data;
  }

  async loginWithEmail(email: string, password: string): Promise<AuthResult> {
    const { data } = await this.http.post<ApiResponse<AuthResult>>('/client/auth/email/login', {
      email,
      password,
    });
    await this.persistSession(data.data);
    return data.data;
  }

  // ── Account linking ─────────────────────────────────────────────────

  async linkAccount(
    // Server rejects `email` with 400 UNSUPPORTED_PROVIDER — email linking must
    // go through a verified flow (/email/signup or /email/login), not /link.
    provider: 'apple' | 'google',
    token: string,
  ): Promise<AuthResult> {
    const existing = await this.getSession();
    if (!existing) {
      throw new Error('linkAccount requires an active session');
    }
    const { data } = await this.http.post<ApiResponse<AuthResult>>('/client/auth/link', {
      provider,
      token,
      session_token: existing.sessionToken,
    });
    await this.persistSession(data.data);
    return data.data;
  }

  // ── Session management ──────────────────────────────────────────────

  async getSession(): Promise<Session | null> {
    if (this.session) return this.session;

    const raw = await this.storage.getItem(KEY_SESSION);
    if (!raw) return null;

    try {
      this.session = JSON.parse(raw) as Session;
      this.http.setSessionToken(this.session.sessionToken);
      return this.session;
    } catch {
      await this.storage.removeItem(KEY_SESSION);
      return null;
    }
  }

  async logout(): Promise<void> {
    // API requires the refresh_token in the body so it can revoke the
    // matching `app_user_sessions` row. If we have no session locally
    // we skip the server call entirely (nothing to revoke).
    const refreshToken = this.session?.refreshToken;
    if (refreshToken) {
      try {
        await this.http.post('/client/auth/logout', { refresh_token: refreshToken });
      } catch {
        // Best-effort server-side logout; always clear local state
      }
    }

    this.http.setSessionToken(null);
    this.session = null;
    await this.storage.removeItem(KEY_SESSION);
    this.notify(null);
  }

  /**
   * Rotate the session + refresh tokens. Callers normally don't need to
   * invoke this directly — the HttpClient can transparently refresh on
   * expiry — but it's exposed for apps that want to force-rotate.
   */
  async refresh(): Promise<Session> {
    const current = await this.getSession();
    if (!current) {
      throw new Error('refresh() requires an active session');
    }
    const { data } = await this.http.post<
      ApiResponse<{
        session_token: string;
        refresh_token: string;
      }>
    >('/client/auth/refresh', { refresh_token: current.refreshToken });

    const refreshed: Session = {
      sessionToken: data.data.session_token,
      refreshToken: data.data.refresh_token,
      user: current.user,
      expiresAt: current.expiresAt,
    };
    this.session = refreshed;
    this.http.setSessionToken(refreshed.sessionToken);
    await this.storage.setItem(KEY_SESSION, JSON.stringify(refreshed));
    this.notify(refreshed);
    return refreshed;
  }

  /**
   * Return the current user record from the server. Requires an active
   * session.
   */
  async me(): Promise<AppUser> {
    const { data } = await this.http.get<ApiResponse<AppUser>>('/client/users/me');
    return data.data;
  }

  // ── Listeners ───────────────────────────────────────────────────────

  onAuthStateChange(callback: AuthStateCallback): Unsubscribe {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  // ── Internal helpers ────────────────────────────────────────────────

  /** Called during init to restore session & set bearer token on HttpClient. */
  async restore(): Promise<void> {
    await this.getSession();
  }

  private async persistSession(result: AuthResult): Promise<void> {
    const session: Session = {
      sessionToken: result.session_token,
      refreshToken: result.refresh_token,
      user: result.user,
      // `expires_at` is not currently returned by the API (tokens expire via
      // JWT `exp` claim, not a server-sent wall clock). Fall back to an empty
      // string so the local session object still conforms to the declared
      // type. Callers should not rely on this field for expiry decisions.
      expiresAt: result.expires_at ?? '',
    };

    this.session = session;
    this.http.setSessionToken(session.sessionToken);
    await this.storage.setItem(KEY_SESSION, JSON.stringify(session));
    this.notify(session);
  }

  private notify(session: Session | null): void {
    for (const cb of this.listeners) {
      try {
        cb(session);
      } catch {
        // Swallow listener errors to avoid breaking the notification loop
      }
    }
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────

function generateId(): string {
  // React Native does NOT expose `globalThis.crypto` by default — Expo Go,
  // bare RN, and Hermes all lack it. Client identifiers minted here aren't
  // auth secrets (server JWTs are), so a Math.random UUIDv4 is acceptable.
  // See packages/client/src/sessions.ts for the same rationale.
  const g = globalThis as unknown as { crypto?: { randomUUID?(): string } };
  if (typeof g.crypto?.randomUUID === 'function') return g.crypto.randomUUID();
  const hex = (n: number): string => Math.floor(Math.random() * n).toString(16);
  const part = (len: number): string => Array.from({ length: len }, () => hex(16)).join('');
  return `${part(8)}-${part(4)}-4${part(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${part(3)}-${part(12)}`;
}
