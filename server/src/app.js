const express = require('express');
const { createAnalyzer, isValidAnalysis } = require('./analyzer');
const path = require('node:path');
const { insertComplaint, toComplaint } = require('./database');
const { rankComplaints, PROVISIONAL_DEFAULTS } = require('./ranking');
const { mountStudentAuth } = require('./auth/routes');

function createApp({ db, analyzer = createAnalyzer(), now = () => new Date(), demo = false,
  sessionSecret = process.env.SESSION_SECRET,
  frontendDir = path.join(__dirname, '../../client/dist') }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  const { requireStudent } = mountStudentAuth(app, { db, now, sessionSecret });

  app.get('/api/status', (req, res) => {
    res.json({ analysis: analyzer.getStatus?.() ?? { mode: analyzer.mode ?? 'injected', ready: true,
      liveVerified: false, missingSettings: [] }, simulation: demo, referenceTime: now().toISOString() });
  });

  app.post('/complaints', requireStudent, async (req, res) => {
    const { description, location } = req.body ?? {};
    if (typeof description !== 'string' || !description.trim() || description.length > 5000
      || typeof location !== 'string' || !location.trim() || location.length > 200) {
      return res.status(400).json({ error: 'description (1–5000 characters) and location (1–200 characters) must be non-empty strings.' });
    }
    const referenceTime = now().toISOString();
    let analysis = null;
    let analysisStatus = 'failed';
    try {
      const result = await analyzer(description);
      if (isValidAnalysis(result, description)) {
        // Snapshot only the agreed contract fields before persistence.
        analysis = { category: result.category, summary: result.summary,
          possibleSafetyRisk: result.possibleSafetyRisk,
          riskEvidence: result.riskEvidence, needsReview: result.needsReview };
        analysisStatus = 'succeeded';
      }
    } catch {
      // Preserve the complaint even when the external analyzer fails.
    }
    const complaint = insertComplaint(db, { description, location, analysis, analysisStatus,
      analysisMode: analyzer.mode ?? 'injected', createdAt: referenceTime,
      studentId: req.student.studentId, ...PROVISIONAL_DEFAULTS, scoringSource: 'provisional-defaults' });
    res.status(201).json(rankComplaints([complaint], referenceTime)[0]);
  });

  app.get('/complaints', (req, res) => {
    const complaints = db.prepare("SELECT * FROM complaints WHERE status = 'pending'").all().map(toComplaint);
    res.json(rankComplaints(complaints, now()));
  });

  app.patch('/complaints/:id/resolve', (req, res) => {
    const id = Number(req.params.id);
    if (!/^\d+$/.test(req.params.id) || !Number.isSafeInteger(id) || id < 1) {
      return res.status(404).json({ error: 'Complaint not found.' });
    }
    const row = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Complaint not found.' });
    if (row.status !== 'resolved') {
      db.prepare("UPDATE complaints SET status = 'resolved', resolved_at = ? WHERE id = ?")
        .run(now().toISOString(), id);
    }
    res.json(rankComplaints([toComplaint(db.prepare('SELECT * FROM complaints WHERE id = ?').get(id))], now())[0]);
  });

  app.use(express.static(frontendDir));
  app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));
  app.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large.' });
    console.error(error);
    res.status(500).json({ error: 'Internal server error.' });
  });
  return app;
}

module.exports = { createApp };
