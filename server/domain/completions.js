'use strict';
/**
 * ============================================================================
 *  Completion — the one write path that must never go wrong
 * ============================================================================
 *
 * A completion closes a task, freezes a snapshot of everything it referred to,
 * and opens the next occurrence — all inside one transaction. Either all four
 * happen or none do.
 *
 * Exactly-once is enforced three independent ways, so no interleaving of two
 * submissions can produce two completions:
 *   1. the transaction takes the write lock up front (BEGIN IMMEDIATE);
 *   2. the task is closed with a guarded UPDATE ... WHERE status = 'pending',
 *      and a `changes` count of 0 means someone else got there first;
 *   3. completions.task_id carries a UNIQUE constraint as the final backstop.
 * The loser of the race is told "Already completed" and handed a fresh list.
 */
const { newId } = require('./ids.js');
const { nowInstant, instantToBusinessDate } = require('./time.js');
const { isUniqueViolation } = require('../db/connector.js');
const { notFound, conflict, badRequest, forbidden } = require('./errors.js');
const { scheduleNextAfterCompletion } = require('./scheduling.js');
const config = require('../config.js');

const MAX_COMMENT = 2000;

function submitCompletion(db, { taskId, employee, photoId, comment }) {
  const trimmed = comment == null ? null : String(comment).trim().slice(0, MAX_COMMENT) || null;

  return db.transaction((tx) => {
    const task = tx.get(`SELECT * FROM maintenance_tasks WHERE id = ?`, [taskId]);
    if (!task) throw notFound('That task no longer exists.', { key: 'server.taskGone' });
    if (task.status !== 'pending') {
      throw conflict('ALREADY_COMPLETED', 'Already completed — someone got to this one first.', { key: 'server.alreadyCompleted' });
    }

    const equipment = tx.get(`SELECT * FROM equipment WHERE id = ?`, [task.equipment_id]);
    const rule = tx.get(`SELECT * FROM maintenance_rules WHERE id = ?`, [task.rule_id]);
    if (!equipment || !rule) throw notFound('That task no longer exists.', { key: 'server.taskGone' });
    if (!equipment.active || equipment.archived) {
      throw conflict('EQUIPMENT_INACTIVE', `${equipment.name} has been deactivated. Nothing to submit.`, { key: 'server.equipmentDeactivated', params: { name: equipment.name } });
    }
    if (!rule.active || rule.archived) {
      throw conflict('RULE_INACTIVE', `"${rule.title}" has been deactivated. Nothing to submit.`, { key: 'server.ruleDeactivated', params: { title: rule.title } });
    }
    // The item has been moved to another type since this occurrence opened, so
    // the rule no longer applies to it. The row stays on file — dormant, not
    // deleted — but it is not work anybody should be closing.
    if (rule.type_id !== equipment.type_id) {
      throw conflict('RULE_NOT_APPLICABLE', `${equipment.name} is no longer a "${rule.title}" item. Nothing to submit.`, { key: 'server.ruleNotApplicable', params: { name: equipment.name, title: rule.title } });
    }
    const type = tx.get(`SELECT * FROM equipment_types WHERE id = ?`, [equipment.type_id]);

    // The photo must exist, must belong to the employee submitting, and must
    // not already back another completion.
    if (!photoId) throw badRequest('PHOTO_REQUIRED', 'A photo of the completed work is required.', { key: 'server.photoRequired' });
    const photo = tx.get(`SELECT * FROM photos WHERE id = ?`, [photoId]);
    if (!photo) throw badRequest('PHOTO_REQUIRED', 'That photo upload could not be found. Please attach it again.', { key: 'server.photoMissing' });
    if (photo.uploaded_by !== employee.id) throw forbidden('That photo was uploaded by someone else.', { key: 'server.photoNotYours' });
    if (photo.claimed) throw badRequest('PHOTO_REUSED', 'That photo is already attached to another completion.', { key: 'server.photoReused' });

    const completedAt = nowInstant();                                    // server-recorded, never client-supplied
    const completedOn = instantToBusinessDate(completedAt, config.businessTimezone);

    // (2) Guarded close. Zero rows changed means a concurrent submission won.
    const closed = tx.run(
      `UPDATE maintenance_tasks SET status = 'completed', closed_at = ? WHERE id = ? AND status = 'pending'`,
      [completedAt, taskId],
    );
    if (closed.changes !== 1) {
      throw conflict('ALREADY_COMPLETED', 'Already completed — someone got to this one first.', { key: 'server.alreadyCompleted' });
    }

    const completionId = newId('comp');
    try {
      // (3) UNIQUE(task_id) backstop.
      tx.run(
        `INSERT INTO completions (
           id, task_id, employee_id, completed_at, completed_on, photo_id, comment,
           snap_equipment_id, snap_equipment_code, snap_equipment_name, snap_location,
           snap_type_id, snap_type_name,
           snap_rule_id, snap_rule_title, snap_instructions, snap_interval_value, snap_interval_unit,
           snap_due_date, snap_employee_name
         ) VALUES (?,?,?,?,?,?,?, ?,?,?,?, ?,?, ?,?,?,?,?, ?,?)`,
        [
          completionId, taskId, employee.id, completedAt, completedOn, photo.id, trimmed,
          equipment.id, equipment.code, equipment.name, equipment.location ?? null,
          type?.id ?? equipment.type_id, type?.name ?? 'Unknown type',
          rule.id, rule.title, rule.instructions ?? '', rule.interval_value, rule.interval_unit,
          task.due_date, employee.display_name,
        ],
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Either the task already has a completion, or this photo already
        // backs one. Both mean: this submission is not the one that counts.
        const claimed = tx.get('SELECT id FROM completions WHERE photo_id = ?', [photo.id]);
        if (claimed) {
          throw badRequest('PHOTO_REUSED', 'That photo is already attached to another completion.', { key: 'server.photoReused' });
        }
        throw conflict('ALREADY_COMPLETED', 'Already completed — someone got to this one first.', { key: 'server.alreadyCompleted' });
      }
      throw err;
    }

    tx.run(`UPDATE photos SET claimed = 1 WHERE id = ?`, [photo.id]);

    // Next occurrence: actual completion date + this rule's current interval.
    const next = scheduleNextAfterCompletion(tx, {
      equipmentId: equipment.id, rule, completedOn,
    });

    return {
      completion: tx.get('SELECT * FROM completions WHERE id = ?', [completionId]),
      completedTask: { ...task, status: 'completed', closed_at: completedAt },
      nextTask: next.task,
      equipment,
      rule,
    };
  });
}

module.exports = { submitCompletion, MAX_COMMENT };
