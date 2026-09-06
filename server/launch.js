#!/usr/bin/env node
'use strict';
/** Convenience: run both apps side by side in one terminal. */
const { spawn } = require('node:child_process');
const path = require('node:path');
const config = require('./config.js');

const entry = path.join(__dirname, 'index.js');
const kids = ['admin', 'worker'].map((role) => {
  const child = spawn(process.execPath, [entry, '--app', role, '--port', String(config.ports[role])], {
    stdio: ['ignore', 'pipe', 'pipe'], env: process.env,
  });
  const tag = role === 'admin' ? '\x1b[38;5;111madmin \x1b[0m' : '\x1b[38;5;150mworker\x1b[0m';
  const pipe = (stream, out) => stream.on('data', (d) => String(d).split('\n').forEach((line) => {
    if (line.trim()) out.write(`${tag} │ ${line}\n`);
  }));
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  return child;
});

const bye = () => { kids.forEach((k) => k.kill('SIGTERM')); process.exit(0); };
process.on('SIGINT', bye);
process.on('SIGTERM', bye);
