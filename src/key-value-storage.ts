/**
 * Platform-agnostic key-value storage interface (AsyncStorage-shape).
 *
 * Used by the SDK for persisting session tokens, anonymous ids, and the
 * remote-config cache — small string blobs keyed by a stable name. NOT
 * the same surface as the customer-blob upload SDK (`./storage.ts` —
 * `Amba.storage.upload(...)`); that one writes to R2 via presigned PUTs.
 *
 * The default implementation uses an in-memory Map. Platform wrappers
 * supply persistent implementations — `@layers/amba-expo` exports
 * `asyncStorageAdapter` backed by `@react-native-async-storage/async-storage`,
 * and the Expo `Amba` singleton installs it automatically during `init()`.
 */
export interface AmbaStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Simple in-memory storage for environments without persistent storage. */
export class InMemoryStorage implements AmbaStorage {
  private store = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.store.delete(key);
  }
}
