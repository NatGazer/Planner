'use strict';
/**
 * The real deployment shape: the admin app and the worker app are separate
 * OS processes, each with its own connection to the same database file. The
 * in-process test proves the transaction serialises within one connection;
 * this proves it across processes, which is what actually ships.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFile } = require('node:child_process');
const path = require('node:path');
const { sandbox, makeEmployee } = require('./helpers.js');

const box = sandbox('cross');
const { db } = box;
const catalog = require('../domain/catalog.js');
const { businessToday } = require('../domain/time.js');

const TODAY = businessToday(box.config.businessTimezone);
const admin = makeEmployee(db, { role: 'admin', name: 'Ana', email: 'ana@x.example', password: 'admin1234' });
const NAMES = ['ada', 'bea', 'cai', 'dev', 'eve', 'fay'];
for (const n of NAMES) makeEmployee(db, { role: 'worker', name: n, email: `${n}@x.example`, password: 'worker1234' });

const type = catalog.createType(db, { name: 'Pump' }, admin);
catalog.createRule(db, { typeId: type.id, title: 'Grease it', intervalValue: 30, intervalUnit: 'days' }, admin, { today: TODAY });
const item = catalog.createEquipment(db, { code: 'P-RACE', name: 'Race pump', typeId: type.id }, admin, { today: TODAY }).equipment;
db.close();                                     // the servers own the file from here

const PORTS = [4831, 4832, 4833];
const servers = [];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test.before(async () => {
  const entry = path.join(__dirname, '..', 'index.js');
  for (const [i, port] of PORTS.entries()) {
    servers.push(spawn(process.execPath, [entry, '--app', i === 0 ? 'admin' : 'worker', '--port', String(port)], {
      stdio: 'ignore',
      env: { ...process.env, MAINTENANCE_DATA_DIR: box.dir, MAINTENANCE_DB_FILE: path.join(box.dir, 'test.db'), MAINTENANCE_PHOTO_DIR: path.join(box.dir, 'photos') },
    }));
  }
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const up = await Promise.all(PORTS.map(async (p) => {
      try { return (await fetch(`http://127.0.0.1:${p}/api/health`)).ok; } catch { return false; }
    }));
    if (up.every(Boolean)) return;
    await wait(150);
  }
  throw new Error('servers did not start');
});

test.after(() => {
  servers.forEach((s) => s.kill('SIGKILL'));
  box.cleanup();
});

test('six employees across three server processes complete one task exactly once', async () => {
  const { createConnector } = require('../db/connector.js');
  const reader = createConnector(box.config);
  const task = reader.get(`SELECT * FROM maintenance_tasks WHERE equipment_id = ? AND status='pending'`, [item.id]);
  assert.ok(task, 'there is one pending task to race for');

  const script = path.join(__dirname, 'race-worker.js');
  const runs = await Promise.all(NAMES.map((name, i) => new Promise((resolve) => {
    // Spread the six attempts across the three processes, two apiece. The
    // administrator process gets the administrator's own credentials, since a
    // worker account is deliberately refused at that app's sign-in — an
    // administrator may also carry out work, and races with everyone else.
    const port = PORTS[i % PORTS.length];
    const isAdminApp = port === PORTS[0];
    const email = isAdminApp ? 'ana@x.example' : `${name}@x.example`;
    const password = isAdminApp ? 'admin1234' : 'worker1234';
    execFile(process.execPath, [script, String(port), email, password, task.id],
      { env: { ...process.env, MAINTENANCE_DATA_DIR: box.dir, MAINTENANCE_DB_FILE: path.join(box.dir, 'test.db'), MAINTENANCE_PHOTO_DIR: path.join(box.dir, 'photos') } },
      (err, stdout) => resolve(JSON.parse(stdout || '{"status":0,"code":"NO_OUTPUT"}')));
  })));

  const winners = runs.filter((r) => r.status === 201);
  const losers = runs.filter((r) => r.code === 'ALREADY_COMPLETED');
  assert.equal(winners.length, 1, `exactly one winner across processes, got ${JSON.stringify(runs)}`);
  assert.equal(losers.length, NAMES.length - 1, `everyone else is told it is already done, got ${JSON.stringify(runs)}`);

  assert.equal(reader.get('SELECT COUNT(*) AS n FROM completions WHERE task_id = ?', [task.id]).n, 1);
  assert.equal(reader.get('SELECT status FROM maintenance_tasks WHERE id = ?', [task.id]).status, 'completed');
  assert.equal(
    reader.get(`SELECT COUNT(*) AS n FROM maintenance_tasks WHERE equipment_id=? AND rule_id=? AND status='pending'`,
      [task.equipment_id, task.rule_id]).n,
    1,
    'and exactly one next occurrence, not six',
  );
  reader.close();
});
