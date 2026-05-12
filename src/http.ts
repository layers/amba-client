import { DEFAULT_API_URL, API_VERSION } from '@layers/amba-shared';

// ─── Types ─────────────────────────────────────────────────────────────

export interface HttpClientConfig {
  apiKey: string;
  apiUrl?: string;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  /** When true the client sends If-None-Match with the cached ETag. */
  etag?: string;
}

export interface HttpResponse<T = unknown> {
  status: number;
  data: T;
  etag?: string;
}

// ─── Constants ─────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

// ─── HttpClient ────────────────────────────────────────────────────────

export class HttpClient {
  private baseUrl: string;
  private apiKey: string;
  private sessionToken: string | null = null;

  constructor(config: HttpClientConfig) {
    const url = config.apiUrl ?? DEFAULT_API_URL;
    // Strip any trailing slash on the caller-provided URL, then append the
    // API version segment. Callers pass the unversioned host (`https://api.amba.dev`)
    // so the SDK constant decides the API generation — see API_VERSION
    // in @layers/amba-shared.
    this.baseUrl = `${url.replace(/\/+$/, '')}/${API_VERSION}`;
    this.apiKey = config.apiKey;
  }

  /** Set (or clear) the bearer token used for authenticated requests. */
  setSessionToken(token: string | null): void {
    this.sessionToken = token;
  }

  /** Perform an HTTP request with automatic retry & exponential back-off. */
  async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<HttpResponse<T>> {
    const { method = 'GET', body, headers: extraHeaders, etag } = options;

    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'X-Api-Key': this.apiKey,
      Accept: 'application/json',
      ...extraHeaders,
    };

    if (this.sessionToken) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`;
    }

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (etag) {
      headers['If-None-Match'] = etag;
    }

    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });

        // 304 Not Modified — return empty data, let caller handle cache
        if (response.status === 304) {
          return {
            status: 304,
            data: undefined as T,
            etag: response.headers.get('etag') ?? etag,
          };
        }

        // 4xx errors are not retryable
        if (response.status >= 400 && response.status < 500) {
          const errorBody = await response.json().catch(() => ({
            error: { code: 'unknown', message: response.statusText },
          }));
          throw new AmbaApiError(
            response.status,
            (errorBody as { error?: { code?: string } }).error?.code ?? 'unknown',
            getErrorMessage(errorBody, response.statusText),
          );
        }

        // 5xx errors are retryable — throw so the retry loop catches them
        if (response.status >= 500) {
          throw new AmbaApiError(
            response.status,
            'server_error',
            `Server error: ${response.status}`,
          );
        }

        const responseEtag = response.headers.get('etag') ?? undefined;

        // 204 No Content
        if (response.status === 204) {
          return { status: 204, data: undefined as T, etag: responseEtag };
        }

        const data = (await response.json()) as T;
        return { status: response.status, data, etag: responseEtag };
      } catch (error) {
        lastError = error;

        // Don't retry client errors (4xx)
        if (error instanceof AmbaApiError && error.status < 500) {
          throw error;
        }

        // Retry on network / 5xx errors with exponential back-off
        if (attempt < MAX_RETRIES - 1) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          await sleep(delay);
        }
      }
    }

    throw lastError;
  }

  // Convenience helpers ──────────────────────────────────────────────────

  async get<T = unknown>(
    path: string,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  async post<T = unknown>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  async put<T = unknown>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  async delete<T = unknown>(
    path: string,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}

// ─── Error ─────────────────────────────────────────────────────────────

export class AmbaApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AmbaApiError';
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(body: unknown, fallback: string): string {
  if (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as { error?: { message?: string } }).error?.message === 'string'
  ) {
    return (body as { error: { message: string } }).error.message;
  }
  return fallback;
}
