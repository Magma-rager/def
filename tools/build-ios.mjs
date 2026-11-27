// Assembles the iPad/iPhone app project: copies the ios/ template, adds the App Store icon and the
// single-file game page, then zips it as dist/ios/SignalBreak.swiftpm.zip for Swift Playgrounds.
// Run after `npm run build`.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const SRC = 'ios/SignalBreak.swiftpm';
const OUT_DIR = 'dist/ios';
const OUT = `${OUT_DIR}/SignalBreak.swiftpm`;
if (!fs.existsSync('dist/app.html')) throw new Error('dist/app.html missing: run `npm run build` first');
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.cpSync(SRC, OUT, { recursive: true, filter: (p) => !p.endsWith('README.txt') });
fs.copyFileSync('public/app-icon-1024.png', `${OUT}/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png`);
fs.copyFileSync('dist/app.html', `${OUT}/Resources/game.html`);
const stamp = new Date('2000-01-01T00:00:00Z');
const files = fs.readdirSync(OUT, { recursive: true }).sort()
  .map((p)=>path.join('SignalBreak.swiftpm',p)).filter((p)=>fs.statSync(path.join(OUT_DIR,p)).isFile());
for (const file of files) fs.utimesSync(path.join(OUT_DIR,file),stamp,stamp);
execFileSync('zip', ['-Xq', 'SignalBreak.swiftpm.zip', '-@'], { cwd: OUT_DIR,
  input:files.join('\n')+'\n',env:{...process.env,TZ:'UTC'} });
const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0) + ' KB';
console.log(`${OUT}/ and ${OUT_DIR}/SignalBreak.swiftpm.zip (${kb(`${OUT_DIR}/SignalBreak.swiftpm.zip`)})`);
