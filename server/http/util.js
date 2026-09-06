'use strict';
const { AppError } = require('../domain/errors.js');

const MAX_JSON = 1 * 1024 * 1024;

/**
 * Read a request body, refusing anything over `limit`.
 *
 * On refusal the stream is paused and drained rather than destroyed:
 * destroying the socket kills the response with it, so the client gets a
 * connection reset instead of the 413 it is meant to show the person. The
 * remainder is discarded without being buffered, so an oversized upload still
 * costs no memory.
 */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let refused = false;

    const onData = (c) => {
      if (refused) return;                       // discard the rest, buffer nothing
      size += c.length;
      if (size > limit) {
        refused = true;
        chunks.length = 0;
        reject(new AppError('PAYLOAD_TOO_LARGE', 'That upload is too large.', 413));
        return;
      }
      chunks.push(c);
    };

    req.on('data', onData);
    req.on('end', () => { if (!refused) resolve(Buffer.concat(chunks)); });
    req.on('aborted', () => { if (!refused) reject(new AppError('ABORTED', 'The upload did not finish.', 400)); });
    req.on('error', (err) => { if (!refused) reject(err); });
  });
}

/**
 * Always resolves to a plain object. `JSON.parse` happily returns null, a
 * number or a string, and every handler downstream then reads a property off
 * it — which is a TypeError and a 500 for what is really a bad request.
 */
async function readJson(req) {
  const buf = await readBody(req, MAX_JSON);
  if (!buf.length) return {};
  let parsed;
  try { parsed = JSON.parse(buf.toString('utf8')); }
  catch { throw new AppError('BAD_JSON', 'The request body was not valid JSON.', 400); }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AppError('BAD_JSON', 'The request body must be a JSON object.', 400);
  }
  return parsed;
}

function send(res, status, payload, headers = {}) {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  res.end(body);
}

function sendError(res, err) {
  if (err instanceof AppError) {
    const headers = err.status === 429 && err.detail?.retryAfterSeconds
      ? { 'retry-after': String(err.detail.retryAfterSeconds) }
      : {};
    // A refused upload leaves unread bytes on the wire; say so and hang up
    // cleanly rather than letting the client stream into a closed handler.
    if (err.status === 413) headers.connection = 'close';
    return send(res, err.status, err.toJSON(), headers);
  }
  // eslint-disable-next-line no-console
  console.error('[unhandled]', err);
  return send(res, 500, { error: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.' } });
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/**
 * Minimal multipart/form-data parser — enough for one photo plus a few text
 * fields, with no dependency and a hard byte ceiling applied upstream.
 */
function parseMultipart(buffer, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) throw new AppError('BAD_UPLOAD', 'Malformed upload.', 400);
  const boundary = Buffer.from(`--${(m[1] || m[2]).trim()}`);
  const parts = [];
  let index = buffer.indexOf(boundary);
  if (index < 0) throw new AppError('BAD_UPLOAD', 'Malformed upload.', 400);
  index += boundary.length;
  while (index < buffer.length) {
    if (buffer[index] === 0x2d && buffer[index + 1] === 0x2d) break; // closing --
    while (buffer[index] === 0x0d || buffer[index] === 0x0a) index += 1;
    const headerEnd = buffer.indexOf('\r\n\r\n', index);
    if (headerEnd < 0) break;
    const rawHeaders = buffer.slice(index, headerEnd).toString('utf8');
    const bodyStart = headerEnd + 4;
    const nextBoundary = buffer.indexOf(boundary, bodyStart);
    if (nextBoundary < 0) break;
    let bodyEnd = nextBoundary;
    if (buffer[bodyEnd - 1] === 0x0a) bodyEnd -= 1;
    if (buffer[bodyEnd - 1] === 0x0d) bodyEnd -= 1;
    const disposition = /name="([^"]*)"/i.exec(rawHeaders);
    const filename = /filename="([^"]*)"/i.exec(rawHeaders);
    const ctype = /content-type:\s*([^\r\n]+)/i.exec(rawHeaders);
    parts.push({
      name: disposition ? disposition[1] : '',
      filename: filename ? filename[1] : null,
      contentType: ctype ? ctype[1].trim().toLowerCase() : null,
      data: buffer.slice(bodyStart, bodyEnd),
    });
    index = nextBoundary + boundary.length;
  }
  return parts;
}

module.exports = { readBody, readJson, send, sendError, parseCookies, parseMultipart, MAX_JSON };
