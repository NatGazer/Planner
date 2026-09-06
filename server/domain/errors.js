'use strict';

/** An error with an HTTP status and a stable machine code the UI can switch on. */
class AppError extends Error {
  constructor(code, message, status = 400, detail = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
  toJSON() {
    return { error: { code: this.code, message: this.message, detail: this.detail ?? undefined } };
  }
}

/**
 * `detail.key` is a translation key and `detail.params` its values, so an app
 * can show this message in the reader's language. The English `message` stays
 * on the error itself: it is what the server logs, and what a client that does
 * not recognise the key falls back to. The server has exactly one language.
 */
const badRequest = (code, msg, detail) => new AppError(code, msg, 400, detail);
const unauthorized = (msg = 'Sign in to continue', detail = { key: 'server.signInToContinue' }) => new AppError('UNAUTHORIZED', msg, 401, detail);
const forbidden = (msg = 'You do not have access to this action', detail = { key: 'server.noAccess' }) => new AppError('FORBIDDEN', msg, 403, detail);
const notFound = (msg = 'Not found', detail = { key: 'server.notFound' }) => new AppError('NOT_FOUND', msg, 404, detail);
const conflict = (code, msg, detail) => new AppError(code, msg, 409, detail);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict };
