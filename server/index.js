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

// A port already in use is a startup failure, not a runtime hiccup — say so
// in one line and exit, rather than lingering as a process that serves
// nothing. (The uncaughtException backstop below is for live requests.)
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    process.stderr.write(`\n  Port ${port} is already in use. Stop whatever is on it, or pass --port.\n\n`);
  } else {
    process.stderr.write(`\n  ${role} app could not start: ${err.message}\n\n`);
  }
  process.exit(1);
});

server.listen(port, () => {
  const label = role === 'admin' ? 'Admin' : 'Worker';
  process.stdout.write(
    `\n  ${label} app  →  http://localhost:${port}\n` +
    `  database    →  ${db.databaseFile || 'custom connector'}\n` +
    `  timezone    →  ${config.businessTimezone} (today is ${today})\n` +
    (opened ? `  reconciled  →  opened ${opened} missing pending task(s)\n` : '') + '\n',
  );
});

/**
 * A backstop, not a licence. Every request is already wrapped, but a process
 * that keeps a maintenance schedule should not disappear because one caller
 * found an edge nobody anticipated. Anything reaching here is a bug and says
 * so loudly in the log.
 */
process.on('uncaughtException', (err) => {
  process.stderr.write(`\n[uncaught] ${err?.stack || err}\n`);
});
process.on('unhandledRejection', (reason) => {
  process.stderr.write(`\n[unhandled rejection] ${reason?.stack || reason}\n`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 500).unref(); });
}
