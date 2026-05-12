import type { CatalogItem, ApiListResponse, ApiResponse } from '@layers/amba-shared';
import type { HttpClient } from './http.js';

export interface CatalogListOptions {
  category?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}

export class CatalogModule {
  constructor(private readonly http: HttpClient) {}

  /** Browse the catalog with optional filters. */
  async list(options?: CatalogListOptions): Promise<{ data: CatalogItem[]; total: number }> {
    const params: Record<string, string> = {};
    if (options?.category) params.category = options.category;
    if (options?.tag) params.tag = options.tag;
    if (options?.limit !== undefined) params.limit = String(options.limit);
    if (options?.offset !== undefined) params.offset = String(options.offset);

    const queryStr = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';

    const { data } = await this.http.get<ApiListResponse<CatalogItem>>(
      `/client/catalog${queryStr}`,
    );
    return { data: data.data, total: data.total };
  }

  /** Get detailed information about a specific catalog item. */
  async get(itemId: string): Promise<CatalogItem> {
    const { data } = await this.http.get<ApiResponse<CatalogItem>>(`/client/catalog/${itemId}`);
    return data.data;
  }
}
