const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/app');
const { openDatabase } = require('../src/database');

async function setup(t, options = {}) {
  const db = openDatabase(options.filename || ':memory:');
  let currentTime = new Date('2026-11-23T12:00:00.000Z');
  const appOptions = { ...options }; delete appOptions.filename;
  const server = createApp({ db, sessionSecret: 'email-login-test-secret', now: () => currentTime,
    analyzer: async description => ({ category: 'general', summary: description, possibleSafetyRisk: false, riskEvidence: null, needsReview: false }),
    ...appOptions }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(route, method = 'GET', body, cookie = '') {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0],
      setCookie: response.headers.get('set-cookie'), headers: response.headers };
  }
  return { db, request, advance(ms) { currentTime = new Date(currentTime.getTime() + ms); } };
}

test('student login trims and lowercases email, creates a student, and starts the shared session', async t => {
  const { db, request } = await setup(t);
  const login = await request('/api/auth/student/login', 'POST', { email: '  STU@IIITL.AC.IN  ' });
  assert.equal(login.status, 200);
  assert.deepEqual(login.body.student, { email: 'stu@iiitl.ac.in' });
  assert.match(login.setCookie, /HttpOnly/); assert.match(login.setCookie, /SameSite=Lax/);
  const cookieValue = login.cookie.split('=')[1].split('.')[0];
  const session = JSON.parse(Buffer.from(cookieValue, 'base64url').toString());
  assert.deepEqual({ role: session.role, studentId: session.studentId }, { role: 'student', studentId: 1 });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM students').get().n, 1);
  const again = await request('/api/auth/student/login', 'POST', { email: 'stu@iiitl.ac.in' });
  assert.equal(again.status, 200); assert.equal(db.prepare('SELECT COUNT(*) AS n FROM students').get().n, 1);
  assert.deepEqual((await request('/api/auth/student/me', 'GET', undefined, login.cookie)).body, { student: { email: 'stu@iiitl.ac.in' } });
});

test('student login rejects malformed email and non-college domains', async t => {
  const { request, db, advance } = await setup(t);
  const invalidEmails = [null, '', '   ', '@iiitl.ac.in', 'name@other.edu', 'name@iiitl.ac.in.evil',
    'name..part@iiitl.ac.in', '.name@iiitl.ac.in', 'name.@iiitl.ac.in', 'name with space@iiitl.ac.in',
    `${'a'.repeat(65)}@iiitl.ac.in`, `${'a'.repeat(250)}@iiitl.ac.in`];
  for (const [index, email] of invalidEmails.entries()) {
    if (index === 10) advance(60_001);
    assert.equal((await request('/api/auth/student/login', 'POST', { email })).status, 400, String(email));
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM students').get().n, 0);
});

test('student login is limited to ten attempts per IP per minute', async t => {
  const { request, advance } = await setup(t);
  for (let i = 0; i < 10; i++) assert.equal((await request('/api/auth/student/login', 'POST', { email: 'not-an-email' })).status, 400);
  const limited = await request('/api/auth/student/login', 'POST', { email: 'next@iiitl.ac.in' });
  assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '60');
  assert.match(limited.body.error, /Too many login attempts/);
  advance(60_001);
  assert.equal((await request('/api/auth/student/login', 'POST', { email: 'next@iiitl.ac.in' })).status, 200);
});

test('complaints require a session and keep student email out of analyzer and queue', async t => {
  let analyzed;
  const { db, request } = await setup(t, { withStudent: false, analyzer: async description => {
    analyzed = description;
    return { category: 'general', summary: description, possibleSafetyRisk: false, riskEvidence: null, needsReview: false };
  } });
  const complaint = { description: 'Broken fan', location: 'Hall' };
  assert.equal((await request('/complaints', 'POST', complaint)).status, 401);
  const login = await request('/api/auth/student/login', 'POST', { email: 'private@iiitl.ac.in' });
  assert.equal(login.status, 200);
  const created = await request('/complaints', 'POST', complaint, login.cookie);
  assert.equal(created.status, 201); assert.equal(analyzed, complaint.description);
  assert.equal(JSON.stringify(created.body).includes('private@iiitl.ac.in'), false);
  assert.equal(db.prepare('SELECT student_id FROM complaints').get().student_id, db.prepare('SELECT id FROM students WHERE email = ?').get('private@iiitl.ac.in').id);
  const queue = await request('/complaints'); assert.equal(JSON.stringify(queue.body).includes('private@iiitl.ac.in'), false);
  const loggedOut = await request('/api/auth/student/logout', 'POST', {}, login.cookie);
  assert.equal((await request('/api/auth/student/me', 'GET', undefined, loggedOut.cookie)).status, 401);
  assert.equal((await request('/complaints', 'POST', complaint, loggedOut.cookie)).status, 401);
});

test('migration preserves existing database data and removes obsolete OTP storage', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'campustriage-email-login-migration-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'legacy.sqlite');
  const first = openDatabase(filename);
  first.exec('CREATE TABLE otp_codes (email TEXT, code_hash TEXT)');
  first.prepare('INSERT INTO students (email, created_at) VALUES (?, ?)').run('legacy@iiitl.ac.in', '2026-11-23T12:00:00.000Z');
  first.close();
  const migrated = openDatabase(filename);
  try {
    assert.equal(migrated.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='otp_codes'").get(), undefined);
    assert.equal(migrated.prepare('SELECT email FROM students').get().email, 'legacy@iiitl.ac.in');
    assert.ok(migrated.prepare('PRAGMA table_info(complaints)').all().some(column => column.name === 'student_id'));
  } finally { migrated.close(); }
});
