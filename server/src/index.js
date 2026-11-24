const { createApp } = require('./app');
const { openDatabase } = require('./database');
const { createAnalyzer } = require('./analyzer');

const db = openDatabase(process.env.DB_PATH);
const port = Number(process.env.PORT || 3001);
const analyzer = createAnalyzer();
const server = createApp({ db, analyzer }).listen(port, '127.0.0.1', () => {
  console.log(`CampusTriage API listening on http://localhost:${server.address().port}`);
  console.log('Analysis configuration:', JSON.stringify(analyzer.getStatus()));
});
function shutdown() {
  server.close(() => { db.close(); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
