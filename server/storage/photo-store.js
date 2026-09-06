'use strict';
/**
 * Access-controlled photo storage.
 *
 * Bytes never sit in a publicly reachable directory: they are written under
 * the private data dir with an opaque key, and the only way back out is
 * `GET /api/photos/:id`, which authenticates the caller first. Swap the two
 * `put`/`open` functions for your platform's object storage and nothing else
 * in the system changes.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { newId } = require('../domain/ids.js');
const { nowInstant } = require('../domain/time.js');
const { badRequest } = require('../domain/errors.js');
const config = require('../config.js');

const EXT = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'image/heic': '.heic', 'image/heif': '.heif', 'image/avif': '.avif',
};

function assertAcceptable(mimeType, byteSize) {
  if (!config.allowedPhotoTypes.includes(mimeType)) {
    throw badRequest('PHOTO_TYPE', `That file type is not supported (${mimeType}). Use a JPEG, PNG, WebP or HEIC photo.`);
  }
  if (!byteSize) throw badRequest('PHOTO_EMPTY', 'The photo came through empty. Please try again.');
  if (byteSize > config.maxPhotoBytes) {
    throw badRequest('PHOTO_TOO_LARGE', `That photo is larger than ${Math.round(config.maxPhotoBytes / 1048576)} MB.`);
  }
}

/**
 * Persist bytes and register the reference.
 *
 * An employee only ever needs one unsubmitted photo at a time. Capping the
 * drafts they may hold stops an authenticated account — or a phone stuck in a
 * retry loop — from filling the disk, and the oldest drafts are discarded to
 * make room rather than the upload being refused.
 */
function put(db, { bytes, mimeType, uploaderId }) {
  assertAcceptable(mimeType, bytes.length);

  const drafts = db.all(
    'SELECT id FROM photos WHERE uploaded_by = ? AND claimed = 0 ORDER BY uploaded_at ASC',
    [uploaderId],
  );
  const overBy = drafts.length - (config.maxDraftPhotosPerEmployee - 1);
  for (let i = 0; i < overBy; i += 1) discardUnclaimed(db, drafts[i].id);
  const id = newId('pho');
  const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
  const key = `${id}${EXT[mimeType] || '.bin'}`;
  fs.mkdirSync(config.photoDir, { recursive: true });
  fs.writeFileSync(path.join(config.photoDir, key), bytes, { mode: 0o600 });

  db.run(
    `INSERT INTO photos (id, storage_key, mime_type, byte_size, checksum, uploaded_by, uploaded_at, claimed)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    [id, key, mimeType, bytes.length, checksum, uploaderId, nowInstant()],
  );
  return db.get('SELECT * FROM photos WHERE id = ?', [id]);
}

/** Read bytes back. Authorisation is the caller's job — see api/shared.js. */
function open(photo) {
  const file = path.join(config.photoDir, path.basename(photo.storage_key));
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file);
}

/**
 * Discard a draft photo that never became a completion.
 *
 * The row delete is guarded on `claimed = 0`, and the bytes are removed ONLY
 * if that delete actually matched. Between reading the row and deleting it a
 * completion can claim the photo; deleting the file on that path would leave
 * a permanent completion record pointing at bytes that no longer exist.
 */
function discardUnclaimed(db, photoId) {
  const photo = db.get('SELECT * FROM photos WHERE id = ? AND claimed = 0', [photoId]);
  if (!photo) return false;
  const { changes } = db.run('DELETE FROM photos WHERE id = ? AND claimed = 0', [photoId]);
  if (changes !== 1) return false;      // somebody claimed it first; leave the bytes alone
  try { fs.rmSync(path.join(config.photoDir, path.basename(photo.storage_key)), { force: true }); } catch { /* already gone */ }
  return true;
}

/**
 * Sweep drafts that were uploaded but never submitted — a worker who took a
 * photo and then walked away. Runs at boot; a day's grace is far longer than
 * any real completion takes.
 */
function sweepAbandoned(db, { olderThanHours = 24 } = {}) {
  const cutoff = new Date(Date.now() - olderThanHours * 3600 * 1000).toISOString();
  const stale = db.all('SELECT id FROM photos WHERE claimed = 0 AND uploaded_at < ?', [cutoff]);
  let removed = 0;
  for (const row of stale) if (discardUnclaimed(db, row.id)) removed += 1;
  return removed;
}

module.exports = { put, open, discardUnclaimed, sweepAbandoned, assertAcceptable };
