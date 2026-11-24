// Open the real PPTX in installed macOS Keynote and render all slides for review.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const q = value => '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

function main() {
  const root = path.join(__dirname, '..');
  const file = path.join(root, 'docs/CampusTriage.pptx');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'campustriage-pptx-review-'));
  fs.copyFileSync(file, path.join(work, 'review.pptx'));
  const script = [
    'with timeout of 50 seconds', 'tell application "Keynote"',
    `set deck to open POSIX file ${q(path.join(work, 'review.pptx'))}`,
    'set slideCount to count of slides of deck', 'if slideCount is not 5 then error "Expected exactly five slides"',
    `export deck to POSIX file ${q(path.join(work, 'reopened.pdf'))} as PDF`,
    `export deck to POSIX file ${q(path.join(work, 'renders'))} as slide images with properties {image format:PNG}`,
    'close deck saving no', 'return version', 'end tell', 'end timeout',
  ].join('\n');
  const appleScript = path.join(work, 'verify.applescript');
  fs.writeFileSync(appleScript, script);
  const version = execFileSync('osascript', [appleScript], { encoding: 'utf8', timeout: 60000 }).trim();
  const previews = path.join(root, '.submission-build/pptx/rendered');
  fs.mkdirSync(previews, { recursive: true });
  const images = fs.readdirSync(path.join(work, 'renders')).filter(name => name.endsWith('.png')).sort();
  if (images.length !== 5) throw new Error('Expected five actual slide renders');
  images.forEach((name, index) => fs.copyFileSync(path.join(work, 'renders', name), path.join(previews, `slide-${index + 1}.png`)));
  fs.copyFileSync(path.join(work, 'reopened.pdf'), path.join(previews, 'reopened.pdf'));
  // Read the actual Office XML package independently of authoring data.
  const structure = JSON.parse(execFileSync('python3', ['-c', `
import zipfile,xml.etree.ElementTree as E,json,re,sys
n={'a':'http://schemas.openxmlformats.org/drawingml/2006/main','p':'http://schemas.openxmlformats.org/presentationml/2006/main'}
with zipfile.ZipFile(sys.argv[1]) as z:
 slides=sorted(name for name in z.namelist() if re.fullmatch(r'ppt/slides/slide\\d+\\.xml',name))
 assert len(slides)==5
 trees=[E.fromstring(z.read(name)) for name in slides]
 cells=[t.text for t in trees[3].findall('.//a:tbl//a:t',n)]
 assert cells==['Ticket','FIFO','Just before 48h','At exactly 48h','#1 Older fan report','1','3','2','#2 Projector report','2','2','3','#3 Possible electrical hazard','3','1','1'], cells
 assert '24 backend tests passed' in ''.join(t.text or '' for t in trees[3].findall('.//a:t',n))
 assert len(trees[1].findall('.//p:pic',n))>=2
 print(json.dumps({'slideCount':len(slides),'nativeComparisonTable':True,'simulationValuesVerified':True,'backendResultsPreserved':True,'uiScreenshotEmbedded':True,'editableTextBoxes':sum(len(t.findall('.//p:sp/p:txBody',n)) for t in trees)}))
`, file], { encoding: 'utf8' }));
  const receipt = { file: 'docs/CampusTriage.pptx', sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    ...structure, openedAndRenderedIn: `Keynote ${version}`, nativeSlideRenders: images.length,
    renderDirectory: '.submission-build/pptx/rendered',
    microsoftPowerPointApplicationTested: false,
    note: 'The actual PPTX was reopened and rendered in Keynote. Visual inspection is recorded separately in docs/VERIFICATION.md.' };
  fs.writeFileSync(path.join(root, 'docs/pptx-verification.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(`PPTX PASS: exactly 5 slides opened and rendered in Keynote ${version}; native table, results and screenshot checked.`);
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { main };
