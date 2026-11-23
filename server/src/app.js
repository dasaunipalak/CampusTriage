const express = require('express');
const { analyzeComplaint, isValidAnalysis } = require('./analyzer');
const { insertComplaint, toComplaint } = require('./database');
const { rankComplaints, PROVISIONAL_DEFAULTS } = require('./ranking');

function createApp({ db, analyzer = analyzeComplaint, now = () => new Date() }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.post('/complaints', async (req, res) => {
    const { description, location } = req.body ?? {};
    if (typeof description !== 'string' || !description.trim() || description.length > 5000
      || typeof location !== 'string' || !location.trim() || location.length > 200) {
      return res.status(400).json({ error: 'description (1–5000 characters) and location (1–200 characters) must be non-empty strings.' });
    }
    let analysis = null;
    let analysisStatus = 'failed';
    try {
      const result = await analyzer(description);
      if (isValidAnalysis(result)) {
        // Snapshot only the agreed contract fields before persistence.
        analysis = { category: result.category, summary: result.summary,
          possibleSafetyRisk: result.possibleSafetyRisk,
          riskEvidence: result.riskEvidence, needsReview: result.needsReview };
        analysisStatus = 'succeeded';
      }
    } catch {
      // Preserve the complaint even when the external analyzer fails.
    }
    const referenceTime = now().toISOString();
    const complaint = insertComplaint(db, { description, location, analysis, analysisStatus,
      createdAt: referenceTime, ...PROVISIONAL_DEFAULTS, scoringSource: 'provisional-defaults' });
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
