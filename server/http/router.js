'use strict';
const { notFound } = require('../domain/errors.js');

/** Tiny pattern router: '/api/admin/equipment/:id/duplicate'. */
function createRouter() {
  const routes = [];
  const add = (method, pattern, handler) => {
    const keys = [];
    const rx = new RegExp(`^${pattern.replace(/:[A-Za-z0-9_]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; })}$`);
    routes.push({ method, rx, keys, handler });
  };
  return {
    get: (p, h) => add('GET', p, h),
    post: (p, h) => add('POST', p, h),
    patch: (p, h) => add('PATCH', p, h),
    del: (p, h) => add('DELETE', p, h),
    match(method, pathname) {
      for (const r of routes) {
        if (r.method !== method) continue;
        const m = r.rx.exec(pathname);
        if (!m) continue;
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        return { handler: r.handler, params };
      }
      return null;
    },
    /** Any route registered at this path under a different verb? */
    knowsPath(pathname) {
      return routes.some((r) => r.rx.test(pathname));
    },
    notFound,
  };
}

module.exports = { createRouter };
