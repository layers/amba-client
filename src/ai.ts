/**
 * `Amba.ai` — end-user-device AI access.
 *
 * `Amba.ai.invoke('prompt_name', {context: {...}})` calls
 * `/client/ai/prompts/:name/invoke` on the API, which proxies to the
 * AI gateway. Only prompts configured as client-invokable in the
 * project are reachable via this route — others 403 with
 * `not_client_invokable`.
 *
 * The client SDK does NOT expose `Amba.ai.anthropic.messages.create(...)`
 * because raw upstream passthrough from a client device would expose the
 * provider key model + token spend in a place we can't enforce per-user
 * rate limits or content moderation. Server-side function code
 * (`ctx.ai.*`) is the surface for that.
 *
 * The response shape is whatever the upstream provider returned (the
 * gateway forwards byte-for-byte). For Anthropic that's `Anthropic.Message`
 * shape; for OpenAI it's `ChatCompletion`. The SDK doesn't strongly type
 * these on the client side because:
 *   1. The customer chooses which provider their prompt targets.
 *   2. We don't want to ship `@anthropic-ai/sdk` types in the client
 *      bundle (mobile devices don't need them).
 * Customer code that wants strict typing imports the provider SDK and
 * casts at the call site — same pattern as `ctx.ai`.
 */

import type { HttpClient } from './http.js';

export interface AiInvokeOptions {
  /**
   * Free-form context map serialized into a single user message when the
   * caller doesn't pass `messages` directly. Same shape the prompt's
   * registered `system_prompt` was authored against.
   */
  context?: Record<string, unknown>;
  /**
   * **Deprecated alias for `context`** kept for backwards compatibility.
   * When supplied, `variables` is merged into `context` with `context`
   * winning on conflict. Logs a one-time `console.warn` so the customer
   * sees the rename. Will be dropped in a future release.
   *
   * Agents that copied the older docs shape (`{variables: {question}}`)
   * get a working call instead of silently-ignored input.
   */
  variables?: Record<string, unknown>;
  /**
   * Pre-built provider-shaped messages array. When set, the gateway uses
   * this verbatim and ignores `context` (you're saying "I know what the
   * upstream wants, here it is"). Useful for chat-style apps where the
   * end-user device threads a multi-turn conversation locally before
   * invoking.
   */
  messages?: unknown[];
  /**
   * Override the prompt's registered `max_tokens` for this call. Subject
   * to the upstream provider's hard cap.
   */
  max_tokens?: number;
}

export class AiModule {
  constructor(private readonly http: HttpClient) {}

  /**
   * Invoke a registered, client-invokable prompt. Returns the upstream
   * provider's raw response body (Anthropic.Message or ChatCompletion
   * shape, depending on the prompt's `provider` field).
   *
   * Throws `AmbaApiError` when the prompt isn't registered, isn't
   * configured as client-invokable, the project hasn't registered an
   * upstream provider key, the rate limit fires, or the upstream
   * provider returns an error. Customers can `if (err.status === 429)`
   * to backoff.
   */
  async invoke(name: string, options: AiInvokeOptions = {}): Promise<unknown> {
    if (!name || typeof name !== 'string' || name.length === 0) {
      throw new Error('Amba.ai.invoke: name is required');
    }
    // Translate the deprecated `variables` alias into `context` before
    // sending. We accept both, with `context` winning when supplied
    // alongside, and warn once per process to nudge migration.
    const merged: AiInvokeOptions = options.variables ? mergeVariables(options) : options;
    const path = `/client/ai/prompts/${encodeURIComponent(name)}/invoke`;
    const { data } = await this.http.post<unknown>(path, merged);
    return data;
  }
}

let warnedVariablesAlias = false;

function mergeVariables(options: AiInvokeOptions): AiInvokeOptions {
  if (!warnedVariablesAlias) {
    warnedVariablesAlias = true;
    // eslint-disable-next-line no-console
    console.warn(
      'Amba.ai.invoke: `variables` is a deprecated alias for `context` and will be removed in a future release. Rename to `{ context: ... }`.',
    );
  }
  // Strip `variables` and merge it into `context` with the explicit
  // `context` winning per-key. Caller's `messages` and `max_tokens`
  // pass through unchanged. Spreads of falsy values (undefined) are
  // a no-op in object literals — no `?? {}` fallback needed.
  const { variables, context, ...rest } = options;
  return {
    ...rest,
    context: { ...variables, ...context },
  };
}

/** Test-only: reset the `variables` alias warning state between cases. */
export function __resetAiInvokeAliasWarning(): void {
  warnedVariablesAlias = false;
}
