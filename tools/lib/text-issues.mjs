// Shared by tools/i18n-layout.mjs and tools/milestone.mjs. Passed to page.evaluate, so it must be
// self-contained (no closures over module scope).
// Runs in the page: text nodes clipped by an overflow:hidden/clip ancestor, outside the viewport, or
// cut by text-overflow: ellipsis, and card content pushed past the card frame.
export function findIssues() {
  const out = [];
  const vw = innerWidth, vh = innerHeight;
  const shown = (el) => {
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false;
    }
    return el.getClientRects().length > 0;
  };
  const path = (el) => {
    const parts = [];
    for (let a = el; a && a !== document.body && parts.length < 4; a = a.parentElement) {
      const cls = typeof a.className === 'string' && a.className.trim() ? '.' + a.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      parts.unshift(a.tagName.toLowerCase() + cls);
    }
    return parts.join(' > ');
  };
  const top = (el) => {
    const r = el.getBoundingClientRect();
    const x = Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
    const hit = document.elementFromPoint(x, y);
    return !hit || el.contains(hit) || hit.contains(el);
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    const txt = n.textContent.replace(/\s+/g, ' ').trim();
    if (!txt) continue;
    const el = n.parentElement;
    if (!el || !shown(el) || !top(el)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
    if (el.closest('.enter, .leaving, .dragging')) continue; // cards mid-animation
    // nearest clipping box, and whether the text sits in a scrollable container (then off-screen
    // parts are reachable by scrolling)
    let clip = null;
    let scroller = false;
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (['auto', 'scroll'].includes(cs.overflowX) || ['auto', 'scroll'].includes(cs.overflowY)) { scroller = true; break; }
      if (!clip && (['hidden', 'clip'].includes(cs.overflowX) || ['hidden', 'clip'].includes(cs.overflowY))) clip = a;
    }
    if (scroller && !clip) continue;
    const cr = clip && clip.getBoundingClientRect();
    for (const r of rects) {
      if (!scroller && (r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1)) { out.push({ kind: 'offscreen', text: txt.slice(0, 70), where: path(el) }); break; }
      // Glyph boxes overhang tight line-heights; vertically, only a hidden part of a line counts.
      const slack = r.height * 0.3;
      if (cr && (r.right > cr.right + 1.5 || r.left < cr.left - 1.5 || r.bottom > cr.bottom + slack || r.top < cr.top - slack)) { out.push({ kind: 'clipped', text: txt.slice(0, 70), where: path(el), by: path(clip) }); break; }
    }
  }
  for (const fr of document.querySelectorAll('.card-frame')) {
    if (fr.scrollHeight > fr.clientHeight + 2 && shown(fr) && top(fr)) out.push({ kind: 'card-overflow', text: fr.querySelector('.card-name').textContent.trim(), where: path(fr) });
  }
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    const cut = () => { const r = document.createRange(); r.selectNodeContents(el); return el.scrollWidth > el.clientWidth || r.getBoundingClientRect().width > el.getBoundingClientRect().width + 0.01; };
    if (cs.textOverflow === 'ellipsis' && cut() && shown(el) && top(el)) out.push({ kind: 'ellipsis', text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 70), where: path(el) });
  }
  return out;
}
