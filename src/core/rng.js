// Seeded, serializable PRNG (mulberry32). All gameplay randomness flows through this.
export class RNG {
  constructor(seed) {
    this.s = (seed >>> 0) || 0x9e3779b9;
  }
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n) {
    return Math.floor(this.next() * n);
  }
  range(a, b) {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  chance(p) {
    return this.next() < p;
  }
  pick(arr) {
    return arr.length ? arr[this.int(arr.length)] : undefined;
  }
  weighted(entries) {
    // entries: [[item, weight], ...]
    let total = 0;
    for (const [, w] of entries) total += Math.max(0, w);
    if (total <= 0) return entries.length ? entries[0][0] : undefined;
    let r = this.next() * total;
    for (const [item, w] of entries) {
      r -= Math.max(0, w);
      if (r < 0) return item;
    }
    return entries[entries.length - 1][0];
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  sample(arr, n) {
    return this.shuffle(arr.slice()).slice(0, n);
  }
  fork(salt) {
    // derive a child stream without disturbing determinism of the parent beyond one draw
    return new RNG((this.s ^ hashStr(String(salt))) >>> 0);
  }
}

export function hashStr(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seedFrom(...parts) {
  return hashStr(parts.join('|'));
}
