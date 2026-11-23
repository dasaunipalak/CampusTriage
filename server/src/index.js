const { createApp } = require('./app');
const { openDatabase } = require('./database');

const db = openDatabase(process.env.DB_PATH);
const port = Number(process.env.PORT ?? 3001);
const server = createApp({ db }).listen(port, () => {
  console.log(`CampusTriage API listening on http://localhost:${server.address().port}`);
});
function shutdown() {
  server.close(() => { db.close(); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
