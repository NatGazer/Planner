'use strict';
const crypto = require('node:crypto');

const N = 16384, r = 8, p = 1, KEYLEN = 64;
const OPTS = { N, r, p, maxmem: 64 * 1024 * 1024 };

/**
 * scrypt is deliberately expensive — which means it must not run on the event
 * loop. `verifyPassword` uses the async form so a burst of sign-in attempts
 * queues on the thread pool instead of freezing every other request.
 */
function scrypt(password, salt, keylen) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, keylen, OPTS, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

function encode(salt, key) {
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** Synchronous — for seeding and tests, never on a request path. */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return encode(salt, crypto.scryptSync(String(password), salt, KEYLEN, OPTS));
}

async function hashPasswordAsync(password) {
  const salt = crypto.randomBytes(16);
  return encode(salt, await scrypt(password, salt, KEYLEN));
}

function parse(stored) {
  const [scheme, n, rr, pp, saltB64, keyB64] = String(stored).split('$');
  if (scheme !== 'scrypt') return null;
  return {
    params: { N: Number(n), r: Number(rr), p: Number(pp), maxmem: OPTS.maxmem },
    salt: Buffer.from(saltB64, 'base64'),
    key: Buffer.from(keyB64, 'base64'),
  };
}

async function verifyPassword(password, stored) {
  const parsed = parse(stored);
  if (!parsed) return false;
  try {
    const actual = await new Promise((resolve, reject) => {
      crypto.scrypt(String(password), parsed.salt, parsed.key.length, parsed.params,
        (err, key) => (err ? reject(err) : resolve(key)));
    });
    return crypto.timingSafeEqual(actual, parsed.key);
  } catch { return false; }
}

/**
 * A hash to verify against when no account matched, so an unknown address
 * costs exactly as much time as a known one. Without this, response latency
 * is an account-enumeration oracle: a valid address is slow, an invalid one
 * is instant.
 */
const DECOY = hashPassword(crypto.randomBytes(24).toString('hex'));
async function burnEquivalentTime(password) {
  await verifyPassword(password, DECOY);
  return false;
}

module.exports = { hashPassword, hashPasswordAsync, verifyPassword, burnEquivalentTime };
