import type { Store, StoreListing, ApiResponse } from '@layers/amba-shared';
import type { HttpClient } from './http.js';

export interface StoreWithListings {
  store: Store;
  listings: StoreListing[];
}

export class StoreModule {
  constructor(private readonly http: HttpClient) {}

  /** Fetch all active stores. */
  async list(): Promise<Store[]> {
    const { data } = await this.http.get<{ data: Store[] }>('/client/stores');
    return data.data;
  }

  /** Fetch a specific store with its listings. */
  async get(storeId: string): Promise<StoreWithListings> {
    const { data } = await this.http.get<ApiResponse<StoreWithListings>>(
      `/client/stores/${storeId}`,
    );
    return data.data;
  }
}
