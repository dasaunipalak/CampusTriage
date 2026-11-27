const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('../src/app');
const { openDatabase } = require('../src/database');

async function setup(t, options = {}) {
  const db = openDatabase(':memory:'); let time = new Date('2026-11-23T12:00:00.000Z'); const codes = [];
  const sender = { async sendOtp(email, code) { codes.push({ email, code }); } };
  const server = createApp({ db, emailSender: sender, sessionSecret: 'auth-test-secret', now: () => time,
    analyzer: async description => ({ category: 'general', summary: description, possibleSafetyRisk: false, riskEvidence: null, needsReview: false }), ...options }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, method = 'GET', body, cookie) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0], setCookie: response.headers.get('set-cookie') };
  }
  return { db, codes, request, advance(ms) { time = new Date(time.getTime() + ms); } };
}

test('student OTP validates domain, normalizes email, hashes code, verifies and starts session', async t => {
  const { db, codes, request } = await setup(t);
  for (const email of ['person@gmail.com', 'person@iiitl.ac.in.evil', ' person @iiitl.ac.in']) {
    assert.equal((await request('/api/auth/student/request-otp', 'POST', { email })).status, 400);
  }
  const sent = await request('/api/auth/student/request-otp', 'POST', { email: '  STU@IIITL.AC.IN ' });
  assert.equal(sent.status, 200); assert.equal(codes[0].email, 'stu@iiitl.ac.in');
  const stored = db.prepare('SELECT * FROM otp_codes').get();
  assert.equal(stored.code_hash.includes(codes[0].code), false);
  assert.equal(stored.expires_at, '2026-11-23T12:10:00.000Z');
  const verified = await request('/api/auth/student/verify-otp', 'POST', { email: 'stu@iiitl.ac.in', code: codes[0].code });
  assert.equal(verified.status, 200); assert.match(verified.setCookie, /HttpOnly/); assert.match(verified.setCookie, /SameSite=Lax/);
  assert.deepEqual(verified.body.student, { email: 'stu@iiitl.ac.in' });
  assert.deepEqual((await request('/api/auth/student/me', 'GET', undefined, verified.cookie)).body, { student: { email: 'stu@iiitl.ac.in' } });
});

test('wrong code attempts invalidate at five and expired code is rejected', async t => {
  const { codes, request, advance, db } = await setup(t);
  await request('/api/auth/student/request-otp', 'POST', { email: 'wrong@iiitl.ac.in' });
  for (let i = 0; i < 5; i++) {
    const response = await request('/api/auth/student/verify-otp', 'POST', { email: 'wrong@iiitl.ac.in', code: '000000' });
    assert.equal(response.status, 401);
  }
  assert.equal(db.prepare('SELECT attempts FROM otp_codes WHERE email = ?').get('wrong@iiitl.ac.in').attempts, 5);
  advance(60_000);
  await request('/api/auth/student/request-otp', 'POST', { email: 'expired@iiitl.ac.in' }); advance(10 * 60_000);
  const expired = await request('/api/auth/student/verify-otp', 'POST', { email: 'expired@iiitl.ac.in', code: codes.at(-1).code });
  assert.equal(expired.status, 401); assert.match(expired.body.error, /expired/);
});

test('OTP request resend cooldown and hourly cap return clear errors', async t => {
  const { request, advance } = await setup(t);
  await request('/api/auth/student/request-otp', 'POST', { email: 'limits@iiitl.ac.in' });
  const cooldown = await request('/api/auth/student/request-otp', 'POST', { email: 'limits@iiitl.ac.in' });
  assert.equal(cooldown.status, 429); assert.match(cooldown.body.error, /wait 60 seconds/);
  for (let i = 1; i < 5; i++) { advance(60_000); assert.equal((await request('/api/auth/student/request-otp', 'POST', { email: 'limits@iiitl.ac.in' })).status, 200); }
  advance(60_000);
  const limited = await request('/api/auth/student/request-otp', 'POST', { email: 'limits@iiitl.ac.in' });
  assert.equal(limited.status, 429); assert.match(limited.body.error, /5 code requests per hour/);
});

test('complaint requires student session and saves student id without exposing email to analyzer or queue', async t => {
  let analyzed;
  const { db, codes, request } = await setup(t, { analyzer: async description => { analyzed = description; return { category: 'general', summary: description, possibleSafetyRisk: false, riskEvidence: null, needsReview: false }; } });
  assert.equal((await request('/complaints', 'POST', { description: 'Broken fan', location: 'Hall' })).status, 401);
  await request('/api/auth/student/request-otp', 'POST', { email: 'private@iiitl.ac.in' });
  const login = await request('/api/auth/student/verify-otp', 'POST', { email: 'private@iiitl.ac.in', code: codes.at(-1).code });
  const created = await request('/complaints', 'POST', { description: 'Broken fan', location: 'Hall' }, login.cookie);
  assert.equal(created.status, 201); assert.equal(analyzed, 'Broken fan');
  assert.equal(db.prepare('SELECT student_id FROM complaints').get().student_id, db.prepare('SELECT id FROM students WHERE email = ?').get('private@iiitl.ac.in').id);
  const queue = await request('/complaints'); assert.equal(JSON.stringify(queue.body).includes('private@iiitl.ac.in'), false);
  const loggedOut = await request('/api/auth/student/logout', 'POST', {}, login.cookie);
  assert.equal((await request('/api/auth/student/me', 'GET', undefined, loggedOut.cookie)).status, 401);
});
