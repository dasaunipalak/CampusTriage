// End-to-end simulation: real React build + HTTP API + SQLite + explicit mock/stubbed AI.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('../server/src/app');
const { openDatabase, insertComplaint } = require('../server/src/database');
const { createAnalyzer, mockAnalyzeComplaint } = require('../server/src/analyzer');
const { AFTER, BEFORE, fixtures } = require('../server/scripts/scenario');

async function main() {
  if (!fs.existsSync(path.join(__dirname, '../client/dist/index.html'))) throw new Error('Run npm run build first.');
  const shots = path.join(__dirname, '../docs/screenshots');
  fs.mkdirSync(shots, { recursive: true });
  const checks = [];
  const pageErrors = [];
  const servers = [];
  let browser;
  async function serve(options) {
    const db = openDatabase(':memory:');
    const codes = [];
    const emailSender = { async sendOtp(email, code) { codes.push({ email, code }); } };
    const server = createApp({ db, demo: true, emailSender, sessionSecret: 'browser-test-secret', ...options }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    servers.push({ server, db });
    return { db, codes, url: `http://127.0.0.1:${server.address().port}` };
  }
  const record = message => { checks.push(message); console.log(`PASS: ${message}`); };
  async function submit(page, description, location) {
    await page.getByRole('link', { name: 'Student report', exact: true }).click();
    await page.getByLabel('Describe the issue').fill(description);
    await page.getByLabel('Where is it?').fill(location);
    await page.getByRole('button', { name: 'Submit complaint', exact: true }).click();
    await page.getByText(/Complaint #\d+ received/).waitFor();
  }
  async function signIn(page, app, email = 'browser@iiitl.ac.in') {
    await page.getByLabel('College email').fill(email);
    await page.getByRole('button', { name: 'Send code', exact: true }).click();
    await page.getByLabel('One-time code').waitFor();
    await page.getByLabel('One-time code').fill(app.codes.at(-1).code);
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await page.getByLabel('Describe the issue').waitFor();
  }
  const ids = page => page.locator('.ticket').evaluateAll(nodes => nodes.map(n => Number(n.dataset.testid.replace('ticket-', ''))));
  async function waitOrder(page, expected) {
    await page.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('.ticket')]
      .map(n => Number(n.dataset.testid.replace('ticket-', '')))) === JSON.stringify(expected), expected);
  }
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    page.on('pageerror', error => pageErrors.push(error.message));
    let clock = new Date(AFTER);
    const app = await serve({ analyzer: createAnalyzer({ env: { ANALYZER_MODE: 'mock' } }), now: () => clock });
    await page.goto(app.url);
    await page.getByText('Mock demo · deterministic simulation', { exact: true }).waitFor();
    await signIn(page, app);
    await page.getByLabel('Describe the issue').fill('The classroom projector is not working.');
    await page.getByLabel('Where is it?').fill('Fictional Block A, Room 102');
    await page.screenshot({ path: path.join(shots, 'student.png'), fullPage: true });
    await page.getByRole('button', { name: 'Submit complaint', exact: true }).click();
    await page.getByText('Complaint #1 received', { exact: true }).waitFor();
    assert.equal(app.db.prepare('SELECT student_id FROM complaints').get().student_id > 0, true);
    record('Student OTP login then submits a routine complaint; confirmation appears and student id is saved.');
    clock = new Date(Date.parse(AFTER) + 1000);
    await submit(page, 'washroom ke socket mein paani ja raha hai', 'Fictional hostel washroom');
    await page.getByRole('link', { name: 'Admin queue', exact: true }).click();
    await waitOrder(page, [2, 1]);
    assert.equal(await page.locator('.ticket').first().locator('q').textContent(), 'washroom ke socket mein paani ja raha hai');
    assert.match(await page.locator('.ticket').first().innerText(), /Review: required/);
    await page.screenshot({ path: path.join(shots, 'admin.png'), fullPage: true });
    await page.locator('.ticket').first().screenshot({ path: path.join(shots, 'hazard-card.png') });
    record('Later Hinglish electrical hazard is rank 1, routine ticket rank 2; exact evidence and required review are visible.');
    await page.getByRole('button', { name: 'Resolve complaint 2', exact: true }).click();
    await page.getByText('Complaint #2 resolved.', { exact: true }).waitFor();
    await waitOrder(page, [1]);
    assert.equal(app.db.prepare('SELECT status FROM complaints WHERE id = 2').get().status, 'resolved');
    record('Resolve updates SQLite and refreshes the UI queue, removing the resolved hazard.');
    await page.route('**/complaints', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Simulated unavailable service"}' }));
    await page.getByRole('button', { name: 'Refresh queue', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Could not refresh' }).waitFor();
    record('Queue refresh failure displays an error and identifies stale results.');
    await page.unroute('**/complaints');
    await page.getByRole('button', { name: 'Refresh queue', exact: true }).click();
    await waitOrder(page, [1]);
    await page.getByRole('button', { name: 'Resolve complaint 1', exact: true }).click();
    await page.getByText('Nothing waiting right now.', { exact: true }).waitFor();
    record('Empty queue state appears after all complaints are resolved.');
    await page.getByRole('link', { name: 'Student report', exact: true }).click();
    await page.route('**/complaints', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Simulated submission error"}' }));
    await page.getByLabel('Describe the issue').fill('Fictional broken chair.');
    await page.getByLabel('Where is it?').fill('Fictional hall');
    await page.getByRole('button', { name: 'Submit complaint', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Simulated submission error' }).waitFor();
    assert.equal(await page.getByLabel('Describe the issue').inputValue(), 'Fictional broken chair.');
    await page.unroute('**/complaints');
    record('Failed student submission shows an error and retains the form for retry.');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(shots, 'student-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    record('Student screen fits a 390px mobile viewport without horizontal overflow.');
    await page.setViewportSize({ width: 1440, height: 1000 });

    // Controlled clock is injected only into this local test server; no public clock-change endpoint.
    clock = new Date(BEFORE);
    const scenario = await serve({ analyzer: mockAnalyzeComplaint, now: () => clock });
    for (const fixture of fixtures) insertComplaint(scenario.db, { ...fixture,
      analysis: await mockAnalyzeComplaint(fixture.description), analysisStatus: 'succeeded', analysisMode: 'mock', scoringSource: 'demo-fixture' });
    await page.goto(`${scenario.url}/#admin`);
    await waitOrder(page, [3, 2, 1]);
    const beforeOrder = await ids(page);
    clock = new Date(AFTER);
    await page.getByRole('button', { name: 'Refresh queue', exact: true }).click();
    await waitOrder(page, [3, 1, 2]);
    const afterOrder = await ids(page);
    await page.screenshot({ path: path.join(shots, 'boundary.png'), fullPage: true });
    record('Exact boundary: routine #1 moves from rank 3 at 47h59m59.999s to rank 2 at 48h; hazard stays rank 1.');
    assert.deepEqual(scenario.db.prepare('SELECT id FROM complaints ORDER BY created_at ASC, id ASC').all().map(c => c.id), [1, 2, 3]);
    record('Same-ticket simulation records FIFO [1,2,3], ranked before [3,2,1], ranked at 48h [3,1,2].');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(shots, 'admin-mobile.png'), fullPage: true });
    record('Admin queue fits a 390px mobile viewport without horizontal overflow.');
    await page.setViewportSize({ width: 1440, height: 1000 });

    const failing = createAnalyzer({ env: { OPENAI_API_KEY: 'test-placeholder', OPENAI_MODEL: 'test-model', AI_TIMEOUT_MS: '20' },
      fetchImpl: () => new Promise(() => {}) });
    const failApp = await serve({ analyzer: failing, now: () => new Date(AFTER) });
    await page.goto(failApp.url);
    await signIn(page, failApp, 'timeout@iiitl.ac.in');
    await submit(page, 'Water is entering a socket in the fictional washroom.', 'Fictional hostel');
    await page.getByText('AI analysis was unavailable. Your original complaint is saved.', { exact: true }).waitFor();
    await page.getByRole('link', { name: 'Admin queue', exact: true }).click();
    await waitOrder(page, [1]);
    await page.getByText('Unknown: AI analysis failed.', { exact: true }).waitFor();
    assert.equal((await page.locator('.ticket').innerText()).includes('Review: required'), true);
    assert.equal(failApp.db.prepare('SELECT analysis_status FROM complaints').get().analysis_status, 'failed');
    await page.screenshot({ path: path.join(shots, 'manual-review.png'), fullPage: true });
    await page.locator('.ticket').first().screenshot({ path: path.join(shots, 'manual-review-card.png') });
    record('Simulated provider timeout preserves original text and shows unknown risk, failed analysis and required manual review.');
    assert.deepEqual(pageErrors, []);
    record('No uncaught browser JavaScript errors during the complete flow.');
    const report = { label: 'SIMULATION: fictional data; mock AI and a stubbed provider timeout; no live OpenAI request',
      browser: await browser.version(), checksPassed: checks.length, checks,
      fifo: [1, 2, 3], rankedBefore48Hours: beforeOrder, rankedAt48Hours: afterOrder,
      liveAI: 'unverified: OPENAI_API_KEY and OPENAI_MODEL missing', screenshots: fs.readdirSync(shots).filter(f => f.endsWith('.png')) };
    fs.writeFileSync(path.join(__dirname, '../docs/browser-results.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(`BROWSER PASS: ${checks.length} checks; evidence in docs/browser-results.json and docs/screenshots/`);
  } finally {
    if (browser) await browser.close();
    for (const { server, db } of servers) { await new Promise(resolve => server.close(resolve)); db.close(); }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
