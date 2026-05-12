/**
 * `Amba.email` — end-user-device email send.
 *
 * Customer apps occasionally need the signed-in end-user device to
 * trigger transactional email *to the user themselves* — e.g. a
 * profile-page "send me a magic link", "resend my confirmation
 * email", or "email me a copy of this report".
 *
 * `Amba.email.send({ template, data })` calls `/client/email/send`
 * on the API. The recipient is ALWAYS the bound session's user —
 * there is no `to` field on the wire and no way to send email to
 * anyone except yourself. Server-side admin tooling still uses the
 * admin route for arbitrary-recipient sends; server-side function
 * code still uses `ctx.email.send`.
 *
 * This is a deliberate constraint, not a missing feature. Allowing
 * arbitrary `to.email` from a client-session-authed surface would
 * let any signed-in customer email anyone they wanted on the
 * project's behalf — a spam + phishing attack. The locked recipient
 * covers the documented end-user-driven use cases without opening
 * that.
 */

import type { HttpClient } from './http.js';

export interface EmailSendInput {
  /**
   * Template name registered on the project. Customer-supplied
   * templates only; the API rejects calls for unregistered names.
   */
  template: string;
  /**
   * Free-form key/value substitution for the template. Same shape the
   * template's MJML / HTML body was authored against.
   */
  data?: Record<string, unknown>;
}

export interface EmailSendResult {
  /**
   * Upstream provider message id. Non-null when the upstream accepted
   * the send. Customer code rarely needs this — it's exposed so a
   * "did my send actually go out" check can be wired against your
   * email provider.
   */
  message_id: string | null;
  /**
   * `'sent'` on accepted upstream, `'suppressed'` when the recipient
   * is on the project's suppression list (bounced before, marked
   * spam, hard-bounced complaint). `'suppressed'` is NOT an error —
   * it's the system protecting the project's sender reputation. The
   * customer app should treat it as success-with-side-effect (e.g.
   * "your email is on file as undeliverable, contact support").
   */
  status: 'sent' | 'suppressed';
}

export class EmailModule {
  constructor(private readonly http: HttpClient) {}

  /**
   * Send a transactional email to the signed-in end-user.
   *
   * The recipient is ALWAYS the bound session's user — the API derives
   * it server-side. Pass only `{ template, data }`.
   *
   * Throws `AmbaApiError`:
   *   - `401` when no client session is bound (call `Amba.auth.signIn`
   *     or equivalent first).
   *   - `400 INVALID_BODY` when `template` is missing/empty.
   *   - `404 TEMPLATE_NOT_FOUND` when the template name isn't
   *     registered for this project.
   *   - `429` when the per-project email rate limit fires.
   */
  async send(input: EmailSendInput): Promise<EmailSendResult> {
    if (!input || typeof input.template !== 'string' || input.template.length === 0) {
      throw new Error('Amba.email.send: template is required (non-empty string)');
    }
    const body = {
      template: input.template,
      data: input.data ?? {},
    };
    const { data } = await this.http.post<{ data: EmailSendResult }>('/client/email/send', body);
    return data.data;
  }
}
