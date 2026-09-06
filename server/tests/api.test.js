'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const path = require('node:path');
const { sandbox, makeEmployee } = require('./helpers.js');

const box = sandbox('api');
const { db } = box;
const catalog = require('../domain/catalog.js');
const { createApp } = require('../app.js');

const TODAY = require('../domain/time.js').businessToday(box.config.businessTimezone);
const admin = makeEmployee(db, { role: 'admin', name: 'Ana Admin', email: 'ana@test.example', password: 'admin1234' });
makeEmployee(db, { role: 'worker', name: 'Wilma Worker', email: 'wilma@test.example', password: 'worker1234' });
makeEmployee(db, { role: 'worker', name: 'Wendell Worker', email: 'wendell@test.example', password: 'worker1234' });
makeEmployee(db, { role: 'worker', name: 'Winona Worker', email: 'winona@test.example', password: 'worker1234' });
makeEmployee(db, { role: 'worker', name: 'Wanda Worker', email: 'wanda@test.example', password: 'worker1234' });

const type = catalog.createType(db, { name: 'Press' }, admin);
catalog.createRule(db, { typeId: type.id, title: 'Lubricate', intervalValue: 7, intervalUnit: 'days' }, admin, { today: TODAY });
const press = catalog.createEquipment(db, { code: 'PR-1', name: 'Press one', typeId: type.id }, admin, { today: TODAY }).equipment;

const adminApp = createApp({ role: 'admin', db });
const workerApp = createApp({ role: 'worker', db });
let adminPort; let workerPort;

const listen = (server) => new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));

test.before(async () => {
  adminPort = await listen(adminApp.server);
  workerPort = await listen(workerApp.server);
});
test.after(() => {
  adminApp.server.close();
  workerApp.server.close();
  box.cleanup();
});

async function signIn(port, email, password) {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/sign-in`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  const cookie = (res.headers.getSetCookie?.() || [res.headers.get('set-cookie')]).filter(Boolean)
    .map((c) => c.split(';')[0]).join('; ');
  return { res, cookie, body: await res.json().catch(() => ({})) };
}
const call = (port, url, opts = {}) => fetch(`http://127.0.0.1:${port}${url}`, opts);

test('signing in with the wrong password fails identically to an unknown address', async () => {
  const a = await signIn(adminPort, 'ana@test.example', 'wrong');
  const b = await signIn(adminPort, 'nobody@test.example', 'admin1234');
  assert.equal(a.res.status, 401);
  assert.equal(b.res.status, 401);
  assert.equal(a.body.error.message, b.body.error.message);
});

test('every endpoint requires authentication', async () => {
  for (const [port, url] of [[adminPort, '/api/admin/dashboard'], [adminPort, '/api/admin/equipment'],
    [workerPort, '/api/worker/tasks'], [adminPort, '/api/admin/history']]) {
    assert.equal((await call(port, url)).status, 401, `${url} must reject anonymous callers`);
  }
});

test('a worker account cannot sign in to the administrator app at all', async () => {
  const { res } = await signIn(adminPort, 'wilma@test.example', 'worker1234');
  assert.equal(res.status, 403);
});

test('the worker server has no administrator endpoint to reach', async () => {
  const { cookie } = await signIn(workerPort, 'wilma@test.example', 'worker1234');
  for (const url of ['/api/admin/dashboard', '/api/admin/equipment', '/api/admin/tasks',
    '/api/admin/rules', '/api/admin/history', '/api/admin/activity']) {
    assert.equal((await call(workerPort, url, { headers: { cookie } })).status, 404, `${url} must not exist on the worker app`);
  }
});

test('a worker token is refused by administrator endpoints even on the admin origin', async () => {
  const { cookie } = await signIn(workerPort, 'wilma@test.example', 'worker1234');
  const res = await call(adminPort, '/api/admin/equipment', { headers: { cookie } });
  assert.equal(res.status, 403);
  const write = await call(adminPort, '/api/admin/equipment', {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'HACK-1', name: 'Nope', typeId: type.id }),
  });
  assert.equal(write.status, 403);
  assert.equal(db.get('SELECT COUNT(*) AS n FROM equipment WHERE code = ?', ['HACK-1']).n, 0);
});

test('a discarded session stops working immediately', async () => {
  const { cookie } = await signIn(adminPort, 'ana@test.example', 'admin1234');
  assert.equal((await call(adminPort, '/api/admin/dashboard', { headers: { cookie } })).status, 200);
  await call(adminPort, '/api/auth/sign-out', { method: 'POST', headers: { cookie } });
  assert.equal((await call(adminPort, '/api/admin/dashboard', { headers: { cookie } })).status, 401);
});

test('completion refuses to proceed without the confirmation checkbox', async () => {
  const { cookie } = await signIn(workerPort, 'wilma@test.example', 'worker1234');
  const { tasks } = await (await call(workerPort, '/api/worker/tasks', { headers: { cookie } })).json();
  const res = await call(workerPort, `/api/worker/tasks/${tasks[0].id}/complete`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ confirmed: false, photoId: 'anything' }),
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'CONFIRMATION_REQUIRED');
  assert.equal(db.get('SELECT status FROM maintenance_tasks WHERE id = ?', [tasks[0].id]).status, 'pending');
});

test('completion refuses to proceed without a photo', async () => {
  const { cookie } = await signIn(workerPort, 'wilma@test.example', 'worker1234');
  const { tasks } = await (await call(workerPort, '/api/worker/tasks', { headers: { cookie } })).json();
  const res = await call(workerPort, `/api/worker/tasks/${tasks[0].id}/complete`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ confirmed: true }),
  });
  assert.equal((await res.json()).error.code, 'PHOTO_REQUIRED');
});

test('a worker may not read another worker\'s photo, an administrator may', async () => {
  const wilma = await signIn(workerPort, 'wilma@test.example', 'worker1234');
  const form = new FormData();
  form.append('photo', new Blob([require('../db/png.js').encodePNG(8, 8, () => [10, 20, 30])], { type: 'image/png' }), 'p.png');
  const { photoId } = await (await call(workerPort, '/api/photos', { method: 'POST', headers: { cookie: wilma.cookie }, body: form })).json();

  assert.equal((await call(workerPort, `/api/photos/${photoId}`, { headers: { cookie: wilma.cookie } })).status, 200);

  const wendell = await signIn(workerPort, 'wendell@test.example', 'worker1234');
  assert.equal((await call(workerPort, `/api/photos/${photoId}`, { headers: { cookie: wendell.cookie } })).status, 403);

  const ana = await signIn(adminPort, 'ana@test.example', 'admin1234');
  assert.equal((await call(adminPort, `/api/photos/${photoId}`, { headers: { cookie: ana.cookie } })).status, 200);
  assert.equal((await call(adminPort, `/api/photos/${photoId}`)).status, 401);
});

test('four employees submitting the same task at once produce exactly one completion', async () => {
  const task = db.get(`SELECT * FROM maintenance_tasks WHERE equipment_id = ? AND status='pending'`, [press.id]);
  const script = path.join(__dirname, 'race-worker.js');
  const emails = ['wilma', 'wendell', 'winona', 'wanda'].map((n) => `${n}@test.example`);

  const runs = await Promise.all(emails.map((email) => new Promise((resolve) => {
    execFile(process.execPath, [script, String(workerPort), email, 'worker1234', task.id],
      { env: { ...process.env } },
      (err, stdout) => resolve(JSON.parse(stdout || '{"status":0,"code":"NO_OUTPUT"}')));
  })));

  const winners = runs.filter((r) => r.status === 201);
  const losers = runs.filter((r) => r.code === 'ALREADY_COMPLETED');
  assert.equal(winners.length, 1, `exactly one winner, got ${JSON.stringify(runs)}`);
  assert.equal(losers.length, 3, `three told "already completed", got ${JSON.stringify(runs)}`);
  assert.equal(db.get('SELECT COUNT(*) AS n FROM completions WHERE task_id = ?', [task.id]).n, 1);
  assert.equal(db.get(`SELECT COUNT(*) AS n FROM maintenance_tasks WHERE equipment_id=? AND rule_id=? AND status='pending'`,
    [task.equipment_id, task.rule_id]).n, 1, 'and exactly one next occurrence, not four');
});

test('the completion appears in administrator history with its photo and comment', async () => {
  const { cookie } = await signIn(adminPort, 'ana@test.example', 'admin1234');
  const history = await (await call(adminPort, `/api/admin/history?equipmentId=${press.id}`, { headers: { cookie } })).json();
  assert.equal(history.total, 1);
  const entry = history.items[0];
  assert.equal(entry.equipment.code, 'PR-1');
  assert.equal(entry.rule.title, 'Lubricate');
  assert.ok(entry.photoId);
  assert.ok(entry.comment.startsWith('from '));
  assert.ok(entry.employee.name.length > 0);
  assert.ok(entry.completedAt);
  assert.equal((await call(adminPort, `/api/photos/${entry.photoId}`, { headers: { cookie } })).status, 200);
});

test('rescheduling is an administrator action and is refused to workers', async () => {
  const worker = await signIn(workerPort, 'wilma@test.example', 'worker1234');
  const task = db.get(`SELECT * FROM maintenance_tasks WHERE status='pending' LIMIT 1`);
  assert.equal((await call(workerPort, `/api/admin/tasks/${task.id}/reschedule`, {
    method: 'POST', headers: { cookie: worker.cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ dueDate: '2030-01-01' }),
  })).status, 404);

  const ana = await signIn(adminPort, 'ana@test.example', 'admin1234');
  const ok = await call(adminPort, `/api/admin/tasks/${task.id}/reschedule`, {
    method: 'POST', headers: { cookie: ana.cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ dueDate: '2030-01-01', reason: 'Parts on order' }),
  });
  assert.equal(ok.status, 200);
  assert.equal(db.get('SELECT due_date FROM maintenance_tasks WHERE id = ?', [task.id]).due_date, '2030-01-01');

  const bad = await call(adminPort, `/api/admin/tasks/${task.id}/reschedule`, {
    method: 'POST', headers: { cookie: ana.cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ dueDate: '2030-02-31' }),
  });
  assert.equal(bad.status, 400);
});

test('business data survives a restart because it lives in the database', async () => {
  const before = db.get('SELECT COUNT(*) AS n FROM completions').n;
  const { createConnector } = require('../db/connector.js');
  const reopened = createConnector(box.config);
  assert.equal(reopened.get('SELECT COUNT(*) AS n FROM completions').n, before);
  assert.ok(reopened.get('SELECT COUNT(*) AS n FROM maintenance_tasks').n > 0);
  reopened.close();
});
