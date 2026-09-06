'use strict';
const http = require('node:http');
const path = require('node:path');
const { createRouter } = require('./http/router.js');
const { createStaticHandler } = require('./http/static.js');
const { send, sendError, parseCookies } = require('./http/util.js');
const { createConnector } = require('./db/connector.js');
const sessions = require('./auth/sessions.js');
const sched = require('./domain/scheduling.js');
const { businessToday } = require('./domain/time.js');
const config = require('./config.js');

/**
 * Build one app server. `role` is 'admin' or 'worker' and decides which
 * router is mounted — the worker origin has no admin route to reach, which is
 * the outer half of the permission story. The inner half is the per-request
 * role check inside every handler.
 */
function createApp({ role, db: injected = null, staticDir = null, secureCookies = config.secureCookies } = {}) {
  if (role !== 'admin' && role !== 'worker') throw new Error(`Unknown app role: ${role}`);

  const db = injected || createConnector(config);
  if (typeof db.migrate === 'function') db.migrate();

  const router = createRouter();
  const ctx = {
    db,
    appRole: role,
    secureCookies,
    tokenOf(req) {
      const auth = String(req.headers.authorization || '');
      if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
      return parseCookies(req.headers.cookie)[sessions.SESSION_COOKIE] || null;
    },
    /**
     * The caller's address, for throttling only. `x-forwarded-for` is trusted
     * solely when TRUST_PROXY is set, because behind no proxy it is a header
     * the caller writes themselves — and an attacker who can forge the key
     * they are throttled on is not throttled at all.
     */
    addressOf(req) {
      if (process.env.TRUST_PROXY === '1') {
        const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
        if (fwd) return fwd;
      }
      return req.socket?.remoteAddress || 'unknown';
    },
    actorOf(req) {
      if (req.__actorResolved) return req.__actor;
      req.__actor = sessions.resolve(db, ctx.tokenOf(req));
      req.__actorResolved = true;
      return req.__actor;
    },
  };

  require('./api/shared.js').register(router, ctx);
  if (role === 'admin') require('./api/admin.js').register(router, ctx);
  require('./api/worker.js').register(router, ctx);

  const serveStatic = staticDir ? createStaticHandler(staticDir) : null;

  const server = http.createServer(async (req, res) => {
    try {
      // Both of these throw on input a caller fully controls: a malformed Host
      // header, or a bad percent-escape such as `/%zz`. Parsing them outside
      // this try meant one unauthenticated request took the whole process
      // down. They are the first thing inside it now.
      let url;
      let pathname;
      try {
        url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        pathname = decodeURIComponent(url.pathname);
      } catch {
        return send(res, 400, { error: { code: 'BAD_REQUEST', message: 'That request could not be understood.' } });
      }

      if (pathname === '/api/health') {
        return send(res, 200, { ok: true, app: role, today: businessToday(config.businessTimezone), timezone: config.businessTimezone });
      }
      const hit = router.match(req.method, pathname);
      if (hit) return await hit.handler(req, res, hit.params, url);
      if (pathname.startsWith('/api/')) {
        return send(res, router.knowsPath(pathname) ? 405 : 404, {
          error: { code: 'NO_ROUTE', message: `No such endpoint on the ${role} app.` },
        });
      }
      if (serveStatic) return serveStatic(req, res, pathname);
      return send(res, 404, { error: { code: 'NO_ROUTE', message: 'Not found' } });
    } catch (err) {
      return sendError(res, err);
    }
  });

  // A request the HTTP parser itself rejects never reaches the handler above.
  server.on('clientError', (err, socket) => {
    if (!socket.writable || socket.destroyed) return;
    const status = err.code === 'HPE_HEADER_OVERFLOW' ? '431 Request Header Fields Too Large' : '400 Bad Request';
    socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  });

  server.on('close', () => { if (!injected) db.close(); });
  return { server, db, router, ctx, role };
}

/**
 * Boot-time housekeeping: expire stale sessions, discard photo drafts nobody
 * ever submitted, and heal any gap in the schedule.
 */
function warmUp(db) {
  const today = businessToday(config.businessTimezone);
  sessions.purgeExpired(db);
  const swept = require('./storage/photo-store.js').sweepAbandoned(db);
  const opened = db.transaction((tx) => sched.reconcileSchedules(tx, { today }));
  return { today, opened: opened.length, swept };
}

const defaultStaticDir = (role) => path.join(__dirname, '..', 'apps', role, 'dist');

module.exports = { createApp, warmUp, defaultStaticDir };
