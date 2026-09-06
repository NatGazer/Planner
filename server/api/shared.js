'use strict';
/** Routes both apps expose: session, identity, and authorised photo reads. */
const sessions = require('../auth/sessions.js');
const photoStore = require('../storage/photo-store.js');
const { readJson, send, parseMultipart, readBody } = require('../http/util.js');
const { unauthorized, badRequest, notFound, forbidden } = require('../domain/errors.js');
const { businessToday } = require('../domain/time.js');
const config = require('../config.js');

function cookie(name, value, maxAgeSeconds, secure) {
  const bits = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSeconds}`];
  if (secure) bits.push('Secure');
  return bits.join('; ');
}

function register(router, ctx) {
  const { db, appRole } = ctx;

  router.post('/api/auth/sign-in', async (req, res) => {
    const body = await readJson(req);
    const result = await sessions.signIn(db, {
      email: body.email,
      password: body.password,
      userAgent: req.headers['user-agent'],
      address: ctx.addressOf(req),
    });
    // This origin serves exactly one app. An account for the other role is
    // rejected here rather than being handed a session it cannot use.
    if (appRole === 'admin' && result.employee.role !== 'admin') {
      sessions.signOut(db, result.token);
      throw forbidden('This is the administrator app. Please use the worker app to sign in.');
    }
    send(res, 200, {
      employee: result.employee,
      expiresAt: result.expiresAt,
      today: businessToday(config.businessTimezone),
      timezone: config.businessTimezone,
    }, { 'set-cookie': cookie(sessions.SESSION_COOKIE, result.token, config.sessionTtlHours * 3600, !!ctx.secureCookies) });
  });

  router.post('/api/auth/sign-out', async (req, res) => {
    sessions.signOut(db, ctx.tokenOf(req));
    send(res, 200, { ok: true }, { 'set-cookie': cookie(sessions.SESSION_COOKIE, '', 0, !!ctx.secureCookies) });
  });

  router.get('/api/auth/me', async (req, res) => {
    const actor = ctx.actorOf(req);
    if (!actor) throw unauthorized();
    send(res, 200, {
      employee: sessions.shapeEmployee({ ...actor, display_name: actor.name, active: actor.active ? 1 : 0 }),
      today: businessToday(config.businessTimezone),
      timezone: config.businessTimezone,
      app: appRole,
    });
  });

  /** Upload a photo. It stays a private draft until a completion claims it. */
  router.post('/api/photos', async (req, res) => {
    const actor = ctx.actorOf(req);
    if (!actor) throw unauthorized();
    const type = String(req.headers['content-type'] || '');
    let bytes; let mime;
    if (type.startsWith('multipart/form-data')) {
      const buf = await readBody(req, config.maxPhotoBytes + 64 * 1024);
      const parts = parseMultipart(buf, type);
      const file = parts.find((p) => p.filename != null && p.data.length);
      if (!file) throw badRequest('PHOTO_REQUIRED', 'No photo was attached.');
      bytes = file.data; mime = (file.contentType || 'application/octet-stream').split(';')[0];
    } else if (type.startsWith('image/')) {
      bytes = await readBody(req, config.maxPhotoBytes + 64 * 1024);
      mime = type.split(';')[0];
    } else {
      throw badRequest('BAD_UPLOAD', 'Send the photo as multipart/form-data or with an image content type.');
    }
    const photo = photoStore.put(db, { bytes, mimeType: mime, uploaderId: actor.id });
    send(res, 201, { photoId: photo.id, byteSize: photo.byte_size, mimeType: photo.mime_type });
  });

  /**
   * Authorised photo read. Administrators see every completion photo; a worker
   * sees only the photos they uploaded. Bytes never sit on a public path.
   */
  router.get('/api/photos/:id', async (req, res, params) => {
    const actor = ctx.actorOf(req);
    if (!actor) throw unauthorized();
    const photo = db.get('SELECT * FROM photos WHERE id = ?', [params.id]);
    if (!photo) throw notFound('That photo is not available.');
    if (actor.role !== 'admin' && photo.uploaded_by !== actor.id) throw forbidden('That photo belongs to another completion.');
    const bytes = photoStore.open(photo);
    if (!bytes) throw notFound('That photo is not available.');
    res.writeHead(200, {
      'content-type': photo.mime_type,
      'content-length': bytes.length,
      'cache-control': 'private, max-age=3600',
      'x-content-type-options': 'nosniff',
    });
    res.end(bytes);
  });
}

module.exports = { register, cookie };
