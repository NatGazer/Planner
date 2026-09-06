'use strict';
const { newToken } = require('../domain/ids.js');
const { nowInstant } = require('../domain/time.js');
const { verifyPassword } = require('./passwords.js');
const { unauthorized, forbidden } = require('../domain/errors.js');
const config = require('../config.js');

const SESSION_COOKIE = 'mm_session';

function shapeEmployee(e) {
  return { id: e.id, email: e.email, name: e.display_name, role: e.role, active: !!e.active };
}

function signIn(db, { email, password, userAgent }) {
  const employee = db.get('SELECT * FROM employees WHERE lower(email) = lower(?)', [String(email || '').trim()]);
  // Same failure for unknown address and wrong password: no account enumeration.
  if (!employee || !employee.active || !verifyPassword(password, employee.password_hash)) {
    throw unauthorized('That email and password do not match.');
  }
  const token = newToken();
  const issued = new Date();
  const expires = new Date(issued.getTime() + config.sessionTtlHours * 3600 * 1000);
  db.run('INSERT INTO sessions (token, employee_id, issued_at, expires_at, user_agent) VALUES (?,?,?,?,?)',
    [token, employee.id, nowInstant(issued), nowInstant(expires), String(userAgent || '').slice(0, 240)]);
  return { token, employee: shapeEmployee(employee), expiresAt: nowInstant(expires) };
}

function signOut(db, token) {
  if (token) db.run('DELETE FROM sessions WHERE token = ?', [token]);
  return { ok: true };
}

/** Resolve a bearer/cookie token to a live employee, or null. */
function resolve(db, token) {
  if (!token) return null;
  const row = db.get(
    `SELECT s.token, s.expires_at, e.* FROM sessions s
       JOIN employees e ON e.id = s.employee_id
      WHERE s.token = ?`, [token]);
  if (!row) return null;
  if (row.expires_at <= nowInstant()) { db.run('DELETE FROM sessions WHERE token = ?', [token]); return null; }
  if (!row.active) return null;
  return { ...shapeEmployee(row), display_name: row.display_name };
}

function purgeExpired(db) {
  db.run('DELETE FROM sessions WHERE expires_at <= ?', [nowInstant()]);
}

/**
 * Role gate. Enforced here, in the API layer, on every request — not in the
 * UI. The worker server additionally never mounts an admin route at all, so
 * a hand-crafted request to the worker origin has nothing to reach.
 */
function requireRole(actor, role) {
  if (!actor) throw unauthorized();
  if (role && actor.role !== role) throw forbidden(`This action is for ${role}s only.`);
  return actor;
}

module.exports = { SESSION_COOKIE, signIn, signOut, resolve, purgeExpired, requireRole, shapeEmployee };
