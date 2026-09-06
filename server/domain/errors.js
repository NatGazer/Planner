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

const badRequest = (code, msg, detail) => new AppError(code, msg, 400, detail);
const unauthorized = (msg = 'Sign in to continue') => new AppError('UNAUTHORIZED', msg, 401);
const forbidden = (msg = 'You do not have access to this action') => new AppError('FORBIDDEN', msg, 403);
const notFound = (msg = 'Not found') => new AppError('NOT_FOUND', msg, 404);
const conflict = (code, msg, detail) => new AppError(code, msg, 409, detail);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict };
