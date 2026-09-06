#!/usr/bin/env node
'use strict';
/**
 * Launch one app.
 *   node server/index.js --app admin  [--port 4310]
 *   node server/index.js --app worker [--port 4320]
 * Both processes share the same database file; SQLite WAL plus a write lock
 * on every transaction keeps them honest.
 */
const { createApp, warmUp, defaultStaticDir } = require('./app.js');
const config = require('./config.js');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  return inline ? inline.split('=').slice(1).join('=') : fallback;
}

const role = arg('app', 'admin');
const port = Number(arg('port', config.ports[role] || 4310));
const { server, db } = createApp({ role, staticDir: arg('static', defaultStaticDir(role)) });
const { today, opened } = warmUp(db);

server.listen(port, () => {
  const label = role === 'admin' ? 'Admin' : 'Worker';
  process.stdout.write(
    `\n  ${label} app  →  http://localhost:${port}\n` +
    `  database    →  ${db.databaseFile || 'custom connector'}\n` +
    `  timezone    →  ${config.businessTimezone} (today is ${today})\n` +
    (opened ? `  reconciled  →  opened ${opened} missing pending task(s)\n` : '') + '\n',
  );
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 500).unref(); });
}
