'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const t = require('../domain/time.js');

test('calendar months clamp to the destination month', () => {
  assert.equal(t.addInterval('2025-01-31', 1, 'months'), '2025-02-28');
  assert.equal(t.addInterval('2024-01-31', 1, 'months'), '2024-02-29');
  assert.equal(t.addInterval('2025-03-31', 1, 'months'), '2025-04-30');
  assert.equal(t.addInterval('2025-05-31', 3, 'months'), '2025-08-31');
  assert.equal(t.addInterval('2025-08-31', 6, 'months'), '2026-02-28');
});

test('clamping does not accumulate across successive hops', () => {
  const a = t.addInterval('2025-01-31', 1, 'months');   // 2025-02-28
  const b = t.addInterval(a, 1, 'months');              // 2025-03-28, not 03-31
  assert.equal(b, '2025-03-28');
});

test('leap day plus a year clamps', () => {
  assert.equal(t.addInterval('2024-02-29', 1, 'years'), '2025-02-28');
  assert.equal(t.addInterval('2024-02-29', 4, 'years'), '2028-02-29');
});

test('days and weeks are plain day arithmetic across month and year ends', () => {
  assert.equal(t.addInterval('2025-12-28', 1, 'weeks'), '2026-01-04');
  assert.equal(t.addInterval('2025-02-27', 3, 'days'), '2025-03-02');
  assert.equal(t.addInterval('2024-02-27', 3, 'days'), '2024-03-01');
});

test('interval values must be positive whole numbers', () => {
  assert.throws(() => t.addInterval('2025-01-01', 0, 'days'), /positive integer/);
  assert.throws(() => t.addInterval('2025-01-01', -2, 'months'), /positive integer/);
  assert.throws(() => t.addInterval('2025-01-01', 1.5, 'days'), /positive integer/);
  assert.throws(() => t.addInterval('2025-01-01', 1, 'fortnights'), /Unknown interval unit/);
});

test('overdue is strictly before today', () => {
  assert.equal(t.isOverdue('2025-06-01', '2025-06-02'), true);
  assert.equal(t.isOverdue('2025-06-02', '2025-06-02'), false);
  assert.equal(t.isOverdue('2025-06-03', '2025-06-02'), false);
});

test('the business timezone decides what "today" is', () => {
  const instant = new Date('2025-06-01T23:30:00Z');
  assert.equal(t.businessToday('Europe/Lisbon', instant), '2025-06-02');   // UTC+1 in June
  assert.equal(t.businessToday('UTC', instant), '2025-06-01');
  assert.equal(t.businessToday('Pacific/Auckland', instant), '2025-06-02');
  assert.equal(t.businessToday('America/Los_Angeles', instant), '2025-06-01');
});

test('due descriptions read the way a person would say them', () => {
  assert.equal(t.describeDue('2025-06-02', '2025-06-02').label, 'Due today');
  assert.equal(t.describeDue('2025-06-03', '2025-06-02').label, 'Due tomorrow');
  assert.equal(t.describeDue('2025-06-01', '2025-06-02').label, '1 day overdue');
  assert.equal(t.describeDue('2025-05-30', '2025-06-02').label, '3 days overdue');
  assert.equal(t.describeDue('2025-06-09', '2025-06-02').bucket, 'soon');
  assert.equal(t.describeDue('2025-06-10', '2025-06-02').bucket, 'later');
});

test('malformed dates are rejected rather than coerced', () => {
  assert.throws(() => t.parseDate('2025-02-30'), /Day out of range/);
  assert.throws(() => t.parseDate('2025-13-01'), /Month out of range/);
  assert.throws(() => t.parseDate('06/02/2025'), /Not a calendar date/);
  assert.equal(t.isValidDate('2024-02-29'), true);
  assert.equal(t.isValidDate('2025-02-29'), false);
});
