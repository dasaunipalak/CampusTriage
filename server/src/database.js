const { DatabaseSync } = require('node:sqlite');
const { mkdirSync } = require('node:fs');
const path = require('node:path');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'campus-triage.sqlite');

function openDatabase(filename = DEFAULT_DB_PATH) {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      location TEXT NOT NULL,
      analysis TEXT,
      analysis_status TEXT NOT NULL CHECK (analysis_status IN ('succeeded', 'failed')),
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
      resolved_at TEXT,
      severity REAL NOT NULL CHECK (severity BETWEEN 0 AND 10),
      urgency REAL NOT NULL CHECK (urgency BETWEEN 0 AND 10),
      impact REAL NOT NULL CHECK (impact BETWEEN 0 AND 10),
      scoring_source TEXT NOT NULL
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
  `);
  // Existing milestone databases contain mock analysis. Preserve it and its provenance.
  if (!db.prepare('PRAGMA table_info(complaints)').all().some(column => column.name === 'analysis_mode')) {
    db.exec("ALTER TABLE complaints ADD COLUMN analysis_mode TEXT NOT NULL DEFAULT 'legacy-mock'");
  }
  if (!db.prepare('PRAGMA table_info(complaints)').all().some(column => column.name === 'student_id')) {
    db.exec('ALTER TABLE complaints ADD COLUMN student_id INTEGER REFERENCES students(id)');
  }
  // Remove OTP records left by the previous login flow; they are no longer used.
  db.exec('DROP TABLE IF EXISTS otp_codes');
  return db;
}

function toComplaint(row) {
  if (!row) return null;
  const analysis = row.analysis === null ? null : JSON.parse(row.analysis);
  const needsReview = row.analysis_status === 'failed'
    || analysis?.needsReview === true || analysis?.possibleSafetyRisk === true;
  return {
    id: row.id, description: row.description, location: row.location,
    analysis, analysisStatus: row.analysis_status, analysisMode: row.analysis_mode,
    analysisError: row.analysis_status === 'failed'
      ? 'Analysis unavailable or invalid; manual review required.' : null,
    needsReview, reviewStatus: needsReview ? 'required' : 'not_required',
    createdAt: row.created_at, status: row.status, resolvedAt: row.resolved_at,
    severity: row.severity, urgency: row.urgency, impact: row.impact,
    scoringSource: row.scoring_source,
  };
}

function insertComplaint(db, complaint) {
  const result = db.prepare(`INSERT INTO complaints
    (description, location, analysis, analysis_status, created_at, severity, urgency, impact, scoring_source, analysis_mode, student_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    complaint.description, complaint.location,
    complaint.analysis === null ? null : JSON.stringify(complaint.analysis),
    complaint.analysisStatus, complaint.createdAt,
    complaint.severity, complaint.urgency, complaint.impact, complaint.scoringSource, complaint.analysisMode ?? 'mock', complaint.studentId ?? null,
  );
  return toComplaint(db.prepare('SELECT * FROM complaints WHERE id = ?').get(result.lastInsertRowid));
}

module.exports = { openDatabase, insertComplaint, toComplaint, DEFAULT_DB_PATH };
