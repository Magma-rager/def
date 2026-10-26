// Usage: node tools/shot.mjs <url> <out.png> [width] [height]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [url, out, w = 1400, h = 900] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: +w, height: +h } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(url);
await p.waitForTimeout(800);
await p.screenshot({ path: out });
if (errs.length) console.log('ERRORS:', errs.join('\n'));
await b.close();
