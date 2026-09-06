'use strict';
/**
 * Read models. Every shape the two apps render is assembled here so the
 * clients stay presentational and a single round trip fills a screen.
 */
const { describeDue, addDays, compareDates, daysBetween } = require('./time.js');

// --- row → client shape -----------------------------------------------------

const typeShape = (r) => (r.type_id ? {
  id: r.type_id, name: r.type_name, accent: r.type_accent || 'aurora', icon: r.type_icon || 'cube',
} : null);

function taskShape(row, today) {
  return {
    id: row.id,
    dueDate: row.due_date,
    status: row.status,
    createdAt: row.created_at,
    closedAt: row.closed_at,
    due: describeDue(row.due_date, today),
    equipment: {
      id: row.equipment_id,
      code: row.equipment_code,
      name: row.equipment_name,
      location: row.location || null,
      active: !!row.equipment_active,
      type: typeShape(row),
    },
    rule: {
      id: row.rule_id,
      title: row.rule_title,
      instructions: row.instructions || '',
      intervalValue: row.interval_value,
      intervalUnit: row.interval_unit,
      active: !!row.rule_active,
    },
  };
}

const TASK_SELECT = `
  SELECT t.id, t.equipment_id, t.rule_id, t.due_date, t.status, t.created_at, t.closed_at,
         e.code AS equipment_code, e.name AS equipment_name, e.location, e.active AS equipment_active,
         ty.id AS type_id, ty.name AS type_name, ty.accent AS type_accent, ty.icon AS type_icon,
         r.title AS rule_title, r.instructions, r.interval_value, r.interval_unit, r.active AS rule_active
    FROM maintenance_tasks t
    JOIN equipment e ON e.id = t.equipment_id
    JOIN equipment_types ty ON ty.id = e.type_id
    JOIN maintenance_rules r ON r.id = t.rule_id`;

/** Actionable = pending, on active equipment, under an active rule. */
const ACTIONABLE = `t.status = 'pending' AND e.active = 1 AND e.archived = 0 AND r.active = 1 AND r.archived = 0`;

/**
 * Outstanding work, ascending by due date — which puts overdue first by
 * construction, since an overdue date is simply an earlier date.
 */
function outstandingTasks(db, { today, includeHidden = false, equipmentId = null, typeId = null, ruleId = null, bucket = null, search = null, limit = 500 }) {
  const where = [includeHidden ? `t.status = 'pending'` : ACTIONABLE];
  const params = [];
  if (equipmentId) { where.push('t.equipment_id = ?'); params.push(equipmentId); }
  if (typeId) { where.push('e.type_id = ?'); params.push(typeId); }
  if (ruleId) { where.push('t.rule_id = ?'); params.push(ruleId); }
  if (bucket === 'overdue') { where.push('t.due_date < ?'); params.push(today); }
  else if (bucket === 'today') { where.push('t.due_date = ?'); params.push(today); }
  else if (bucket === 'week') { where.push('t.due_date > ? AND t.due_date <= ?'); params.push(today, addDays(today, 7)); }
  else if (bucket === 'due-or-overdue') { where.push('t.due_date <= ?'); params.push(today); }
  else if (bucket === 'later') { where.push('t.due_date > ?'); params.push(addDays(today, 7)); }
  if (search) {
    where.push('(e.code LIKE ? OR e.name LIKE ? OR r.title LIKE ? OR e.location LIKE ?)');
    const q = `%${search}%`;
    params.push(q, q, q, q);
  }
  const sql = `${TASK_SELECT} WHERE ${where.join(' AND ')}
               ORDER BY t.due_date ASC, e.code ASC, r.title ASC LIMIT ?`;
  return db.all(sql, [...params, Math.min(Number(limit) || 500, 1000)]).map((r) => taskShape(r, today));
}

function taskById(db, id, today) {
  const row = db.get(`${TASK_SELECT} WHERE t.id = ?`, [id]);
  return row ? taskShape(row, today) : null;
}

// --- completions ------------------------------------------------------------

function completionShape(row) {
  return {
    id: row.id,
    taskId: row.task_id,
    completedAt: row.completed_at,
    completedOn: row.completed_on,
    dueDate: row.snap_due_date,
    daysLate: daysBetween(row.snap_due_date, row.completed_on),
    onTime: compareDates(row.completed_on, row.snap_due_date) <= 0,
    comment: row.comment || null,
    photoId: row.photo_id,
    employee: { id: row.employee_id, name: row.snap_employee_name },
    equipment: {
      id: row.snap_equipment_id,
      code: row.snap_equipment_code,
      name: row.snap_equipment_name,
      location: row.snap_location || null,
      type: { id: row.snap_type_id, name: row.snap_type_name },
    },
    rule: {
      id: row.snap_rule_id,
      title: row.snap_rule_title,
      instructions: row.snap_instructions || '',
      intervalValue: row.snap_interval_value,
      intervalUnit: row.snap_interval_unit,
    },
  };
}

function completionHistory(db, { equipmentId = null, ruleId = null, employeeId = null, typeId = null, from = null, to = null, search = null, limit = 200, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (equipmentId) { where.push('c.snap_equipment_id = ?'); params.push(equipmentId); }
  if (ruleId) { where.push('c.snap_rule_id = ?'); params.push(ruleId); }
  if (employeeId) { where.push('c.employee_id = ?'); params.push(employeeId); }
  if (typeId) { where.push('c.snap_type_id = ?'); params.push(typeId); }
  if (from) { where.push('c.completed_on >= ?'); params.push(from); }
  if (to) { where.push('c.completed_on <= ?'); params.push(to); }
  if (search) {
    where.push('(c.snap_equipment_code LIKE ? OR c.snap_equipment_name LIKE ? OR c.snap_rule_title LIKE ? OR c.snap_employee_name LIKE ? OR c.comment LIKE ?)');
    const q = `%${search}%`;
    params.push(q, q, q, q, q);
  }
  const sql = `SELECT c.* FROM completions c
               ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
               ORDER BY c.completed_at DESC LIMIT ? OFFSET ?`;
  const rows = db.all(sql, [...params, Math.min(Number(limit) || 200, 500), Number(offset) || 0]);
  const countSql = `SELECT COUNT(*) AS n FROM completions c ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
  const total = db.get(countSql, params)?.n ?? rows.length;
  return { items: rows.map(completionShape), total };
}

function completionById(db, id) {
  const row = db.get('SELECT * FROM completions WHERE id = ?', [id]);
  return row ? completionShape(row) : null;
}

// --- dashboard --------------------------------------------------------------

/**
 * One request fills the whole admin home screen. Inactive equipment and
 * inactive rules are excluded from every actionable count.
 */
function dashboard(db, { today }) {
  const in7 = addDays(today, 7);
  const in30 = addDays(today, 30);
  const one = (sql, params = []) => db.get(sql, params) ?? {};

  const equipment = one(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active
      FROM equipment WHERE archived = 0`);
  const types = one(`SELECT COUNT(*) AS total FROM equipment_types WHERE archived = 0`);
  const rules = one(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active
      FROM maintenance_rules WHERE archived = 0`);

  const buckets = one(`
    SELECT
      SUM(CASE WHEN t.due_date <  ? THEN 1 ELSE 0 END) AS overdue,
      SUM(CASE WHEN t.due_date =  ? THEN 1 ELSE 0 END) AS due_today,
      SUM(CASE WHEN t.due_date >  ? AND t.due_date <= ? THEN 1 ELSE 0 END) AS due_week,
      SUM(CASE WHEN t.due_date >  ? THEN 1 ELSE 0 END) AS later,
      COUNT(*) AS outstanding
    FROM maintenance_tasks t
    JOIN equipment e ON e.id = t.equipment_id
    JOIN maintenance_rules r ON r.id = t.rule_id
    WHERE ${ACTIONABLE}`, [today, today, today, in7, in7]);

  const hidden = one(`
    SELECT COUNT(*) AS n FROM maintenance_tasks t
      JOIN equipment e ON e.id = t.equipment_id
      JOIN maintenance_rules r ON r.id = t.rule_id
     WHERE t.status = 'pending' AND (e.active = 0 OR r.active = 0)`);

  // 28-day completion trend, business-local dates.
  const since14 = addDays(today, -27);
  const trendRows = db.all(
    `SELECT completed_on AS d, COUNT(*) AS n FROM completions WHERE completed_on >= ? GROUP BY completed_on`,
    [since14],
  );
  const trendMap = new Map(trendRows.map((r) => [r.d, r.n]));
  const completionTrend = Array.from({ length: 28 }, (_, i) => {
    const d = addDays(since14, i);
    return { date: d, count: trendMap.get(d) || 0 };
  });

  // Upcoming 14-day load, actionable tasks only. Day 0 folds in everything
  // overdue so the chart never hides a backlog off the left edge.
  const loadRows = db.all(
    `SELECT t.due_date AS d, COUNT(*) AS n
       FROM maintenance_tasks t
       JOIN equipment e ON e.id = t.equipment_id
       JOIN maintenance_rules r ON r.id = t.rule_id
      WHERE ${ACTIONABLE} AND t.due_date <= ?
      GROUP BY t.due_date`, [addDays(today, 13)],
  );
  const loadMap = new Map(loadRows.map((r) => [r.d, r.n]));
  const overdueCarry = loadRows.filter((r) => compareDates(r.d, today) < 0).reduce((s, r) => s + r.n, 0);
  const upcomingLoad = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(today, i);
    return { date: d, count: (loadMap.get(d) || 0) + (i === 0 ? overdueCarry : 0), carried: i === 0 ? overdueCarry : 0 };
  });

  const byType = db.all(`
    SELECT ty.id, ty.name, ty.accent, ty.icon,
           COUNT(DISTINCT e.id) AS equipment_count,
           SUM(CASE WHEN t.id IS NOT NULL AND t.due_date < ? THEN 1 ELSE 0 END) AS overdue
      FROM equipment_types ty
      LEFT JOIN equipment e ON e.type_id = ty.id AND e.archived = 0 AND e.active = 1
      LEFT JOIN maintenance_tasks t
             ON t.equipment_id = e.id AND t.status = 'pending'
      LEFT JOIN maintenance_rules r ON r.id = t.rule_id AND r.active = 1 AND r.archived = 0
     WHERE ty.archived = 0
     GROUP BY ty.id ORDER BY equipment_count DESC, ty.name ASC`, [today]);

  const attention = db.all(`${TASK_SELECT}
     WHERE ${ACTIONABLE} AND t.due_date < ?
     ORDER BY t.due_date ASC LIMIT 6`, [today]).map((r) => taskShape(r, today));

  const nextUp = db.all(`${TASK_SELECT}
     WHERE ${ACTIONABLE} AND t.due_date >= ?
     ORDER BY t.due_date ASC LIMIT 6`, [today]).map((r) => taskShape(r, today));

  const recent = db.all('SELECT * FROM completions ORDER BY completed_at DESC LIMIT 8').map(completionShape);

  const thirty = one(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN completed_on <= snap_due_date THEN 1 ELSE 0 END) AS on_time
       FROM completions WHERE completed_on >= ?`, [addDays(today, -29)]);
  const totalCompletions = one('SELECT COUNT(*) AS n FROM completions').n ?? 0;

  return {
    today,
    stats: {
      activeEquipment: equipment.active ?? 0,
      totalEquipment: equipment.total ?? 0,
      inactiveEquipment: (equipment.total ?? 0) - (equipment.active ?? 0),
      equipmentTypes: types.total ?? 0,
      activeRules: rules.active ?? 0,
      totalRules: rules.total ?? 0,
      overdue: buckets.overdue ?? 0,
      dueToday: buckets.due_today ?? 0,
      dueThisWeek: buckets.due_week ?? 0,
      later: buckets.later ?? 0,
      outstanding: buckets.outstanding ?? 0,
      hiddenPending: hidden.n ?? 0,
      completions30d: thirty.total ?? 0,
      onTime30d: thirty.on_time ?? 0,
      onTimeRate30d: thirty.total ? Math.round(((thirty.on_time ?? 0) / thirty.total) * 100) : null,
      completionsAllTime: totalCompletions,
    },
    completionTrend,
    upcomingLoad,
    byType: byType.map((t) => ({
      id: t.id, name: t.name, accent: t.accent, icon: t.icon,
      equipmentCount: t.equipment_count ?? 0, overdue: t.overdue ?? 0,
    })),
    attention,
    nextUp,
    recentCompletions: recent,
  };
}

module.exports = { outstandingTasks, taskById, taskShape, completionHistory, completionById, completionShape, dashboard, TASK_SELECT, ACTIONABLE };
