// Seeded random numbers. Every game and league uses one of these, so a seed replays exactly.

export function makeRng(seed) {
  let state = (Number(seed) >>> 0) || 0x9e3779b9;
  const rng = {
    get state() { return state; },
    set state(v) { state = v >>> 0; },
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let x = state;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    },
    int(lo, hi) { return lo + Math.floor(rng.next() * (hi - lo + 1)); },
    chance(p) { return rng.next() < p; },
    pick(arr) { return arr[Math.floor(rng.next() * arr.length)]; },
    normal(mean = 0, sd = 1) {
      const u = Math.max(rng.next(), 1e-12);
      const v = rng.next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    exp(mean) { return -mean * Math.log(Math.max(rng.next(), 1e-12)); },
    weighted(items, weightOf) {
      let total = 0;
      for (const it of items) total += Math.max(0, weightOf(it));
      if (total <= 0) return items[Math.floor(rng.next() * items.length)];
      let r = rng.next() * total;
      for (const it of items) {
        r -= Math.max(0, weightOf(it));
        if (r <= 0) return it;
      }
      return items[items.length - 1];
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
  return rng;
}

export function randomSeed() {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

export const logistic = (x) => 1 / (1 + Math.exp(-x));
export const logit = (p) => Math.log(p / (1 - p));
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
