// Non-battle screens: title, map, reward, shop, event, rest, surgery, treasure, boss prep,
// mutation, story dialogue and run results.
import { h, clear, btn, esc } from './dom.js';
import { cardEl } from './cardView.js';
import { liveScene, drawEnemyStill } from './scene.js';
import { drawPortrait } from '../render/rig.js';
import { CARDS, GRAFTS } from '../data/cards.js';
import { RELICS } from '../data/relics.js';
import { ENEMIES } from '../data/enemies.js';
import { EVENT_MAP } from '../data/events.js';
import { MUTATIONS } from '../data/mutations.js';
import { TRAITS, NODE_TYPES } from '../data/traits.js';
import { SCENES, SPEAKERS, DEFEAT_LINES } from '../data/story.js';
import { PREPARED_PLANS, VOLATILE_OUTCOMES, MAP_DEPTHS } from '../engine/run.js';
import { themeName } from '../render/backgrounds.js';
import { drawIcon, ICON_PATHS } from '../render/icons.js';
import { STARTER_OPTIONS } from '../data/relics.js';
import { unlocks } from '../engine/save.js';

function iconSvg(name, cls = '') {
  const filled = ['burst', 'shield', 'heal', 'flame', 'skull', 'crown', 'coin', 'chest', 'star'].includes(name);
  return `<svg class="ico ${cls}" viewBox="-11 -11 22 22" aria-hidden="true"><path d="${ICON_PATHS[name] || ICON_PATHS.star}" class="${filled ? 'f' : 's'}"/></svg>`;
}

export function relicBadge(app, id, extra = {}) {
  const r = RELICS[id];
  const b = h('button', { class: `relic-badge r-${r.rarity}`, type: 'button', title: r.name, ...extra }, h('span', { class: 'rb-ico', html: app.relicIconSvg(id) }), h('span', { class: 'rb-name' }, r.name));
  return b;
}

// ───────────────────────── TITLE ─────────────────────────
export function titleScreen(app, root) {
  const canvas = h('canvas', { class: 'scene-canvas' });
  const has = app.hasSave();
  const menu = h('div', { class: 'title-menu' });
  if (has) menu.append(btn('Continue', () => app.continueRun(), 'primary big'));
  menu.append(btn('New Run', () => app.newRunFlow(), has ? 'big' : 'primary big'));
  menu.append(btn('Museum', () => app.openMuseum(), ''));
  menu.append(btn('How to Play', () => app.howToPlay(), ''));
  menu.append(btn('Settings', () => app.openSettings(), ''));
  const m = app.meta;
  const el = h('div', { class: 'title screen' }, canvas,
    h('div', { class: 'title-inner' },
      h('div', { class: 'logo' }, h('span', { class: 'logo-a' }, 'SIGNAL'), h('span', { class: 'logo-sl' }, '//'), h('span', { class: 'logo-b' }, 'BREAK')),
      h('div', { class: 'tagline' }, 'A Relay-driven card saga. Patched to version 0.3.1. Probably.'),
      menu,
      h('div', { class: 'title-foot' }, `Runs ${m.totalRuns} · Wins ${m.wins} · Best combo ${m.bestCombo} cards`)));
  clear(root).append(el);
  const sc = liveScene(canvas, { act: 1, party: true, enemy: null, dim: 0.25, left: true });
  app.audio.music('title');
  return () => sc.stop();
}

export function newRunDialog(app) {
  const u = unlocks(app.meta);
  let chosen = 'beta_badge';
  const list = h('div', { class: 'starter-list' });
  const render = () => {
    clear(list);
    for (const opt of STARTER_OPTIONS) {
      const ok = !opt.unlock || u[opt.unlock];
      const r = RELICS[opt.id];
      const b = h('button', { class: `starter-opt ${chosen === opt.id ? 'sel' : ''}`, type: 'button', disabled: !ok },
        h('span', { class: 'rb-ico', html: app.relicIconSvg(opt.id) }),
        h('span', { class: 'so-body' }, h('b', {}, r.name), h('span', {}, ok ? r.text : `Locked — ${opt.hint}`)));
      b.addEventListener('click', () => { chosen = opt.id; render(); app.audio.sfx('click'); });
      list.append(b);
    }
  };
  render();
  const close = app.modal(h('div', { class: 'panel' },
    h('h2', {}, 'New Run'),
    h('p', { class: 'dim' }, 'Choose a starting relic. More unlock through the Museum.'),
    list,
    h('div', { class: 'row-btns' },
      btn('Cancel', () => close(), ''),
      btn('Begin', () => { close(); app.startRun(chosen); }, 'primary'))), { dismiss: true });
}

// ───────────────────────── STORY DIALOGUE ─────────────────────────
export function storyDialog(app, lines, onDone) {
  let i = 0;
  const portrait = h('canvas', { class: 'dlg-portrait', width: 220, height: 220 });
  const name = h('div', { class: 'dlg-name' });
  const text = h('div', { class: 'dlg-text' });
  const next = h('div', { class: 'dlg-next' }, '▶');
  const skip = h('button', { class: 'btn small dlg-skip', type: 'button' }, 'Skip');
  const box = h('div', { class: 'dlg-box' }, h('div', { class: 'dlg-pframe' }, portrait), h('div', { class: 'dlg-body' }, name, text, next));
  const layer = h('div', { class: 'dialog-layer' }, box, skip);
  app.layers.dialog.append(layer);
  let typing = null;
  let full = '';
  let raf = 0;
  let t0 = performance.now();
  const ctx = portrait.getContext('2d');
  const drawP = () => {
    const ln = lines[i];
    if (!ln) return;
    ctx.clearRect(0, 0, 220, 220);
    const sp = SPEAKERS[ln.who] || SPEAKERS.sys;
    ctx.fillStyle = sp.color;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(0, 0, 220, 220);
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 220, 220);
    ctx.clip();
    drawPortrait(ctx, ln.who, 220, 220, (performance.now() - t0) / 1000);
    ctx.restore();
    raf = requestAnimationFrame(drawP);
  };
  const show = () => {
    const ln = lines[i];
    const sp = SPEAKERS[ln.who] || SPEAKERS.sys;
    name.innerHTML = `<b style="color:${sp.color}">${esc(sp.name)}</b>${sp.title ? `<span>${esc(sp.title)}</span>` : ''}`;
    box.className = `dlg-box who-${ln.who}`;
    full = ln.text;
    let n = 0;
    clearInterval(typing);
    text.textContent = '';
    typing = setInterval(() => {
      n += 2;
      text.textContent = full.slice(0, n);
      if (n >= full.length) { clearInterval(typing); typing = null; }
    }, 16);
    app.audio.sfx('hover');
  };
  const finish = () => {
    clearInterval(typing);
    cancelAnimationFrame(raf);
    layer.remove();
    window.removeEventListener('keydown', key);
    onDone();
  };
  const advance = () => {
    if (typing) { clearInterval(typing); typing = null; text.textContent = full; return; }
    i++;
    if (i >= lines.length) finish();
    else show();
  };
  const key = (e) => { if (e.key === ' ' || e.key === 'Enter') { advance(); e.preventDefault(); } if (e.key === 'Escape') finish(); };
  box.addEventListener('click', advance);
  skip.addEventListener('click', (e) => { e.stopPropagation(); finish(); });
  window.addEventListener('keydown', key);
  show();
  drawP();
}

// ───────────────────────── MAP ─────────────────────────
export function partyStrip(app) {
  const run = app.run;
  const el = h('div', { class: 'party-strip' });
  for (const p of run.d.party) {
    const pct = Math.round((p.hp / p.maxHp) * 100);
    el.append(h('div', { class: `ps-member m-${p.id}` }, h('span', { class: 'ps-name' }, { V: 'Hessa', C: 'Corvin', S: 'Pin' }[p.id]),
      h('span', { class: 'ps-bar' }, h('i', { style: { width: pct + '%' } })), h('span', { class: 'ps-hp' }, `${p.hp}/${p.maxHp}`)));
  }
  return el;
}

export function runHeader(app, title) {
  const run = app.run;
  const relics = h('div', { class: 'hdr-relics' });
  for (const id of run.d.relics) {
    const b = h('button', { class: 'relic-pip', type: 'button', title: RELICS[id].name, html: app.relicIconSvg(id) });
    b.addEventListener('click', () => app.showRelic(id));
    relics.append(b);
  }
  for (const m of run.d.mutations) {
    const b = h('button', { class: 'relic-pip mut', type: 'button', title: MUTATIONS[m].name }, '✶');
    b.addEventListener('click', () => app.info(MUTATIONS[m].name, MUTATIONS[m].text));
    relics.append(b);
  }
  return h('div', { class: 'run-header' },
    h('div', { class: 'rh-title' }, h('b', {}, title || `ACT ${run.act}`), h('span', {}, themeName(run.act))),
    partyStrip(app),
    h('div', { class: 'rh-scrap' }, h('span', { html: iconSvg('coin') }), h('b', {}, String(run.d.scrap))),
    relics,
    h('div', { class: 'rh-btns' }, btn('Deck', () => app.viewDeck(), 'small'), btn('☰', () => app.pause(), 'small icon')));
}

export function mapScreen(app, root) {
  const run = app.run;
  const map = run.d.map;
  const avail = new Set(run.availableNodes());
  const area = h('div', { class: 'map-area' });
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'map-edges');
  area.append(svg);
  const info = h('div', { class: 'map-info' });
  let selected = null;
  const pathSet = new Set(run.d.path);
  const posOf = (n) => [(n.depth + 0.5) / (MAP_DEPTHS + 1), n.depth === MAP_DEPTHS ? 0.5 : 0.08 + n.y * 0.84];
  const nodeEls = {};
  for (const n of map.nodes) {
    const [x, y] = posOf(n);
    const type = NODE_TYPES[n.type];
    const cur = run.d.position === n.id;
    const cls = ['map-node', `t-${n.type}`, avail.has(n.id) ? 'avail' : '', n.visited ? 'visited' : '', cur ? 'current' : ''].join(' ');
    const b = h('button', { class: cls, type: 'button', style: { left: `${x * 100}%`, top: `${y * 100}%`, '--nc': type.color }, 'aria-label': `${type.name}${n.trait ? ' · ' + TRAITS[n.trait].name : ''}` },
      h('span', { class: 'mn-ico', html: iconSvg(type.icon) }), n.trait ? h('span', { class: 'mn-trait', style: { background: TRAITS[n.trait].color }, title: TRAITS[n.trait].name }) : null);
    b.addEventListener('click', () => select(n));
    nodeEls[n.id] = b;
    area.append(b);
  }
  const drawEdges = () => {
    const r = area.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
    svg.innerHTML = '';
    for (const n of map.nodes) {
      const [x1, y1] = posOf(n);
      for (const eid of n.edges) {
        const m = map.nodes.find((q) => q.id === eid);
        if (!m) continue;
        const [x2, y2] = posOf(m);
        const line = document.createElementNS(svgNS, 'path');
        const ax = x1 * r.width, ay = y1 * r.height, bx = x2 * r.width, by = y2 * r.height;
        line.setAttribute('d', `M${ax},${ay} C${(ax + bx) / 2},${ay} ${(ax + bx) / 2},${by} ${bx},${by}`);
        const walked = pathSet.has(n.id) && pathSet.has(eid);
        const open = (run.d.position === n.id && avail.has(eid)) || (!run.d.position && false);
        line.setAttribute('class', walked ? 'edge walked' : open ? 'edge open' : 'edge');
        svg.append(line);
      }
    }
  };
  const select = (n) => {
    selected = n;
    for (const el of Object.values(nodeEls)) el.classList.remove('sel');
    nodeEls[n.id].classList.add('sel');
    app.audio.sfx('click');
    const type = NODE_TYPES[n.type];
    const can = avail.has(n.id);
    const desc = {
      battle: 'A standard encounter. Win for Scrap and a card.',
      elite: 'A dangerous elite. Win for a relic, more Scrap, and better cards.',
      event: 'Something strange. Choices with real consequences.',
      shop: 'Buy cards and relics, remove or upgrade cards.',
      rest: 'Recover, upgrade a card, or prepare for the next big fight.',
      surgery: 'Alter a card: re-gauge rank, recut suit, graft an effect.',
      treasure: 'A cache: choose one of two relics.',
      boss: `The act boss: ${ENEMIES[run.d.bosses[run.act]].name}.`,
    }[n.type];
    clear(info).append(
      h('div', { class: 'mi-head' }, h('span', { class: 'mi-ico', style: { color: type.color }, html: iconSvg(type.icon) }), h('b', {}, type.name), n.trait ? h('span', { class: 'mi-trait', style: { color: TRAITS[n.trait].color } }, TRAITS[n.trait].name) : null),
      h('div', { class: 'mi-desc' }, desc),
      n.trait ? h('div', { class: 'mi-tdesc' }, TRAITS[n.trait].text) : null,
      can ? btn('Travel', () => { app.audio.sfx('map'); run.enterNode(n.id); app.save(); app.route(); }, 'primary') : h('div', { class: 'dim small' }, n.visited ? 'Visited' : 'Not reachable from here'));
  };
  const legend = h('div', { class: 'map-legend' }, ...Object.entries(NODE_TYPES).map(([k, t]) => h('span', { style: { color: t.color }, html: `${iconSvg(t.icon)}${t.name}` })));
  const el = h('div', { class: 'map screen' }, runHeader(app), h('div', { class: 'map-body' }, area, h('div', { class: 'map-side' }, info, legend)));
  clear(root).append(el);
  requestAnimationFrame(drawEdges);
  const ro = new ResizeObserver(drawEdges);
  ro.observe(area);
  const firstAvail = map.nodes.find((n) => avail.has(n.id));
  if (firstAvail) select(firstAvail);
  else clear(info).append(h('div', { class: 'dim' }, 'Choose your next destination.'));
  app.audio.music('map');
  return () => ro.disconnect();
}

// ───────────────────────── REWARD ─────────────────────────
export function rewardScreen(app, root) {
  const run = app.run;
  const p = run.d.pending;
  if (!p.scrapTaken) { run.takeReward('scrap'); app.save(); }
  let sel = null;
  const cards = h('div', { class: 'reward-cards' });
  const takeBtn = btn('Take card', () => {
    if (sel === null) return;
    run.takeReward('card', sel);
    app.audio.sfx('confirm');
    app.save();
    render();
  }, 'primary');
  const skipBtn = btn('Skip card', () => { run.takeReward('skipcard'); app.save(); render(); }, '');
  const relicRow = h('div', { class: 'reward-relics' });
  const render = () => {
    clear(cards);
    p.cards.forEach((spec, i) => {
      const el = cardEl({ uid: `rw${i}`, ...spec }, { static: true });
      if (p.cardTaken) el.classList.add(p.cardPicked === i ? 'picked' : 'faded');
      if (sel === i && !p.cardTaken) el.classList.add('selected');
      el.addEventListener('click', () => { if (p.cardTaken) return; sel = i; app.audio.sfx('card', { rank: CARDS[spec.id].rank }); render(); });
      cards.append(el);
    });
    takeBtn.disabled = p.cardTaken || sel === null;
    skipBtn.disabled = p.cardTaken;
    clear(relicRow);
    if (p.relics.length) {
      relicRow.append(h('div', { class: 'rr-label' }, p.relicChoice ? 'Choose a relic' : 'Relic'));
      p.relics.forEach((id, i) => {
        const b = relicBadge(app, id);
        b.append(h('span', { class: 'rb-text' }, RELICS[id].text));
        if (p.relicTaken) b.classList.add(p.relicPicked === i ? 'picked' : 'faded');
        b.addEventListener('click', () => {
          if (p.relicTaken) return;
          run.takeReward('relic', i);
          app.audio.sfx('confirm');
          app.save();
          render();
        });
        relicRow.append(b);
      });
    }
  };
  render();
  const cont = btn('Continue', () => {
    run.finishReward();
    app.save();
    app.route();
  }, 'primary big');
  const el = h('div', { class: 'reward screen' }, runHeader(app),
    h('div', { class: 'reward-body' },
      h('h2', {}, p.boss ? 'BOSS DEFEATED' : 'VICTORY'),
      h('div', { class: 'reward-scrap', html: `${iconSvg('coin')} +${p.scrap} Scrap` }),
      h('div', { class: 'reward-section' }, h('div', { class: 'rr-label' }, 'Add a card to your deck'), cards, h('div', { class: 'row-btns' }, skipBtn, takeBtn)),
      relicRow,
      h('div', { class: 'row-btns end' }, cont)));
  clear(root).append(el);
  app.audio.music('map');
}

// ───────────────────────── SHOP ─────────────────────────
export function shopScreen(app, root) {
  const run = app.run;
  const p = run.d.pending;
  const s = p.stock;
  const body = h('div', { class: 'shop-body' });
  const render = () => {
    clear(body);
    const cardsRow = h('div', { class: 'shop-cards' });
    s.cards.forEach((it, i) => {
      const el = cardEl({ uid: `sh${i}`, ...it.spec }, { static: true });
      const wrap = h('div', { class: `shop-item ${it.sold ? 'sold' : ''}` }, el, h('div', { class: `price ${run.d.scrap < it.price ? 'poor' : ''}` }, it.sold ? 'SOLD' : `${it.price}`));
      if (!it.sold) wrap.addEventListener('click', () => {
        const r = run.shopBuy('card', i);
        app.audio.sfx(r.ok ? 'buy' : 'reject');
        if (!r.ok) app.toast(r.text || 'Not enough Scrap');
        app.save();
        render();
        refreshHeader();
      });
      cardsRow.append(wrap);
    });
    const relicRow = h('div', { class: 'shop-relics' });
    s.relics.forEach((it, i) => {
      const b = relicBadge(app, it.id);
      b.append(h('span', { class: 'rb-text' }, RELICS[it.id].text), h('span', { class: `price ${run.d.scrap < it.price ? 'poor' : ''}` }, it.sold ? 'SOLD' : `${it.price}`));
      if (it.sold) b.classList.add('sold');
      else b.addEventListener('click', () => {
        const r = run.shopBuy('relic', i);
        app.audio.sfx(r.ok ? 'buy' : 'reject');
        if (!r.ok) app.toast(r.text || 'Not enough Scrap');
        app.save();
        render();
        refreshHeader();
      });
      relicRow.append(b);
    });
    const svc = h('div', { class: 'shop-services' });
    const service = (kind, label, desc, price, used) => {
      const b = h('button', { class: `svc ${used ? 'sold' : ''}`, type: 'button', disabled: used || run.d.scrap < price }, h('b', {}, label), h('span', {}, desc), h('span', { class: 'price' }, used ? 'USED' : String(price)));
      b.addEventListener('click', async () => {
        if (kind === 'heal') {
          const r = run.shopBuy('heal');
          app.audio.sfx(r.ok ? 'heal' : 'reject');
        } else {
          const r = run.shopBuy(kind);
          if (!r.ok) { app.toast(r.text); return; }
          let action = kind;
          if (kind === 'surgery') {
            action = await app.chooseSurgeryOp(s.grafts);
            if (!action) return;
          }
          const filter = (inst) => run.canApplySelect(kind === 'remove' ? 'remove' : kind === 'upgrade' ? 'upgrade' : action, inst);
          const uid = await app.selectCard({ title: label, filter, confirm: label, preview: kind === 'upgrade' });
          if (!uid) return;
          if (run.shopService(kind, uid, action)) app.audio.sfx('buy');
        }
        app.save();
        render();
        refreshHeader();
      });
      return b;
    };
    svc.append(
      service('remove', 'Remove a card', 'Thin your deck', s.removePrice, s.removeUsed),
      service('upgrade', 'Upgrade a card', 'Improve its numbers', s.upgradePrice, s.upgradeUsed),
      service('surgery', 'Card surgery', 'Recut, re-gauge or graft', s.surgeryPrice, s.surgeryUsed),
      service('heal', 'Patch up', 'Heal party 30%', s.healPrice, s.healUsed));
    body.append(h('div', { class: 'shop-label' }, 'Cards'), cardsRow, h('div', { class: 'shop-label' }, 'Relics'), relicRow, h('div', { class: 'shop-label' }, 'Services'), svc);
  };
  const headerSlot = h('div', {});
  const refreshHeader = () => clear(headerSlot).append(runHeader(app, 'SHOP'));
  refreshHeader();
  render();
  const el = h('div', { class: 'shop screen' }, headerSlot,
    h('div', { class: 'shop-wrap' }, h('div', { class: 'shop-keeper' }, h('div', { class: 'sk-name' }, 'Gerald\'s Discount Relays'), h('div', { class: 'sk-line' }, p.stock.disc < 1 ? '"Scrap Cache special! Everything 20% off. Don\'t tell Ozmund."' : '"Everything here was cut from the game. Lovingly."')), body,
      h('div', { class: 'row-btns end' }, btn('Leave', () => { run.leaveNode(); app.save(); app.route(); }, 'primary'))));
  clear(root).append(el);
  app.audio.music('map');
}

// ───────────────────────── EVENT ─────────────────────────
export function eventScreen(app, root) {
  const run = app.run;
  const p = run.d.pending;
  const ev = EVENT_MAP[p.eventId];
  const canvas = h('canvas', { class: 'event-art' });
  const body = h('div', { class: 'event-body' });
  const render = () => {
    clear(body);
    body.append(h('h2', {}, ev.title), h('p', { class: 'event-text' }, ev.text));
    if (!p.result || p.result.repeat) {
      if (p.result && p.result.repeat) body.append(h('p', { class: 'event-result' }, p.result.text));
      const list = h('div', { class: 'event-choices' });
      const api = run.api(run.rng('preview'));
      ev.choices.forEach((ch, i) => {
        const req = ch.req ? ch.req(api) : true;
        const b = h('button', { class: 'choice', type: 'button', disabled: req !== true }, h('b', {}, ch.label), h('span', {}, req === true ? ch.hint : req));
        b.addEventListener('click', () => {
          const r = run.eventChoose(i);
          if (r && r.error) { app.toast(r.error); return; }
          app.audio.sfx('confirm');
          app.save();
          handleSelect();
        });
        list.append(b);
      });
      if (p.result && p.result.repeat) list.append(btn('Leave', () => { run.leaveNode(); app.save(); app.route(); }, ''));
      body.append(list);
    } else {
      body.append(h('p', { class: 'event-result' }, p.result.text));
      if (p.result.offer) {
        const row = h('div', { class: 'reward-cards' });
        p.result.offer.forEach((spec, i) => {
          const el = cardEl({ uid: `of${i}`, ...spec }, { static: true });
          el.addEventListener('click', () => { run.takeOfferCard(i); app.audio.sfx('confirm'); app.save(); render(); });
          row.append(el);
        });
        body.append(h('div', { class: 'rr-label' }, 'Choose one (tap)'), row, btn('Skip', () => { p.result.offer = null; app.save(); render(); }, 'small'));
      } else body.append(h('div', { class: 'row-btns end' }, btn('Continue', () => { run.leaveNode(); app.save(); app.route(); }, 'primary')));
    }
  };
  const handleSelect = async () => {
    if (p.select) {
      const sel = p.select;
      const uid = await app.selectCard({ title: sel.title, filter: (inst) => run.canApplySelect(sel.action, inst), confirm: 'Confirm', preview: sel.action === 'upgrade', action: sel.action, cancelable: true });
      if (uid) run.applySelect(sel.action, uid);
      else run.cancelSelect();
      app.save();
    }
    render();
  };
  const el = h('div', { class: 'event screen' }, runHeader(app, 'EVENT'), h('div', { class: 'event-wrap' }, h('div', { class: 'event-art-wrap' }, canvas), body));
  clear(root).append(el);
  const sc = liveScene(canvas, { act: run.act, icon: ev.art, dim: 0.15 });
  if (p.select) handleSelect();
  else render();
  app.audio.music('map');
  return () => sc.stop();
}

// ───────────────────────── REST ─────────────────────────
export function restScreen(app, root) {
  const run = app.run;
  const p = run.d.pending;
  const canvas = h('canvas', { class: 'scene-canvas' });
  const body = h('div', { class: 'rest-body' });
  const render = (msg) => {
    clear(body);
    body.append(h('h2', {}, 'Furnace Rest'), h('p', { class: 'dim' }, p.quiet ? 'Quiet Channel: recovery heals 45%.' : 'The furnace hums. Choose one.'));
    if (p.done) {
      body.append(h('p', { class: 'event-result' }, msg || 'You feel ready to move on.'), h('div', { class: 'row-btns end' }, btn('Continue', () => { run.leaveNode(); app.save(); app.route(); }, 'primary')));
      return;
    }
    const opts = [
      ['recover', 'Recover', `Heal every ally ${p.quiet ? 45 : 30}% of max HP.`, 'heal'],
      ['tune', 'Tune-up', 'Upgrade a card of your choice.', 'wrench'],
      ['fortify', 'Fortify', 'Next Elite or Boss: start with 12 Guard and 2 Momentum.', 'shield'],
      ['overdrive', 'Overdrive', 'Upgrade 2 random cards. Every ally loses 15% of current HP.', 'bolt'],
    ];
    const list = h('div', { class: 'rest-opts' });
    for (const [k, name, desc, ic] of opts) {
      const b = h('button', { class: 'rest-opt', type: 'button' }, h('span', { class: 'ro-ico', html: iconSvg(ic) }), h('b', {}, name), h('span', {}, desc));
      b.addEventListener('click', async () => {
        if (k === 'tune') {
          const uid = await app.selectCard({ title: 'Upgrade a card', filter: (inst) => !inst.up, confirm: 'Upgrade', preview: true, cancelable: true });
          if (!uid) return;
          run.applySelect('upgrade', uid);
          p.done = 'tune';
          app.audio.sfx('confirm');
          app.save();
          render('A card is sharpened by the furnace light.');
          return;
        }
        const r = run.restChoose(k);
        app.audio.sfx(k === 'recover' ? 'heal' : 'confirm');
        app.save();
        render(r && r.text);
        refreshHeader();
      });
      list.append(b);
    }
    body.append(list);
  };
  const headerSlot = h('div', {});
  const refreshHeader = () => clear(headerSlot).append(runHeader(app, 'REST'));
  refreshHeader();
  const el = h('div', { class: 'rest screen' }, headerSlot, h('div', { class: 'rest-wrap' }, h('div', { class: 'rest-art' }, canvas), body));
  clear(root).append(el);
  render();
  const sc = liveScene(canvas, { act: run.act, party: true, dim: 0.1 });
  app.audio.music('map');
  return () => sc.stop();
}

// ───────────────────────── SURGERY ─────────────────────────
export function surgeryScreen(app, root) {
  const run = app.run;
  const p = run.d.pending;
  const body = h('div', { class: 'surgery-body' });
  const render = (msg) => {
    clear(body);
    body.append(h('h2', {}, 'Card Surgery'), h('p', { class: 'dim' }, `Alter a card permanently. First operation free, a second costs 40 Scrap. Operations used: ${p.ops}/2.`));
    if (msg) body.append(h('p', { class: 'event-result' }, msg));
    if (p.ops < 2) {
      const ops = [
        ['rankup', 'Re-gauge +1', 'Raise a card\'s rank by 1.'],
        ['rankdown', 'Re-gauge −1', 'Lower a card\'s rank by 1.'],
        ['recut', 'Recut suit', 'Switch a card between A and B.'],
        ['ex', 'Stamp EX (+50)', 'Make a card EX (fits any suit).'],
        ...p.grafts.map((g) => [`graft:${g}`, `Graft: ${GRAFTS[g].name}`, GRAFTS[g].text]),
      ];
      const list = h('div', { class: 'surgery-ops' });
      for (const [action, name, desc] of ops) {
        const cost = run.surgeryCost(action);
        const b = h('button', { class: 'choice', type: 'button', disabled: run.d.scrap < cost }, h('b', {}, `${name}${cost ? ` · ${cost} Scrap` : ' · free'}`), h('span', {}, desc));
        b.addEventListener('click', async () => {
          const uid = await app.selectCard({ title: name, filter: (inst) => run.canApplySelect(action, inst), confirm: 'Operate', action, cancelable: true });
          if (!uid) return;
          const r = run.surgeryApply(uid, action);
          app.audio.sfx(r.ok ? 'confirm' : 'reject');
          if (!r.ok) app.toast(r.text);
          app.save();
          render(r.ok ? `${CARDS[run.card(uid) ? run.card(uid).id : 'glitch'].name} altered.` : null);
          refreshHeader();
        });
        list.append(b);
      }
      body.append(list);
    }
    body.append(h('div', { class: 'row-btns end' }, btn('Leave', () => { run.leaveNode(); app.save(); app.route(); }, 'primary')));
  };
  const headerSlot = h('div', {});
  const refreshHeader = () => clear(headerSlot).append(runHeader(app, 'SURGERY'));
  refreshHeader();
  render();
  clear(root).append(h('div', { class: 'surgery screen' }, headerSlot, h('div', { class: 'surgery-wrap' }, body)));
  app.audio.music('map');
}

// ───────────────────────── TREASURE ─────────────────────────
export function treasureScreen(app, root) {
  const run = app.run;
  const p = run.d.pending;
  const body = h('div', { class: 'treasure-body' });
  const render = () => {
    clear(body);
    body.append(h('h2', {}, 'Scrap Cache'), h('p', { class: 'dim' }, `Choose one relic. +${p.scrap} Scrap either way.`));
    const row = h('div', { class: 'reward-relics' });
    p.relics.forEach((id, i) => {
      const b = relicBadge(app, id);
      b.append(h('span', { class: 'rb-text' }, RELICS[id].text));
      if (p.taken) b.classList.add(run.hasRelic(id) ? 'picked' : 'faded');
      b.addEventListener('click', () => { if (run.treasureTake(i)) { app.audio.sfx('confirm'); app.save(); render(); } });
      row.append(b);
    });
    body.append(row, h('div', { class: 'row-btns end' }, btn(p.taken ? 'Continue' : 'Leave (take Scrap only)', () => { run.leaveNode(); app.save(); app.route(); }, 'primary')));
  };
  render();
  clear(root).append(h('div', { class: 'treasure screen' }, runHeader(app, 'CACHE'), h('div', { class: 'surgery-wrap' }, body)));
}

// ───────────────────────── BOSS PREP ─────────────────────────
export function bossPrepScreen(app, root) {
  const run = app.run;
  const p = run.d.pending;
  const def = ENEMIES[p.bossId];
  const canvas = h('canvas', { class: 'boss-art', width: 360, height: 360 });
  const body = h('div', { class: 'boss-body' });
  const prof = p.profile;
  const evidence = prof.length
    ? h('div', { class: 'evidence' }, h('div', { class: 'rr-label' }, 'Signal analysis (this run only)'), ...prof.slice(0, 3).map((x, i) => h('div', { class: i === 0 ? 'ev main' : 'ev' }, `${x.evidence}`)))
    : h('div', { class: 'evidence' }, h('div', { class: 'rr-label' }, 'Signal analysis (this run only)'), h('div', { class: 'ev' }, 'Profile inconclusive: no strategy is specialized enough to counter.'));
  const adapt = p.adaptation
    ? h('div', { class: 'adapt-card' }, h('b', {}, `Adaptation: ${p.adaptation.name}`), h('span', {}, p.adaptation.desc), h('span', { class: 'dim' }, `Break it: ${p.adaptation.breakText}`))
    : h('div', { class: 'adapt-card none' }, h('b', {}, 'No adaptation'), h('span', {}, 'The boss fights with its base kit.'));
  const vol = VOLATILE_OUTCOMES.find((v) => v.id === p.volatileId);
  const plans = h('div', { class: 'prep-plans' });
  for (const plan of PREPARED_PLANS) {
    const b = h('button', { class: 'choice', type: 'button' }, h('b', {}, `Prepared · ${plan.name}`), h('span', {}, plan.text));
    b.addEventListener('click', () => choose('prepared', plan.id));
    plans.append(b);
  }
  const volBtn = h('button', { class: 'choice volatile', type: 'button' }, h('b', {}, 'Volatile · roll the signal'), h('span', {}, 'One of: ' + VOLATILE_OUTCOMES.map((v) => v.name).join(', ') + '. Outcome is fixed for this act and revealed on choosing.'));
  volBtn.addEventListener('click', () => choose('volatile'));
  const choose = (kind, planId) => {
    const r = run.chooseBossPrep(kind, planId);
    if (!r) return;
    app.audio.sfx('confirm');
    app.save();
    if (kind === 'volatile') {
      app.info(`Volatile: ${vol.name}`, vol.text, () => app.route());
    } else app.route();
  };
  body.append(h('div', { class: 'boss-title' }, h('span', { class: 'dim' }, `ACT ${run.act} BOSS`), h('h2', {}, def.name)), h('p', { class: 'dim' }, def.lore), evidence, adapt, h('div', { class: 'rr-label' }, 'Choose your approach'), plans, volBtn);
  clear(root).append(h('div', { class: 'bossprep screen' }, runHeader(app, 'BOSS'), h('div', { class: 'boss-wrap' }, h('div', { class: 'boss-art-wrap' }, canvas), body)));
  drawEnemyStill(canvas, p.bossId, 1.2);
  app.audio.music('boss');
}

// ───────────────────────── MUTATION ─────────────────────────
export function mutationScreen(app, root) {
  const run = app.run;
  const p = run.d.pending;
  const list = h('div', { class: 'mut-list' });
  for (const id of p.options) {
    const m = MUTATIONS[id];
    const b = h('button', { class: 'mut-card', type: 'button' }, h('span', { class: 'mut-star' }, '✶'), h('b', {}, m.name), h('span', {}, m.text), m.tag ? h('span', { class: 'mut-tag' }, m.tag) : null);
    b.addEventListener('click', () => {
      run.chooseMutation(id);
      app.audio.sfx('finisher');
      app.save();
      app.route();
    });
    list.append(b);
  }
  clear(root).append(h('div', { class: 'mutation screen' }, runHeader(app, 'MUTATION'), h('div', { class: 'surgery-wrap' },
    h('h2', {}, 'The game mutates around you'), h('p', { class: 'dim' }, 'Choose one permanent build mutation for this run.'), list)));
  app.audio.music('map');
}

// ───────────────────────── RESULTS ─────────────────────────
export function resultsScreen(app, root, summary) {
  const win = summary.result === 'victory';
  const canvas = h('canvas', { class: 'scene-canvas' });
  const stat = (k, v) => h('div', { class: 'stat-row' }, h('span', {}, k), h('b', {}, String(v)));
  const bosses = summary.bosses.map((b) => ENEMIES[b].name).join(', ') || 'None';
  const decisions = h('div', { class: 'decisions' }, ...summary.decisions.map((d) => h('div', { class: 'ev' }, `Act ${d.act}: ${ENEMIES[d.boss].name} · ${d.prep} (${d.plan})${d.adaptation ? ` · adapted: ${d.adaptation}` : ''}${d.mutation ? ` · mutation: ${MUTATIONS[d.mutation].name}` : ''} · ${d.result || 'defeat'}`)));
  const body = h('div', { class: 'results-body' },
    h('h1', { class: win ? 'win' : 'lose' }, win ? 'CORE STABILIZED' : 'RUN ENDED'),
    h('div', { class: 'score' }, `Score ${summary.score}`),
    h('div', { class: 'stats-grid' },
      stat('Act reached', summary.act), stat('Floors', summary.floors), stat('Bosses defeated', bosses), stat('Elites', summary.elites),
      stat('Build', summary.archetype), stat('Deck size', summary.deckSize), stat('Combos', summary.combos), stat('Perfects', summary.perfect),
      stat('Cash Outs', summary.cashouts), stat('Finishers', summary.finishers), stat('Longest combo', `${summary.longest} cards`), stat('Biggest hit', summary.maxHit)),
    decisions,
    h('div', { class: 'row-btns' }, btn('Museum', () => app.openMuseum(), ''), btn('Title', () => app.toTitle(), ''), btn('New Run', () => app.newRunFlow(), 'primary')));
  clear(root).append(h('div', { class: 'results screen' }, canvas, body));
  const sc = liveScene(canvas, { act: win ? 3 : 1, party: true, partyPose: win ? 'victory' : 'idle', dim: 0.45 });
  app.audio.music(win ? 'map' : 'title');
  return () => sc.stop();
}

export function defeatLines(app) {
  const n = app.meta.defeats || 0;
  return DEFEAT_LINES[n % DEFEAT_LINES.length];
}

export { SCENES, drawIcon };
