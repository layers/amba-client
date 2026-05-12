/**
 * Error taxonomy re-exported from `@layers/amba-functions`.
 *
 * `instanceof AmbaAuthError` (and the rest of the hierarchy) MUST work
 * in BOTH end-user device code (this package) and customer server-side
 * function code. For class identity to flow through both surfaces,
 * both packages need to import the SAME class. We import + re-export
 * from `@layers/amba-functions` (rather than copying the class
 * definitions) so a customer doing `if (err instanceof AmbaAuthError)`
 * gets the same matching behaviour whether `err` was thrown server-side
 * or rehydrated from a 4xx response body in this package's HTTP layer.
 *
 * The legacy `AmbaApiError` from `./http.ts` stays as a back-compat
 * alias — existing callers that catch it keep working until they
 * migrate to the typed subclasses.
 */

export {
  AmbaAuthError,
  AmbaError,
  AmbaInternalError,
  AmbaNotFoundError,
  AmbaRateLimitError,
  AmbaTenantUnavailableError,
  AmbaValidationError,
  deserializeAmbaError,
  isAmbaError,
  serializeAmbaError,
} from '@layers/amba-functions';

export type {
  AmbaAuthCode,
  AmbaErrorJsonBody,
  AmbaErrorKind,
  AmbaErrorOptions,
  AmbaNotFoundDetails,
  AmbaRateLimitDetails,
  AmbaTenantUnavailableDetails,
  AmbaValidationDetails,
  AmbaValidationFieldError,
  AnyAmbaError,
} from '@layers/amba-functions';
