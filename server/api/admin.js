'use strict';
/** Administrator surface. Every route re-checks the role server-side. */
const { send, readJson } = require('../http/util.js');
const { unauthorized, forbidden, notFound, badRequest } = require('../domain/errors.js');
const { businessToday, isValidDate } = require('../domain/time.js');
const queries = require('../domain/queries.js');
const catalog = require('../domain/catalog.js');
const sched = require('../domain/scheduling.js');
const audit = require('../domain/audit.js');
const config = require('../config.js');

function adminOrThrow(ctx, req) {
  const actor = ctx.actorOf(req);
  if (!actor) throw unauthorized();
  if (actor.role !== 'admin') throw forbidden('This action is for administrators only.');
  return { ...actor, display_name: actor.name };
}

const bool = (v) => (v === 'true' ? true : v === 'false' ? false : null);

function register(router, ctx) {
  const { db } = ctx;
  const today = () => businessToday(config.businessTimezone);

  // ------------------------------------------------------------ dashboard --
  router.get('/api/admin/dashboard', async (req, res) => {
    adminOrThrow(ctx, req);
    send(res, 200, { ...queries.dashboard(db, { today: today() }), timezone: config.businessTimezone });
  });

  // ---------------------------------------------------------------- tasks --
  router.get('/api/admin/tasks', async (req, res, _p, url) => {
    adminOrThrow(ctx, req);
    const t = today();
    const q = url.searchParams;
    const shared = {
      today: t,
      includeHidden: q.get('includeHidden') === 'true',
      equipmentId: q.get('equipmentId') || null,
      typeId: q.get('typeId') || null,
      ruleId: q.get('ruleId') || null,
      search: q.get('search') || null,
    };
    const tasks = queries.outstandingTasks(db, {
      ...shared,
      bucket: q.get('bucket') || null,
      on: isValidDate(q.get('on')) ? q.get('on') : null,
    });
    send(res, 200, {
      today: t,
      tasks,
      // Counts describe the whole list under the current equipment/type/search
      // filters, deliberately ignoring the due-status tab — so the tabs keep
      // showing what you would get by switching to them.
      counts: queries.outstandingCounts(db, shared),
      shown: tasks.length,
    });
  });

  router.get('/api/admin/tasks/:id', async (req, res, params) => {
    adminOrThrow(ctx, req);
    const task = queries.taskById(db, params.id, today());
    if (!task) throw notFound('That task no longer exists.');
    send(res, 200, { today: today(), task });
  });

  router.post('/api/admin/tasks/:id/reschedule', async (req, res, params) => {
    const actor = adminOrThrow(ctx, req);
    const body = await readJson(req);
    if (!isValidDate(body.dueDate)) throw badRequest('VALIDATION', 'Pick a real calendar date.', { field: 'dueDate' });
    const result = db.transaction((tx) => sched.rescheduleTask(tx, {
      taskId: params.id, newDueDate: body.dueDate, reason: body.reason, actor,
    }));
    if (!result) throw notFound('That task no longer exists.');
    send(res, 200, { task: queries.taskById(db, params.id, today()), changed: !result.unchanged });
  });

  // ---------------------------------------------------------------- types --
  router.get('/api/admin/types', async (req, res) => {
    adminOrThrow(ctx, req);
    send(res, 200, { types: catalog.listTypes(db), accents: catalog.ACCENTS, icons: catalog.ICONS });
  });
  router.post('/api/admin/types', async (req, res) => {
    const actor = adminOrThrow(ctx, req);
    const t = catalog.createType(db, await readJson(req), actor);
    send(res, 201, { type: catalog.listTypes(db).find((x) => x.id === t.id) });
  });
  router.patch('/api/admin/types/:id', async (req, res, params) => {
    const actor = adminOrThrow(ctx, req);
    catalog.updateType(db, params.id, await readJson(req), actor);
    send(res, 200, { type: catalog.listTypes(db).find((x) => x.id === params.id) });
  });
  router.post('/api/admin/types/:id/archive', async (req, res, params) => {
    const actor = adminOrThrow(ctx, req);
    send(res, 200, catalog.archiveType(db, params.id, actor));
  });

  // ------------------------------------------------------------ equipment --
  router.get('/api/admin/equipment', async (req, res, _p, url) => {
    adminOrThrow(ctx, req);
    send(res, 200, {
      today: today(),
      equipment: catalog.listEquipment(db, {
        typeId: url.searchParams.get('typeId') || null,
        active: bool(url.searchParams.get('active')),
        search: url.searchParams.get('search') || null,
      }),
    });
  });

  /** Everything one equipment detail screen needs, in a single round trip. */
  router.get('/api/admin/equipment/:id', async (req, res, params) => {
    adminOrThrow(ctx, req);
    const t = today();
    const equipment = catalog.getEquipment(db, params.id);
    if (!equipment) throw notFound('That equipment no longer exists.');
    send(res, 200, {
      today: t,
      equipment,
      tasks: queries.outstandingTasks(db, { today: t, equipmentId: params.id, includeHidden: true }),
      history: queries.completionHistory(db, { equipmentId: params.id, limit: 100 }),
      rules: catalog.listRules(db, { typeId: equipment.type.id }),
      activity: audit.list(db, { entity: 'equipment', entityId: params.id, limit: 50 }),
    });
  });

  router.post('/api/admin/equipment', async (req, res) => {
    const actor = adminOrThrow(ctx, req);
    const result = catalog.createEquipment(db, await readJson(req), actor, { today: today() });
    send(res, 201, result);
  });
  router.patch('/api/admin/equipment/:id', async (req, res, params) => {
    const actor = adminOrThrow(ctx, req);
    send(res, 200, { equipment: catalog.updateEquipment(db, params.id, await readJson(req), actor, { today: today() }) });
  });
  router.post('/api/admin/equipment/:id/duplicate', async (req, res, params) => {
    const actor = adminOrThrow(ctx, req);
    send(res, 201, { created: catalog.duplicateEquipment(db, params.id, await readJson(req), actor, { today: today() }) });
  });
  router.post('/api/admin/equipment/:id/archive', async (req, res, params) => {
    const actor = adminOrThrow(ctx, req);
    send(res, 200, catalog.archiveEquipment(db, params.id, actor));
  });

  // ---------------------------------------------------------------- rules --
  router.get('/api/admin/rules', async (req, res, _p, url) => {
    adminOrThrow(ctx, req);
    send(res, 200, {
      rules: catalog.listRules(db, {
        typeId: url.searchParams.get('typeId') || null,
        active: bool(url.searchParams.get('active')),
      }),
    });
  });
  router.get('/api/admin/rules/:id', async (req, res, params) => {
    adminOrThrow(ctx, req);
    const rule = catalog.getRule(db, params.id);
    if (!rule) throw notFound('That maintenance task no longer exists.');
    const t = today();
    send(res, 200, {
      today: t,
      rule,
      tasks: queries.outstandingTasks(db, { today: t, ruleId: params.id, includeHidden: true }),
      history: queries.completionHistory(db, { ruleId: params.id, limit: 100 }).items,
      activity: audit.list(db, { entity: 'maintenance_rule', entityId: params.id, limit: 50 }),
    });
  });
  router.post('/api/admin/rules', async (req, res) => {
    const actor = adminOrThrow(ctx, req);
    send(res, 201, catalog.createRule(db, await readJson(req), actor, { today: today() }));
  });
  router.patch('/api/admin/rules/:id', async (req, res, params) => {
    const actor = adminOrThrow(ctx, req);
    send(res, 200, { rule: catalog.updateRule(db, params.id, await readJson(req), actor) });
  });
  router.post('/api/admin/rules/:id/archive', async (req, res, params) => {
    const actor = adminOrThrow(ctx, req);
    send(res, 200, catalog.archiveRule(db, params.id, actor));
  });

  // -------------------------------------------------------------- history --
  router.get('/api/admin/history', async (req, res, _p, url) => {
    adminOrThrow(ctx, req);
    const q = url.searchParams;
    const result = queries.completionHistory(db, {
      equipmentId: q.get('equipmentId') || null,
      ruleId: q.get('ruleId') || null,
      employeeId: q.get('employeeId') || null,
      typeId: q.get('typeId') || null,
      from: isValidDate(q.get('from')) ? q.get('from') : null,
      to: isValidDate(q.get('to')) ? q.get('to') : null,
      search: q.get('search') || null,
      limit: Number(q.get('limit') || 100),
      offset: Number(q.get('offset') || 0),
    });
    send(res, 200, { today: today(), ...result });
  });

  router.get('/api/admin/completions/:id', async (req, res, params) => {
    adminOrThrow(ctx, req);
    const c = queries.completionById(db, params.id);
    if (!c) throw notFound('That completion record no longer exists.');
    send(res, 200, { completion: c });
  });

  // ------------------------------------------------------------- activity --
  router.get('/api/admin/activity', async (req, res, _p, url) => {
    adminOrThrow(ctx, req);
    send(res, 200, { activity: audit.list(db, { limit: Number(url.searchParams.get('limit') || 150) }) });
  });

  router.get('/api/admin/employees', async (req, res) => {
    adminOrThrow(ctx, req);
    send(res, 200, {
      employees: db.all('SELECT id, display_name, email, role, active FROM employees ORDER BY display_name')
        .map((e) => ({ id: e.id, name: e.display_name, email: e.email, role: e.role, active: !!e.active })),
    });
  });
}

module.exports = { register };
