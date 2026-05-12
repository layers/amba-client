import { CONFIG_CACHE_TTL_SECONDS } from '@layers/amba-shared';
import type { HttpClient } from './http.js';
import type { AmbaStorage } from './key-value-storage.js';

// ─── Storage Keys ──────────────────────────────────────────────────────

const KEY_CONFIG_CACHE = 'amba_config_cache';
const KEY_CONFIG_ETAG = 'amba_config_etag';
const KEY_CONFIG_FETCHED_AT = 'amba_config_fetched_at';

// ─── ConfigModule ──────────────────────────────────────────────────────

export class ConfigModule {
  private cache: Record<string, unknown> | null = null;
  private etag: string | null = null;
  private fetchedAt: number = 0;

  constructor(
    private readonly http: HttpClient,
    private readonly storage: AmbaStorage,
  ) {}

  /** Get a single config value by key. Returns `undefined` if the key is missing. */
  async get(key: string): Promise<unknown> {
    const all = await this.getAll();
    return all[key];
  }

  /** Get the full resolved config map, loading from cache or server as needed. */
  async getAll(): Promise<Record<string, unknown>> {
    if (this.cache && !this.isStale()) {
      return this.cache;
    }

    await this.fetchConfig();
    return this.cache ?? {};
  }

  /** Force-refresh the config from the server, bypassing the TTL check. */
  async refresh(): Promise<void> {
    await this.fetchConfig();
  }

  /** Restore cached config from storage during init. */
  async restore(): Promise<void> {
    const raw = await this.storage.getItem(KEY_CONFIG_CACHE);
    if (raw) {
      try {
        this.cache = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        this.cache = null;
      }
    }

    this.etag = await this.storage.getItem(KEY_CONFIG_ETAG);

    const fetchedAtStr = await this.storage.getItem(KEY_CONFIG_FETCHED_AT);
    this.fetchedAt = fetchedAtStr ? Number(fetchedAtStr) : 0;
  }

  // ── Internal ────────────────────────────────────────────────────────

  private isStale(): boolean {
    return Date.now() - this.fetchedAt > CONFIG_CACHE_TTL_SECONDS * 1000;
  }

  private async fetchConfig(): Promise<void> {
    // GET /client/config responds with { data: { key: value } }. Previously
    // we stored the whole envelope (`response.data`) so `get('foo')` looked
    // up `envelope.foo` and always came back undefined. Unwrap to the
    // inner map here so the public API behaves as documented.
    const response = await this.http.get<{ data: Record<string, unknown> }>(
      '/client/config',
      this.etag ? { etag: this.etag } : undefined,
    );

    if (response.status === 304) {
      // Content hasn't changed — just bump the fetch time
      this.fetchedAt = Date.now();
      await this.storage.setItem(KEY_CONFIG_FETCHED_AT, String(this.fetchedAt));
      return;
    }

    this.cache = response.data?.data ?? {};
    this.etag = response.etag ?? null;
    this.fetchedAt = Date.now();

    await Promise.all([
      this.storage.setItem(KEY_CONFIG_CACHE, JSON.stringify(this.cache)),
      this.storage.setItem(KEY_CONFIG_FETCHED_AT, String(this.fetchedAt)),
      this.etag
        ? this.storage.setItem(KEY_CONFIG_ETAG, this.etag)
        : this.storage.removeItem(KEY_CONFIG_ETAG),
    ]);
  }
}
