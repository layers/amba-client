import type { TrackEventInput } from '@layers/amba-shared';
import { HttpClient } from './http.js';
// AsyncStorage-shape interface used internally by AuthModule + ConfigModule.
import { InMemoryStorage } from './key-value-storage.js';
import type { AmbaStorage } from './key-value-storage.js';
// Customer-blob upload SDK (R2-backed).
import { StorageModule } from './storage.js';
import { AuthModule } from './auth.js';
import { StreakModule } from './streaks.js';
import { ContentModule } from './content.js';
import { ConfigModule } from './config.js';
import { EntitlementModule } from './entitlements.js';
import { PushModule } from './push.js';
import { AchievementModule } from './achievements.js';
import { CatalogModule } from './catalog.js';
import { ChallengeModule } from './challenges.js';
import { CurrencyModule } from './currencies.js';
import { DeepLinkModule } from './deep-links.js';
import { FeedModule } from './feeds.js';
import { FriendModule } from './friends.js';
import { GroupModule } from './groups.js';
import { InventoryModule } from './inventory.js';
import { LeaderboardModule } from './leaderboards.js';
import { MediaModule } from './media.js';
import { MessagingModule } from './messaging.js';
import { ModerationModule } from './moderation.js';
import { OnboardingModule } from './onboarding.js';
import { ReferralModule } from './referrals.js';
import { ReviewModule } from './reviews.js';
import { RoleModule } from './roles.js';
import { SessionModule } from './sessions.js';
import { StoreModule } from './stores.js';
import { SyncModule } from './sync.js';
import { XpModule } from './xp.js';
import { CollectionsModule, makeCollectionsProxy, type CollectionsRoot } from './collections.js';
import { AiModule } from './ai.js';
import { EmailModule } from './email.js';

// ─── Re-exports ────────────────────────────────────────────────────────

export type { AmbaStorage } from './key-value-storage.js';
export { InMemoryStorage } from './key-value-storage.js';
// Customer-blob upload SDK — `Amba.storage.upload(...)` etc.
export {
  StorageModule,
  type StorageUploadInput,
  type StorageUploadResult,
  type StorageDeleteInput,
  type StoragePresignInput,
  type StoragePresignResult,
} from './storage.js';
export { HttpClient, AmbaApiError } from './http.js';
export type { HttpClientConfig, RequestOptions, HttpResponse } from './http.js';
// Codegen engine — consumed by the `amba types generate` CLI command.
// Re-exported here so the CLI can import from the package barrel.
export { generateCollectionTypes } from './codegen/index.js';
export type {
  CodegenHttpClient,
  GenerateTypesInput,
  GenerateTypesResult,
} from './codegen/index.js';
// Typed error hierarchy. Re-exported so `instanceof AmbaAuthError` works
// on the end-user device side. Identity is preserved across the wire format.
export {
  AmbaError,
  AmbaAuthError,
  AmbaInternalError,
  AmbaNotFoundError,
  AmbaRateLimitError,
  AmbaTenantUnavailableError,
  AmbaValidationError,
  deserializeAmbaError,
  isAmbaError,
  serializeAmbaError,
} from './errors.js';
export type {
  AmbaAuthCode,
  AmbaErrorJsonBody,
  AmbaErrorKind,
  AmbaErrorOptions,
  AmbaNotFoundDetails,
  AmbaRateLimitDetails,
  AmbaTenantUnavailableDetails,
  AmbaValidationDetails,
  AmbaValidationFieldError,
  AnyAmbaError,
} from './errors.js';
// Collections SDK — the end-user-device counterpart to ctx.collections.
export {
  CollectionsModule,
  makeCollectionsProxy,
  type ClientCollection,
  type CollectionsRoot,
  type CountQuery,
  type CreateInput,
  type DeleteQuery,
  type FindNearestQuery,
  type FindNearestResult,
  type FindQuery,
  type PaginatedFindResult,
  type UpdateQuery,
  type WhereClause,
} from './collections.js';
export { AuthModule } from './auth.js';
export type { Session, AuthStateCallback, Unsubscribe } from './auth.js';
export { StreakModule } from './streaks.js';
export { ContentModule } from './content.js';
export type { ContentListOptions } from './content.js';
export { ConfigModule } from './config.js';
export { EntitlementModule } from './entitlements.js';
export { PushModule } from './push.js';
export { AchievementModule } from './achievements.js';
export type { AchievementWithProgress } from './achievements.js';
export { CatalogModule } from './catalog.js';
export { ChallengeModule } from './challenges.js';
export { CurrencyModule } from './currencies.js';
export type { CurrencyBalanceView } from './currencies.js';
export { DeepLinkModule } from './deep-links.js';
export { FeedModule } from './feeds.js';
export { FriendModule } from './friends.js';
export { GroupModule } from './groups.js';
export { InventoryModule } from './inventory.js';
export { LeaderboardModule } from './leaderboards.js';
export { MediaModule } from './media.js';
export { MessagingModule } from './messaging.js';
export { ModerationModule } from './moderation.js';
export { OnboardingModule } from './onboarding.js';
export { ReferralModule } from './referrals.js';
export { ReviewModule } from './reviews.js';
export { RoleModule } from './roles.js';
export { SessionModule } from './sessions.js';
export { StoreModule } from './stores.js';
export { SyncModule } from './sync.js';
export { XpModule } from './xp.js';
// AI invocation SDK — `Amba.ai.invoke('prompt_name', {context})` for
// prompts configured as client-invokable.
export { AiModule, type AiInvokeOptions } from './ai.js';
// Email send SDK — `Amba.email.send({ template, data })` from end-user
// devices. Recipient is locked to the bound session's user.
export { EmailModule, type EmailSendInput, type EmailSendResult } from './email.js';

// ─── Config ────────────────────────────────────────────────────────────

export interface AmbaConfig {
  projectId: string;
  apiKey: string;
  apiUrl?: string;
  environment?: 'development' | 'production';
  storage?: AmbaStorage;
}

// ─── Client ────────────────────────────────────────────────────────────

export class AmbaClient {
  readonly auth: AuthModule;
  readonly streaks: StreakModule;
  readonly content: ContentModule;
  readonly config: ConfigModule;
  readonly entitlements: EntitlementModule;
  readonly push: PushModule;
  readonly achievements: AchievementModule;
  readonly catalog: CatalogModule;
  readonly challenges: ChallengeModule;
  readonly currencies: CurrencyModule;
  readonly deepLinks: DeepLinkModule;
  readonly feeds: FeedModule;
  readonly friends: FriendModule;
  readonly groups: GroupModule;
  readonly inventory: InventoryModule;
  readonly leaderboards: LeaderboardModule;
  readonly media: MediaModule;
  readonly messaging: MessagingModule;
  readonly moderation: ModerationModule;
  readonly onboarding: OnboardingModule;
  readonly referrals: ReferralModule;
  readonly reviews: ReviewModule;
  readonly roles: RoleModule;
  readonly sessions: SessionModule;
  readonly stores: StoreModule;
  readonly sync: SyncModule;
  readonly xp: XpModule;
  /**
   * Customer-collection accessor. `client.collections.<name>.<method>()`
   * resolves dynamically through a `Proxy` so codegen can augment
   * specific names (`Amba.collections.posts`) via TypeScript module
   * augmentation. The same surface is exposed on `Amba.collections` as
   * a singleton sugar getter.
   */
  readonly collections: CollectionsRoot;
  private readonly collectionsModule: CollectionsModule;
  /**
   * Customer-blob upload SDK. `client.storage.upload({...})` writes to
   * R2 via a presigned PUT issued by the API. The same surface is
   * exposed on `Amba.storage` as a singleton sugar getter.
   *
   * NOTE: distinct from the private AsyncStorage shim (`kvStore`) that
   * AuthModule + ConfigModule use for session token / config caching.
   * The shim's interface name is `AmbaStorage`; this field is the
   * upload SDK.
   */
  readonly storage: StorageModule;
  /**
   * AI invocation SDK — calls client-invokable registered prompts
   * via `/client/ai/prompts/:name/invoke`. The same surface is exposed
   * on `Amba.ai` as a singleton sugar getter (see below).
   */
  readonly ai: AiModule;
  /**
   * Email send SDK — `client.email.send({ template, data })` triggers
   * a transactional email to the signed-in end-user. Recipient is
   * locked to the bound session's user server-side; the wire has no
   * `to` field. The same surface is exposed on `Amba.email` as a
   * singleton sugar getter.
   */
  readonly email: EmailModule;

  private readonly http: HttpClient;
  /**
   * AsyncStorage-shape key-value shim — used internally by AuthModule
   * (session token persistence) + ConfigModule (remote-config cache).
   */
  private readonly kvStore: AmbaStorage;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly clientConfig: AmbaConfig) {
    this.kvStore = clientConfig.storage ?? new InMemoryStorage();

    this.http = new HttpClient({
      apiKey: clientConfig.apiKey,
      apiUrl: clientConfig.apiUrl,
    });

    this.auth = new AuthModule(this.http, this.kvStore);
    this.streaks = new StreakModule(this.http);
    this.content = new ContentModule(this.http);
    this.config = new ConfigModule(this.http, this.kvStore);
    this.entitlements = new EntitlementModule(this.http);
    this.push = new PushModule(this.http);
    this.achievements = new AchievementModule(this.http);
    this.catalog = new CatalogModule(this.http);
    this.challenges = new ChallengeModule(this.http);
    this.currencies = new CurrencyModule(this.http);
    this.deepLinks = new DeepLinkModule(this.http);
    this.feeds = new FeedModule(this.http);
    this.friends = new FriendModule(this.http);
    this.groups = new GroupModule(this.http);
    this.inventory = new InventoryModule(this.http);
    this.leaderboards = new LeaderboardModule(this.http);
    this.media = new MediaModule(this.http);
    this.messaging = new MessagingModule(this.http);
    this.moderation = new ModerationModule(this.http);
    this.onboarding = new OnboardingModule(this.http);
    this.referrals = new ReferralModule(this.http);
    this.reviews = new ReviewModule(this.http);
    this.roles = new RoleModule(this.http);
    this.sessions = new SessionModule(this.http);
    this.stores = new StoreModule(this.http);
    this.sync = new SyncModule(this.http);
    this.xp = new XpModule(this.http);
    this.collectionsModule = new CollectionsModule(this.http);
    this.collections = makeCollectionsProxy(this.collectionsModule);
    this.storage = new StorageModule(this.http);
    this.ai = new AiModule(this.http);
    this.email = new EmailModule(this.http);
  }

  /**
   * Initialise the client: restore session, create anonymous identity,
   * fetch remote config, and load cached streaks.
   *
   * Safe to call multiple times — subsequent calls return the same promise.
   */
  async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.performInit();
    }
    return this.initPromise;
  }

  /**
   * Track a custom event.
   *
   * Sends to POST /client/events with event name and optional properties.
   */
  async track(event: string, properties?: Record<string, unknown>): Promise<void> {
    const body: TrackEventInput = { event, properties };
    await this.http.post('/client/events', body);
  }

  /** Returns the project id this client was configured with. */
  get projectId(): string {
    return this.clientConfig.projectId;
  }

  /** Returns the current environment. */
  get environment(): 'development' | 'production' {
    return this.clientConfig.environment ?? 'production';
  }

  // ── Internal ────────────────────────────────────────────────────────

  private async performInit(): Promise<void> {
    // Restore persisted session (sets bearer token on http client)
    await this.auth.restore();

    // Ensure an anonymous id exists
    await this.auth.getAnonymousId();

    // Restore cached config, then refresh from server in background
    await this.config.restore();

    // Non-blocking: refresh config from server
    this.config.refresh().catch(() => {
      // Swallow — stale config is fine for now
    });
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────

let singletonInstance: AmbaClient | null = null;

/**
 * Convenience singleton. Call `Amba.configure(config)` once, then use
 * `Amba.client` everywhere.
 */
export const Amba = {
  /** Initialise the singleton client. */
  configure(config: AmbaConfig): AmbaClient {
    singletonInstance = new AmbaClient(config);
    return singletonInstance;
  },

  /** Access the configured client. Throws if `configure` has not been called. */
  get client(): AmbaClient {
    if (!singletonInstance) {
      throw new Error(
        'Amba has not been configured. Call Amba.configure({ projectId, apiKey }) first.',
      );
    }
    return singletonInstance;
  },

  /**
   * Sugar — `Amba.collections.<name>` is identical to
   * `Amba.client.collections.<name>`. Throws the same "not configured"
   * error as `Amba.client` when `configure()` hasn't run, so the
   * surface is observationally indistinguishable to customer code.
   * All access forms resolve to the same underlying Collection
   * instances; there is no observable difference at runtime.
   */
  get collections(): AmbaClient['collections'] {
    if (!singletonInstance) {
      throw new Error(
        'Amba has not been configured. Call Amba.configure({ projectId, apiKey }) first.',
      );
    }
    return singletonInstance.collections;
  },

  /**
   * Sugar — `Amba.storage.upload(...)` is identical to
   * `Amba.client.storage.upload(...)`. Same "not configured" throw as
   * the other top-level getters.
   */
  get storage(): AmbaClient['storage'] {
    if (!singletonInstance) {
      throw new Error(
        'Amba has not been configured. Call Amba.configure({ projectId, apiKey }) first.',
      );
    }
    return singletonInstance.storage;
  },

  /**
   * Sugar — `Amba.ai.invoke('prompt', ...)` is identical to
   * `Amba.client.ai.invoke('prompt', ...)`. Same "not configured" throw
   * shape.
   */
  get ai(): AmbaClient['ai'] {
    if (!singletonInstance) {
      throw new Error(
        'Amba has not been configured. Call Amba.configure({ projectId, apiKey }) first.',
      );
    }
    return singletonInstance.ai;
  },

  /**
   * Sugar — `Amba.email.send({ template, data })` is identical to
   * `Amba.client.email.send(...)`. Same "not configured" throw shape.
   */
  get email(): AmbaClient['email'] {
    if (!singletonInstance) {
      throw new Error(
        'Amba has not been configured. Call Amba.configure({ projectId, apiKey }) first.',
      );
    }
    return singletonInstance.email;
  },
};
