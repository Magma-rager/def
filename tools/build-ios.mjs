// Assembles the iPad/iPhone app project: copies the ios/ template, adds the App Store icon and the
// single-file game page, then zips it as dist/ios/SignalBreak.swiftpm.zip for Swift Playgrounds.
// Run after `npm run build`.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const SRC = 'ios/SignalBreak.swiftpm';
const OUT_DIR = 'dist/ios';
const OUT = `${OUT_DIR}/SignalBreak.swiftpm`;
if (!fs.existsSync('dist/app.html')) throw new Error('dist/app.html missing: run `npm run build` first');
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.cpSync(SRC, OUT, { recursive: true, filter: (p) => !p.endsWith('README.txt') });
fs.copyFileSync('public/app-icon-1024.png', `${OUT}/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png`);
fs.copyFileSync('dist/app.html', `${OUT}/Resources/game.html`);
execFileSync('zip', ['-qr', 'SignalBreak.swiftpm.zip', 'SignalBreak.swiftpm'], { cwd: OUT_DIR });
const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0) + ' KB';
console.log(`${OUT}/ and ${OUT_DIR}/SignalBreak.swiftpm.zip (${kb(`${OUT_DIR}/SignalBreak.swiftpm.zip`)})`);
