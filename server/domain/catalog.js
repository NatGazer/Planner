'use strict';
/**
 * Configuration writes: equipment types, equipment, maintenance rules.
 * Every mutation is transactional, audited, and keeps the schedule in step.
 */
const { newId } = require('./ids.js');
const { nowInstant, isValidDate, UNITS } = require('./time.js');
const { badRequest, notFound, conflict } = require('./errors.js');
const { isUniqueViolation } = require('../db/connector.js');
const audit = require('./audit.js');
const sched = require('./scheduling.js');

const ACCENTS = ['aurora', 'ember', 'cobalt', 'orchid', 'lime', 'sunset', 'ice', 'gold'];
const ICONS = ['cube', 'fan', 'bolt', 'drop', 'gear', 'flame', 'wave', 'shield', 'truck', 'leaf', 'chip', 'lift'];

const str = (v) => (v == null ? '' : String(v).trim());
function need(value, field, max = 120) {
  const s = str(value);
  if (!s) throw badRequest('VALIDATION', `${field} is required.`, { field });
  if (s.length > max) throw badRequest('VALIDATION', `${field} must be ${max} characters or fewer.`, { field });
  return s;
}

// ---------------------------------------------------------------- types -----

function listTypes(db) {
  return db.all(`
    SELECT ty.*,
           (SELECT COUNT(*) FROM equipment e WHERE e.type_id = ty.id AND e.archived = 0) AS equipment_count,
           (SELECT COUNT(*) FROM equipment e WHERE e.type_id = ty.id AND e.archived = 0 AND e.active = 1) AS active_equipment_count,
           (SELECT COUNT(*) FROM maintenance_rules r WHERE r.type_id = ty.id AND r.archived = 0) AS rule_count,
           (SELECT COUNT(*) FROM maintenance_rules r WHERE r.type_id = ty.id AND r.archived = 0 AND r.active = 1) AS active_rule_count
      FROM equipment_types ty WHERE ty.archived = 0 ORDER BY ty.name ASC`)
    .map((t) => ({
      id: t.id, name: t.name, accent: t.accent, icon: t.icon, createdAt: t.created_at,
      equipmentCount: t.equipment_count, activeEquipmentCount: t.active_equipment_count,
      ruleCount: t.rule_count, activeRuleCount: t.active_rule_count,
    }));
}

function createType(db, { name, accent, icon }, actor) {
  const clean = { name: need(name, 'Type name'), accent: ACCENTS.includes(accent) ? accent : 'aurora', icon: ICONS.includes(icon) ? icon : 'cube' };
  return db.transaction((tx) => {
    const id = newId('type');
    try {
      tx.run(`INSERT INTO equipment_types (id, name, accent, icon, archived, created_at) VALUES (?,?,?,?,0,?)`,
        [id, clean.name, clean.accent, clean.icon, nowInstant()]);
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('DUPLICATE_NAME', `An equipment type called "${clean.name}" already exists.`);
      throw err;
    }
    audit.record(tx, { actor, action: 'type.created', entity: 'equipment_type', entityId: id, summary: `Created equipment type "${clean.name}"`, detail: clean });
    return tx.get('SELECT * FROM equipment_types WHERE id = ?', [id]);
  });
}

function updateType(db, id, patch, actor) {
  return db.transaction((tx) => {
    const before = tx.get('SELECT * FROM equipment_types WHERE id = ? AND archived = 0', [id]);
    if (!before) throw notFound('That equipment type no longer exists.');
    const next = {
      name: patch.name === undefined ? before.name : need(patch.name, 'Type name'),
      accent: patch.accent === undefined ? before.accent : (ACCENTS.includes(patch.accent) ? patch.accent : before.accent),
      icon: patch.icon === undefined ? before.icon : (ICONS.includes(patch.icon) ? patch.icon : before.icon),
    };
    try {
      tx.run('UPDATE equipment_types SET name = ?, accent = ?, icon = ? WHERE id = ?', [next.name, next.accent, next.icon, id]);
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('DUPLICATE_NAME', `An equipment type called "${next.name}" already exists.`);
      throw err;
    }
    audit.record(tx, { actor, action: 'type.updated', entity: 'equipment_type', entityId: id, summary: `Updated equipment type "${next.name}"`, detail: { before: { name: before.name, accent: before.accent, icon: before.icon }, after: next } });
    return tx.get('SELECT * FROM equipment_types WHERE id = ?', [id]);
  });
}

/** Archive rather than delete: completed history keeps pointing somewhere real. */
function archiveType(db, id, actor) {
  return db.transaction((tx) => {
    const t = tx.get('SELECT * FROM equipment_types WHERE id = ? AND archived = 0', [id]);
    if (!t) throw notFound('That equipment type no longer exists.');
    const live = tx.get('SELECT COUNT(*) AS n FROM equipment WHERE type_id = ? AND archived = 0', [id]).n;
    if (live > 0) throw conflict('TYPE_IN_USE', `${live} piece${live === 1 ? '' : 's'} of equipment still use this type. Move or archive them first.`);
    tx.run('UPDATE equipment_types SET archived = 1 WHERE id = ?', [id]);
    tx.run('UPDATE maintenance_rules SET archived = 1 WHERE type_id = ?', [id]);
    audit.record(tx, { actor, action: 'type.archived', entity: 'equipment_type', entityId: id, summary: `Archived equipment type "${t.name}"` });
    return { ok: true };
  });
}

// ------------------------------------------------------------ equipment -----

const EQUIPMENT_SELECT = `
  SELECT e.*, ty.name AS type_name, ty.accent AS type_accent, ty.icon AS type_icon,
         (SELECT COUNT(*) FROM maintenance_tasks t JOIN maintenance_rules r ON r.id = t.rule_id
           WHERE t.equipment_id = e.id AND t.status = 'pending' AND r.active = 1 AND r.archived = 0) AS pending_count,
         (SELECT MIN(t.due_date) FROM maintenance_tasks t JOIN maintenance_rules r ON r.id = t.rule_id
           WHERE t.equipment_id = e.id AND t.status = 'pending' AND r.active = 1 AND r.archived = 0) AS next_due,
         (SELECT COUNT(*) FROM completions c WHERE c.snap_equipment_id = e.id) AS completion_count,
         (SELECT MAX(c.completed_at) FROM completions c WHERE c.snap_equipment_id = e.id) AS last_completed_at
    FROM equipment e JOIN equipment_types ty ON ty.id = e.type_id`;

function equipmentShape(e) {
  return {
    id: e.id, code: e.code, name: e.name, location: e.location || null,
    active: !!e.active, createdAt: e.created_at, updatedAt: e.updated_at,
    type: { id: e.type_id, name: e.type_name, accent: e.type_accent, icon: e.type_icon },
    pendingCount: e.pending_count ?? 0,
    nextDue: e.next_due || null,
    completionCount: e.completion_count ?? 0,
    lastCompletedAt: e.last_completed_at || null,
  };
}

function listEquipment(db, { typeId = null, active = null, search = null } = {}) {
  const where = ['e.archived = 0'];
  const params = [];
  if (typeId) { where.push('e.type_id = ?'); params.push(typeId); }
  if (active === true) where.push('e.active = 1');
  if (active === false) where.push('e.active = 0');
  if (search) {
    where.push('(e.code LIKE ? OR e.name LIKE ? OR e.location LIKE ?)');
    const q = `%${search}%`; params.push(q, q, q);
  }
  return db.all(`${EQUIPMENT_SELECT} WHERE ${where.join(' AND ')} ORDER BY e.code ASC`, params).map(equipmentShape);
}

function getEquipment(db, id) {
  const row = db.get(`${EQUIPMENT_SELECT} WHERE e.id = ?`, [id]);
  return row ? equipmentShape(row) : null;
}

function createEquipment(db, { code, name, typeId, location, active = true, firstDueDate = null }, actor, { today }) {
  const clean = {
    code: need(code, 'Asset code', 40),
    name: need(name, 'Equipment name'),
    typeId: need(typeId, 'Equipment type', 64),
    location: str(location).slice(0, 160) || null,
    active: active !== false,
  };
  if (firstDueDate && !isValidDate(firstDueDate)) throw badRequest('VALIDATION', 'First due date must be a real calendar date.', { field: 'firstDueDate' });

  return db.transaction((tx) => {
    const type = tx.get('SELECT * FROM equipment_types WHERE id = ? AND archived = 0', [clean.typeId]);
    if (!type) throw badRequest('VALIDATION', 'Pick an equipment type that still exists.', { field: 'typeId' });

    const id = newId('eq');
    const ts = nowInstant();
    try {
      tx.run(`INSERT INTO equipment (id, code, name, type_id, location, active, archived, created_at, updated_at)
              VALUES (?,?,?,?,?,?,0,?,?)`,
        [id, clean.code, clean.name, clean.typeId, clean.location, clean.active ? 1 : 0, ts, ts]);
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('DUPLICATE_CODE', `Asset code "${clean.code}" is already in use.`, { field: 'code' });
      throw err;
    }
    const equipment = tx.get('SELECT * FROM equipment WHERE id = ?', [id]);
    const opened = sched.initializeTasksForEquipment(tx, equipment, { setupDate: today, firstDueDate });
    audit.record(tx, {
      actor, action: 'equipment.created', entity: 'equipment', entityId: id,
      summary: `Added ${clean.code} — ${clean.name}`,
      detail: { ...clean, typeName: type.name, firstDueDate: firstDueDate || null, tasksOpened: opened.length },
    });
    return { equipment: getEquipment(tx, id), tasksOpened: opened.length };
  });
}

function updateEquipment(db, id, patch, actor, { today }) {
  return db.transaction((tx) => {
    const before = tx.get('SELECT * FROM equipment WHERE id = ? AND archived = 0', [id]);
    if (!before) throw notFound('That equipment no longer exists.');
    const next = {
      code: patch.code === undefined ? before.code : need(patch.code, 'Asset code', 40),
      name: patch.name === undefined ? before.name : need(patch.name, 'Equipment name'),
      type_id: patch.typeId === undefined ? before.type_id : need(patch.typeId, 'Equipment type', 64),
      location: patch.location === undefined ? before.location : (str(patch.location).slice(0, 160) || null),
      active: patch.active === undefined ? before.active : (patch.active ? 1 : 0),
    };
    if (next.type_id !== before.type_id) {
      const type = tx.get('SELECT * FROM equipment_types WHERE id = ? AND archived = 0', [next.type_id]);
      if (!type) throw badRequest('VALIDATION', 'Pick an equipment type that still exists.', { field: 'typeId' });
    }
    try {
      tx.run(`UPDATE equipment SET code = ?, name = ?, type_id = ?, location = ?, active = ?, updated_at = ? WHERE id = ?`,
        [next.code, next.name, next.type_id, next.location, next.active, nowInstant(), id]);
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('DUPLICATE_CODE', `Asset code "${next.code}" is already in use.`, { field: 'code' });
      throw err;
    }
    const after = tx.get('SELECT * FROM equipment WHERE id = ?', [id]);

    let retired = 0; let opened = [];
    if (next.type_id !== before.type_id) {
      // Moving an item to a different type changes which rules apply. Pending
      // work for rules that no longer apply is retired (audited); the new
      // type's rules open fresh schedules. Completed history is never touched.
      retired = sched.retireOrphanedPendingTasks(tx, after, actor);
      opened = sched.initializeTasksForEquipment(tx, after, { setupDate: today });
    }
    if (next.active !== before.active) {
      audit.record(tx, {
        actor, action: next.active ? 'equipment.activated' : 'equipment.deactivated',
        entity: 'equipment', entityId: id,
        summary: `${next.active ? 'Activated' : 'Deactivated'} ${after.code} — ${after.name}`,
        detail: next.active ? { note: 'Pending tasks restored at their existing due dates.' } : { note: 'Pending tasks hidden; history preserved.' },
      });
    }
    const changed = Object.keys(next).filter((k) => String(before[k] ?? '') !== String(next[k] ?? '') && k !== 'active');
    if (changed.length || next.type_id !== before.type_id) {
      audit.record(tx, {
        actor, action: 'equipment.updated', entity: 'equipment', entityId: id,
        summary: `Updated ${after.code} — ${after.name}`,
        detail: { changed, before: { code: before.code, name: before.name, typeId: before.type_id, location: before.location }, after: { code: next.code, name: next.name, typeId: next.type_id, location: next.location }, retiredTasks: retired, openedTasks: opened.length },
      });
    }
    return getEquipment(tx, id);
  });
}

/**
 * Duplicate a physical item: a new asset code and a brand-new schedule.
 * Completion history is never copied — it belongs to the original item.
 */
function duplicateEquipment(db, id, { code, name, location, count = 1, firstDueDate = null }, actor, { today }) {
  const n = Math.max(1, Math.min(Number(count) || 1, 50));
  return db.transaction((tx) => {
    const source = tx.get('SELECT * FROM equipment WHERE id = ? AND archived = 0', [id]);
    if (!source) throw notFound('That equipment no longer exists.');
    const created = [];
    for (let i = 0; i < n; i += 1) {
      const suffix = n === 1 ? '' : `-${String(i + 1).padStart(2, '0')}`;
      const nextCode = need((code ? `${code}${suffix}` : `${source.code}-COPY${suffix || '-01'}`), 'Asset code', 40);
      const res = createEquipment(tx, {
        code: nextCode,
        name: name ? String(name) : source.name,
        typeId: source.type_id,
        location: location === undefined ? source.location : location,
        active: true,
        firstDueDate,
      }, actor, { today });
      created.push(res.equipment);
    }
    audit.record(tx, {
      actor, action: 'equipment.duplicated', entity: 'equipment', entityId: id,
      summary: `Duplicated ${source.code} into ${created.length} new item${created.length === 1 ? '' : 's'}`,
      detail: { from: source.code, created: created.map((c) => c.code), note: 'New identifiers and fresh schedules. No history copied.' },
    });
    return created;
  });
}

function archiveEquipment(db, id, actor) {
  return db.transaction((tx) => {
    const e = tx.get('SELECT * FROM equipment WHERE id = ? AND archived = 0', [id]);
    if (!e) throw notFound('That equipment no longer exists.');
    tx.run('UPDATE equipment SET archived = 1, active = 0, updated_at = ? WHERE id = ?', [nowInstant(), id]);
    audit.record(tx, {
      actor, action: 'equipment.archived', entity: 'equipment', entityId: id,
      summary: `Archived ${e.code} — ${e.name}`,
      detail: { note: 'Pending tasks hidden. Completed history retained with its original snapshot.' },
    });
    return { ok: true };
  });
}

// ---------------------------------------------------------------- rules -----

const RULE_SELECT = `
  SELECT r.*, ty.name AS type_name, ty.accent AS type_accent, ty.icon AS type_icon,
         (SELECT COUNT(*) FROM maintenance_tasks t WHERE t.rule_id = r.id AND t.status = 'pending') AS pending_count,
         (SELECT COUNT(*) FROM completions c WHERE c.snap_rule_id = r.id) AS completion_count
    FROM maintenance_rules r JOIN equipment_types ty ON ty.id = r.type_id`;

function ruleShape(r) {
  return {
    id: r.id, title: r.title, instructions: r.instructions || '',
    intervalValue: r.interval_value, intervalUnit: r.interval_unit,
    active: !!r.active, createdAt: r.created_at, updatedAt: r.updated_at,
    type: { id: r.type_id, name: r.type_name, accent: r.type_accent, icon: r.type_icon },
    pendingCount: r.pending_count ?? 0, completionCount: r.completion_count ?? 0,
  };
}

function listRules(db, { typeId = null, active = null } = {}) {
  const where = ['r.archived = 0'];
  const params = [];
  if (typeId) { where.push('r.type_id = ?'); params.push(typeId); }
  if (active === true) where.push('r.active = 1');
  if (active === false) where.push('r.active = 0');
  return db.all(`${RULE_SELECT} WHERE ${where.join(' AND ')} ORDER BY ty.name ASC, r.title ASC`, params).map(ruleShape);
}

function getRule(db, id) {
  const row = db.get(`${RULE_SELECT} WHERE r.id = ?`, [id]);
  return row ? ruleShape(row) : null;
}

function validateInterval(value, unit) {
  const v = Number(value);
  if (!Number.isInteger(v) || v <= 0) throw badRequest('VALIDATION', 'Interval must be a whole number greater than zero.', { field: 'intervalValue' });
  if (v > 9999) throw badRequest('VALIDATION', 'Interval is unrealistically large.', { field: 'intervalValue' });
  if (!UNITS.has(unit)) throw badRequest('VALIDATION', 'Interval unit must be days, weeks, months or years.', { field: 'intervalUnit' });
  return v;
}

function createRule(db, { typeId, title, instructions, intervalValue, intervalUnit, active = true, firstDueDate = null }, actor, { today }) {
  const clean = {
    typeId: need(typeId, 'Equipment type', 64),
    title: need(title, 'Task title', 140),
    instructions: str(instructions).slice(0, 8000),
    intervalValue: validateInterval(intervalValue, intervalUnit),
    intervalUnit,
    active: active !== false,
  };
  if (firstDueDate && !isValidDate(firstDueDate)) throw badRequest('VALIDATION', 'First due date must be a real calendar date.', { field: 'firstDueDate' });

  return db.transaction((tx) => {
    const type = tx.get('SELECT * FROM equipment_types WHERE id = ? AND archived = 0', [clean.typeId]);
    if (!type) throw badRequest('VALIDATION', 'Pick an equipment type that still exists.', { field: 'typeId' });
    const id = newId('rule');
    const ts = nowInstant();
    tx.run(`INSERT INTO maintenance_rules (id, type_id, title, instructions, interval_value, interval_unit, active, archived, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,0,?,?)`,
      [id, clean.typeId, clean.title, clean.instructions, clean.intervalValue, clean.intervalUnit, clean.active ? 1 : 0, ts, ts]);
    const rule = tx.get('SELECT * FROM maintenance_rules WHERE id = ?', [id]);
    const opened = sched.initializeTasksForRule(tx, rule, { setupDate: today, firstDueDate });
    audit.record(tx, {
      actor, action: 'rule.created', entity: 'maintenance_rule', entityId: id,
      summary: `Added "${clean.title}" every ${clean.intervalValue} ${clean.intervalUnit} to ${type.name}`,
      detail: { ...clean, typeName: type.name, firstDueDate: firstDueDate || null, tasksOpened: opened.length },
    });
    return { rule: getRule(tx, id), tasksOpened: opened.length };
  });
}

function updateRule(db, id, patch, actor) {
  return db.transaction((tx) => {
    const before = tx.get('SELECT * FROM maintenance_rules WHERE id = ? AND archived = 0', [id]);
    if (!before) throw notFound('That maintenance task no longer exists.');
    const unit = patch.intervalUnit === undefined ? before.interval_unit : patch.intervalUnit;
    const next = {
      title: patch.title === undefined ? before.title : need(patch.title, 'Task title', 140),
      instructions: patch.instructions === undefined ? before.instructions : str(patch.instructions).slice(0, 8000),
      interval_value: patch.intervalValue === undefined && patch.intervalUnit === undefined
        ? before.interval_value
        : validateInterval(patch.intervalValue === undefined ? before.interval_value : patch.intervalValue, unit),
      interval_unit: unit,
      active: patch.active === undefined ? before.active : (patch.active ? 1 : 0),
    };
    tx.run(`UPDATE maintenance_rules SET title = ?, instructions = ?, interval_value = ?, interval_unit = ?, active = ?, updated_at = ? WHERE id = ?`,
      [next.title, next.instructions, next.interval_value, next.interval_unit, next.active, nowInstant(), id]);

    if (next.active !== before.active) {
      audit.record(tx, {
        actor, action: next.active ? 'rule.activated' : 'rule.deactivated',
        entity: 'maintenance_rule', entityId: id,
        summary: `${next.active ? 'Activated' : 'Deactivated'} "${next.title}"`,
        detail: next.active ? { note: 'Pending tasks restored at their existing due dates.' } : { note: 'Pending tasks hidden; history preserved.' },
      });
    }
    const frequencyChanged = next.interval_value !== before.interval_value || next.interval_unit !== before.interval_unit;
    const otherChanged = next.title !== before.title || next.instructions !== before.instructions;
    if (frequencyChanged || otherChanged) {
      audit.record(tx, {
        actor, action: 'rule.updated', entity: 'maintenance_rule', entityId: id,
        summary: frequencyChanged
          ? `Changed "${next.title}" frequency: every ${before.interval_value} ${before.interval_unit} → every ${next.interval_value} ${next.interval_unit}`
          : `Updated "${next.title}"`,
        detail: {
          before: { title: before.title, intervalValue: before.interval_value, intervalUnit: before.interval_unit },
          after: { title: next.title, intervalValue: next.interval_value, intervalUnit: next.interval_unit },
          note: frequencyChanged ? 'Applies to the next generated occurrence. Existing pending due dates are unchanged.' : undefined,
        },
      });
    }
    return getRule(tx, id);
  });
}

function archiveRule(db, id, actor) {
  return db.transaction((tx) => {
    const r = tx.get('SELECT * FROM maintenance_rules WHERE id = ? AND archived = 0', [id]);
    if (!r) throw notFound('That maintenance task no longer exists.');
    tx.run('UPDATE maintenance_rules SET archived = 1, active = 0, updated_at = ? WHERE id = ?', [nowInstant(), id]);
    audit.record(tx, {
      actor, action: 'rule.archived', entity: 'maintenance_rule', entityId: id,
      summary: `Archived "${r.title}"`,
      detail: { note: 'Pending tasks hidden. Completed history retained with its original snapshot.' },
    });
    return { ok: true };
  });
}

module.exports = {
  ACCENTS, ICONS,
  listTypes, createType, updateType, archiveType,
  listEquipment, getEquipment, createEquipment, updateEquipment, duplicateEquipment, archiveEquipment, equipmentShape,
  listRules, getRule, createRule, updateRule, archiveRule, ruleShape,
};
