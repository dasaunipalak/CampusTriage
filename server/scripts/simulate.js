const { rankComplaints } = require('../src/ranking');
const { mockAnalyzeComplaint } = require('../src/analyzer');
const { AFTER, BEFORE, fixtures } = require('./scenario');
const fs = require('node:fs');
const path = require('node:path');
async function simulate() {
  const complaints = await Promise.all(fixtures.map(async c => ({ ...c,
    analysis: await mockAnalyzeComplaint(c.description), analysisMode: 'mock', scoringSource: 'demo-fixture' })));
  const fifo = [...complaints].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const before = rankComplaints(complaints, BEFORE);
  const after = rankComplaints(complaints, AFTER);
  const results = { label: 'SIMULATION: fictional tickets, mock analysis, synthetic factors',
    beforeTime: BEFORE, afterTime: AFTER, fifo: fifo.map(c => c.id),
    rankedBefore: before.map(c => c.id), rankedAt48Hours: after.map(c => c.id),
    positions: complaints.map(c => ({ id: c.id, description: c.description,
      fifoPosition: fifo.findIndex(x => x.id === c.id) + 1,
      rankedBeforePosition: before.findIndex(x => x.id === c.id) + 1,
      rankedAt48HoursPosition: after.findIndex(x => x.id === c.id) + 1,
      severity: c.severity, urgency: c.urgency, impact: c.impact,
      scoreAt48Hours: after.find(x => x.id === c.id).ranking.score,
      evidence: c.analysis.riskEvidence,
    })) };
  return results;
}
if (require.main === module) simulate().then(results => {
  const destination = path.join(__dirname, '../../docs/simulation-results.json');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(results, null, 2) + '\n');
  console.log(results.label);
  console.table(results.positions.map(({ id, fifoPosition, rankedBeforePosition, rankedAt48HoursPosition }) =>
    ({ id, FIFO: fifoPosition, 'Ranked at 47h59m59.999s': rankedBeforePosition, 'Ranked at 48h': rankedAt48HoursPosition })));
  console.log(`Recorded ${destination}`);
}).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { simulate };
