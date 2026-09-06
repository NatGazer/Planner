'use strict';
/**
 * ============================================================================
 *  Database connector port
 * ============================================================================
 *
 * Everything above this file talks to the database through five methods. Swap
 * the implementation and the whole system moves to your platform's database
 * without touching a line of domain logic.
 *
 *   interface Connector {
 *     all(sql, params?)        -> Row[]
 *     get(sql, params?)        -> Row | undefined
 *     run(sql, params?)        -> { changes: number }
 *     transaction(fn)          -> fn's return value, applied atomically.
 *                                 `fn` receives a Connector scoped to the
 *                                 transaction; throwing rolls the whole thing
 *                                 back. Must be genuinely serialisable — the
 *                                 completion path depends on it.
 *     close()                  -> void
 *   }
 *
 * `params` is a positional array bound to `?` placeholders. Only five value
 * types cross this boundary: string, number, null, and integers standing in
 * for booleans. No driver-specific types leak upward.
 *
 * Two behaviours the domain layer relies on, which your adapter must preserve:
 *
 *   1. UNIQUE violations must throw an Error whose message or `code` contains
 *      'UNIQUE' / 'unique' / '23505'. `isUniqueViolation(err)` recognises the
 *      common dialects; extend it if yours differs. This is what makes the
 *      "one pending task per equipment-rule pair" guarantee real rather than
 *      advisory, and what turns a concurrent double-completion into a clean
 *      "Already completed" instead of two rows.
 *   2. `transaction()` must take a write lock up front (SQLite BEGIN
 *      IMMEDIATE, Postgres default, etc.) so two concurrent completions of the
 *      same task serialise rather than deadlock on upgrade.
 *
 * See docs/DATABASE-CONNECTOR.md for a worked example.
 */

const REQUIRED_METHODS = ['all', 'get', 'run', 'transaction', 'close'];

/** Throw early and loudly if an adapter is missing part of the contract. */
function assertConnector(connector, label = 'connector') {
  if (!connector || typeof connector !== 'object') {
    throw new TypeError(`${label} must be an object implementing the Connector port`);
  }
  const missing = REQUIRED_METHODS.filter((m) => typeof connector[m] !== 'function');
  if (missing.length) {
    throw new TypeError(`${label} is missing Connector method(s): ${missing.join(', ')}`);
  }
  return connector;
}

const UNIQUE_HINTS = ['UNIQUE constraint failed', 'unique constraint', 'duplicate key', '23505', 'ER_DUP_ENTRY'];

/** Dialect-tolerant detection of a unique-index collision. */
function isUniqueViolation(err) {
  if (!err) return false;
  const haystack = `${err.code ?? ''} ${err.errcode ?? ''} ${err.message ?? ''} ${err.errstr ?? ''}`;
  return UNIQUE_HINTS.some((hint) => haystack.toLowerCase().includes(hint.toLowerCase()));
}

/**
 * Resolve the configured connector.
 * `MAINTENANCE_DB_CONNECTOR` may point at any module exporting
 * `createConnector(config)`; otherwise the bundled SQLite adapter is used.
 */
function createConnector(config) {
  const override = config.connectorModule || process.env.MAINTENANCE_DB_CONNECTOR;
  if (override) {
    // eslint-disable-next-line global-require
    const mod = require(override.startsWith('.') ? require('node:path').resolve(override) : override);
    const factory = mod.createConnector || mod.default || mod;
    if (typeof factory !== 'function') {
      throw new TypeError(`Connector module ${override} must export createConnector(config)`);
    }
    return assertConnector(factory(config), `connector from ${override}`);
  }
  // eslint-disable-next-line global-require
  const { createSqliteConnector } = require('./sqlite/index.js');
  return assertConnector(createSqliteConnector(config), 'sqlite connector');
}

module.exports = { createConnector, assertConnector, isUniqueViolation, REQUIRED_METHODS };
