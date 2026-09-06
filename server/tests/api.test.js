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

test('an unknown address costs the same time as a known one', async () => {
  const throttle = require('../auth/throttle.js');
  throttle.reset();
  const time = async (email) => {
    const t0 = process.hrtime.bigint();
    await signIn(adminPort, email, 'definitely-not-the-password');
    return Number(process.hrtime.bigint() - t0) / 1e6;
  };
  // Warm the thread pool so the first call does not carry startup cost.
  await time('warmup@test.example');
  const known = await time('ana@test.example');
  const unknown = await time('nobody-at-all@test.example');
  const ratio = Math.max(known, unknown) / Math.max(1, Math.min(known, unknown));
  assert.ok(ratio < 3,
    `latency must not reveal whether an account exists (known ${known.toFixed(1)}ms, unknown ${unknown.toFixed(1)}ms)`);
  throttle.reset();
});

test('repeated failures are throttled, and a Retry-After is given', async () => {
  const throttle = require('../auth/throttle.js');
  throttle.reset();
  let last;
  for (let i = 0; i < throttle.MAX_PER_PAIR + 1; i += 1) {
    last = await signIn(adminPort, 'ana@test.example', 'wrong-again');
  }
  assert.equal(last.res.status, 429);
  assert.equal(last.body.error.code, 'TOO_MANY_ATTEMPTS');
  assert.ok(Number(last.res.headers.get('retry-after')) > 0);

  // The correct password is refused too while the throttle holds — otherwise
  // it would be a way to test passwords faster than the limit allows.
  const good = await signIn(adminPort, 'ana@test.example', 'admin1234');
  assert.equal(good.res.status, 429);

  throttle.reset();
  const after = await signIn(adminPort, 'ana@test.example', 'admin1234');
  assert.equal(after.res.status, 200);
});

test('an oversized upload gets a 413, not a dropped connection', async () => {
  const { cookie } = await signIn(workerPort, 'wilma@test.example', 'worker1234');
  const huge = Buffer.alloc(box.config.maxPhotoBytes + 256 * 1024, 0x41);
  const form = new FormData();
  form.append('photo', new Blob([huge], { type: 'image/png' }), 'big.png');
  const res = await call(workerPort, '/api/photos', { method: 'POST', headers: { cookie }, body: form });
  assert.equal(res.status, 413);
  assert.equal((await res.json()).error.code, 'PAYLOAD_TOO_LARGE');
});

test('a JSON body that is not an object is a 400, never a 500', async () => {
  const { cookie } = await signIn(workerPort, 'wilma@test.example', 'worker1234');
  for (const body of ['null', '42', '"a string"', '[1,2,3]', 'true']) {
    const res = await call(workerPort, '/api/worker/tasks/anything/complete', {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body,
    });
    assert.equal(res.status, 400, `body ${body} must be a bad request`);
    assert.equal((await res.json()).error.code, 'BAD_JSON');
  }
  const admin = await signIn(adminPort, 'ana@test.example', 'admin1234');
  const res = await call(adminPort, '/api/admin/equipment', {
    method: 'POST', headers: { cookie: admin.cookie, 'content-type': 'application/json' }, body: 'null',
  });
  assert.equal(res.status, 400);
});

test('one employee cannot fill the disk with unsubmitted drafts', async () => {
  const { cookie } = await signIn(workerPort, 'winona@test.example', 'worker1234');
  const png = require('../db/png.js').encodePNG(8, 8, () => [30, 40, 50]);
  const ids = [];
  for (let i = 0; i < box.config.maxDraftPhotosPerEmployee + 4; i += 1) {
    const form = new FormData();
    form.append('photo', new Blob([png], { type: 'image/png' }), `p${i}.png`);
    const r = await call(workerPort, '/api/photos', { method: 'POST', headers: { cookie }, body: form });
    assert.equal(r.status, 201);
    ids.push((await r.json()).photoId);
  }
  const winona = db.get('SELECT id FROM employees WHERE email = ?', ['winona@test.example']);
  const held = db.get('SELECT COUNT(*) AS n FROM photos WHERE uploaded_by = ? AND claimed = 0', [winona.id]).n;
  assert.equal(held, box.config.maxDraftPhotosPerEmployee, 'the cap holds');
  // The most recent upload is always the one kept — it is the one being used.
  assert.equal(db.get('SELECT COUNT(*) AS n FROM photos WHERE id = ?', [ids[ids.length - 1]]).n, 1);
});

test('a malformed request is answered, and does not take the server with it', async () => {
  const net = require('node:net');
  const raw = (line) => new Promise((resolve) => {
    const socket = net.connect(workerPort, '127.0.0.1', () => {
      socket.write(`${line}\r\nHost: localhost\r\nConnection: close\r\n\r\n`);
    });
    let data = '';
    socket.on('data', (c) => { data += c; });
    socket.on('close', () => resolve(data.split('\r\n')[0] || ''));
    socket.on('error', () => resolve('SOCKET ERROR'));
  });

  // A bad percent-escape: `decodeURIComponent` throws on this.
  assert.match(await raw('GET /%zz HTTP/1.1'), /^HTTP\/1\.1 400/);
  assert.match(await raw('GET /api/%E0%A4%A HTTP/1.1'), /^HTTP\/1\.1 400/);

  // And the server is still there afterwards, which is the whole point.
  const health = await call(workerPort, '/api/health');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
});
