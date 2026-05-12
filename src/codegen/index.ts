/**
 * `amba types generate` engine.
 *
 * Produces the contents of `.amba/types.d.ts` — a single declaration
 * file that declares one TypeScript interface per customer collection
 * and module-augments `@layers/amba-client` so
 * `Amba.collections.<name>.find()` is statically typed.
 *
 * The engine is the *pure* part of the codegen pipeline. It emits a
 * string. The `amba types generate` CLI command wraps this — it owns:
 *   - argv parsing (`--watch`, project-id discovery)
 *   - filesystem writing (`.amba/types.d.ts`)
 *   - the polling loop for `--watch`
 *
 * One-shot is the default; `--watch` is opt-in. The engine is NOT
 * auto-run on `amba functions deploy`.
 *
 * Wire path:
 *   GET /admin/projects/:p/collections                — list
 *   GET /admin/projects/:p/collections/:name          — describe
 *
 * Postgres → TS type mapping is a fixed table:
 *   uuid, text         → string
 *   integer, bigint, numeric → number
 *   boolean            → boolean
 *   timestamptz, date  → string (ISO 8601)
 *   jsonb              → unknown
 * Anything else is mapped to `unknown` with a comment so the customer
 * can investigate without breaking the build.
 *
 * The emitted file:
 *   - Always carries an "auto-generated; do not edit" banner.
 *   - Augments `@layers/amba-client` so `client.collections.posts` becomes typed.
 *   - Augments `Amba.collections` (the sugar form) the same way.
 *   - Augments `@layers/amba-functions` so `ctx.collections.posts` from the
 *     server side picks up the same types — single declaration covers
 *     both surfaces (one less file for customers to commit).
 */

// ─── Public API ─────────────────────────────────────────────────────

export interface CodegenHttpClient {
  /**
   * Minimal contract — the engine only needs GET. The CLI is free to
   * pass an authenticated wrapper around `fetch`, an instance of
   * `@layers/amba-client`'s `HttpClient`, or anything that conforms.
   */
  get<T>(path: string): Promise<{ data: T }>;
}

export interface GenerateTypesInput {
  /** Authenticated admin-API client. Caller is responsible for the auth header. */
  http: CodegenHttpClient;
  /** amba project id whose collection schemas we read. */
  projectId: string;
  /**
   * Override the banner timestamp (testing). When omitted the emitted
   * file is timestamp-free so reruns produce byte-identical output if
   * the schema hasn't changed (matters for `--watch` and CI noise).
   */
  bannerTimestamp?: string;
}

export interface GenerateTypesResult {
  /** Full content of `.amba/types.d.ts`. */
  declarationsTs: string;
  /** Names of every collection that was emitted. Sorted alphabetically. */
  collectionNames: string[];
}

/**
 * Read every collection schema for `projectId` and emit a single
 * `.amba/types.d.ts` body. The CLI writes the result to disk.
 */
export async function generateCollectionTypes(
  input: GenerateTypesInput,
): Promise<GenerateTypesResult> {
  const list = await listCollections(input.http, input.projectId);
  const sorted = [...list].sort();
  const collections: CollectionSchema[] = [];
  for (const name of sorted) {
    collections.push(await describeCollection(input.http, input.projectId, name));
  }
  return {
    declarationsTs: emitDeclarations(collections, input.bannerTimestamp),
    collectionNames: sorted,
  };
}

// ─── Wire types ──────────────────────────────────────────────────────

interface ListResponse {
  data: Array<{ name: string }>;
}

interface DescribeColumn {
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
}

interface DescribeResponse {
  data: {
    name: string;
    columns: DescribeColumn[];
  };
}

interface CollectionSchema {
  name: string;
  columns: DescribeColumn[];
}

async function listCollections(http: CodegenHttpClient, projectId: string): Promise<string[]> {
  const { data } = await http.get<ListResponse>(
    `/admin/projects/${encodeURIComponent(projectId)}/collections?limit=200`,
  );
  return data.data.map((c) => c.name).filter((n): n is string => typeof n === 'string');
}

async function describeCollection(
  http: CodegenHttpClient,
  projectId: string,
  name: string,
): Promise<CollectionSchema> {
  const { data } = await http.get<DescribeResponse>(
    `/admin/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(name)}`,
  );
  return { name: data.data.name, columns: data.data.columns };
}

// ─── Type mapping ────────────────────────────────────────────────────

/**
 * Map a Postgres `data_type` string (as returned by
 * `information_schema.columns`) to its TypeScript surface form.
 *
 * Names here match the spelling Postgres returns — `'text'`,
 * `'integer'`, `'timestamp with time zone'` (NOT `'timestamptz'`), etc.
 */
const PG_TYPE_TO_TS: Record<string, string> = {
  uuid: 'string',
  text: 'string',
  'character varying': 'string',
  integer: 'number',
  bigint: 'number',
  smallint: 'number',
  numeric: 'number',
  'double precision': 'number',
  real: 'number',
  boolean: 'boolean',
  // Postgres reports `timestamp with time zone` for timestamptz, `timestamp
  // without time zone` for plain timestamp. Both serialize as ISO 8601
  // over the wire — string on the TS side.
  'timestamp with time zone': 'string',
  'timestamp without time zone': 'string',
  date: 'string',
  // JSONB is an unknown JSON value — customers narrow at the call site.
  jsonb: 'unknown',
  json: 'unknown',
};

/**
 * Resolve the TS type for a single column. Server-managed columns get
 * fixed shapes regardless of the customer's CREATE TABLE invocation
 * (id is always uuid, etc.) so the emitted interface always matches the
 * runtime contract — and so a customer who SELECTs * gets a typed row.
 */
function tsTypeForColumn(col: DescribeColumn): string {
  const base = PG_TYPE_TO_TS[col.data_type] ?? 'unknown';
  // Optionally narrow nullable columns. Server-managed `deleted_at` is
  // always `string | null`, regardless of NOT NULL on the wire (it
  // really is null in non-deleted rows).
  if (col.column_name === 'deleted_at') return 'string | null';
  if (col.is_nullable === 'YES') return `${base} | null`;
  return base;
}

// ─── Emitter ─────────────────────────────────────────────────────────

const HEADER_BANNER = `// .amba/types.d.ts
// AUTO-GENERATED by \`amba types generate\` — do not edit by hand.
//
// This file is regenerated whenever you run the CLI. It declares one
// interface per customer collection and module-augments @layers/amba-client +
// @layers/amba-functions so \`Amba.collections.<name>\`, \`client.collections.<name>\`,
// and \`ctx.collections.<name>\` (server side) are all statically typed.
//
// Commit OR gitignore at your discretion. The shape mirrors your
// current schema in the tenant DB — regenerate after every collection
// migration.`;

function emitDeclarations(collections: CollectionSchema[], bannerTimestamp?: string): string {
  const banner = bannerTimestamp
    ? `${HEADER_BANNER}\n// Generated: ${bannerTimestamp}`
    : HEADER_BANNER;

  const interfaces = collections.map((c) => emitInterface(c)).join('\n\n');

  // Module augmentation. Customers who installed `@layers/amba-client` get the
  // typed `Amba.collections.<name>` and `client.collections.<name>`. The
  // server side gets the same shape on `ctx.collections.<name>` via the
  // `@layers/amba-functions` augmentation. Both blocks are guarded so an
  // editor / tsc instance that doesn't have the corresponding package
  // installed silently no-ops the augmentation rather than erroring on
  // module-not-found.
  const augmentClient = collections.length
    ? `
declare module '@layers/amba-client' {
  interface CollectionsRoot {
${collections.map((c) => `    readonly ${tsLiteralKey(c.name)}: import('@layers/amba-client').ClientCollection<Amba.collections.${tsTypeName(c.name)}>;`).join('\n')}
  }
}
`
    : '';

  const augmentFunctions = collections.length
    ? `
declare module '@layers/amba-functions' {
  interface CollectionsRoot {
${collections.map((c) => `    readonly ${tsLiteralKey(c.name)}: import('@layers/amba-functions').Collection<Amba.collections.${tsTypeName(c.name)}>;`).join('\n')}
  }
}
`
    : '';

  return `${banner}\n\nexport {};\n\ndeclare global {\n  namespace Amba {\n    namespace collections {\n${interfaces ? indent(interfaces, 6) : '      // (no collections defined yet)'}\n    }\n  }\n}\n${augmentClient}${augmentFunctions}`;
}

function emitInterface(c: CollectionSchema): string {
  const fields = c.columns.map((col) => {
    const ts = tsTypeForColumn(col);
    const optional = col.is_nullable === 'YES' ? '?' : '';
    return `${tsLiteralKey(col.column_name)}${optional}: ${ts};`;
  });
  // Field-level JSDoc kept minimal — we don't have customer descriptions
  // in `information_schema`. If we ever surface those in the describe
  // response, add them here.
  return `interface ${tsTypeName(c.name)} {\n${fields.map((f) => `  ${f}`).join('\n')}\n}`;
}

/**
 * Indent every line of `s` by `n` spaces. Used to nest the per-collection
 * interface block inside `namespace Amba.collections { … }`.
 */
function indent(s: string, n: number): string {
  const pad = ' '.repeat(n);
  return s
    .split('\n')
    .map((line) => (line.length === 0 ? '' : pad + line))
    .join('\n');
}

/**
 * Quote a property name only if it isn't a valid plain TS identifier.
 * Customer collection names are already validated against
 * `^[a-z][a-z0-9_]*$` (see `@layers/amba-shared/reserved-collection-prefixes`)
 * so the unquoted form is the common path; the helper is defensive in
 * case future column-name relaxations ship.
 */
function tsLiteralKey(name: string): string {
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) return name;
  return JSON.stringify(name);
}

/**
 * Convert a collection name (`posts`, `plan_steps`) into the TS
 * interface name. Snake_case is preserved — customers see
 * `Amba.collections.plan_steps` in source code, so the interface name
 * matches verbatim.
 */
function tsTypeName(collectionName: string): string {
  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(collectionName)) {
    // Fallback — should never trigger in practice because reserved-name
    // validation rejects anything that wouldn't fit the regex.
    return JSON.stringify(collectionName);
  }
  return collectionName;
}
