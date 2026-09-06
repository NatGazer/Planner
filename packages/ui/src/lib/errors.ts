import { ApiError } from './api';
import { en } from './strings/en';
import type { Params, StringKey, TFunc } from './i18n';

/**
 * Turning whatever went wrong into a sentence in the reader's language.
 *
 * Three sources, in order of how much they know:
 *
 *   1. `detail.key` — the server naming the exact message it meant. Some of
 *      those keys carry another key inside them ("{field} is required"), so
 *      `fieldKey`, `unitKey` and `roleKey` are translated before substitution.
 *   2. `error.<CODE>` — a general sentence for the machine code, for anything
 *      the server did not name specifically.
 *   3. The server's own English message, which is better than a shrug if this
 *      client is older than the server it is talking to.
 *
 * Anything that is not an ApiError never reached the server at all: that is a
 * dead network, and it says so rather than blaming the data.
 */

const known = (key: string): key is StringKey => key in en;

/** Keys nested inside a message's parameters, and the slot each one fills. */
const NESTED: Record<string, string> = { fieldKey: 'field', unitKey: 'unit', roleKey: 'role' };

function resolveParams(t: TFunc, raw: Record<string, unknown> | undefined): Params {
  const out: Params = {};
  if (!raw) return out;
  for (const [name, value] of Object.entries(raw)) {
    if (value === null || value === undefined || typeof value === 'object') continue;
    const slot = NESTED[name];
    if (slot) {
      const nested = String(value);
      out[slot] = known(nested) ? t(nested) : nested;
    } else {
      out[name] = value as string | number;
    }
  }
  return out;
}

export function errorMessage(t: TFunc, err: unknown, fallback: StringKey = 'common.somethingWrong'): string {
  if (err instanceof ApiError) {
    const key = err.detail?.key;
    if (typeof key === 'string' && known(key)) {
      return t(key, resolveParams(t, err.detail?.params as Record<string, unknown> | undefined));
    }
    const byCode = `error.${err.code}`;
    if (known(byCode)) return t(byCode);
    return err.message || t(fallback);
  }
  // No response at all — the request never got there.
  if (err instanceof TypeError) return t('common.offline');
  return t(fallback);
}

/** True when the error is the session having ended underneath the screen. */
export const isExpiredSession = (err: unknown): boolean =>
  err instanceof ApiError && err.status === 401;
