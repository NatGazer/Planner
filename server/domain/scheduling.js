'use strict';
/**
 * ============================================================================
 *  Scheduling engine
 * ============================================================================
 *
 * The rules this file enforces, in one place:
 *
 *   • Exactly one pending task per (equipment, rule) pair. An overdue task
 *     stays outstanding; missed occurrences never pile up.
 *   • First due date defaults to setup date + the rule's interval. No previous
 *     completion is ever invented.
 *   • After a completion, the next due date is the *actual completion date*
 *     plus that rule's interval — so early or late work re-bases only that one
 *     pair's schedule.
 *   • A frequency change applies to the next generated occurrence. Pending due
 *     dates are left alone unless an administrator reschedules explicitly.
 *   • Deactivating equipment or a rule hides its pending tasks. Nothing is
 *     deleted, and reactivation restores the original dates, overdue included.
 */
const { newId } = require('./ids.js');
const { addInterval, nowInstant } = require('./time.js');
const { isUniqueViolation } = require('../db/connector.js');
const audit = require('./audit.js');

/**
 * Create the pending task for a pair if — and only if — none exists.
 * Concurrency-safe: the partial unique index is the arbiter, not this read.
 * @returns {{created: boolean, task: object}}
 */
function ensurePendingTask(db, { equipmentId, ruleId, dueDate }) {
  const existing = db.get(
    `SELECT * FROM maintenance_tasks WHERE equipment_id = ? AND rule_id = ? AND status = 'pending'`,
    [equipmentId, ruleId],
  );
  if (existing) return { created: false, task: existing };

  const task = {
    id: newId('task'),
    equipment_id: equipmentId,
    rule_id: ruleId,
    due_date: dueDate,
    status: 'pending',
    created_at: nowInstant(),
    closed_at: null,
  };
  try {
    db.run(
      `INSERT INTO maintenance_tasks (id, equipment_id, rule_id, due_date, status, created_at, closed_at)
       VALUES (?, ?, ?, ?, 'pending', ?, NULL)`,
      [task.id, task.equipment_id, task.rule_id, task.due_date, task.created_at],
    );
    return { created: true, task };
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Someone else won the race. Their task is the one that counts.
      const winner = db.get(
        `SELECT * FROM maintenance_tasks WHERE equipment_id = ? AND rule_id = ? AND status = 'pending'`,
        [equipmentId, ruleId],
      );
      if (winner) return { created: false, task: winner };
    }
    throw err;
  }
}

/** Default first due date for a pair: the day it was set up + one interval. */
function defaultFirstDue(rule, setupDate) {
  return addInterval(setupDate, rule.interval_value, rule.interval_unit);
}

/**
 * Open the schedule for one piece of equipment against every rule of its type.
 * Used when equipment is created and when its type changes.
 */
function initializeTasksForEquipment(db, equipment, { setupDate, firstDueDate = null }) {
  const rules = db.all(
    `SELECT * FROM maintenance_rules WHERE type_id = ? AND archived = 0`,
    [equipment.type_id],
  );
  const created = [];
  for (const rule of rules) {
    const due = firstDueDate || defaultFirstDue(rule, setupDate);
    const res = ensurePendingTask(db, { equipmentId: equipment.id, ruleId: rule.id, dueDate: due });
    if (res.created) created.push(res.task);
  }
  return created;
}

/**
 * Open the schedule for one rule across every existing item of its type.
 * Inactive items get a task too — it is hidden, not absent, so reactivating
 * the item reveals a schedule that has been running all along.
 */
function initializeTasksForRule(db, rule, { setupDate, firstDueDate = null }) {
  const items = db.all(
    `SELECT * FROM equipment WHERE type_id = ? AND archived = 0`,
    [rule.type_id],
  );
  const created = [];
  const due = firstDueDate || defaultFirstDue(rule, setupDate);
  for (const item of items) {
    const res = ensurePendingTask(db, { equipmentId: item.id, ruleId: rule.id, dueDate: due });
    if (res.created) created.push(res.task);
  }
  return created;
}

/**
 * Retire pending tasks for pairs that no longer exist — the only case being an
 * equipment item moved to a different type. Completed history is untouched:
 * it carries its own snapshot and is never rewritten.
 */
function retireOrphanedPendingTasks(db, equipment, actor) {
  const orphans = db.all(
    `SELECT t.*, r.title AS rule_title
       FROM maintenance_tasks t
       JOIN maintenance_rules r ON r.id = t.rule_id
      WHERE t.equipment_id = ? AND t.status = 'pending' AND r.type_id <> ?`,
    [equipment.id, equipment.type_id],
  );
  for (const o of orphans) {
    db.run(`DELETE FROM maintenance_tasks WHERE id = ? AND status = 'pending'`, [o.id]);
    audit.record(db, {
      actor,
      action: 'task.retired',
      entity: 'maintenance_task',
      entityId: o.id,
      summary: `Retired pending "${o.rule_title}" on ${equipment.code} — no longer applies after the type change`,
      detail: { dueDate: o.due_date, ruleId: o.rule_id },
    });
  }
  return orphans.length;
}

/**
 * The next occurrence after a completion: completion date + this rule's
 * interval. Called inside the completion transaction.
 */
function scheduleNextAfterCompletion(db, { equipmentId, rule, completedOn }) {
  const due = addInterval(completedOn, rule.interval_value, rule.interval_unit);
  return ensurePendingTask(db, { equipmentId, ruleId: rule.id, dueDate: due });
}

/** Administrator moves one pending task. Always audited. */
function rescheduleTask(db, { taskId, newDueDate, reason, actor }) {
  const task = db.get(
    `SELECT t.*, e.code AS equipment_code, r.title AS rule_title
       FROM maintenance_tasks t
       JOIN equipment e ON e.id = t.equipment_id
       JOIN maintenance_rules r ON r.id = t.rule_id
      WHERE t.id = ?`,
    [taskId],
  );
  if (!task) return null;
  if (task.status !== 'pending') return { unchanged: true, task };
  if (task.due_date === newDueDate) return { unchanged: true, task };

  db.run(`UPDATE maintenance_tasks SET due_date = ? WHERE id = ? AND status = 'pending'`, [newDueDate, taskId]);
  audit.record(db, {
    actor,
    action: 'task.rescheduled',
    entity: 'maintenance_task',
    entityId: taskId,
    summary: `Rescheduled "${task.rule_title}" on ${task.equipment_code}: ${task.due_date} → ${newDueDate}`,
    detail: { from: task.due_date, to: newDueDate, reason: reason || null },
  });
  return { unchanged: false, task: { ...task, due_date: newDueDate } };
}

/**
 * Self-healing sweep. Every active pair should own exactly one pending task;
 * if one is ever missing (a hand-edited database, a restored backup, a partial
 * import) this reopens it dated today + interval rather than leaving a silent
 * hole in the schedule.
 */
function reconcileSchedules(db, { today }) {
  const pairs = db.all(
    `SELECT e.id AS equipment_id, r.id AS rule_id, r.interval_value, r.interval_unit
       FROM equipment e
       JOIN maintenance_rules r ON r.type_id = e.type_id
      WHERE e.archived = 0 AND r.archived = 0
        AND NOT EXISTS (
          SELECT 1 FROM maintenance_tasks t
           WHERE t.equipment_id = e.id AND t.rule_id = r.id AND t.status = 'pending'
        )`,
  );
  const opened = [];
  for (const p of pairs) {
    const due = addInterval(today, p.interval_value, p.interval_unit);
    const res = ensurePendingTask(db, { equipmentId: p.equipment_id, ruleId: p.rule_id, dueDate: due });
    if (res.created) opened.push(res.task);
  }
  return opened;
}

module.exports = {
  ensurePendingTask,
  defaultFirstDue,
  initializeTasksForEquipment,
  initializeTasksForRule,
  retireOrphanedPendingTasks,
  scheduleNextAfterCompletion,
  rescheduleTask,
  reconcileSchedules,
};
