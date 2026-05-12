import type { UserInventoryItem, ApiResponse } from '@layers/amba-shared';
import type { HttpClient } from './http.js';

export interface PurchaseResult {
  purchased: boolean;
  currency_code: string;
  price: number;
  balance_after: number;
}

export class InventoryModule {
  constructor(private readonly http: HttpClient) {}

  /** Fetch the current user's inventory. */
  async getAll(): Promise<UserInventoryItem[]> {
    const { data } = await this.http.get<{ data: UserInventoryItem[] }>('/client/inventory');
    return data.data;
  }

  /** Purchase an item from the catalog or a store using virtual currency. */
  async purchase(
    catalogItemId: string,
    currencyCode: string,
    storeId?: string,
  ): Promise<PurchaseResult> {
    const body: Record<string, unknown> = {
      catalog_item_id: catalogItemId,
      currency_code: currencyCode,
    };
    if (storeId) body.store_id = storeId;

    const { data } = await this.http.post<ApiResponse<PurchaseResult>>(
      '/client/inventory/purchase',
      body,
    );
    return data.data;
  }

  /** Consume a consumable item, reducing its quantity. */
  async consume(catalogItemId: string, quantity?: number): Promise<UserInventoryItem> {
    const body: Record<string, unknown> = {};
    if (quantity !== undefined) body.quantity = quantity;

    const { data } = await this.http.post<ApiResponse<UserInventoryItem>>(
      `/client/inventory/${catalogItemId}/consume`,
      body,
    );
    return data.data;
  }
}
