// Native macOS Keynote fallback when the supplied presentation runtime is absent.
// Reads the existing HTML geometry; exports editable text and a native comparison table.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const q = value => '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '" & linefeed & "') + '"';
const rgb = color => '{' + (color.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(n => Math.round(Number(n) * 257)).join(', ') + '}';
async function main() {
  const root = path.join(__dirname, '..');
  const work = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'campustriage-pptx-'));
  fs.mkdirSync(path.join(root, '.submission-build/pptx'), {recursive:true});
  fs.writeFileSync(path.join(root, '.submission-build/pptx/work-path.txt'), work);
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const data = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(path.join(root, 'docs/presentation.html')).href);
    await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
    for (let i = 0; i < 5; i++) {
      await page.evaluate(i => {
        document.body.classList.add('presenting');
        document.querySelectorAll('.slide').forEach((s, j) => s.classList.toggle('active', i === j));
        window.scrollTo(0, 0);
      }, i);
      const slide = await page.locator('.slide.active').evaluate(s => {
        const rect = s.getBoundingClientRect();
        const lines = [];
        for (const element of s.querySelectorAll('h1,h2,h3,p')) {
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) {
            const style = getComputedStyle(node.parentElement);
            let line;
            for (let index = 0; index < node.textContent.length; index++) {
              const range = document.createRange(); range.setStart(node, index); range.setEnd(node, index + 1);
              const box = range.getBoundingClientRect();
              if (box.width < 0.01 || box.height < 0.01) continue;
              if (!line || Math.abs(line.y - (box.top - rect.top)) > 1) {
                line = { text: '', x: box.left - rect.left, y: box.top - rect.top, w: 0, h: box.height,
                  font: style.fontFamily.includes('Georgia') ? 'Georgia' : Number(style.fontWeight) >= 600 ? 'Arial-BoldMT' : 'ArialMT',
                  size: parseFloat(style.fontSize), spacing: parseFloat(style.letterSpacing) || 0, color: style.color };
                lines.push(line);
              }
              line.text += node.textContent[index]; line.w = box.right - rect.left - line.x;
            }
          }
        }
        const pseudo = getComputedStyle(s, '::after');
        lines.push({ text: 'CampusTriage / Software Engineering', x: 72, y: 681, w: 500, h: 20, font: 'ArialMT', size: 13, spacing: 1, color: pseudo.color });
        lines.push({ text: `${s.dataset.number} / 5`, x: 1170, y: 681, w: 45, h: 20, font: 'ArialMT', size: 14, color: getComputedStyle(s, '::before').color });
        const images = [...s.querySelectorAll('img')].map(image => {
          const r = image.getBoundingClientRect();
          return { source: image.src, x: r.left - rect.left, y: r.top - rect.top, w: r.width, h: r.height };
        });
        const table = s.querySelector('table');
        let tableData = null;
        if (table) {
          const r = table.getBoundingClientRect();
          tableData = { x: r.left - rect.left, y: r.top - rect.top, w: r.width, h: r.height,
            widths: [...table.rows[0].cells].map(c => c.getBoundingClientRect().width),
            heights: [...table.rows].map(r => r.getBoundingClientRect().height),
            rows: [...table.rows].map(row => [...row.cells].map(cell => cell.innerText)) };
        }
        return { lines, images, table: tableData, background: getComputedStyle(s).backgroundColor };
      });
      const style = await page.addStyleTag({ content: '.slide>*{visibility:hidden!important}.slide::before,.slide::after{visibility:hidden!important}' });
      slide.backgroundPath = path.join(work, `background-${i + 1}.png`);
      await page.locator('.slide.active').screenshot({ path: slide.backgroundPath });
      await style.evaluate(el => el.remove());
      for (let j = 0; j < slide.images.length; j++) {
        const img = slide.images[j];
        img.file = path.join(work, `image-${i + 1}-${j}.png`);
        fs.writeFileSync(img.file, Buffer.from(img.source.split(',')[1], 'base64'));
        delete img.source;
      }
      data.push(slide);
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(work, 'source.json'), JSON.stringify(data, null, 2));
  const code = [
    'with timeout of 50 seconds', 'tell application "Keynote"',
    'set deck to make new document with properties {document theme:theme "White", width:1280, height:720}',
    'tell deck',
  ];
  for (let i = 0; i < data.length; i++) {
    const slide = data[i];
    code.push(i === 0 ? 'set s to slide 1' : 'set s to make new slide with properties {base slide:master slide "Blank"}',
      'tell s', 'set title showing to false', 'set body showing to false',
      `make new image with properties {file:POSIX file ${q(slide.backgroundPath)}, position:{0,0}, width:1280, height:720}`,
      'set presenter notes to "Source: existing docs/presentation.html. Fictional simulation and mock AI. Native text and comparison table; actual UI screenshot."');
    for (let j = 0; j < slide.lines.length; j++) {
      const t = slide.lines[j];
      code.push(`set tx to make new text item with properties {object text:${q(t.text)}, position:{${t.x.toFixed(2)},${t.y.toFixed(2)}}, width:${Math.ceil(t.w + 20)}, height:${Math.ceil(t.h + 12)}}`,
        `set font of object text of tx to ${q(t.font)}`, `set size of object text of tx to ${t.size}`,
        `set color of object text of tx to ${rgb(t.color)}`);
    }
    for (const img of slide.images) code.push(`make new image with properties {file:POSIX file ${q(img.file)}, position:{${img.x},${img.y}}, width:${Math.round(img.w)}, height:${Math.round(img.h)}}`);
    if (slide.table) {
      const t = slide.table;
      code.push(`set tb to make new table with properties {row count:4, column count:4, header row count:1, header column count:0, position:{${t.x},${t.y}}, width:${Math.round(t.w)}, height:${Math.round(t.h)}}`,
        'tell tb', 'set font name of cell range to "Arial"', 'set font size of cell range to 24',
        `set background color of cell range to ${rgb(slide.background)}`, `set text color of cell range to ${rgb('rgb(25,59,44)')}`,
        'set vertical alignment of cell range to center', 'set alignment of cell range to center', 'set alignment of column 1 to left');
      t.widths.forEach((width, index) => code.push(`set width of column ${index + 1} to ${width}`));
      t.heights.forEach((height, index) => code.push(`set height of row ${index + 1} to ${height}`));
      t.rows.forEach((row, r) => row.forEach((value, c) => code.push(`set value of cell ${q(String.fromCharCode(65 + c) + (r + 1))} to ${q(value)}`)));
      code.push('set font size of row 1 to 18', `set text color of row 1 to ${rgb('rgb(84,114,93)')}`,
        `set text color of row 4 to ${rgb('rgb(140,80,42)')}`, 'end tell');
    }
    code.push('end tell');
  }
  code.push('end tell', `export deck to POSIX file ${q(path.join(work, 'native.pptx'))} as Microsoft PowerPoint`,
    'close deck saving no', 'end tell', 'end timeout');
  const appleScript = path.join(work, 'create.applescript');
  fs.writeFileSync(appleScript, code.join('\n'));
  console.log(execFileSync('osascript', [appleScript], { encoding: 'utf8', timeout: 60000 }));
  // Correct export text-box insets/spacing using the exact browser geometry.
  execFileSync('python3', [path.join(__dirname, 'finalize-pptx.py'), work], { stdio: 'inherit' });
  console.log('Created docs/CampusTriage.pptx using native Keynote export.');
  require('./verify-pptx.cjs').main();
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
