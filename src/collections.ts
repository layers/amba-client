/**
 * `@layers/amba-client` — collections SDK.
 *
 * End-user-device counterpart to `ctx.collections.<name>` from
 * `@layers/amba-functions`. The query DSL shape is byte-identical to
 * the server-side surface: one mental model, one set of typed helpers.
 * The two surfaces differ only in trust posture — server-side code can
 * `.asUser(uid)` to narrow to a specific user, end-user code is
 * auto-scoped server-side to the signed-in user and has no `.asUser()`.
 *
 * Three access forms:
 *
 *   Amba.collections.posts.find(...)          // sugar getter
 *   Amba.client.collections.posts.find(...)   // canonical
 *   client.collections.posts.find(...)        // direct-instance
 *
 * All three resolve to the same {@link ClientCollection} instance per
 * `(client, name)` pair. The `collections` value is a `Proxy` that
 * lazily constructs `ClientCollection<TRow>` per accessed name and
 * caches them so repeated `.posts` lookups return the same handle.
 *
 * Wire shape — every method calls one of these routes:
 *   POST   /v1/client/collections/<name>          create
 *   GET    /v1/client/collections/<name>          find / count (with `query` arg)
 *   GET    /v1/client/collections/<name>/:id      findOne
 *   PATCH  /v1/client/collections/<name>/:id      update (single-id form)
 *   DELETE /v1/client/collections/<name>/:id      delete (single-id form)
 *
 * The server enforces auto-RLS (`WHERE user_id = appUserId AND deleted_at
 * IS NULL`) on every read and write, so the client never sends a `user_id`
 * filter — the DSL accepts it for symmetry with the server-side surface
 * but it's ignored when present (server overrides). The server also
 * strips server-managed columns from the create payload silently.
 */

import type { HttpClient } from './http.js';
import { isReservedCollectionName } from '@layers/amba-shared';
import { AmbaValidationError } from './errors.js';

// ─── DSL types ──────────────────────────────────────────────────────

/**
 * Where clause. Mirrors `WhereClause<TRow>` from `@layers/amba-functions`
 * — same shape on the server and on the end-user device. Each field can
 * be a literal (eq shorthand) or an operator object; `and` / `or` /
 * `not` compose nested clauses.
 */
export type WhereClause<TRow> = {
  [K in keyof TRow]?:
    | TRow[K]
    | { eq: TRow[K] }
    | { ne: TRow[K] }
    | { gt: TRow[K] }
    | { gte: TRow[K] }
    | { lt: TRow[K] }
    | { lte: TRow[K] }
    | { in: TRow[K][] }
    | { notIn: TRow[K][] }
    | { like: string }
    | { ilike: string }
    | { isNull: true }
    | { isNotNull: true };
} & {
  and?: WhereClause<TRow>[];
  or?: WhereClause<TRow>[];
  not?: WhereClause<TRow>;
};

export type CreateInput<TRow> = Omit<TRow, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>;

export interface FindQuery<TRow> {
  where?: WhereClause<TRow>;
  /**
   * Single-column form: `'scanned_at desc'` or `'scanned_at'` (asc default).
   * Multi-column form: `['scanned_at desc', 'id asc']`.
   * Cursor pagination requires single-column form.
   */
  order?:
    | `${string} asc`
    | `${string} desc`
    | string
    | (`${string} asc` | `${string} desc` | string)[];
  /** Page size. Server-enforced max 1000; default 50. */
  limit?: number;
  /**
   * Offset-based pagination. **Discouraged past offset > 1000** — O(N) on
   * the database; cursor pagination is preferred. Mutually exclusive with
   * `cursor`.
   */
  offset?: number;
  /**
   * Opaque cursor — base64url-encoded `{orderColumn, orderValue, id}`
   * returned by a prior `find({...paginate: true})` as `next_cursor`.
   * Mutually exclusive with `offset`.
   */
  cursor?: string;
  /** Column projection. Empty / undefined = SELECT *. */
  select?: (keyof TRow)[];
  /** Include soft-deleted rows. Default false. */
  includeDeleted?: boolean;
}

export interface PaginatedFindResult<TRow> {
  rows: TRow[];
  next_cursor: string | null;
}

export interface UpdateQuery<TRow> {
  /** Required — no implicit "update all". Empty `where: {}` is allowed but logged server-side. */
  where: WhereClause<TRow>;
  set: Partial<Omit<TRow, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>>;
  /** Cap on row count. Defaults 1000; max 10_000. */
  limit?: number;
}

export interface DeleteQuery<TRow> {
  where: WhereClause<TRow>;
  limit?: number;
}

export type CountQuery<TRow> = Pick<FindQuery<TRow>, 'where' | 'includeDeleted'>;

/**
 * Nearest-vec input. Either `to: number[]` (pre-computed embedding)
 * OR `to: string` (server fetches embedding via the AI gateway). The
 * server's `/find-nearest` route handles the embedding fetch when
 * `to` is text — keeps the secret-key boundary on the server and
 * means customer code doesn't need to call `Amba.ai.embeddings.create`
 * separately.
 */
export interface FindNearestQuery<TRow> {
  /** Pre-computed embedding OR text to embed via the AI gateway. */
  to: number[] | string;
  /**
   * Number of nearest rows to return. Default 10, max 100. The route
   * caps server-side regardless of input.
   */
  k?: number;
  /** Vector column name. Defaults to `'embedding'` if not specified. */
  column?: string;
  /**
   * Distance operator. MUST match the index's operator class — if
   * the customer declared `vector: { distance: 'l2' }` on the
   * collection schema, the index uses `vector_l2_ops` and the query
   * here must specify `'l2'` or pgvector falls back to a sequential
   * scan (correct results, slower).
   */
  distance?: 'cosine' | 'l2' | 'inner_product';
  /**
   * When `to` is a string, the embedding model used to encode it.
   * Default `text-embedding-3-small`.
   */
  embeddingModel?: string;
  embeddingProvider?: 'openai';
  /** Additional WHERE conditions on top of nearest. */
  where?: WhereClause<TRow>;
  /** Cursor for pagination (next_cursor from a previous response). */
  cursor?: string;
  includeDeleted?: boolean;
}

export type FindNearestResult<TRow> = {
  rows: Array<TRow & { _distance: number }>;
  next_cursor: string | null;
};

// ─── Public Collection interface ─────────────────────────────────────

/**
 * The end-user `Amba.collections.<name>` surface. Mirrors the
 * server-side `Collection<TRow>` interface from `@layers/amba-functions`
 * EXCEPT for `.asUser()` — that primitive is server-side only, because
 * every `/client/*` call is auto-scoped to the signed-in user server-side.
 *
 * `count()` is exposed in addition to find/findOne. `find` has two
 * overloads — without `paginate` returns `TRow[]`, with `paginate: true`
 * returns the cursor envelope.
 */
export interface ClientCollection<TRow extends Record<string, unknown> = Record<string, unknown>> {
  create(input: CreateInput<TRow>): Promise<TRow>;
  find(query?: FindQuery<TRow>): Promise<TRow[]>;
  find(query: FindQuery<TRow> & { paginate: true }): Promise<PaginatedFindResult<TRow>>;
  findOne(idOrQuery: string | FindQuery<TRow>): Promise<TRow | null>;
  count(query?: CountQuery<TRow>): Promise<number>;
  update(query: UpdateQuery<TRow> | { id: string; set: UpdateQuery<TRow>['set'] }): Promise<TRow[]>;
  delete(query: DeleteQuery<TRow> | { id: string }): Promise<{ count: number }>;
  /**
   * Nearest-vec lookup. Input is either a pre-computed embedding
   * (`number[]`) or a text string the server embeds via the AI gateway.
   * Returns rows ordered by distance ASC plus a synthesized `_distance`
   * column. Cursor pagination encodes `(distance, id)`.
   *
   * Requires the collection to have a `vector(N)` column (default
   * `'embedding'`) and ideally an ivfflat or hnsw index whose
   * operator class matches the `distance` parameter.
   */
  findNearest(query: FindNearestQuery<TRow>): Promise<FindNearestResult<TRow>>;
}

// ─── Module ──────────────────────────────────────────────────────────

/**
 * Root module — factory the AmbaClient holds. The `collections` field on
 * `AmbaClient` is a `Proxy` over an instance of this; each `.<name>`
 * lookup returns the cached `ClientCollection`.
 *
 * Customers don't construct this directly — they reach it via
 * `Amba.collections.<name>` / `client.collections.<name>`.
 */
export class CollectionsModule {
  private readonly cache = new Map<string, ClientCollectionImpl<Record<string, unknown>>>();

  constructor(private readonly http: HttpClient) {}

  /**
   * Resolve a collection by name. Validates against the reserved-prefix
   * list before any HTTP call — typing a reserved name from customer
   * code throws synchronously rather than burning a roundtrip.
   *
   * Caches per-name so repeated lookups return the same handle (handy
   * for code that compares `Amba.collections.posts === client.collections.posts`).
   */
  get<TRow extends Record<string, unknown> = Record<string, unknown>>(
    name: string,
  ): ClientCollection<TRow> {
    if (isReservedCollectionName(name)) {
      throw new AmbaValidationError({
        code: 'invalid_argument',
        message: `Collection name '${name}' is reserved or invalid`,
        details: {
          fields: [{ path: 'collection', message: 'reserved name', received: name }],
        },
      });
    }
    let coll = this.cache.get(name);
    if (!coll) {
      coll = new ClientCollectionImpl<Record<string, unknown>>(name, this.http);
      this.cache.set(name, coll);
    }
    return coll as unknown as ClientCollection<TRow>;
  }
}

/**
 * Build the Proxy that the `client.collections` field exposes. `.<name>`
 * dispatches to {@link CollectionsModule.get} so codegen-emitted
 * `declare module '@layers/amba-client'` augmentations type-check at the call
 * site.
 *
 * The Proxy intentionally only forwards string-keyed property access;
 * Symbols (introspection from JSON.stringify, etc.) return undefined so
 * the customer-supplied collection name space stays clean.
 */
export function makeCollectionsProxy(module: CollectionsModule): CollectionsRoot {
  // Carrier object so `typeof obj === 'object'` checks behave normally.
  const target = Object.create(null) as object;
  return new Proxy(target, {
    get(_, prop) {
      if (typeof prop !== 'string') return undefined;
      // Reject the canonical Symbol-ish lookups by returning undefined —
      // these are JS-engine introspection, not customer table accesses.
      if (prop === 'then' || prop === 'toJSON' || prop.startsWith('_')) return undefined;
      return module.get(prop);
    },
    has(_, prop) {
      // Used by `'foo' in collections` — return true for any non-private string.
      return typeof prop === 'string' && !prop.startsWith('_');
    },
    // Block writes — collections is a read-only namespace.
    set() {
      return false;
    },
    deleteProperty() {
      return false;
    },
  }) as unknown as CollectionsRoot;
}

/**
 * Type of the proxy. Index signature so codegen output (`declare
 * namespace Amba.collections { interface posts { … } }`) can augment
 * specific names; the dynamic Proxy serves both typed and untyped lookups.
 */
export type CollectionsRoot = {
  readonly [name: string]: ClientCollection<Record<string, unknown>>;
};

// ─── Implementation ─────────────────────────────────────────────────

/**
 * Per-collection HTTP wrapper. Stateless beyond constructor args — the
 * cache in {@link CollectionsModule} guarantees one instance per
 * collection name.
 *
 * Wire shape:
 *   - The server reads the find-query DSL from the request body on JSON
 *     POSTs, but GET routes need it via `?query=<json>` because the
 *     Fetch spec rejects GET-with-body. We always use the query-string
 *     form for find/findOne/count so the same code path works in
 *     browsers, Node, and Workers.
 */
class ClientCollectionImpl<TRow extends Record<string, unknown>> implements ClientCollection<TRow> {
  private readonly basePath: string;

  constructor(
    name: string,
    private readonly http: HttpClient,
  ) {
    // `name` is only needed to build the base path — we don't store it
    // beyond that. The path is what every method actually uses.
    this.basePath = `/client/collections/${encodeURIComponent(name)}`;
  }

  async create(input: CreateInput<TRow>): Promise<TRow> {
    const { data } = await this.http.post<{ data: TRow }>(this.basePath, input);
    return data.data;
  }

  // Overload signatures match the public interface.
  find(query: FindQuery<TRow> & { paginate: true }): Promise<PaginatedFindResult<TRow>>;
  find(query?: FindQuery<TRow>): Promise<TRow[]>;
  async find(
    query?: FindQuery<TRow> | (FindQuery<TRow> & { paginate: true }),
  ): Promise<TRow[] | PaginatedFindResult<TRow>> {
    const paginate = (query as { paginate?: boolean } | undefined)?.paginate === true;

    // Strip `paginate` before serializing — it's a client-side flag, not
    // part of the wire query. Same for any undefined values so the URL
    // stays clean. Cast to a plain record for the helper; the runtime
    // shape is JSON-safe because the SDK is the only caller.
    const wire = stripUndefined(query as Record<string, unknown> | undefined);
    if (wire) delete (wire as Record<string, unknown>)['paginate'];

    const queryParam =
      wire && Object.keys(wire).length > 0
        ? `?query=${encodeURIComponent(JSON.stringify(wire))}`
        : '';
    const path = `${this.basePath}${queryParam}`;
    const { data } = await this.http.get<
      { data: TRow[] } | { data: TRow[]; next_cursor: string | null }
    >(path);

    if (paginate) {
      const next = (data as { next_cursor?: string | null }).next_cursor ?? null;
      return { rows: data.data, next_cursor: next };
    }
    return data.data;
  }

  async findOne(idOrQuery: string | FindQuery<TRow>): Promise<TRow | null> {
    if (typeof idOrQuery === 'string') {
      // Single-id form — direct `/:id` route, returns 404 → null.
      try {
        const { data } = await this.http.get<{ data: TRow }>(
          `${this.basePath}/${encodeURIComponent(idOrQuery)}`,
        );
        return data.data;
      } catch (err) {
        if (isApiNotFound(err)) return null;
        throw err;
      }
    }
    // Query form — find with limit:1, return first row.
    const rows = await this.find({ ...idOrQuery, limit: 1 });
    return rows[0] ?? null;
  }

  async count(query?: CountQuery<TRow>): Promise<number> {
    // Server-side count via dedicated route. Returns the exact count
    // regardless of size.
    const wire: { where?: unknown; includeDeleted?: boolean } = {};
    if (query?.where !== undefined) wire.where = query.where;
    if (query?.includeDeleted !== undefined) wire.includeDeleted = query.includeDeleted;
    const queryParam =
      Object.keys(wire).length > 0 ? `?query=${encodeURIComponent(JSON.stringify(wire))}` : '';
    const { data } = await this.http.get<{ data: { count: number } }>(
      `${this.basePath}/count${queryParam}`,
    );
    return data.data.count;
  }

  async update(
    query: UpdateQuery<TRow> | { id: string; set: UpdateQuery<TRow>['set'] },
  ): Promise<TRow[]> {
    if ('id' in query && typeof query.id === 'string') {
      // Single-id form. Server route is PATCH /:id.
      const { data } = await this.http.request<{ data: TRow }>(
        `${this.basePath}/${encodeURIComponent(query.id)}`,
        { method: 'PATCH', body: { set: query.set } },
      );
      return [data.data];
    }
    // Bulk update via PATCH /:name with {where, set, limit?}. Returns
    // the rows that were updated. Server enforces the same auto-RLS as
    // the single-id form + caps `limit` at 10_000.
    const bulk = query as UpdateQuery<TRow>;
    const body: Record<string, unknown> = { where: bulk.where, set: bulk.set };
    if (bulk.limit !== undefined) body['limit'] = bulk.limit;
    const { data } = await this.http.request<{ data: TRow[]; count: number }>(this.basePath, {
      method: 'PATCH',
      body,
    });
    return data.data;
  }

  async delete(query: DeleteQuery<TRow> | { id: string }): Promise<{ count: number }> {
    if ('id' in query && typeof query.id === 'string') {
      try {
        await this.http.delete<{ data: { id: string; deleted: boolean } }>(
          `${this.basePath}/${encodeURIComponent(query.id)}`,
        );
        return { count: 1 };
      } catch (err) {
        if (isApiNotFound(err)) return { count: 0 };
        throw err;
      }
    }
    // Bulk soft-delete via DELETE /:name with {where, limit?}. Server
    // returns `{count: N}`.
    const bulk = query as DeleteQuery<TRow>;
    const body: Record<string, unknown> = { where: bulk.where };
    if (bulk.limit !== undefined) body['limit'] = bulk.limit;
    const { data } = await this.http.request<{ data: { count: number } }>(this.basePath, {
      method: 'DELETE',
      body,
    });
    return { count: data.data.count };
  }

  async findNearest(query: FindNearestQuery<TRow>): Promise<FindNearestResult<TRow>> {
    if (query.to === undefined || (typeof query.to !== 'string' && !Array.isArray(query.to))) {
      throw new AmbaValidationError({
        code: 'invalid_argument',
        message: 'findNearest({to}): `to` must be a string or number[]',
      });
    }
    // Empty input is meaningless on either side — empty string can't
    // be embedded (provider rejects), empty vector has no defined
    // distance to anything. Fail synchronously so customer dev loops
    // see "you passed nothing" instead of waiting for a 400 from the
    // gateway.
    if (typeof query.to === 'string' && query.to.length === 0) {
      throw new AmbaValidationError({
        code: 'invalid_argument',
        message: 'findNearest({to}): `to` must not be an empty string',
      });
    }
    if (Array.isArray(query.to) && query.to.length === 0) {
      throw new AmbaValidationError({
        code: 'invalid_argument',
        message: 'findNearest({to}): `to` must not be an empty array',
      });
    }
    // Body shape mirrors the wire contract on the server's
    // /find-nearest route. The SDK takes care of mapping `to` →
    // `to_text` or `to_vector` so customer code stays simple.
    const body: Record<string, unknown> = {};
    if (typeof query.to === 'string') {
      body['to_text'] = query.to;
    } else {
      body['to_vector'] = query.to;
    }
    if (query.k !== undefined) body['k'] = query.k;
    if (query.column !== undefined) body['column'] = query.column;
    if (query.distance !== undefined) body['distance'] = query.distance;
    if (query.embeddingModel !== undefined) body['embedding_model'] = query.embeddingModel;
    if (query.embeddingProvider !== undefined) body['embedding_provider'] = query.embeddingProvider;
    if (query.where !== undefined) body['where'] = query.where;
    if (query.cursor !== undefined) body['cursor'] = query.cursor;
    // The wire convention on `/client/collections/<name>/find-nearest`
    // is snake_case for every multi-word field — customers reading the
    // API reference expect `include_deleted`, so we send that to match.
    if (query.includeDeleted !== undefined) body['include_deleted'] = query.includeDeleted;

    const { data } = await this.http.post<{
      data: Array<TRow & { _distance: number }>;
      next_cursor: string | null;
    }>(`${this.basePath}/find-nearest`, body);
    return {
      rows: data.data,
      next_cursor: data.next_cursor,
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

interface ApiErrorLike {
  status?: number;
  code?: string;
}

/**
 * Detect a 404 response from either the legacy `AmbaApiError` or the
 * typed `AmbaNotFoundError`. The HttpClient still throws `AmbaApiError`
 * for wire failures; we look at the duck-typed status to keep the SDK
 * surface stable across both.
 */
function isApiNotFound(err: unknown): boolean {
  const e = err as ApiErrorLike | null;
  return e?.status === 404 || e?.code === 'not_found' || e?.code === 'NOT_FOUND';
}

/**
 * Strip `undefined`-valued top-level keys so they don't end up in the
 * serialized JSON query string (`{a: undefined, b: 1}` → `{b: 1}`).
 */
function stripUndefined<T extends Record<string, unknown>>(
  obj: T | undefined,
): Partial<T> | undefined {
  if (!obj) return undefined;
  const out: Partial<T> = {};
  for (const k of Object.keys(obj) as (keyof T)[]) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}
