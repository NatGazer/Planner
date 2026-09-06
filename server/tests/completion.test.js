'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox, makeEmployee, makePhoto } = require('./helpers.js');

const box = sandbox('comp');
const { db } = box;
const catalog = require('../domain/catalog.js');
const queries = require('../domain/queries.js');
const { submitCompletion } = require('../domain/completions.js');
const photoStore = require('../storage/photo-store.js');

const TODAY = '2026-03-10';
const admin = makeEmployee(db, { role: 'admin', name: 'Admin' });
const alice = makeEmployee(db, { role: 'worker', name: 'Alice Ferreira' });
const bob = makeEmployee(db, { role: 'worker', name: 'Bob Nkemdirim' });

const type = catalog.createType(db, { name: 'Chiller' }, admin);
const rule = catalog.createRule(db, {
  typeId: type.id, title: 'Filter swap', instructions: 'Swap the filter.', intervalValue: 30, intervalUnit: 'days',
}, admin, { today: TODAY }).rule;
const item = catalog.createEquipment(db, { code: 'CH-9', name: 'Chiller nine', typeId: type.id, location: 'Roof' }, admin, { today: TODAY }).equipment;
const openTask = () => db.get(`SELECT * FROM maintenance_tasks WHERE equipment_id=? AND rule_id=? AND status='pending'`, [item.id, rule.id]);

test.after(() => box.cleanup());

test('a photo is required', () => {
  assert.throws(() => submitCompletion(db, { taskId: openTask().id, employee: alice, photoId: null }),
    (e) => e.code === 'PHOTO_REQUIRED');
  assert.throws(() => submitCompletion(db, { taskId: openTask().id, employee: alice, photoId: 'pho_nonexistent' }),
    (e) => e.code === 'PHOTO_REQUIRED');
  assert.equal(openTask().status, 'pending', 'the task stays pending when submission fails');
});

test('a photo belongs to whoever uploaded it', () => {
  const bobsPhoto = makePhoto(db, bob.id);
  assert.throws(() => submitCompletion(db, { taskId: openTask().id, employee: alice, photoId: bobsPhoto.id }),
    (e) => e.status === 403);
});

test('a photo cannot back two completions', () => {
  const photo = makePhoto(db, alice.id);
  submitCompletion(db, { taskId: openTask().id, employee: alice, photoId: photo.id, comment: 'first' });
  assert.throws(() => submitCompletion(db, { taskId: openTask().id, employee: alice, photoId: photo.id }),
    (e) => e.code === 'PHOTO_REUSED');
});

test('the comment is optional and completion still records cleanly without one', () => {
  const before = queries.completionHistory(db, {}).total;
  submitCompletion(db, { taskId: openTask().id, employee: bob, photoId: makePhoto(db, bob.id).id });
  const latest = queries.completionHistory(db, { limit: 1 }).items[0];
  assert.equal(latest.comment, null);
  assert.equal(queries.completionHistory(db, {}).total, before + 1);
});

test('completing produces exactly one completion and exactly one next task', () => {
  const task = openTask();
  const pendingBefore = db.get(`SELECT COUNT(*) AS n FROM maintenance_tasks WHERE status='pending'`).n;
  const result = submitCompletion(db, { taskId: task.id, employee: alice, photoId: makePhoto(db, alice.id).id, comment: 'All good' });

  assert.equal(db.get(`SELECT COUNT(*) AS n FROM completions WHERE task_id = ?`, [task.id]).n, 1);
  assert.equal(db.get(`SELECT COUNT(*) AS n FROM maintenance_tasks WHERE status='pending'`).n, pendingBefore);
  assert.equal(db.get(`SELECT status FROM maintenance_tasks WHERE id = ?`, [task.id]).status, 'completed');
  assert.equal(result.nextTask.status, 'pending');
  assert.notEqual(result.nextTask.id, task.id);
});

test('the completion time is recorded by the server, never by the client', () => {
  const task = openTask();
  // A client-supplied timestamp is not even a parameter of the API.
  const result = submitCompletion(db, { taskId: task.id, employee: alice, photoId: makePhoto(db, alice.id).id, completedAt: '1999-01-01T00:00:00Z' });
  assert.ok(new Date(result.completion.completed_at).getTime() > Date.now() - 60_000);
});

test('a second submission of a closed task is refused', () => {
  const task = db.get(`SELECT * FROM maintenance_tasks WHERE status='completed' LIMIT 1`);
  assert.throws(() => submitCompletion(db, { taskId: task.id, employee: bob, photoId: makePhoto(db, bob.id).id }),
    (e) => e.code === 'ALREADY_COMPLETED' && e.status === 409);
});

test('history freezes a snapshot that later renames and archives cannot rewrite', () => {
  const completion = queries.completionHistory(db, { limit: 1 }).items[0];
  const originalEquipmentName = completion.equipment.name;
  const originalRuleTitle = completion.rule.title;
  const originalInterval = completion.rule.intervalValue;

  catalog.updateEquipment(db, item.id, { name: 'Renamed chiller', location: 'Somewhere else' }, admin, { today: TODAY });
  catalog.updateRule(db, rule.id, { title: 'Renamed rule', intervalValue: 7, intervalUnit: 'years' }, admin);
  catalog.archiveRule(db, rule.id, admin);
  catalog.archiveEquipment(db, item.id, admin);

  const after = queries.completionById(db, completion.id);
  assert.equal(after.equipment.name, originalEquipmentName);
  assert.equal(after.rule.title, originalRuleTitle);
  assert.equal(after.rule.intervalValue, originalInterval);
  assert.equal(after.employee.name, completion.employee.name);
  assert.equal(after.completedAt, completion.completedAt);
});

test('archiving preserves every completed record', () => {
  assert.ok(queries.completionHistory(db, {}).total >= 4);
  assert.ok(queries.completionHistory(db, { equipmentId: item.id }).total >= 4);
});

test('work on deactivated equipment or rules cannot be submitted', () => {
  const t2 = catalog.createType(db, { name: 'Boiler' }, admin);
  const r2 = catalog.createRule(db, { typeId: t2.id, title: 'Flue check', intervalValue: 1, intervalUnit: 'months' }, admin, { today: TODAY }).rule;
  const e2 = catalog.createEquipment(db, { code: 'BO-1', name: 'Boiler one', typeId: t2.id }, admin, { today: TODAY }).equipment;
  const task = db.get(`SELECT * FROM maintenance_tasks WHERE equipment_id=? AND status='pending'`, [e2.id]);

  catalog.updateEquipment(db, e2.id, { active: false }, admin, { today: TODAY });
  assert.throws(() => submitCompletion(db, { taskId: task.id, employee: alice, photoId: makePhoto(db, alice.id).id }),
    (e) => e.code === 'EQUIPMENT_INACTIVE');

  catalog.updateEquipment(db, e2.id, { active: true }, admin, { today: TODAY });
  catalog.updateRule(db, r2.id, { active: false }, admin);
  assert.throws(() => submitCompletion(db, { taskId: task.id, employee: alice, photoId: makePhoto(db, alice.id).id }),
    (e) => e.code === 'RULE_INACTIVE');
});

test('photo bytes are only reachable through the store, never from a public path', () => {
  const photo = makePhoto(db, alice.id, 7);
  const row = db.get('SELECT * FROM photos WHERE id = ?', [photo.id]);
  assert.ok(photoStore.open(row).length > 0);
  assert.ok(row.storage_key.indexOf('/') === -1, 'the key carries no traversable path');
  assert.equal(row.claimed, 0, 'an unclaimed draft until a completion takes it');
});

test('oversized and unsupported uploads are refused before anything is written', () => {
  assert.throws(() => photoStore.assertAcceptable('application/pdf', 100), (e) => e.code === 'PHOTO_TYPE');
  assert.throws(() => photoStore.assertAcceptable('image/png', 0), (e) => e.code === 'PHOTO_EMPTY');
  assert.throws(() => photoStore.assertAcceptable('image/png', 99 * 1024 * 1024), (e) => e.code === 'PHOTO_TOO_LARGE');
});

test('a photo claimed mid-sweep keeps its bytes', () => {
  const photo = makePhoto(db, alice.id, 21);
  const file = require('node:path').join(box.config.photoDir, photo.storage_key);
  assert.ok(require('node:fs').existsSync(file));

  // Simulate the race: the row is claimed after it was read as unclaimed.
  db.run('UPDATE photos SET claimed = 1 WHERE id = ?', [photo.id]);
  const removed = photoStore.discardUnclaimed(db, photo.id);

  assert.equal(removed, false, 'the discard reports that it did nothing');
  assert.ok(require('node:fs').existsSync(file), 'and the bytes a completion may point at survive');
});

test('the database itself refuses a photo used twice', () => {
  const t3 = catalog.createType(db, { name: 'Hoist' }, admin);
  catalog.createRule(db, { typeId: t3.id, title: 'Chain check', intervalValue: 1, intervalUnit: 'months' }, admin, { today: TODAY });
  const a = catalog.createEquipment(db, { code: 'HO-1', name: 'Hoist one', typeId: t3.id }, admin, { today: TODAY }).equipment;
  const b = catalog.createEquipment(db, { code: 'HO-2', name: 'Hoist two', typeId: t3.id }, admin, { today: TODAY }).equipment;
  const taskA = db.get(`SELECT * FROM maintenance_tasks WHERE equipment_id=? AND status='pending'`, [a.id]);
  const taskB = db.get(`SELECT * FROM maintenance_tasks WHERE equipment_id=? AND status='pending'`, [b.id]);

  const photo = makePhoto(db, alice.id, 22);
  submitCompletion(db, { taskId: taskA.id, employee: alice, photoId: photo.id });

  // Reach past the application check straight at the constraint.
  db.run('UPDATE photos SET claimed = 0 WHERE id = ?', [photo.id]);
  assert.throws(() => submitCompletion(db, { taskId: taskB.id, employee: alice, photoId: photo.id }),
    (e) => e.code === 'PHOTO_REUSED');
  assert.equal(db.get(`SELECT status FROM maintenance_tasks WHERE id = ?`, [taskB.id]).status, 'pending',
    'and the losing task is left open');
});
