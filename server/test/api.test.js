const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/app');
const { openDatabase, insertComplaint, toComplaint } = require('../src/database');
const { seed } = require('../scripts/seed');
const { mockAnalyzeComplaint } = require('../src/analyzer');

const NOW = '2026-11-23T12:00:00.000Z';
async function setup(t, options = {}) {
  const db = openDatabase(':memory:');
  const withStudent = options.withStudent !== false;
  const appOptions = { ...options }; delete appOptions.withStudent;
  const server = createApp({ db, analyzer: mockAnalyzeComplaint, sessionSecret: 'test-session-secret', now: () => new Date(NOW), ...appOptions }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    db.close();
  });
  let cookie = '';
  if (withStudent) {
    const url = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${url}/api/auth/student/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'test@iiitl.ac.in' }) });
    cookie = response.headers.get('set-cookie').split(';')[0];
  }
  async function request(route = '/complaints', method = 'GET', body) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, {
      method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  return { db, request, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

test('POST preserves originals, persists UTC time, pending status, successful safe analysis and defaults', async t => {
  const { db, request } = await setup(t);
  const input = { description: '  Projector is broken.  ', location: ' Room 102 ' };
  const response = await request('/complaints', 'POST', input);
  assert.equal(response.status, 201);
  assert.equal(response.body.description, input.description);
  assert.equal(response.body.location, input.location);
  assert.equal(response.body.createdAt, NOW);
  assert.equal(response.body.status, 'pending');
  assert.equal(response.body.analysisStatus, 'succeeded');
  assert.equal(response.body.analysis.possibleSafetyRisk, false);
  assert.equal(response.body.analysisError, null);
  assert.equal(response.body.reviewStatus, 'not_required');
  assert.equal(response.body.ranking.provisional, true);
  assert.deepEqual(response.body.ranking.factors, { severity: 5, urgency: 5, impact: 5, waiting: 0 });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM complaints').get().n, 1);
  const listed = await request();
  assert.deepEqual(listed.body, [response.body]);
});

test('POST validates both fields and never invokes analyzer for invalid input', async t => {
  let called = false;
  const { db, request } = await setup(t, { analyzer: async () => { called = true; } });
  for (const input of [null, {}, [], { description: 'x' }, { description: ' ', location: 'x' },
    { description: 'x', location: 123 }, { description: 'x', location: '\t' },
    { description: 'x'.repeat(5001), location: 'x' }, { description: 'x', location: 'x'.repeat(201) }]) {
    assert.equal((await request('/complaints', 'POST', input)).status, 400);
  }
  assert.equal(called, false);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM complaints').get().n, 0);
});

test('thrown analysis saves original complaint with unknown risk and manual review', async t => {
  const { request } = await setup(t, { analyzer: async () => { throw new Error('Provider down'); } });
  const response = await request('/complaints', 'POST', { description: 'Potential problem', location: 'Library' });
  assert.equal(response.status, 201);
  assert.equal(response.body.analysis, null);
  assert.equal(response.body.analysisStatus, 'failed');
  assert.equal(response.body.needsReview, true);
  assert.equal(response.body.reviewStatus, 'required');
  assert.match(response.body.analysisError, /manual review/);
  assert.equal((await request()).body[0].description, 'Potential problem');
});

test('invalid analyzer output is distinguishable from successful no-risk analysis', async t => {
  const valid = { category: 'general', summary: 'Broken chair', possibleSafetyRisk: false,
    riskEvidence: null, needsReview: false };
  let result;
  const { request } = await setup(t, { analyzer: async () => result });
  for (result of [null, {}, { ...valid, possibleSafetyRisk: 'false' },
    { ...valid, summary: '' }, { ...valid, category: '' }, { ...valid, needsReview: null },
    { ...valid, riskEvidence: undefined }, { ...valid, possibleSafetyRisk: true }]) {
    const response = await request('/complaints', 'POST', { description: 'Broken chair', location: 'Hall' });
    assert.equal(response.status, 201);
    assert.equal(response.body.analysisStatus, 'failed');
    assert.equal(response.body.analysis, null);
    assert.equal(response.body.reviewStatus, 'required');
  }
  result = valid;
  const response = await request('/complaints', 'POST', { description: 'Broken chair', location: 'Hall' });
  assert.equal(response.body.analysisStatus, 'succeeded');
  assert.equal(response.body.analysis.possibleSafetyRisk, false);
  assert.equal(response.body.reviewStatus, 'not_required');
});

test('hazard requires admin review even if analyzer needsReview is false', async t => {
  const { request } = await setup(t, { analyzer: async () => ({ category: 'electrical',
    summary: 'Wet socket', possibleSafetyRisk: true, riskEvidence: 'water in socket', needsReview: false }) });
  const response = await request('/complaints', 'POST', { description: 'water in socket', location: 'Hall' });
  assert.equal(response.body.reviewStatus, 'required');
  assert.equal(response.body.ranking.tier, 'safety');
});

test('demo fixture ranks hazard, overdue and routine; seed refuses existing data', async t => {
  const { db, request } = await setup(t);
  await seed(db, NOW);
  const response = await request();
  assert.deepEqual(response.body.map(c => c.id), [3, 2, 1]);
  assert.deepEqual(response.body.map(c => c.ranking.tier), ['safety', 'overdue', 'routine']);
  assert.equal(response.body[0].analysis.riskEvidence, 'socket mein paani ja raha hai');
  assert.equal(response.body[1].ranking.elapsedHours, 48);
  assert.equal(response.body[2].ranking.scoringSource, 'demo-fixture');
  assert.equal(response.body[2].ranking.provisional, false);
  assert.ok(Math.abs(response.body[2].ranking.score - 4.1) < 1e-12);
  await assert.rejects(seed(db, NOW), /empty database/);
  assert.equal((await request()).body.length, 3);
});

test('resolve persists status, removes complaint from pending queue and is idempotent', async t => {
  const { db, request } = await setup(t);
  const created = await request('/complaints', 'POST', { description: 'sparking socket', location: 'Hall' });
  const route = `/complaints/${created.body.id}/resolve`;
  const resolved = await request(route, 'PATCH');
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.status, 'resolved');
  assert.equal(resolved.body.resolvedAt, NOW);
  assert.equal(db.prepare('SELECT status FROM complaints WHERE id = ?').get(created.body.id).status, 'resolved');
  assert.deepEqual((await request()).body, []);
  assert.deepEqual((await request(route, 'PATCH')).body, resolved.body);
  for (const id of ['99999', 'abc', '1.5', '0', '9007199254740992']) {
    assert.equal((await request(`/complaints/${id}/resolve`, 'PATCH')).status, 404);
  }
});

test('SQLite persists original and analysis across database reopen', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'campustriage-persistence-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'complaints.sqlite');
  const first = openDatabase(filename);
  await seed(first, NOW);
  first.close();
  const second = openDatabase(filename);
  try {
    const row = second.prepare('SELECT * FROM complaints WHERE id = 3').get();
    assert.equal(row.description, 'socket mein paani ja raha hai');
    assert.equal(JSON.parse(row.analysis).possibleSafetyRisk, true);
    assert.equal(row.analysis_status, 'succeeded');
  } finally { second.close(); }
});

test('invalid JSON and oversized bodies return JSON errors without saving', async t => {
  const { db, baseUrl } = await setup(t);
  for (const [body, status] of [['{', 400], [JSON.stringify({ description: 'x'.repeat(40000), location: 'Hall' }), 413]]) {
    const response = await fetch(`${baseUrl}/complaints`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(response.status, status);
    assert.equal(typeof (await response.json()).error, 'string');
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM complaints').get().n, 0);
});

test('ungrounded evidence triggers manual review even for injected analyzers', async t => {
  const { request } = await setup(t, { analyzer: async () => ({ category: 'electrical', summary: 'Water in socket',
    possibleSafetyRisk: true, riskEvidence: 'invented phrase', needsReview: true }) });
  const response = await request('/complaints', 'POST', { description: 'water in socket', location: 'Hall' });
  assert.equal(response.status, 201);
  assert.equal(response.body.analysisStatus, 'failed');
  assert.equal(response.body.analysis, null);
  assert.equal(response.body.reviewStatus, 'required');
});

test('migration preserves old database records and labels historical analysis as legacy mock', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'campustriage-migration-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'legacy.sqlite');
  const first = openDatabase(filename);
  insertComplaint(first, { description: 'Broken chair', location: 'Hall', analysis: await mockAnalyzeComplaint('Broken chair'),
    analysisStatus: 'succeeded', createdAt: NOW, severity: 5, urgency: 5, impact: 5, scoringSource: 'provisional-defaults' });
  first.exec('ALTER TABLE complaints DROP COLUMN analysis_mode');
  first.close();
  const second = openDatabase(filename);
  try {
    const complaint = toComplaint(second.prepare('SELECT * FROM complaints').get());
    assert.equal(complaint.description, 'Broken chair');
    assert.equal(complaint.analysisMode, 'legacy-mock');
    assert.equal(complaint.analysisStatus, 'succeeded');
  } finally { second.close(); }
});
