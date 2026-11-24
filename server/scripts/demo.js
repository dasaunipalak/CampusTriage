const { openDatabase } = require('../src/database');
const { createApp } = require('../src/app');
const { mockAnalyzeComplaint } = require('../src/analyzer');
const { seed } = require('./seed');
const path = require('node:path');

async function main() {
  const now = new Date('2026-11-24T12:00:00.000Z');
  const db = openDatabase(process.env.DB_PATH || path.join(__dirname, '../data/demo.sqlite'));
  if (!db.prepare('SELECT COUNT(*) AS n FROM complaints').get().n) await seed(db, now);
  const server = createApp({ db, analyzer: mockAnalyzeComplaint, now: () => now, demo: true })
    .listen(Number(process.env.PORT || 3001), '127.0.0.1', () => {
      console.log(`MOCK SIMULATION ONLY · frozen clock ${now.toISOString()}`);
      console.log(`CampusTriage demo: http://localhost:${server.address().port}`);
    });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => db.close()));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
