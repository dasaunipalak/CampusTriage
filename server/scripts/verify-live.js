const { createAnalyzer, isValidAnalysis } = require('../src/analyzer');
async function main() {
  const analyzer = createAnalyzer({ env: { ...process.env, ANALYZER_MODE: 'openai' } });
  const status = analyzer.getStatus();
  if (!status.ready) {
    console.error(`Live AI UNVERIFIED. Add ${status.missingSettings.join(' and ')} to server/.env.`);
    process.exitCode = 1;
    return;
  }
  const description = 'Fictional demo: washroom ke socket mein paani ja raha hai.';
  const analysis = await analyzer(description);
  if (!isValidAnalysis(analysis, description)) throw new Error('Invalid analysis');
  console.log(JSON.stringify({ liveAI: 'verified', provider: 'openai', model: status.model, description, analysis }, null, 2));
}
main().catch(() => { console.error('Live AI UNVERIFIED: request failed, timed out, or returned invalid output. Check credentials, model access and networking.'); process.exitCode = 1; });
