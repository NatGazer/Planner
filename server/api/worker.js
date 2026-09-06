'use strict';
/**
 * Worker surface. Three read routes and one write route — that is the whole
 * capability of a worker session. There is deliberately no route here that
 * could create, edit, reschedule or delete anything, and the worker server
 * never mounts the admin router at all.
 */
const { send, readJson } = require('../http/util.js');
const { unauthorized, forbidden, notFound, badRequest } = require('../domain/errors.js');
const { businessToday } = require('../domain/time.js');
const queries = require('../domain/queries.js');
const { submitCompletion } = require('../domain/completions.js');
const photoStore = require('../storage/photo-store.js');
const config = require('../config.js');

function actorOrThrow(ctx, req) {
  const actor = ctx.actorOf(req);
  if (!actor) throw unauthorized();
  // Administrators are a superset and may also carry out work.
  if (actor.role !== 'worker' && actor.role !== 'admin') throw forbidden();
  return actor;
}

function register(router, ctx) {
  const { db } = ctx;
  const today = () => businessToday(config.businessTimezone);

  /** The one shared list. No assignment, no claiming — ordered by due date. */
  router.get('/api/worker/tasks', async (req, res, _p, url) => {
    actorOrThrow(ctx, req);
    const t = today();
    const search = url.searchParams.get('search') || null;
    // The most urgent 300, which is far more than a shift can hold, and the
    // list is ordered so those are the ones that matter. The counts below are
    // exact regardless, and search reaches anything past the cut.
    const tasks = queries.outstandingTasks(db, { today: t, search, limit: 300 });
    send(res, 200, {
      today: t,
      timezone: config.businessTimezone,
      counts: queries.outstandingCounts(db, { today: t, search }),
      truncated: !!tasks.truncated,
      tasks,
    });
  });

  router.get('/api/worker/tasks/:id', async (req, res, params) => {
    actorOrThrow(ctx, req);
    const t = today();
    const task = queries.taskById(db, params.id, t);
    if (!task || task.status !== 'pending' || !task.equipment.active || !task.rule.active || !task.rule.applies) {
      throw notFound('That task is no longer outstanding.', { key: 'server.taskNotOutstanding' });
    }
    send(res, 200, { today: t, task });
  });

  router.post('/api/worker/tasks/:id/complete', async (req, res, params) => {
    const actor = actorOrThrow(ctx, req);
    const body = await readJson(req);
    if (body.confirmed !== true) {
      throw badRequest('CONFIRMATION_REQUIRED', 'Tick "Maintenance completed" before submitting.', { field: 'confirmed', key: 'server.tickConfirm' });
    }
    if (!body.photoId) {
      throw badRequest('PHOTO_REQUIRED', 'Add one photo of the completed work.', { field: 'photoId', key: 'server.addOnePhoto' });
    }
    const result = submitCompletion(db, {
      taskId: params.id,
      employee: { id: actor.id, display_name: actor.name },
      photoId: body.photoId,
      comment: body.comment,
    });
    const t = today();
    send(res, 201, {
      ok: true,
      completion: queries.completionShape(result.completion),
      nextTask: { id: result.nextTask.id, dueDate: result.nextTask.due_date },
      today: t,
      tasks: queries.outstandingTasks(db, { today: t }),
    });
  });

  /** Abandoning a draft photo before submitting cleans it up. */
  router.del('/api/worker/photos/:id', async (req, res, params) => {
    const actor = actorOrThrow(ctx, req);
    const photo = db.get('SELECT * FROM photos WHERE id = ?', [params.id]);
    if (!photo) return send(res, 200, { ok: true });
    if (photo.uploaded_by !== actor.id) throw forbidden();
    photoStore.discardUnclaimed(db, params.id);
    return send(res, 200, { ok: true });
  });
}

module.exports = { register };
