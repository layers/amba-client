/**
 * Customer-blob upload SDK — `Amba.storage.upload(...)`.
 *
 * Blob storage backend is R2 with a shared-bucket-plus-prefix layout by
 * default; bucket-per-project is an opt-in upgrade. From the customer's
 * perspective the SDK looks the same either way — they call
 * `upload({ bucket, file })` and get back a stable URL on
 * `https://{project_slug}.cdn.amba.host/...`.
 *
 * Wire shape:
 *   POST /v1/client/media/upload      — register asset, get presigned PUT
 *   DELETE /v1/client/media/:assetId  — soft-delete + cascade R2 object
 *
 * The SDK does the upload in two HTTP roundtrips:
 *   1. POST → server registers the asset record + returns `{ asset, upload_url }`.
 *   2. PUT → upload_url (presigned R2 PUT) — direct to R2, no API hop.
 *
 * The presigned PUT URL is constructed server-side via R2's S3-compatible
 * signature (no CF API roundtrip per upload). Uploads are bounded by the
 * bucket policy (max size + allowed mime types) — the R2 PUT will reject
 * objects that violate the policy.
 */

import type { HttpClient } from './http.js';

// ─── Public types — wire contract for /client/media/upload ──────────

export interface StorageUploadInput {
  /** Logical bucket name as defined in the bucket policy (e.g. 'media', 'private', 'public'). */
  bucket: string;
  /**
   * The blob to upload. Browser / RN: `Blob` or `File`. Node: `Buffer`
   * or any `BodyInit` accepted by `fetch`. Streaming is delegated to
   * `fetch` — we don't read the whole body into memory.
   */
  file: BodyInit;
  /** MIME type. Required when the bucket policy restricts allowed mime types. */
  contentType?: string;
  /** Customer-displayable filename. Stored on the asset record. */
  filename?: string;
  /**
   * Object lifetime in days. The lifecycle job purges expired objects
   * + their asset records daily at 03:00 UTC. Omit for indefinite.
   */
  retentionDays?: number;
  /** Custom metadata. Stored on the asset record's `metadata` jsonb column. */
  metadata?: Record<string, unknown>;
  /**
   * Optional pre-computed blurhash for image previews. Customer code
   * that already has the bytes in hand can compute this client-side
   * (browser: `blurhash` npm package, ~3KB; React Native: `expo-image`
   * has it built in) and pass the encoded string here so the API
   * persists it on the asset record.
   *
   * Omit if you don't need blurhash previews.
   */
  blurhash?: string;
}

export interface StorageUploadResult {
  /** Asset record UUID. */
  id: string;
  /** Stable public URL on `{project_slug}.cdn.amba.host`. */
  url: string;
  /** Object key (path-prefix + filename) inside the project's R2 prefix. */
  key: string;
}

export interface StorageDeleteInput {
  id: string;
}

export interface StoragePresignInput {
  bucket: string;
  key: string;
  method: 'GET' | 'PUT';
  /** PUT default: 600s (10min). GET default: 3600s (1h). Capped at 86400s (24h). */
  expiresInSeconds?: number;
}

export interface StoragePresignResult {
  url: string;
  expiresAt: string;
}

// ─── Module ──────────────────────────────────────────────────────────

/**
 * `Amba.client.storage` / `Amba.storage` — customer-blob upload SDK.
 *
 * Two-roundtrip upload: the API issues an R2 presigned PUT; the SDK
 * does the actual byte-pumping straight to R2. This keeps the API path
 * off the upload data path entirely (zero proxy bandwidth).
 */
export class StorageModule {
  constructor(private readonly http: HttpClient) {}

  /**
   * Upload a blob and return its stable URL. Performs:
   *   1. POST /client/media/upload — server inserts asset record + issues presigned PUT.
   *   2. PUT presigned-url — body upload directly to R2.
   *
   * Failures on step 2 leave a "phantom" asset record in the DB whose
   * object doesn't exist; the lifecycle purge sweeps these (records
   * whose `expires_at` is set and whose object 404s on HEAD). Customers
   * re-upload to the same `id` if they need to retry.
   */
  async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    // Build the metadata payload the API expects.
    const registerBody: Record<string, unknown> = {
      bucket: input.bucket,
    };
    if (input.contentType !== undefined) registerBody['content_type'] = input.contentType;
    if (input.filename !== undefined) registerBody['filename'] = input.filename;
    if (input.retentionDays !== undefined) registerBody['retention_days'] = input.retentionDays;
    if (input.metadata !== undefined) registerBody['metadata'] = input.metadata;
    if (input.blurhash !== undefined) registerBody['blurhash'] = input.blurhash;

    const { data: registered } = await this.http.post<{
      data: { id: string; key: string; url: string };
      upload_url: string;
    }>('/client/media/upload', registerBody);

    // Direct PUT to R2. The presigned URL embeds the auth + content-type
    // expectation; we forward content-type if the customer supplied it
    // (R2 verifies it matches the signed value).
    const putHeaders: Record<string, string> = {};
    if (input.contentType) putHeaders['Content-Type'] = input.contentType;

    const putRes = await fetch(registered.upload_url, {
      method: 'PUT',
      headers: putHeaders,
      body: input.file,
    });
    if (!putRes.ok) {
      throw new Error(
        `R2 upload failed: ${putRes.status} ${putRes.statusText}` +
          (putRes.headers.get('content-type')?.includes('xml')
            ? ` — ${(await putRes.text().catch(() => '')).slice(0, 256)}`
            : ''),
      );
    }

    return {
      id: registered.data.id,
      url: registered.data.url,
      key: registered.data.key,
    };
  }

  /**
   * Soft-delete an asset (sets `deleted_at` on the record + queues an
   * R2 object delete). Idempotent — deleting an already-deleted asset
   * returns `{ count: 0 }` without throwing.
   */
  async delete(input: StorageDeleteInput): Promise<{ count: number }> {
    try {
      await this.http.delete(`/client/media/${encodeURIComponent(input.id)}`);
      return { count: 1 };
    } catch (err) {
      // 404 is the idempotent "already gone" case.
      const status = (err as { status?: number } | null)?.status;
      if (status === 404) return { count: 0 };
      throw err;
    }
  }

  /**
   * Issue a presigned URL the customer can hand to a third party for
   * direct upload (PUT) or download (GET). The server signs against R2
   * using the project's R2 access key — the customer never sees the
   * underlying credentials.
   *
   * PUT URLs honor the bucket policy (max size + allowed mime types)
   * — the signed PUT will reject mismatches at R2. GET URLs are
   * unconditional reads.
   */
  async presign(input: StoragePresignInput): Promise<StoragePresignResult> {
    const { data } = await this.http.post<{
      data: { url: string; expires_at: string };
    }>('/client/media/presign', {
      bucket: input.bucket,
      key: input.key,
      method: input.method,
      ...(input.expiresInSeconds !== undefined
        ? { expires_in_seconds: input.expiresInSeconds }
        : {}),
    });
    return {
      url: data.data.url,
      expiresAt: data.data.expires_at,
    };
  }
}
