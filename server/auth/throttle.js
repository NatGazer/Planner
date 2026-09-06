'use strict';
/**
 * Sign-in throttling.
 *
 * Keyed on the pair (client address, email), so one person fat-fingering their
 * own password never locks out a colleague, and a spray across many accounts
 * from one address is still caught by the per-address cap.
 *
 * In-process on purpose: this system runs as one or two processes over one
 * database. If it is ever put behind a load balancer with many nodes, move
 * this to the shared store — the interface is two functions.
 */
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_PAIR = 8;
const MAX_PER_ADDRESS = 30;
const SWEEP_EVERY = 500;

const attempts = new Map();
let sinceSweep = 0;

function sweep(now) {
  for (const [key, list] of attempts) {
    const live = list.filter((t) => now - t < ATTEMPT_WINDOW_MS);
    if (live.length) attempts.set(key, live); else attempts.delete(key);
  }
}

function count(key, now) {
  const list = attempts.get(key);
  if (!list) return 0;
  return list.filter((t) => now - t < ATTEMPT_WINDOW_MS).length;
}

/** @returns {{blocked: boolean, retryAfterSeconds: number}} */
function check(address, email, now = Date.now()) {
  const pair = `${address}|${String(email || '').toLowerCase()}`;
  const perPair = count(pair, now);
  const perAddress = count(address, now);
  if (perPair >= MAX_PER_PAIR || perAddress >= MAX_PER_ADDRESS) {
    const list = attempts.get(perPair >= MAX_PER_PAIR ? pair : address) || [];
    const oldest = Math.min(...list);
    return { blocked: true, retryAfterSeconds: Math.max(1, Math.ceil((ATTEMPT_WINDOW_MS - (now - oldest)) / 1000)) };
  }
  return { blocked: false, retryAfterSeconds: 0 };
}

function recordFailure(address, email, now = Date.now()) {
  const pair = `${address}|${String(email || '').toLowerCase()}`;
  for (const key of [pair, address]) {
    attempts.set(key, [...(attempts.get(key) || []), now]);
  }
  sinceSweep += 1;
  if (sinceSweep >= SWEEP_EVERY) { sinceSweep = 0; sweep(now); }
}

/** A successful sign-in clears that person's slate. */
function clear(address, email) {
  attempts.delete(`${address}|${String(email || '').toLowerCase()}`);
}

function reset() { attempts.clear(); sinceSweep = 0; }

module.exports = { check, recordFailure, clear, reset, MAX_PER_PAIR, MAX_PER_ADDRESS, ATTEMPT_WINDOW_MS };
