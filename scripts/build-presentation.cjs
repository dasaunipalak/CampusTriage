const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

async function main() {
  const root = path.join(__dirname, '..');
  const docs = path.join(root, 'docs');
  const browserResult = JSON.parse(fs.readFileSync(path.join(docs, 'browser-results.json'), 'utf8'));
  const simulation = JSON.parse(fs.readFileSync(path.join(docs, 'simulation-results.json'), 'utf8'));
  const tests = fs.readFileSync(path.join(docs, 'backend-test-results.txt'), 'utf8');
  const count = tests.match(/(?:ℹ |# )?pass (\d+)/)?.[1];
  if (!count) throw new Error('Record successful backend test output in docs/backend-test-results.txt first.');
  assert.match(tests, /fail 0/);
  assert.deepEqual(simulation.rankedAt48Hours, [3, 1, 2]);
  const image = name => 'data:image/png;base64,' + fs.readFileSync(path.join(docs, 'screenshots', name)).toString('base64');
  const slides = [
    `<section class="slide cover"><p class="kicker">SOFTWARE ENGINEERING / 25 NOVEMBER 2026</p><h1>CampusTriage</h1><p class="subtitle">Maintenance reports need<br>more than arrival order.</p><div class="core"><p>A student describes a possible electrical danger.<br>Older routine reports already fill the queue.</p><p><strong>Core problem:</strong> FIFO gives every report the same priority signal.</p></div><p class="disclosure">Local classroom prototype · fictional complaint data</p></section>`,
    `<section class="slide"><p class="kicker">WORKFLOW AND WORKING DEMO</p><h2>A report becomes an explained queue position</h2><p class="workflow">Student description + location / Structured analysis / Ranked admin queue / Resolve</p><img class="hazard" src="${image('hazard-card.png')}" alt="Actual mock-demo screenshot: the later Hinglish wet-socket ticket ranks first with original text, exact evidence, required review and an explanation."><p class="caption">Actual browser demo: later hazard #2 ranks first, earlier routine #1 ranks second.<br>Mock analysis is explicit. Original wording and evidence stay visible.</p></section>`,
    `<section class="slide"><p class="kicker">DESIGN CHOICES AND SOFTWARE ENGINEERING</p><h2>Language extraction, deterministic policy</h2><div class="two"><div><h3>Why this approach</h3><p>React separates student reporting from admin review.</p><p>Express + SQLite keep the local demo small and persistent.</p><p>A replaceable LLM adapter extracts meaning. The backend owns queue policy.</p></div><div><h3>Engineering makes it inspectable</h3><p>The five-field analyzer contract validates exact evidence quotes.</p><p>Pure ranking and an injected clock test the 48-hour boundary.</p><p>Adapter deadlines preserve reports for manual review after AI failure.</p></div></div><p class="bottom">Requirements traceability connects each implemented behaviour to acceptance checks.</p></section>`,
    `<section class="slide"><p class="kicker">FIFO COMPARISON / VERIFIED RESULTS</p><h2>The same fictional reports, a different order</h2><table><thead><tr><th>Ticket</th><th>FIFO</th><th>Just before 48h</th><th>At exactly 48h</th></tr></thead><tbody><tr><td>#1 Older fan report</td><td>1</td><td>3</td><td>2</td></tr><tr><td>#2 Projector report</td><td>2</td><td>2</td><td>3</td></tr><tr><td>#3 Possible electrical hazard</td><td>3</td><td>1</td><td>1</td></tr></tbody></table><p class="simulation">SIMULATION · mock extraction + synthetic factors · reference 24 Nov 2026, 12:00 UTC</p><p class="results"><strong>${count} backend tests passed</strong> · ${browserResult.checksPassed} browser checks passed · React build passed</p><p class="caption">The UI verified evidence, resolution, exact-boundary promotion and timeout fallback.<br>These results demonstrate policy behaviour, not real response-time gains or AI accuracy.</p></section>`,
    `<section class="slide"><p class="kicker">DISTINCTIVE BEHAVIOUR AND PROTOTYPE LIMITS</p><h2>Evidence for review, with explicit uncertainty</h2><div class="two"><div><h3>What is distinctive</h3><p>Original language stays beside an exact evidence quote.</p><p>Possible hazards and long waits override a numeric score.</p><p>Failed AI analysis stays visible as unknown risk requiring human review.</p></div><div><h3>What remains limited</h3><p><strong>Live AI unverified:</strong> add OPENAI_API_KEY and OPENAI_MODEL, then run verification.</p><p>Severity, urgency and impact default to 5/10. Fixture factors are synthetic.</p><p>No authentication, real accuracy evaluation or public deployment.</p></div></div><p class="bottom">A working local workflow with documented limits. Human review remains essential.</p></section>`,
  ];
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CampusTriage — five-slide submission presentation</title><style>
*{box-sizing:border-box}html,body{margin:0;background:#122b22;color:#193b2c;font-family:Arial,sans-serif}body{padding:28px 0 70px}.slide{position:relative;width:1280px;height:720px;padding:52px 72px 62px;background:#f5f8f5;margin:0 auto 30px;overflow:hidden;break-after:page}.slide:after{content:'CampusTriage / Software Engineering';position:absolute;bottom:22px;left:72px;font-size:13px;letter-spacing:1px;color:#6c8171}.slide:before{content:attr(data-number) ' / 5';position:absolute;bottom:22px;right:72px;font-size:14px;color:#6c8171}.kicker{margin:0 0 23px;font-size:14px;letter-spacing:3px;font-weight:bold;color:#50785e}h1{font-family:Georgia,serif;font-size:80px;font-weight:400;letter-spacing:-3px;margin:26px 0 20px}h2{font-family:Georgia,serif;font-size:44px;line-height:1.13;letter-spacing:-1px;font-weight:400;margin:0 0 25px}h3{font-size:24px;color:#286245;font-weight:600;margin:0 0 22px}p{font-size:24px;line-height:1.4;margin:0 0 22px}.cover{background:#193e2d;color:white}.cover .kicker,.cover:after,.cover:before{color:#a7c3ae}.subtitle{font-family:Georgia,serif;font-size:42px;line-height:1.2;color:#dbeadd;margin-bottom:35px}.core p{font-size:23px;max-width:940px;color:#d2e2d7;margin-bottom:20px}.disclosure{font-size:16px;color:#a7c3ae;position:absolute;bottom:55px;margin:0}.workflow{font-size:20px;color:#53715b;margin-bottom:22px}.hazard{display:block;width:1100px;height:389px;object-fit:contain;object-position:left top;margin:0}.caption{font-size:19px;color:#5f7867;line-height:1.35;margin-top:17px}.two{display:grid;grid-template-columns:1fr 1fr;gap:70px;margin-top:45px}.two p{font-size:23px;line-height:1.45;margin-bottom:24px}.bottom{font-size:21px;color:#4d7057;position:absolute;left:72px;right:72px;bottom:65px;margin:0}.simulation{font-size:16px;color:#7e6231;margin:18px 0 32px}.results{font-size:25px;color:#28563b;margin:0 0 25px}table{border-collapse:collapse;width:100%;font-size:24px;margin-top:28px}th{text-align:left;font-size:18px;font-weight:600;color:#54725d;padding:14px 12px;border-bottom:2px solid #abc4b1}td{padding:21px 12px;border-bottom:1px solid #cfdcd2}th:not(:first-child),td:not(:first-child){text-align:center}tbody tr:last-child{color:#8c502a}nav{position:relative;width:max-content;margin:18px auto;bottom:auto;left:auto;transform:none;background:#fff;padding:9px 15px;border-radius:10px;display:flex;gap:18px;align-items:center;font-size:14px;box-shadow:0 3px 25px #0004}nav button{background:#234e38;color:#fff;border:0;padding:8px 18px;border-radius:5px;font-size:14px;cursor:pointer}nav a{color:#234e38}body.presenting .slide{display:none}body.presenting .slide.active{display:block;margin-top:0}body.presenting{padding-top:0}button:focus-visible,a:focus-visible{outline:3px solid #c38a32;outline-offset:3px}@page{size:1280px 720px;margin:0}@media print{html,body{background:white;padding:0}.slide,body.presenting .slide{display:block!important;margin:0;box-shadow:none}.slide:last-of-type{break-after:auto}nav{display:none}}@media screen and (max-width:1280px){.slide{transform-origin:top left;zoom:calc(100vw / 1280px)}}
</style></head><body>${slides.map((slide, i) => slide.replace('class="slide', `data-number="${i + 1}" class="slide`)).join('')}<nav aria-label="Presentation controls"><button id="previous">Previous</button><span id="counter">1 / 5</span><button id="next">Next</button><button id="all">All slides</button><a href="presentation.pdf">PDF copy</a></nav><script>
const slides=[...document.querySelectorAll('.slide')];let current=0;function show(i){current=Math.max(0,Math.min(4,i));document.body.classList.add('presenting');slides.forEach((s,j)=>s.classList.toggle('active',j===current));document.querySelector('#counter').textContent=(current+1)+' / 5';window.scrollTo(0,0)}document.querySelector('#previous').onclick=()=>show(current-1);document.querySelector('#next').onclick=()=>show(current+1);document.querySelector('#all').onclick=()=>document.body.classList.remove('presenting');window.onkeydown=e=>{if(e.key==='ArrowRight'||e.key==='PageDown'){e.preventDefault();show(current+1)}if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();show(current-1)}if(e.key==='Escape')document.body.classList.remove('presenting')};show(0);
</script></body></html>`;
  fs.writeFileSync(path.join(docs, 'presentation.html'), html);
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(pathToFileURL(path.join(docs, 'presentation.html')).href);
    await page.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
    const renderDir = path.join(root, '.submission-build/slides');
    fs.mkdirSync(renderDir, { recursive: true });
    for (let i = 0; i < 5; i++) {
      if (i) await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.locator('.slide.active').screenshot({ path: path.join(renderDir, `slide-${i + 1}.png`) });
    }
    await page.pdf({ path: path.join(docs, 'presentation.pdf'), printBackground: true, preferCSSPageSize: true,
      displayHeaderFooter: false, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
    assert.equal(await page.locator('.slide').count(), 5);
    // Check authored content geometry at full size; screenshots still need visual inspection.
    const overflow = await page.evaluate(() => {
      document.body.classList.remove('presenting');
      const issues=[];
      for (const slide of document.querySelectorAll('.slide')) {
        const rect=slide.getBoundingClientRect();
        for (const el of slide.querySelectorAll('h1,h2,h3,p,table,img')) {
          const r=el.getBoundingClientRect();
          if(r.bottom>rect.bottom-40 || r.right>rect.right-30) issues.push({slide:slide.dataset.number,text:el.textContent.slice(0,70)});
        }
      }
      return issues;
    });
    assert.deepEqual(overflow, [], 'Slide contents overflow');
    console.log('Created docs/presentation.html and docs/presentation.pdf; 5 slides. Review renders in .submission-build/slides/.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
