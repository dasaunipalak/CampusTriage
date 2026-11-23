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
  return db;
}

function toComplaint(row) {
  if (!row) return null;
  const analysis = row.analysis === null ? null : JSON.parse(row.analysis);
  const needsReview = row.analysis_status === 'failed'
    || analysis?.needsReview === true || analysis?.possibleSafetyRisk === true;
  return {
    id: row.id, description: row.description, location: row.location,
    analysis, analysisStatus: row.analysis_status,
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
    (description, location, analysis, analysis_status, created_at, severity, urgency, impact, scoring_source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    complaint.description, complaint.location,
    complaint.analysis === null ? null : JSON.stringify(complaint.analysis),
    complaint.analysisStatus, complaint.createdAt,
    complaint.severity, complaint.urgency, complaint.impact, complaint.scoringSource,
  );
  return toComplaint(db.prepare('SELECT * FROM complaints WHERE id = ?').get(result.lastInsertRowid));
}

module.exports = { openDatabase, insertComplaint, toComplaint, DEFAULT_DB_PATH };
