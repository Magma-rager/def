// Renders public/app-icon.svg to the opaque 1024x1024 PNG used as the iOS App Store icon.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const svg = fs.readFileSync('public/app-icon.svg', 'utf8');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
const font = fs.readdirSync('public/fonts').find((f) => f.startsWith('bigshoulders'));
const face = `@font-face{font-family:'Big Shoulders Display';font-weight:700 900;src:url(data:font/woff2;base64,${fs.readFileSync('public/fonts/' + font).toString('base64')}) format('woff2')}`;
await p.setContent(`<html><head><style>${face}</style></head><body style="margin:0;background:#140a10">${svg.replace('<svg ', '<svg width="1024" height="1024" ')}</body></html>`);
await p.evaluate(() => document.fonts.load('900 300px "Big Shoulders Display"'));
await p.screenshot({ path: 'public/app-icon-1024.png', omitBackground: false, clip: { x: 0, y: 0, width: 1024, height: 1024 } });
await b.close();
console.log('public/app-icon-1024.png');
