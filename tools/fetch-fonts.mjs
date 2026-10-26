// One-time helper: downloads the latin woff2 subsets of the game's Google Fonts into public/fonts
// and writes public/fonts/fonts.css pointing at the local files (the build inlines them).
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const URL_CSS = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&family=Big+Shoulders+Display:wght@700;800;900&family=Spectral:ital,wght@0,400;0,600;1,400&display=swap';
const css = await (await fetch(URL_CSS, { headers: { 'User-Agent': UA } })).text();
const blocks = css.split('/* ').slice(1).filter((b) => b.startsWith('latin */'));
fs.mkdirSync('public/fonts', { recursive: true });
const out = [];
const files = new Map();
for (const b of blocks) {
  const face = b.slice(b.indexOf('@font-face'));
  const src = face.match(/url\((https:[^)]+)\)/)[1];
  let name = files.get(src);
  if (!name) {
    name = src.split('/').slice(-3).join('-');
    fs.writeFileSync(`public/fonts/${name}`, Buffer.from(await (await fetch(src)).arrayBuffer()));
    files.set(src, name);
  }
  out.push(face.replace(src, name).trim());
}
fs.writeFileSync('public/fonts/fonts.css', out.join('\n') + '\n');
console.log(`${out.length} faces, ${files.size} files`);
