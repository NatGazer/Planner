#!/usr/bin/env node
'use strict';
/**
 * One command for the whole system in development: both API servers and both
 * Vite dev servers, colour-tagged in a single terminal.
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const root = path.join(__dirname, '..');
const config = require(path.join(root, 'server', 'config.js'));

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const jobs = [
  { tag: '\x1b[38;5;111madmin·api \x1b[0m', cmd: process.execPath, args: [path.join(root, 'server/index.js'), '--app', 'admin', '--port', String(config.ports.admin)] },
  { tag: '\x1b[38;5;150mworker·api\x1b[0m', cmd: process.execPath, args: [path.join(root, 'server/index.js'), '--app', 'worker', '--port', String(config.ports.worker)] },
  { tag: '\x1b[38;5;147madmin·ui \x1b[0m', cmd: npm, args: ['--workspace', 'apps/admin', 'run', 'dev'] },
  { tag: '\x1b[38;5;114mworker·ui\x1b[0m', cmd: npm, args: ['--workspace', 'apps/worker', 'run', 'dev'] },
];

const kids = jobs.map((j) => {
  const child = spawn(j.cmd, j.args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  const pipe = (stream, out) => stream.on('data', (d) => String(d).split('\n').forEach((line) => {
    if (line.trim()) out.write(`${j.tag} │ ${line}\n`);
  }));
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  return child;
});

process.stdout.write('\n  Admin UI   http://localhost:5310\n  Worker UI  http://localhost:5320\n\n');
const bye = () => { kids.forEach((k) => k.kill('SIGTERM')); process.exit(0); };
process.on('SIGINT', bye);
process.on('SIGTERM', bye);
