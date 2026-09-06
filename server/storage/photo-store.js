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

/** Persist bytes and register the reference. Returns the photo row. */
function put(db, { bytes, mimeType, uploaderId }) {
  assertAcceptable(mimeType, bytes.length);
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

/** Best-effort cleanup of a draft photo that never became a completion. */
function discardUnclaimed(db, photoId) {
  const photo = db.get('SELECT * FROM photos WHERE id = ? AND claimed = 0', [photoId]);
  if (!photo) return false;
  db.run('DELETE FROM photos WHERE id = ? AND claimed = 0', [photoId]);
  try { fs.rmSync(path.join(config.photoDir, path.basename(photo.storage_key)), { force: true }); } catch { /* ignore */ }
  return true;
}

module.exports = { put, open, discardUnclaimed, assertAcceptable };
