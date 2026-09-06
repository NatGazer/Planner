'use strict';
const { newId } = require('./ids.js');
const { nowInstant } = require('./time.js');

/**
 * Append-only record of every administrative change. Written inside the same
 * transaction as the change it describes, so the log can never disagree with
 * the data.
 */
function record(db, { actor, action, entity, entityId, summary, detail = null }) {
  db.run(
    `INSERT INTO audit_log (id, at, actor_id, actor_name, action, entity, entity_id, summary, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId('aud'), nowInstant(), actor?.id ?? 'system', actor?.display_name ?? 'System',
      action, entity, entityId, summary,
      detail == null ? null : JSON.stringify(detail),
    ],
  );
}

function list(db, { limit = 200, entity = null, entityId = null } = {}) {
  const where = [];
  const params = [];
  if (entity) { where.push('entity = ?'); params.push(entity); }
  if (entityId) { where.push('entity_id = ?'); params.push(entityId); }
  const sql = `SELECT * FROM audit_log ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
               ORDER BY at DESC LIMIT ?`;
  return db.all(sql, [...params, Math.min(Number(limit) || 200, 500)]).map((r) => ({
    ...r, detail: r.detail ? JSON.parse(r.detail) : null,
  }));
}

module.exports = { record, list };
