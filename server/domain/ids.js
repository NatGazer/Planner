'use strict';
const crypto = require('node:crypto');

/** Prefixed, sortable-ish, URL-safe identifier. */
function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString('base64url')}`;
}
const newToken = () => crypto.randomBytes(32).toString('base64url');

module.exports = { newId, newToken };
