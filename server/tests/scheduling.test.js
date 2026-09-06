'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox, makeEmployee, makePhoto } = require('./helpers.js');

const box = sandbox('sched');
const { db } = box;
const catalog = require('../domain/catalog.js');
const queries = require('../domain/queries.js');
const sched = require('../domain/scheduling.js');
const { submitCompletion } = require('../domain/completions.js');
const t = require('../domain/time.js');

const TODAY = '2026-03-10';
const admin = makeEmployee(db, { role: 'admin', name: 'Admin One' });
const worker = makeEmployee(db, { role: 'worker', name: 'Worker One' });

const pending = (equipmentId, ruleId) => db.get(
  `SELECT * FROM maintenance_tasks WHERE equipment_id = ? AND rule_id = ? AND status = 'pending'`, [equipmentId, ruleId]);

test.after(() => box.cleanup());

test('a type supports several independent rules, and each item gets its own schedule', () => {
  const type = catalog.createType(db, { name: 'Pump' }, admin);
  const rA = catalog.createRule(db, { typeId: type.id, title: 'Weekly check', intervalValue: 1, intervalUnit: 'weeks' }, admin, { today: TODAY }).rule;
  const rB = catalog.createRule(db, { typeId: type.id, title: 'Quarterly service', intervalValue: 3, intervalUnit: 'months' }, admin, { today: TODAY }).rule;

  const e1 = catalog.createEquipment(db, { code: 'P-1', name: 'Pump one', typeId: type.id }, admin, { today: TODAY }).equipment;
  const e2 = catalog.createEquipment(db, { code: 'P-2', name: 'Pump two', typeId: type.id }, admin, { today: TODAY }).equipment;

  // Two items x two rules = four independent pending tasks.
  assert.equal(db.get(`SELECT COUNT(*) AS n FROM maintenance_tasks WHERE status='pending'`).n, 4);
  assert.equal(pending(e1.id, rA.id).due_date, '2026-03-17');   // setup + 1 week
  assert.equal(pending(e1.id, rB.id).due_date, '2026-06-10');   // setup + 3 months
  assert.equal(pending(e2.id, rA.id).due_date, '2026-03-17');
  assert.notEqual(pending(e1.id, rA.id).id, pending(e2.id, rA.id).id);

  box.fixture = { type, rA, rB, e1, e2 };
});

test('adding a rule later opens tasks on every existing item of the type', () => {
  const { type, e1, e2 } = box.fixture;
  const rC = catalog.createRule(db, { typeId: type.id, title: 'Yearly overhaul', intervalValue: 1, intervalUnit: 'years' }, admin, { today: TODAY });
  assert.equal(rC.tasksOpened, 2);
  assert.equal(pending(e1.id, rC.rule.id).due_date, '2027-03-10');
  assert.equal(pending(e2.id, rC.rule.id).due_date, '2027-03-10');
  box.fixture.rC = rC.rule;
});

test('the administrator may set an explicit first due date instead of the default', () => {
  const { type } = box.fixture;
  const e3 = catalog.createEquipment(db, {
    code: 'P-3', name: 'Pump three', typeId: type.id, firstDueDate: '2026-03-12',
  }, admin, { today: TODAY }).equipment;
  const rows = db.all(`SELECT * FROM maintenance_tasks WHERE equipment_id = ? AND status='pending'`, [e3.id]);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.due_date === '2026-03-12'));
  box.fixture.e3 = e3;
});

test('completing early re-bases only that one equipment-rule pair', () => {
  const { rA, e1, e2 } = box.fixture;
  const task = pending(e1.id, rA.id);                     // due 2026-03-17
  const e2Before = pending(e2.id, rA.id).due_date;

  const photo = makePhoto(db, worker.id);
  const result = submitCompletion(db, { taskId: task.id, employee: worker, photoId: photo.id, comment: 'Done early' });

  const completedOn = result.completion.completed_on;
  assert.equal(result.nextTask.due_date, t.addInterval(completedOn, 1, 'weeks'));
  assert.equal(pending(e2.id, rA.id).due_date, e2Before, 'the sibling item is untouched');
  assert.equal(db.get(`SELECT COUNT(*) AS n FROM maintenance_tasks WHERE equipment_id=? AND rule_id=? AND status='pending'`, [e1.id, rA.id]).n, 1);
});

test('a late completion also re-bases from the completion date, not the due date', () => {
  const { type } = box.fixture;
  const rule = catalog.createRule(db, { typeId: type.id, title: 'Late test', intervalValue: 10, intervalUnit: 'days' }, admin, { today: TODAY }).rule;
  const item = catalog.createEquipment(db, { code: 'P-LATE', name: 'Late pump', typeId: type.id }, admin, { today: TODAY }).equipment;

  // Backdate the task so it is well overdue.
  db.run(`UPDATE maintenance_tasks SET due_date = ? WHERE equipment_id = ? AND rule_id = ? AND status = 'pending'`,
    ['2026-01-01', item.id, rule.id]);
  const task = pending(item.id, rule.id);

  const photo = makePhoto(db, worker.id, 40);
  const result = submitCompletion(db, { taskId: task.id, employee: worker, photoId: photo.id });
  const completedOn = result.completion.completed_on;

  assert.equal(result.completion.snap_due_date, '2026-01-01', 'history keeps the date it was actually due');
  assert.equal(result.nextTask.due_date, t.addInterval(completedOn, 10, 'days'),
    'the next occurrence is completion date + interval, not missed due date + interval');
  assert.ok(t.compareDates(result.nextTask.due_date, completedOn) > 0);
});

test('one pending task per pair — an overdue task never accumulates duplicates', () => {
  const { type } = box.fixture;
  const rule = catalog.createRule(db, { typeId: type.id, title: 'Daily thing', intervalValue: 1, intervalUnit: 'days' }, admin, { today: TODAY }).rule;
  const item = catalog.createEquipment(db, { code: 'P-DAILY', name: 'Daily pump', typeId: type.id }, admin, { today: TODAY }).equipment;
  db.run(`UPDATE maintenance_tasks SET due_date = '2025-01-01' WHERE equipment_id = ? AND rule_id = ?`, [item.id, rule.id]);

  // Whatever else happens — a reconcile sweep, a repeated initialise — there is
  // still exactly one outstanding occurrence, still carrying its original date.
  db.transaction((tx) => sched.reconcileSchedules(tx, { today: TODAY }));
  sched.initializeTasksForRule(db, db.get('SELECT * FROM maintenance_rules WHERE id = ?', [rule.id]), { setupDate: TODAY });
  const rows = db.all(`SELECT * FROM maintenance_tasks WHERE equipment_id=? AND rule_id=? AND status='pending'`, [item.id, rule.id]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].due_date, '2025-01-01');
});

test('overdue tasks sort first because they are simply earlier dates', () => {
  const list = queries.outstandingTasks(db, { today: TODAY });
  const dates = list.map((x) => x.dueDate);
  assert.deepEqual(dates, [...dates].sort(), 'ascending by due date');
  const firstNonOverdue = list.findIndex((x) => x.due.bucket !== 'overdue');
  const anyOverdueAfter = list.slice(firstNonOverdue === -1 ? list.length : firstNonOverdue).some((x) => x.due.bucket === 'overdue');
  assert.equal(anyOverdueAfter, false);
});

test('a frequency change applies to the next occurrence, not the pending one', () => {
  const { rB, e2 } = box.fixture;
  const before = pending(e2.id, rB.id).due_date;
  catalog.updateRule(db, rB.id, { intervalValue: 1, intervalUnit: 'months' }, admin);
  assert.equal(pending(e2.id, rB.id).due_date, before, 'the pending due date is left alone');

  const photo = makePhoto(db, worker.id, 80);
  const result = submitCompletion(db, { taskId: pending(e2.id, rB.id).id, employee: worker, photoId: photo.id });
  assert.equal(result.nextTask.due_date, t.addInterval(result.completion.completed_on, 1, 'months'),
    'the new frequency governs the occurrence generated after it');
});

test('deactivating equipment hides its pending work and reactivation restores the same dates', () => {
  const { e3 } = box.fixture;
  const before = db.all(`SELECT id, due_date FROM maintenance_tasks WHERE equipment_id=? AND status='pending' ORDER BY id`, [e3.id]);
  assert.ok(before.length > 0);

  catalog.updateEquipment(db, e3.id, { active: false }, admin, { today: TODAY });
  const hidden = queries.outstandingTasks(db, { today: TODAY }).filter((x) => x.equipment.id === e3.id);
  assert.equal(hidden.length, 0, 'hidden from the actionable list');
  const stillThere = db.all(`SELECT id, due_date FROM maintenance_tasks WHERE equipment_id=? AND status='pending' ORDER BY id`, [e3.id]);
  assert.deepEqual(stillThere, before, 'rows are untouched, not deleted');

  catalog.updateEquipment(db, e3.id, { active: true }, admin, { today: TODAY });
  const back = queries.outstandingTasks(db, { today: TODAY }).filter((x) => x.equipment.id === e3.id);
  assert.equal(back.length, before.length);
  assert.deepEqual(back.map((x) => x.dueDate).sort(), before.map((x) => x.due_date).sort(),
    'including dates that are now overdue');
});

test('deactivating a rule hides it everywhere and keeps history intact', () => {
  const { rC } = box.fixture;
  const historyBefore = queries.completionHistory(db, {}).total;
  catalog.updateRule(db, rC.id, { active: false }, admin);
  assert.equal(queries.outstandingTasks(db, { today: TODAY }).filter((x) => x.rule.id === rC.id).length, 0);
  assert.equal(db.get(`SELECT COUNT(*) AS n FROM maintenance_tasks WHERE rule_id=? AND status='pending'`, [rC.id]).n > 0, true);
  assert.equal(queries.completionHistory(db, {}).total, historyBefore);
  catalog.updateRule(db, rC.id, { active: true }, admin);
});

test('an explicit reschedule moves the date and is written to the audit log', () => {
  const { rA, e2 } = box.fixture;
  const task = pending(e2.id, rA.id);
  db.transaction((tx) => sched.rescheduleTask(tx, { taskId: task.id, newDueDate: '2026-04-01', reason: 'Contractor unavailable', actor: admin }));
  assert.equal(pending(e2.id, rA.id).due_date, '2026-04-01');
  const entry = require('../domain/audit.js').list(db, { entity: 'maintenance_task', entityId: task.id })[0];
  assert.equal(entry.action, 'task.rescheduled');
  assert.equal(entry.detail.to, '2026-04-01');
  assert.equal(entry.detail.reason, 'Contractor unavailable');
  assert.equal(entry.actor_name, 'Admin One');
});

test('duplicating equipment gives a new identifier and a fresh schedule, never copied history', () => {
  const { e1 } = box.fixture;
  const historyOfOriginal = queries.completionHistory(db, { equipmentId: e1.id }).total;
  assert.ok(historyOfOriginal > 0, 'the original has history to not copy');

  const [copy] = catalog.duplicateEquipment(db, e1.id, { code: 'P-1-CLONE' }, admin, { today: TODAY });
  assert.notEqual(copy.id, e1.id);
  assert.equal(copy.code, 'P-1-CLONE');
  assert.equal(queries.completionHistory(db, { equipmentId: copy.id }).total, 0, 'no history copied');

  const copyTasks = db.all(`SELECT * FROM maintenance_tasks WHERE equipment_id=? AND status='pending'`, [copy.id]);
  assert.ok(copyTasks.length > 0, 'a schedule of its own');
  assert.equal(queries.completionHistory(db, { equipmentId: e1.id }).total, historyOfOriginal, 'the original is untouched');
});

test('completion history can be filtered to one maintenance task', () => {
  const { rA } = box.fixture;
  const all = queries.completionHistory(db, {}).total;
  const forRule = queries.completionHistory(db, { ruleId: rA.id });
  assert.ok(forRule.total > 0, 'that rule has completions');
  assert.ok(forRule.total < all, 'and it is a subset of everything');
  assert.ok(forRule.items.every((c) => c.rule.id === rA.id));
});

test('an abandoned photo draft is swept, a claimed one never is', () => {
  const store = require('../storage/photo-store.js');
  const fresh = makePhoto(db, worker.id, 9);
  const stale = makePhoto(db, worker.id, 10);
  db.run('UPDATE photos SET uploaded_at = ? WHERE id = ?', ['2020-01-01T00:00:00.000Z', stale.id]);

  const claimed = db.get('SELECT * FROM photos WHERE claimed = 1 LIMIT 1');
  db.run('UPDATE photos SET uploaded_at = ? WHERE id = ?', ['2020-01-01T00:00:00.000Z', claimed.id]);

  const removed = store.sweepAbandoned(db);
  assert.equal(removed, 1, 'only the stale unclaimed draft');
  assert.equal(db.get('SELECT COUNT(*) AS n FROM photos WHERE id = ?', [stale.id]).n, 0);
  assert.equal(db.get('SELECT COUNT(*) AS n FROM photos WHERE id = ?', [fresh.id]).n, 1, 'a recent draft is left alone');
  assert.equal(db.get('SELECT COUNT(*) AS n FROM photos WHERE id = ?', [claimed.id]).n, 1, 'a claimed photo is never swept');
});

test('the dashboard per-type overdue count excludes deactivated rules', () => {
  const type = catalog.createType(db, { name: 'Chiller unit' }, admin);
  const live = catalog.createRule(db, { typeId: type.id, title: 'Live check', intervalValue: 1, intervalUnit: 'days' }, admin, { today: TODAY }).rule;
  const dormant = catalog.createRule(db, { typeId: type.id, title: 'Dormant check', intervalValue: 1, intervalUnit: 'days' }, admin, { today: TODAY }).rule;
  const item = catalog.createEquipment(db, { code: 'CH-COUNT', name: 'Counting chiller', typeId: type.id }, admin, { today: TODAY }).equipment;

  db.run(`UPDATE maintenance_tasks SET due_date = '2020-01-01' WHERE equipment_id = ?`, [item.id]);
  const both = queries.dashboard(db, { today: TODAY }).byType.find((t) => t.id === type.id);
  assert.equal(both.overdue, 2);

  catalog.updateRule(db, dormant.id, { active: false }, admin);
  const one = queries.dashboard(db, { today: TODAY }).byType.find((t) => t.id === type.id);
  assert.equal(one.overdue, 1, 'the deactivated rule stops counting');

  // ...and it agrees with the headline figure, which is the whole point.
  const outstanding = queries.outstandingTasks(db, { today: TODAY })
    .filter((t) => t.equipment.id === item.id && t.due.bucket === 'overdue');
  assert.equal(outstanding.length, 1);
  assert.equal(outstanding[0].rule.id, live.id);
});

test('an interval that would leave the supported date range is refused with a reason', () => {
  const type = catalog.createType(db, { name: 'Bridge crane' }, admin);
  assert.throws(
    () => catalog.createRule(db, { typeId: type.id, title: 'Structural survey', intervalValue: 9999, intervalUnit: 'years' }, admin, { today: TODAY }),
    (e) => e.code === 'VALIDATION' && /fifty years/.test(e.message),
  );
  // The realistic end of the range still works.
  const ok = catalog.createRule(db, { typeId: type.id, title: 'Structural survey', intervalValue: 50, intervalUnit: 'years' }, admin, { today: TODAY });
  assert.equal(ok.rule.intervalValue, 50);
});

test('a search term containing LIKE wildcards matches itself', () => {
  const type = catalog.createType(db, { name: 'Odd names' }, admin);
  catalog.createRule(db, { typeId: type.id, title: 'Check it', intervalValue: 1, intervalUnit: 'months' }, admin, { today: TODAY });
  catalog.createEquipment(db, { code: 'PCT-100%', name: 'Full load unit', typeId: type.id }, admin, { today: TODAY });
  catalog.createEquipment(db, { code: 'PCT-1000', name: 'Other unit', typeId: type.id }, admin, { today: TODAY });

  const literal = queries.outstandingTasks(db, { today: TODAY, search: 'PCT-100%' });
  assert.equal(literal.length, 1, 'the % is a character, not a wildcard');
  assert.equal(literal[0].equipment.code, 'PCT-100%');

  const both = queries.outstandingTasks(db, { today: TODAY, search: 'PCT-100' });
  assert.equal(both.length, 2, 'and an ordinary prefix still matches both');
});

test('duplicating an item whose code is already at the limit still works', () => {
  const type = catalog.createType(db, { name: 'Long codes' }, admin);
  catalog.createRule(db, { typeId: type.id, title: 'Look at it', intervalValue: 1, intervalUnit: 'months' }, admin, { today: TODAY });
  const longCode = 'X'.repeat(40);
  const source = catalog.createEquipment(db, { code: longCode, name: 'Maximal', typeId: type.id }, admin, { today: TODAY }).equipment;

  const [copy] = catalog.duplicateEquipment(db, source.id, {}, admin, { today: TODAY });
  assert.ok(copy.code.length <= 40);
  assert.notEqual(copy.code, longCode);
  assert.ok(copy.code.endsWith('-01'), 'the suffix is what makes it unique, so it is what survives');

  // Duplicating the same item again walks past the codes already taken
  // instead of colliding and making the administrator invent one.
  const three = catalog.duplicateEquipment(db, source.id, { count: 3 }, admin, { today: TODAY });
  assert.equal(new Set(three.map((c) => c.code)).size, 3);
  assert.ok(three.every((c) => c.code.length <= 40));
  assert.ok(!three.some((c) => c.code === copy.code));
});

test('a list that hits its ceiling says so rather than hiding rows', () => {
  const tiny = queries.outstandingTasks(db, { today: TODAY, limit: 2 });
  assert.equal(tiny.length, 2);
  assert.equal(tiny.truncated, true);
  const whole = queries.outstandingTasks(db, { today: TODAY, limit: 5000 });
  assert.equal(whole.truncated, false);
});

test('a nonsense limit or offset is ignored, not bound into the query', () => {
  assert.doesNotThrow(() => queries.outstandingTasks(db, { today: TODAY, limit: 'banana' }));
  assert.doesNotThrow(() => queries.completionHistory(db, { limit: 'banana', offset: 'also banana' }));
  assert.doesNotThrow(() => queries.completionHistory(db, { limit: -5, offset: -12 }));
  assert.doesNotThrow(() => require('../domain/audit.js').list(db, { limit: NaN }));
  const sane = queries.completionHistory(db, { limit: 'banana' });
  assert.ok(sane.items.length <= 200);
});
