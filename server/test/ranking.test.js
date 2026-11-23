const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rankComplaints } = require('../src/ranking');

const NOW = '2026-11-23T12:00:00.000Z';
function complaint(id, hoursAgo, values = {}) {
  return { id, createdAt: new Date(Date.parse(NOW) - hoursAgo * 3_600_000).toISOString(),
    severity: 5, urgency: 5, impact: 5, analysis: { possibleSafetyRisk: false }, ...values };
}

test('safety hazards precede overdue and high-scoring routine complaints', () => {
  const results = rankComplaints([
    complaint(1, 72), complaint(2, 1, { severity: 10, urgency: 10, impact: 10 }),
    complaint(3, 0, { severity: 0, urgency: 0, impact: 0, analysis: { possibleSafetyRisk: true } }),
  ], NOW);
  assert.deepEqual(results.map(c => c.id), [3, 1, 2]);
  assert.equal(results[0].ranking.tier, 'safety');
  assert.match(results[0].ranking.rankReason, /admin review/);
});

test('48-hour threshold is inclusive; overdue uses oldest first regardless of score', () => {
  const results = rankComplaints([
    complaint(1, 48 - 1 / 3_600_000, { severity: 10, urgency: 10, impact: 10 }),
    complaint(2, 48, { severity: 0, urgency: 0, impact: 0 }),
    complaint(3, 49, { severity: 0, urgency: 0, impact: 0 }),
  ], NOW);
  assert.deepEqual(results.map(c => c.id), [3, 2, 1]);
  assert.equal(results[1].ranking.tier, 'overdue');
  assert.equal(results[2].ranking.tier, 'routine');
});

test('exact weighted formula and descending score order', () => {
  const results = rankComplaints([
    complaint(1, 6, { severity: 3, urgency: 4, impact: 8 }),
    complaint(2, 0, { severity: 8, urgency: 8, impact: 8 }),
  ], NOW);
  assert.deepEqual(results.map(c => c.id), [2, 1]);
  assert.ok(Math.abs(results[1].ranking.score - 4.1) < 1e-12);
  assert.equal(results[1].ranking.factors.waiting, 1);
});

test('equal scores use oldest first, then ID for identical timestamps', () => {
  const results = rankComplaints([
    complaint(4, 0, { severity: 5.5 }),
    complaint(3, 12), complaint(2, 12),
  ], NOW);
  assert.equal(results[0].ranking.score, results[2].ranking.score);
  assert.deepEqual(results.map(c => c.id), [2, 3, 4]);
});

test('waiting clamps to 0–10; ranking is pure and validates explicit factor inputs', () => {
  const input = [complaint(1, 100), complaint(2, -1)];
  const snapshot = structuredClone(input);
  const results = rankComplaints(input, NOW);
  assert.equal(results[0].ranking.factors.waiting, 10);
  assert.equal(results[1].ranking.factors.waiting, 0);
  assert.deepEqual(input, snapshot);
  assert.throws(() => rankComplaints([complaint(1, 0, { severity: undefined })], NOW), TypeError);
  assert.throws(() => rankComplaints([complaint(1, 0, { impact: 11 })], NOW), TypeError);
  assert.throws(() => rankComplaints(input, undefined), TypeError);
});
