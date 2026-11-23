const { openDatabase, insertComplaint } = require('../src/database');
const { analyzeComplaint } = require('../src/analyzer');

async function seed(db, referenceTime) {
  if (!Number.isFinite(new Date(referenceTime).getTime())) throw new Error('Invalid seed reference time');
  const fixtures = [
    { description: 'Classroom projector is not working.', location: 'Block A, Room 102',
      hoursAgo: 6, severity: 3, urgency: 4, impact: 8 },
    { description: 'Library reading room fan is not working.', location: 'Library, Room 2',
      hoursAgo: 48, severity: 2, urgency: 2, impact: 4 },
    { description: 'socket mein paani ja raha hai', location: 'Hostel washroom',
      hoursAgo: 1, severity: 9, urgency: 10, impact: 7 },
  ];
  // Only seed an empty DB: never erase existing complaints or duplicate demo rows.
  if (db.prepare('SELECT COUNT(*) AS count FROM complaints').get().count !== 0) {
    throw new Error('Demo seeding requires an empty database; use a fresh DB_PATH.');
  }
  const prepared = await Promise.all(fixtures.map(async fixture => ({
    ...fixture, analysis: await analyzeComplaint(fixture.description), analysisStatus: 'succeeded',
    createdAt: new Date(new Date(referenceTime).getTime() - fixture.hoursAgo * 3_600_000).toISOString(),
    scoringSource: 'demo-fixture',
  })));
  db.exec('BEGIN');
  try {
    const complaints = prepared.map(complaint => insertComplaint(db, complaint));
    db.exec('COMMIT');
    return complaints;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

if (require.main === module) {
  const db = openDatabase(process.env.DB_PATH);
  const referenceTime = process.env.SEED_NOW ?? new Date().toISOString();
  seed(db, referenceTime).then(() => console.log(`Seeded 3 complaints relative to ${referenceTime}`))
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => db.close());
}

module.exports = { seed };
