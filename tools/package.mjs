#!/usr/bin/env node
/**
 * Build the deliverable archive: source, docs, the two built apps, and a
 * pre-seeded demo database, so it runs with Node alone and no install step.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const name = 'maintenance-management';
const out = path.join(root, `${name}.zip`);
const staging = path.join(root, '.package', name);

fs.rmSync(path.join(root, '.package'), { recursive: true, force: true });
fs.rmSync(out, { force: true });
fs.mkdirSync(staging, { recursive: true });

const INCLUDE = [
  'README.md', 'package.json', 'package-lock.json', 'tsconfig.base.json', '.nvmrc', '.gitignore',
  'docs', 'server', 'apps', 'packages', 'scripts', 'tools', '.data',
];
const SKIP = new Set(['node_modules', '.git', '.vite', 'coverage']);

function copy(rel) {
  const src = path.join(root, rel);
  if (!fs.existsSync(src)) return;
  const dest = path.join(staging, rel);
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      if (SKIP.has(entry)) continue;
      copy(path.join(rel, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}
for (const item of INCLUDE) copy(item);

// A WAL file is a live journal; check-pointing keeps the shipped database whole.
for (const suffix of ['-wal', '-shm']) {
  fs.rmSync(path.join(staging, '.data', `maintenance.db${suffix}`), { force: true });
}

execFileSync('zip', ['-rq', out, name], { cwd: path.join(root, '.package') });
fs.rmSync(path.join(root, '.package'), { recursive: true, force: true });

const size = fs.statSync(out).size;
process.stdout.write(`${out}\n${(size / 1048576).toFixed(2)} MB\n`);
