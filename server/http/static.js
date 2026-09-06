'use strict';
const fs = require('node:fs');
const path = require('node:path');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json',
  '.map': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};

/** Serve a built single-page app, falling back to index.html for deep links. */
function createStaticHandler(rootDir) {
  const root = path.resolve(rootDir);
  return function serve(req, res, pathname) {
    if (!fs.existsSync(root)) {
      res.writeHead(503, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><meta charset="utf-8"><title>Not built yet</title>
        <body style="font:16px/1.6 ui-sans-serif,system-ui;background:#07080f;color:#e8ecff;padding:48px;max-width:44rem;margin:auto">
        <h1 style="font-size:1.4rem">This app has not been built yet</h1>
        <p>Run <code style="background:#1a1d2e;padding:2px 6px;border-radius:6px">npm run build</code> from the project root, then start the server again.</p>
        <p style="opacity:.6">Expected build output at <code>${root}</code></p></body>`);
      return true;
    }
    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    let file = path.resolve(root, rel);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return true; }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404).end('Not found'); return true; }

    const ext = path.extname(file).toLowerCase();
    const immutable = /\/assets\//.test(file) && ext !== '.html';
    const body = fs.readFileSync(file);
    res.writeHead(200, {
      'content-type': TYPES[ext] || 'application/octet-stream',
      'content-length': body.length,
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    res.end(body);
    return true;
  };
}

module.exports = { createStaticHandler };
