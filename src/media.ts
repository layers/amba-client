import type { ApiResponse, ApiListResponse } from '@layers/amba-shared';
import type { MediaAsset } from '@layers/amba-shared/platform-types';
import type { HttpClient } from './http.js';

export class MediaModule {
  constructor(private readonly http: HttpClient) {}

  /** Get a single media asset by ID. */
  async get(assetId: string): Promise<MediaAsset> {
    const { data } = await this.http.get<ApiResponse<MediaAsset>>(`/client/media/${assetId}`);
    return data.data;
  }

  /** List available media assets. */
  async list(options?: {
    folderId?: string;
    limit?: number;
    offset?: number;
  }): Promise<MediaAsset[]> {
    const params = new URLSearchParams();
    if (options?.folderId) params.set('folder_id', options.folderId);
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    if (options?.offset !== undefined) params.set('offset', String(options.offset));

    const query = params.toString();
    const path = query ? `/client/media?${query}` : '/client/media';

    const { data } = await this.http.get<ApiListResponse<MediaAsset>>(path);
    return data.data;
  }

  /** Upload user media (e.g. avatar). Returns asset record and upload URL. */
  async upload(input: {
    filename: string;
    mimeType: string;
    sizeBytes?: number;
  }): Promise<{ asset: MediaAsset; uploadUrl: string }> {
    const { data } = await this.http.post<{ data: MediaAsset; upload_url: string }>(
      '/client/media/upload',
      {
        filename: input.filename,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
      },
    );
    return {
      asset: data.data,
      uploadUrl: data.upload_url,
    };
  }
}
