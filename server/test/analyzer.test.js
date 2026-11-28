const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAnalyzer, isValidAnalysis, mockAnalyzeComplaint } = require('../src/analyzer');
const { openDatabase } = require('../src/database');
const { createApp } = require('../src/app');
const { once } = require('node:events');

const description = 'washroom ke socket mein paani ja raha hai';
const valid = { category: 'electrical', summary: 'Water is entering a socket.',
  possibleSafetyRisk: true, riskEvidence: 'socket mein paani ja raha hai', needsReview: true };
const env = { OPENAI_API_KEY: 'test-placeholder', OPENAI_MODEL: 'test-model' };
const payload = analysis => ({ status: 'completed', output: [{ type: 'message',
  content: [{ type: 'output_text', text: JSON.stringify(analysis) }] }] });
const reply = data => ({ ok: true, json: async () => data });

test('real adapter requests strict structured output and verifies only after valid success', async () => {
  let called = false;
  const analyzer = createAnalyzer({ env, fetchImpl: async (url, options) => {
    called = true;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer test-placeholder');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'test-model');
    assert.equal(body.input, description);
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.equal(body.text.format.schema.additionalProperties, false);
    return reply(payload(valid));
  } });
  assert.equal(analyzer.getStatus().liveVerified, false);
  assert.deepEqual(await analyzer(description), valid);
  assert.equal(called, true);
  assert.equal(analyzer.getStatus().liveVerified, true);
});

test('missing key/model never invokes provider or silently uses mock', async () => {
  for (const settings of [{}, { OPENAI_API_KEY: 'test-placeholder' }, { OPENAI_MODEL: 'test-model' }]) {
    const analyzer = createAnalyzer({ env: settings, fetchImpl: () => assert.fail('Unexpected network request') });
    assert.equal(analyzer.getStatus().mode, 'openai');
    assert.equal(analyzer.getStatus().ready, false);
    await assert.rejects(analyzer(description), /configuration/);
    assert.equal(analyzer.getStatus().liveVerified, false);
  }
});

test('mock mode is explicit and does not claim live verification', async () => {
  const analyzer = createAnalyzer({ env: { ANALYZER_MODE: 'mock' }, fetchImpl: () => assert.fail() });
  assert.deepEqual(await analyzer(description), await mockAnalyzeComplaint(description));
  assert.equal(analyzer.getStatus().mode, 'mock');
  assert.equal(analyzer.getStatus().liveVerified, false);
  assert.throws(() => createAnalyzer({ env: { ANALYZER_MODE: 'typo' } }), /ANALYZER_MODE/);
  assert.throws(() => createAnalyzer({ env: { AI_TIMEOUT_MS: 'NaN' } }), /AI_TIMEOUT_MS/);
});

test('evidence must be an exact contiguous quote even without a safety flag', () => {
  assert.equal(isValidAnalysis(valid, description), true);
  for (const evidence of ['Water is entering a socket', 'SOCKET', '', 'socket … paani']) {
    assert.equal(isValidAnalysis({ ...valid, riskEvidence: evidence }, description), false);
    assert.equal(isValidAnalysis({ ...valid, possibleSafetyRisk: false, riskEvidence: evidence }, description), false);
  }
  assert.equal(isValidAnalysis({ ...valid, possibleSafetyRisk: false, riskEvidence: null }, description), true);
});

test('adapter rejects HTTP errors, malformed JSON, refusals, incomplete and ungrounded results', async () => {
  const cases = [
    { ok: false },
    { ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); } },
    reply({ status: 'incomplete', output: [] }), reply({ status: 'completed', output: [] }),
    reply({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] }),
    reply(payload({ ...valid, riskEvidence: 'invented evidence' })), reply(payload({})),
    reply({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{' }] }] }),
  ];
  for (const response of cases) {
    const analyzer = createAnalyzer({ env, fetchImpl: async () => response });
    await assert.rejects(analyzer(description));
    assert.equal(analyzer.getStatus().liveVerified, false);
  }
});

test('deadline aborts stalled fetch and stalled body reading', async () => {
  for (const stallBody of [false, true]) {
    let signal;
    const analyzer = createAnalyzer({ env: { ...env, AI_TIMEOUT_MS: '10' }, fetchImpl: async (url, options) => {
      signal = options.signal;
      if (!stallBody) return new Promise(() => {});
      return { ok: true, json: () => new Promise(() => {}) };
    } });
    await assert.rejects(analyzer(description), /timed out/);
    assert.equal(signal.aborted, true);
  }
});

test('HTTP API saves original complaint on real-adapter timeout and exposes mode safely', async t => {
  const db = openDatabase(':memory:');
  const analyzer = createAnalyzer({ env: { ...env, AI_TIMEOUT_MS: '10' }, fetchImpl: () => new Promise(() => {}) });
  const server = createApp({ db, analyzer, sessionSecret: 'analyzer-test-secret' }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/api/auth/student/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ai@iiitl.ac.in' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const response = await fetch(`${base}/complaints`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ description, location: 'Fictional washroom' }) });
  assert.equal(response.status, 201);
  const saved = await response.json();
  assert.equal(saved.description, description);
  assert.equal(saved.analysisMode, 'openai');
  assert.equal(saved.analysisStatus, 'failed');
  assert.equal(saved.analysis, null);
  assert.equal(saved.reviewStatus, 'required');
  const status = await (await fetch(`${base}/api/status`)).json();
  assert.equal(status.analysis.liveVerified, false);
  assert.ok(!JSON.stringify(status).includes(env.OPENAI_API_KEY));
});
