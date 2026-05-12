import type { ContentItem, ApiResponse, ApiListResponse } from '@layers/amba-shared';
import type { HttpClient } from './http.js';

export interface ContentListOptions {
  category?: string;
  limit?: number;
  offset?: number;
}

// Client-authored create input. Matches `CreateContentItemInput` from
// `@layers/amba-shared` but excludes admin-only curation fields (is_premium,
// sort_order). Expressed locally so the SDK surface doesn't drift if the
// server accepts additional fields in the future.
export interface CreateContentItemInput {
  title?: string | null;
  body: string;
  media_url?: string | null;
  category?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateContentItemInput {
  title?: string | null;
  body?: string;
  media_url?: string | null;
  category?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
  is_active?: boolean;
}

export class ContentModule {
  constructor(private readonly http: HttpClient) {}

  /** Get today's scheduled content items. */
  async getToday(): Promise<ContentItem[]> {
    const { data } = await this.http.get<ApiListResponse<ContentItem>>('/client/content/today');
    return data.data;
  }

  /** List content items in a specific library with optional filtering. */
  async getLibrary(libraryId: string, options: ContentListOptions = {}): Promise<ContentItem[]> {
    const params = new URLSearchParams();
    if (options.category) params.set('category', options.category);
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));

    const query = params.toString();
    const path = `/client/content/libraries/${libraryId}/items${query ? `?${query}` : ''}`;

    const { data } = await this.http.get<ApiListResponse<ContentItem>>(path);
    return data.data;
  }

  /** Get a single content item by id. */
  async getItem(itemId: string): Promise<ContentItem> {
    const { data } = await this.http.get<ApiResponse<ContentItem>>(
      `/client/content/items/${itemId}`,
    );
    return data.data;
  }

  /** Create a content item in a library. The server stamps ownership
   *  from the current session — the caller cannot set `owner_app_user_id`. */
  async createItem(libraryId: string, input: CreateContentItemInput): Promise<ContentItem> {
    const { data } = await this.http.post<ApiResponse<ContentItem>>(
      `/client/content/libraries/${libraryId}/items`,
      input,
    );
    return data.data;
  }

  /** Update a content item. The server rejects the update with 404 if
   *  the item is not owned by the current user. */
  async updateItem(itemId: string, input: UpdateContentItemInput): Promise<ContentItem> {
    // HttpClient doesn't expose a `patch()` helper yet — use the generic
    // request path (same pattern used by ReviewModule.update).
    const { data } = await this.http.request<ApiResponse<ContentItem>>(
      `/client/content/items/${itemId}`,
      { method: 'PATCH', body: input },
    );
    return data.data;
  }

  /** Delete a content item. The server rejects with 404 if the item is
   *  not owned by the current user. */
  async deleteItem(itemId: string): Promise<void> {
    await this.http.delete(`/client/content/items/${itemId}`);
  }
}
