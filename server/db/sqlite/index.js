'use strict';
/**
 * Default connector: SQLite via Node's built-in `node:sqlite`.
 * Zero third-party dependencies, real transactions, real unique constraints,
 * and safe for the admin and worker servers to open concurrently.
 */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA_PATH = path.join(__dirname, '..', 'schema.sql');

function bind(params) {
  // node:sqlite accepts null/number/string/bigint/Uint8Array. Booleans and
  // undefined are the two things domain code can plausibly hand us.
  return (params ?? []).map((v) => {
    if (v === undefined || v === null) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v;
  });
}

function createSqliteConnector(config = {}) {
  const file = config.databaseFile || path.join(process.cwd(), '.data', 'maintenance.db');
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA synchronous = NORMAL');
  // Two server processes share this file; wait rather than fail on contention.
  db.exec(`PRAGMA busy_timeout = ${Number(config.busyTimeoutMs ?? 8000)}`);

  const cache = new Map();
  function stmt(sql) {
    let s = cache.get(sql);
    if (!s) { s = db.prepare(sql); cache.set(sql, s); }
    return s;
  }

  let depth = 0;

  const api = {
    all(sql, params) { return stmt(sql).all(...bind(params)); },
    get(sql, params) { return stmt(sql).get(...bind(params)); },
    run(sql, params) {
      const r = stmt(sql).run(...bind(params));
      return { changes: Number(r.changes ?? 0), lastInsertRowid: r.lastInsertRowid };
    },
    /**
     * Atomic unit of work. Nested calls join the outer transaction so domain
     * helpers compose freely. BEGIN IMMEDIATE takes the write lock up front,
     * which is what serialises two racing completions of the same task.
     */
    transaction(fn) {
      if (depth > 0) { depth += 1; try { return fn(api); } finally { depth -= 1; } }
      db.exec('BEGIN IMMEDIATE');
      depth = 1;
      try {
        const result = fn(api);
        db.exec('COMMIT');
        return result;
      } catch (err) {
        try { db.exec('ROLLBACK'); } catch { /* connection already unwound */ }
        throw err;
      } finally {
        depth = 0;
      }
    },
    close() { cache.clear(); db.close(); },
    /** Idempotent: safe to call on every boot. */
    migrate() { db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8')); return api; },
    databaseFile: file,
  };

  return api;
}

module.exports = { createSqliteConnector };
