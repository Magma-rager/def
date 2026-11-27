// WebAudio synthesizer: all sound effects and music are generated at runtime (no audio files).
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

const TRACKS = {
  title: { bpm: 84, root: 50, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 3, 4], bass: [0, null, null, null, 0, null, 7, null], arp: [0, 2, 4, 7, 4, 2, 0, -3], drums: null, arpWave: 'triangle', pad: true, swing: 0 },
  map: { bpm: 98, root: 52, scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 3, 5, 4], bass: [0, null, 0, null, 4, null, 4, null], arp: [0, 4, 7, 4, 9, 7, 4, 2], drums: 'light', arpWave: 'triangle', pad: true },
  battle1: { bpm: 132, root: 50, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 6, 4], bass: [0, 0, 7, 0, 0, 7, 0, 5], arp: [0, 3, 7, 10, 7, 3, 12, 7], drums: 'drive', arpWave: 'square', pad: false },
  battle2: { bpm: 138, root: 52, scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, 1, 5, 4], bass: [0, null, 0, 1, 0, null, 7, 6], arp: [0, 1, 7, 8, 12, 8, 7, 1], drums: 'drive', arpWave: 'square', pad: true },
  battle3: { bpm: 146, root: 45, scale: [0, 1, 3, 4, 6, 8, 9], prog: [0, 4, 1, 6], bass: [0, 0, 12, 0, 1, 0, 12, 6], arp: [0, 6, 12, 6, 1, 7, 13, 7], drums: 'heavy', arpWave: 'sawtooth', pad: true },
  boss: { bpm: 152, root: 47, scale: [0, 1, 3, 5, 7, 8, 11], prog: [0, 5, 1, 4], bass: [0, 0, 0, 12, 0, 0, 11, 7], arp: [0, 7, 12, 15, 12, 7, 11, 7], drums: 'heavy', arpWave: 'square', pad: true },
};

const BOSS_ARRANGEMENTS = {
  clockwork_regent: { root: 50, arp: [0,7,null,12,3,10,null,7], drums: 'light', arpWave: 'triangle' },
  scrap_tyrant: { root: 43, bass: [0,0,5,0,null,0,10,0], arp: [0,null,3,12,null,10,3,7] },
  protocol_auditor: { root: 53, arp: [0,1,12,null,7,8,12,null], pad: false },
  mirror_array: { root: 55, arp: [0,7,14,19,14,7,0,-5], drums: 'light', arpWave: 'triangle' },
  the_corruptor: { root: 46, arp: [0,13,6,1,12,null,7,2], bass: [0,null,1,0,6,1,null,0] },
  signalbreak_core: { root: 42, arp: [0,7,12,15,18,15,12,7], prog: [0,2,5,4] },
};
export function scoreFor(track) {
  if (track.startsWith('boss:')) return { ...TRACKS.boss, ...BOSS_ARRANGEMENTS[track.slice(5)] };
  return TRACKS[track];
}

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.track = null;
    this.wantTrack = null;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.duck = 1;
    this.lastPlayed = new Map();
    this.intensity = 0;
  }

  unlock() {
    if (this.ctx) {
      // iOS leaves the context 'interrupted' after the app was in the background or a call came in
      if (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.connect(new AC());
  }

  connect(c) {
    this.ctx = c;
    this.master = c.createGain();
    this.musicBus = c.createGain();
    this.sfxBus = c.createGain();
    this.master.gain.value = this.settings.muted ? 0 : this.settings.master;
    this.musicBus.gain.value = this.settings.music * .47 * this.duck;
    this.sfxBus.gain.value = this.settings.sfx * .70;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(this.comp);
    this.headroom = c.createGain();
    this.headroom.gain.value = .79;
    this.comp.connect(this.headroom).connect(c.destination);
    // echo send for "echo" sfx
    this.delay = c.createDelay(1);
    this.delay.delayTime.value = 0.14;
    this.fb = c.createGain();
    this.fb.gain.value = 0.35;
    this.delay.connect(this.fb);
    this.fb.connect(this.delay);
    this.delay.connect(this.sfxBus);
    this.noiseBuf = c.createBuffer(1, c.sampleRate * 1.0, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.applySettings(this.settings);
    if (this.wantTrack) this.music(this.wantTrack);
  }

  applySettings(s) {
    this.settings = s;
    if (!this.ctx) return;
    const m = s.muted ? 0 : s.master;
    this.master.gain.setTargetAtTime(m, this.ctx.currentTime, 0.02);
    this.musicBus.gain.setTargetAtTime(s.music * .47 * this.duck, this.ctx.currentTime, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfx * .70, this.ctx.currentTime, 0.02);
  }

  setDuck(v) {
    this.duck = v;
    this.applySettings(this.settings);
  }

  // ── primitives ──
  tone(freq, dur, { type = 'sine', vol = 0.3, attack = 0.004, slide = null, at = 0, bus = null, filter = null, q = 1, detune = 0, send = false } = {}) {
    const c = this.ctx;
    const t = Math.max(c.currentTime, c.currentTime + at);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (detune) o.detune.value = detune;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(attack, dur * .7));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) {
      const f = c.createBiquadFilter();
      f.type = filter.type || 'lowpass';
      f.frequency.value = filter.freq;
      f.Q.value = q;
      o.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(bus || this.sfxBus);
    if (send) g.connect(this.delay);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur, { vol = 0.3, type = 'bandpass', freq = 1200, endFreq = null, q = 1, at = 0, bus = null, attack = 0.003 } = {}) {
    const c = this.ctx;
    const t = Math.max(c.currentTime, c.currentTime + at);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(attack, dur * .7));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus || this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // ── sound effects ──
  sfx(name, opts = {}) {
    if (!this.ctx || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const key = name === 'recipe' ? `ex:${opts.cue.notes.join(',')}` : name;
    const limit = name === 'contact' || name === 'partyHurt' ? .065 : .032;
    if (now - (this.lastPlayed.get(key) ?? -Infinity) < limit) return;
    this.lastPlayed.set(key, now);
    const r = opts.rank || 1;
    switch (name) {
      case 'windup': this.motif(opts, 'wind'); break;
      case 'cue': this.motif(opts, 'hero'); break;
      case 'recipe': this.motif(opts, 'recipe'); break;
      case 'foe-cue': this.motif(opts, 'foe'); break;
      case 'foe-phase': this.motif(opts, 'phase'); break;
      case 'foe-down': this.motif(opts, 'down'); break;
      case 'contact': {
        const loud = opts.strong ? .14 : .075;
        const body = opts.voice === 'V' ? 138 : opts.voice === 'C' ? 212 : 174;
        this.tone(body, .12, { vol: loud, slide: 58 });
        this.noise(.074, { vol: loud*.48, freq: opts.voice === 'S' ? 3100 : 1850, q: 2.6 });
        break;
      }
      case 'flow-extension':
        this.tone(318, .11, { vol: .07, slide: 510 });
        this.tone(674, .14, { type: 'triangle', vol: .063, at: .055, slide: 810 });
        break;
      case 'click': this.tone(880, 0.05, { type: 'triangle', vol: 0.12, slide: 660 }); break;
      case 'hover': this.tone(1200, 0.03, { type: 'sine', vol: 0.05 }); break;
      case 'confirm': this.tone(660, 0.08, { type: 'triangle', vol: 0.14 }); this.tone(990, 0.12, { type: 'triangle', vol: 0.12, at: 0.06 }); break;
      case 'back': this.tone(520, 0.08, { type: 'triangle', vol: 0.12, slide: 380 }); break;
      case 'card': this.tone(NOTE(60 + r * 2), 0.14, { type: 'triangle', vol: 0.18 }); this.noise(0.05, { vol: 0.08, freq: 4000, type: 'highpass' }); break;
      case 'cardPlay': {
        const f = NOTE(57 + r * 2);
        this.tone(f, 0.18, { type: 'square', vol: 0.08, filter: { freq: 2400 } });
        this.tone(f * 2, 0.1, { type: 'triangle', vol: 0.08 });
        break;
      }
      case 'whoosh': this.noise(0.16, { vol: 0.18, freq: 400, endFreq: 2400, q: 1.5 }); break;
      case 'slash': this.noise(0.12, { vol: 0.25, freq: 3000, endFreq: 900, type: 'bandpass', q: 2 }); this.tone(900, 0.08, { type: 'sawtooth', vol: 0.05, slide: 300 }); break;
      case 'heavyHit': this.noise(0.18, { vol: 0.3, freq: 2200, endFreq: 500 }); break;
      case 'impact': {
        const a = Math.min(1, (opts.amount || 5) / 20);
        this.tone(170, 0.12, { type: 'sine', vol: 0.25 + a * 0.15, slide: 60 });
        this.noise(0.08, { vol: 0.15, freq: 1500, type: 'lowpass' });
        break;
      }
      case 'impactBig': this.tone(120, 0.32, { type: 'sine', vol: 0.5, slide: 35 }); this.noise(0.28, { vol: 0.35, freq: 900, type: 'lowpass' }); this.tone(60, 0.4, { type: 'triangle', vol: 0.25 }); break;
      case 'shoot': this.noise(0.06, { vol: 0.25, freq: 5000, type: 'highpass' }); this.tone(1300, 0.08, { type: 'square', vol: 0.06, slide: 320 }); break;
      case 'charge': this.tone(300, 0.2, { type: 'sine', vol: 0.08, slide: 900 }); break;
      case 'cast': for (let i = 0; i < 3; i++) this.tone(NOTE(76 + i * 5), 0.28, { type: 'sine', vol: 0.08, at: i * 0.02, detune: (i - 1) * 12 }); this.noise(0.2, { vol: 0.08, freq: 6000, type: 'highpass' }); break;
      case 'guardUp': this.tone(520, 0.35, { type: 'sine', vol: 0.15 }); this.tone(1310, 0.3, { type: 'sine', vol: 0.08 }); break;
      case 'block': this.tone(700, 0.18, { type: 'square', vol: 0.06, filter: { freq: 1800 } }); this.tone(1650, 0.22, { type: 'sine', vol: 0.1 }); break;
      case 'buff': [0, 4, 7].forEach((n, i) => this.tone(NOTE(72 + n), 0.12, { type: 'triangle', vol: 0.1, at: i * 0.05 })); break;
      case 'echo': this.tone(NOTE(84), 0.15, { type: 'sine', vol: 0.12, send: true }); break;
      case 'relay': this.tone(NOTE(67), 0.1, { type: 'triangle', vol: 0.14 }); this.tone(NOTE(74), 0.16, { type: 'triangle', vol: 0.14, at: 0.07 }); break;
      case 'comboStart': this.tone(NOTE(64), 0.08, { type: 'square', vol: 0.05, filter: { freq: 2000 } }); break;
      case 'perfect': [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(67 + n), 0.3, { type: 'triangle', vol: 0.12, at: i * 0.03 })); break;
      case 'ex': [0, 7, 12, 19].forEach((n, i) => this.tone(NOTE(72 + n), 0.22, { type: 'sine', vol: 0.11, at: i * 0.05 })); this.tone(NOTE(60), 0.4, { type: 'triangle', vol: 0.08 }); break;
      case 'exNew': [0, 4, 7, 11, 14, 19].forEach((n, i) => this.tone(NOTE(72 + n), 0.3, { type: 'sine', vol: 0.11, at: i * 0.06 })); break;
      case 'finisher':
        [0, 4, 7, 12, 16].forEach((n, i) => this.tone(NOTE(62 + n), 0.7, { type: 'sawtooth', vol: 0.06, at: i * 0.02, filter: { freq: 3000 } }));
        this.tone(70, 0.8, { type: 'sine', vol: 0.4, slide: 30 });
        this.noise(0.9, { vol: 0.12, freq: 7000, type: 'highpass' });
        break;
      case 'dropped': this.tone(NOTE(64), 0.15, { type: 'square', vol: 0.06, filter: { freq: 1200 } }); this.tone(NOTE(60), 0.25, { type: 'square', vol: 0.06, at: 0.12, filter: { freq: 900 } }); break;
      case 'cashout': [0, 4, 7, 12, 16].forEach((n, i) => this.tone(NOTE(79 + n), 0.09, { type: 'square', vol: 0.05, at: i * 0.045, filter: { freq: 5000 } })); if (opts.quick) this.tone(NOTE(103), 0.2, { type: 'sine', vol: 0.08, at: 0.25 }); break;
      case 'momentum': this.tone(NOTE(79), 0.08, { type: 'sine', vol: 0.1, slide: NOTE(86) }); break;
      case 'telegraph': {
        const pair = opts.kind === 'atk' ? [475,597] : opts.kind === 'aoe' ? [396,796] : opts.kind === 'drain' ? [702,407] : [708,625];
        pair.forEach((f,i) => this.tone(f,.085,{type:'triangle',vol:.072,at:i*.07}));
        break;
      }
      case 'enemyAttack': this.tone(110, 0.2, { type: 'sawtooth', vol: 0.1, slide: 70, filter: { freq: 600 } }); this.noise(0.12, { vol: 0.12, freq: 800 }); break;
      case 'enemyCast': this.tone(240, 0.3, { type: 'sine', vol: 0.1, slide: 480 }); this.tone(250, 0.3, { type: 'sine', vol: 0.08, slide: 470, detune: 30 }); break;
      case 'interfere': for (let i = 0; i < 5; i++) this.tone(200 + Math.random() * 1600, 0.04, { type: 'square', vol: 0.04, at: i * 0.035 }); break;
      case 'partyHurt': this.tone(140, 0.18, { type: 'triangle', vol: 0.25, slide: 70 }); this.noise(0.12, { vol: 0.15, freq: 600, type: 'lowpass' }); break;
      case 'ko': this.tone(400, 0.6, { type: 'triangle', vol: 0.15, slide: 90 }); break;
      case 'enemyDie': this.noise(0.35, { vol: 0.28, freq: 1800, endFreq: 200, type: 'lowpass' }); this.tone(300, 0.3, { type: 'square', vol: 0.05, slide: 60, filter: { freq: 1200 } }); break;
      case 'bossDie': this.tone(80, 1.6, { type: 'sine', vol: 0.5, slide: 25 }); this.noise(1.5, { vol: 0.35, freq: 1500, endFreq: 100, type: 'lowpass' }); break;
      case 'phase': this.tone(220, 0.6, { type: 'sawtooth', vol: 0.08, slide: 880, filter: { freq: 2000 } }); this.tone(110, 0.6, { type: 'sine', vol: 0.3, slide: 55 }); break;
      case 'churn': this.noise(0.16, { vol: 0.16, freq: 2400, endFreq: 500, q: 2 }); this.tone(500, 0.1, { type: 'triangle', vol: 0.06, slide: 250 }); break;
      case 'stash': this.tone(NOTE(72), 0.07, { type: 'triangle', vol: 0.1 }); this.tone(NOTE(79), 0.08, { type: 'triangle', vol: 0.1, at: 0.05 }); break;
      case 'reject': this.tone(110, 0.14, { type: 'square', vol: 0.08, filter: { freq: 900 } }); break;
      case 'stumble': this.tone(98, 0.2, { type: 'sawtooth', vol: 0.08, filter: { freq: 700 } }); break;
      case 'drain': this.noise(0.3, { vol: 0.15, freq: 3000, endFreq: 300 }); break;
      case 'heal': [0, 7, 12].forEach((n, i) => this.tone(NOTE(81 + n), 0.25, { type: 'sine', vol: 0.07, at: i * 0.06 })); break;
      case 'summon': this.noise(0.4, { vol: 0.15, freq: 200, endFreq: 3000 }); break;
      case 'enemyGuard': this.tone(600, 0.2, { type: 'square', vol: 0.04, filter: { freq: 1500 } }); break;
      case 'lock': this.tone(300, 0.08, { type: 'square', vol: 0.07, filter: { freq: 1400 } }); this.noise(0.1, { vol: 0.12, freq: 3000, type: 'highpass', at: 0.03 }); break;
      case 'unlock': this.tone(NOTE(76), 0.08, { type: 'triangle', vol: 0.08 }); break;
      case 'victory': [0, 4, 7, 12, 7, 12, 16].forEach((n, i) => this.tone(NOTE(67 + n), i === 6 ? 0.7 : 0.16, { type: 'square', vol: 0.06, at: i * 0.11, filter: { freq: 3200 } })); break;
      case 'defeat': [7, 3, 0, -5].forEach((n, i) => this.tone(NOTE(60 + n), 0.45, { type: 'triangle', vol: 0.12, at: i * 0.28 })); break;
      case 'map': this.tone(NOTE(69), 0.1, { type: 'triangle', vol: 0.1 }); break;
      case 'buy': [0, 7].forEach((n, i) => this.tone(NOTE(84 + n), 0.1, { type: 'square', vol: 0.05, at: i * 0.06, filter: { freq: 4000 } })); break;
      default: this.tone(600, 0.05, { type: 'sine', vol: 0.06 });
    }
  }

  motif({ cue, voice, strong, order = 0, kind, phase = 0 }, role) {
    const modes = {
      wind: { type:'sine', vol:.042, duration:.074, gap:.036, transpose:-10 },
      hero: { type:voice === 'V' ? 'triangle' : voice === 'S' ? 'square' : 'sine',
        vol:voice === 'S' ? .064 : .090, duration:voice === 'V' ? .124 : voice === 'S' ? .069 : .162,
        gap:voice === 'S' ? .045 : .052, transpose:voice === 'S' ? 9 : voice === 'C' ? 5 : -5 },
      recipe: { type:'triangle', vol:.070, duration:.21, gap:.046, transpose:10 },
      foe: { type:'triangle', vol:.066, duration:.125, gap:.058, transpose:-4 },
      phase: { type:'sine', vol:.094, duration:.37, gap:.125, transpose:phase*2 },
      down: { type:'triangle', vol:.11, duration:.43, gap:.11, transpose:-13 },
    };
    const spec = modes[role];
    const notes = role === 'wind' ? cue.notes.slice(0,1) : role === 'down' ? [...cue.notes].reverse() : cue.notes;
    const delay = Math.min(2,order)*.024;
    notes.forEach((n,i) => {
      const f = NOTE(n + spec.transpose);
      this.tone(f, spec.duration, { type:spec.type, vol:spec.vol * (i ? .78 : 1),
        filter:{freq: role === 'hero' && voice === 'S' ? 1850 : 3100},
        attack: role === 'phase' || role === 'down' ? .028 : .007, at:delay+i*spec.gap,
        ...(role === 'down' ? { slide:f*.73 } : {}) });
    });
    if ((voice === 'V' || voice === 'S') && role === 'hero') {
      this.noise(.083, { vol:strong?.067:.041, freq:voice === 'V' ? 1540 : 3190, endFreq:voice === 'V' ? 540 : 1770, q:1.5 });
    }
    if (role === 'foe' && ['atk','aoe','scramble','glitch','lock'].includes(kind)) {
      this.noise(kind === 'aoe' ? .14 : .095,{vol:strong?.072:.043,freq:kind === 'atk' ? 780 : 1950,endFreq:520,q:2.5});
    }
  }

  bossPhase(phase) { this.intensity = Math.max(0,phase); }

  // Low machinery ambience bed under the music (filtered noise + hum), tinted per context.
  ambience(track) {
    const c = this.ctx;
    if (!this.amb) {
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 260;
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = 0.13;
      lg.gain.value = 90;
      lfo.connect(lg);
      lg.connect(f.frequency);
      const hum = c.createOscillator();
      hum.type = 'sine';
      hum.frequency.value = 55;
      const hg = c.createGain();
      hg.gain.value = 0.012;
      const g = c.createGain();
      g.gain.value = 0;
      src.connect(f);
      f.connect(g);
      hum.connect(hg);
      hg.connect(g);
      g.connect(this.musicBus);
      src.start();
      lfo.start();
      hum.start();
      this.amb = { g, f, hum };
    }
    const level = track === 'title' ? 0.05 : track && track.startsWith('battle') ? 0.08 : track && track.startsWith('boss') ? .1 : 0.06;
    const hz = track === 'battle2' ? 70 : track === 'battle3' || track?.startsWith('boss') ? (track.startsWith('boss:') ? 41 + (scoreFor(track)?.root - 47) : 41) : 55;
    this.amb.g.gain.setTargetAtTime(level, c.currentTime, 0.8);
    this.amb.hum.frequency.setTargetAtTime(hz, c.currentTime, 0.8);
  }

  // ── music sequencer ──
  music(track) {
    this.wantTrack = track;
    if (!this.ctx) return;
    this.ambience(track);
    if (this.track === track) return;
    this.track = track;
    this.intensity = 0;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 30);
  }

  schedule() {
    if (!this.ctx || !this.track) return;
    const T = scoreFor(this.track);
    if (!T) return;
    const stepDur = 60 / T.bpm / 2; // eighth notes
    if (this.nextTime < this.ctx.currentTime - .16) this.nextTime = this.ctx.currentTime + .035;
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      this.playStep(T, this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  playStep(T, step, t, sd) {
    const c = this.ctx;
    const bar = Math.floor(step / 8) % T.prog.length;
    const deg = T.prog[bar];
    const chordRoot = T.root + T.scale[deg % T.scale.length] + (deg >= T.scale.length ? 12 : 0);
    const i = step % 8;
    const at = t - c.currentTime;
    const bus = this.musicBus;
    const b = T.bass[i];
    if (b !== null && b !== undefined) this.tone(NOTE(chordRoot - 12 + b), sd * 0.9, { type: 'sawtooth', vol: 0.11, at, bus, filter: { freq: 500 }, q: 3 });
    const ar = T.arp[i];
    if (ar !== null && ar !== undefined && (T.drums || i % 2 === 0)) this.tone(NOTE(chordRoot + 12 + ar), sd * 0.7, { type: T.arpWave, vol: T.arpWave === 'triangle' ? 0.06 : 0.025, at, bus, filter: { freq: 2600 } });
    if (this.intensity && this.track?.startsWith('boss') && (i === 3 || i === 7)) {
      this.tone(NOTE(chordRoot+19),sd*.83,{at,bus,type:'sine',vol:.036+Math.min(2,this.intensity)*.008,attack:.019});
    }
    if ((i === 2 || i === 6) && T.drums === 'drive') {
      this.noise(.076,{at,bus,vol:.047,freq:T.root<51 ? 1710 : 2450,endFreq:700,q:5});
    }
    if (T.pad && i === 0) {
      for (const n of [0, 3, 7]) this.tone(NOTE(chordRoot + n), sd * 7.5, { type: 'sawtooth', vol: 0.012, at, bus, attack: 0.4, filter: { freq: 900 }, detune: (n - 3) * 3 });
    }
    if (T.drums) {
      const heavy = T.drums === 'heavy';
      if (i % 4 === 0 || (heavy && i === 6)) this.tone(110, 0.18, { type: 'sine', vol: 0.32, slide: 40, at, bus });
      if (T.drums !== 'light' && i % 4 === 2) this.noise(0.12, { vol: 0.14, freq: 1800, type: 'bandpass', at, bus });
      this.noise(0.04, { vol: T.drums === 'light' ? 0.03 : 0.05, freq: 8000, type: 'highpass', at, bus });
    }
  }
}
