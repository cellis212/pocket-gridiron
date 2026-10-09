// Turns a Pokémon's real stats into football ratings.
// Step 1: real in-game stats at the player's level (base stat, IV, nature, the main-series formula).
// Step 2: football attributes, each a fixed blend of those stats plus body size and body shape.
// Step 3: a 1-99 scale, where 99 is the 99.5th percentile of every Pokémon at full strength.
// The app plays everyone at full strength (level 100, perfect IVs, neutral nature); the level
// argument stays so the stat formula is the real one and the tests can check it.
import { POKEDEX, NATURES } from '../data/pokedex.js';
import { clamp } from './rng.js';

export const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
export const STAT_LABELS = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];
export const DEX = new Map(POKEDEX.map((p) => [p.id, p]));
export const NEUTRAL_NATURE = NATURES.findIndex((n) => n.name === 'hardy');

// How each football rating is built. This table drives both the math and the description on the
// Scouting page, so the two cannot drift apart.
// mix: weights over real stats. "hp" is HP without its level bonus, so it weighs like the others;
// "hi" and "lo" are the higher and the lower of Atk and SpA.
// body: size and shape factors, applied in order (see BODY_RULES and the shape tables below).
export const FORMULAS = {
  SPD: { mix: [['spe', 1]], body: [] },
  AGI: { mix: [['spe', 0.7], ['spd', 0.3]], body: [{ f: 'nimble' }] },
  STR: { mix: [['atk', 0.7], ['hp', 0.3]], body: [{ f: 'mass' }] },
  AWR: { mix: [['spa', 0.5], ['spd', 0.5]], body: [] },
  THP: { mix: [['hi', 0.6], ['lo', 0.4]], body: [{ f: 'hands', base: 0.55, scale: 0.45 }] },
  THA: { mix: [['spa', 0.65], ['spd', 0.35]], body: [{ f: 'hands', base: 0.3, scale: 0.7 }] },
  CTH: { mix: [['spd', 0.45], ['spe', 0.3], ['spa', 0.25]], body: [{ f: 'hands', base: 0.3, scale: 0.7 }, { f: 'reach' }] },
  CAR: { mix: [['hp', 0.5], ['def', 0.5]], body: [{ f: 'hands', base: 0.6, scale: 0.4 }] },
  RBK: { mix: [['def', 0.45], ['atk', 0.35], ['hp', 0.2]], body: [{ f: 'mass' }] },
  PBK: { mix: [['def', 0.45], ['spd', 0.3], ['hp', 0.25]], body: [{ f: 'mass' }] },
  PRS: { mix: [['atk', 0.5], ['spe', 0.3], ['hp', 0.2]], body: [{ f: 'mass', pow: 0.5 }] },
  TAK: { mix: [['atk', 0.5], ['def', 0.3], ['hp', 0.2]], body: [{ f: 'mass', pow: 0.7 }] },
  COV: { mix: [['spe', 0.5], ['spd', 0.3], ['spa', 0.2]], body: [{ f: 'nimble' }] },
  KPW: { mix: [['atk', 1]], body: [{ f: 'legs', base: 0.3, scale: 0.7 }] },
  KAC: { mix: [['spa', 0.6], ['spd', 0.4]], body: [{ f: 'legs', base: 0.3, scale: 0.7 }] },
  STA: { mix: [['hp', 0.6], ['def', 0.4]], body: [] },
};
export const MIX_LABELS = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe', hi: 'higher of Atk and SpA', lo: 'lower of Atk and SpA' };
export const BODY_LABELS = { mass: 'weight', nimble: 'light body', reach: 'height', hands: 'hands', legs: 'legs' };

const ATTR_NAMES = {
  SPD: 'Speed', AGI: 'Agility', STR: 'Strength', AWR: 'Awareness', THP: 'Throw Power', THA: 'Throw Accuracy',
  CTH: 'Catching', CAR: 'Carrying', RBK: 'Run Block', PBK: 'Pass Block', PRS: 'Pass Rush', TAK: 'Tackling',
  COV: 'Coverage', KPW: 'Kick Power', KAC: 'Kick Accuracy', STA: 'Stamina',
};
export const ATTRS = Object.entries(FORMULAS).map(([key, f]) => ({
  key,
  name: ATTR_NAMES[key],
  from: [...new Set([...f.mix.flatMap(([k]) => (k === 'hi' || k === 'lo' ? ['Atk', 'SpA'] : [MIX_LABELS[k]])), ...f.body.map((b) => BODY_LABELS[b.f])])].join(', '),
}));
export const ATTR_KEYS = ATTRS.map((a) => a.key);

export const POSITIONS = {
  QB: { name: 'Quarterback', side: 'O', w: { THA: 0.36, THP: 0.2, AWR: 0.26, AGI: 0.09, SPD: 0.09 } },
  RB: { name: 'Running Back', side: 'O', w: { SPD: 0.24, AGI: 0.24, CAR: 0.2, STR: 0.17, CTH: 0.1, AWR: 0.05 } },
  WR: { name: 'Wide Receiver', side: 'O', w: { CTH: 0.36, SPD: 0.3, AGI: 0.2, AWR: 0.09, STR: 0.05 } },
  TE: { name: 'Tight End', side: 'O', w: { CTH: 0.3, RBK: 0.22, STR: 0.2, SPD: 0.16, AWR: 0.12 } },
  OL: { name: 'Offensive Line', side: 'O', w: { PBK: 0.4, RBK: 0.38, STR: 0.12, AWR: 0.1 } },
  DL: { name: 'Defensive Line', side: 'D', w: { PRS: 0.36, TAK: 0.26, STR: 0.26, AWR: 0.12 } },
  LB: { name: 'Linebacker', side: 'D', w: { TAK: 0.34, AWR: 0.2, SPD: 0.16, COV: 0.15, PRS: 0.15 } },
  CB: { name: 'Cornerback', side: 'D', w: { COV: 0.42, SPD: 0.3, AGI: 0.16, AWR: 0.12 } },
  S: { name: 'Safety', side: 'D', w: { COV: 0.32, TAK: 0.24, AWR: 0.24, SPD: 0.2 } },
  K: { name: 'Kicker', side: 'ST', w: { KPW: 0.5, KAC: 0.5 } },
  P: { name: 'Punter', side: 'ST', w: { KPW: 0.62, KAC: 0.38 } },
};
export const POS_KEYS = Object.keys(POSITIONS);

// How well each body shape can hold a ball (hands) and kick one (legs).
export const SHAPE_HANDS = {
  humanoid: 1, arms: 0.9, upright: 0.85, tentacles: 0.85, armor: 0.7, 'bug-wings': 0.6,
  heads: 0.5, blob: 0.5, wings: 0.45, legs: 0.4, quadruped: 0.35, ball: 0.3, squiggle: 0.3, fish: 0.25,
};
export const SHAPE_LEGS = {
  humanoid: 1, legs: 1, upright: 0.9, quadruped: 0.85, armor: 0.8, arms: 0.6, wings: 0.6, tentacles: 0.6,
  'bug-wings': 0.55, heads: 0.5, ball: 0.5, blob: 0.45, squiggle: 0.4, fish: 0.35,
};
export const SHAPE_LABELS = {
  humanoid: 'Humanoid', arms: 'Arms only', upright: 'Upright', tentacles: 'Tentacles', armor: 'Armored',
  'bug-wings': 'Insect', heads: 'Many heads', blob: 'Blob', wings: 'Winged', legs: 'Legs only',
  quadruped: 'Four legs', ball: 'Head only', squiggle: 'Serpent', fish: 'Fins',
};

// Abilities that change a stat or a rating before the game starts. Game-time abilities live in perks.js.
export const STAT_ABILITIES = {
  'huge-power': { atk: 2 },
  'pure-power': { atk: 2 },
  'gorilla-tactics': { atk: 1.5 },
  hustle: { atk: 1.5 },
  'fur-coat': { def: 2 },
};
export const RATING_ABILITIES = {
  hustle: { THA: 0.8, CTH: 0.8, KAC: 0.8 },
  'compound-eyes': { THA: 1.2, CTH: 1.2, KAC: 1.2 },
  'keen-eye': { COV: 1.06, CTH: 1.06 },
  'no-guard': { THA: 1.1, CTH: 1.1 },
};

export function abilityOf(speciesId, slot) {
  const sp = DEX.get(speciesId);
  if (slot === 2) return sp.hidden || sp.abil[0] || '';
  return sp.abil[slot] || sp.abil[0] || sp.hidden || '';
}

export function realStats(speciesId, level, ivs, natureIdx, ability) {
  const sp = DEX.get(speciesId);
  const nature = NATURES[natureIdx] ?? NATURES[NEUTRAL_NATURE];
  const out = {};
  sp.base.forEach((b, i) => {
    const core = Math.floor(((2 * b + ivs[i]) * level) / 100);
    if (i === 0) {
      out.hp = sp.slug === 'shedinja' ? 1 : core + level + 10;
    } else {
      let mod = 1;
      if (nature.up === i) mod = 1.1;
      if (nature.down === i) mod = 0.9;
      out[STAT_KEYS[i]] = Math.floor((core + 5) * mod);
    }
  });
  const boost = STAT_ABILITIES[ability];
  if (boost) for (const k of Object.keys(boost)) out[k] = Math.floor(out[k] * boost[k]);
  return out;
}

// Size factors: 1 + k × log2(size ÷ reference), kept between lo and hi.
export const BODY_RULES = {
  mass: { k: 0.07, ref: 60, unit: 'kg', lo: 0.8, hi: 1.2 },
  reach: { k: 0.06, ref: 1.5, unit: 'm', lo: 0.88, hi: 1.12 },
  nimble: { k: -0.04, ref: 60, unit: 'kg', lo: 0.88, hi: 1.1 },
};
const sizeRule = (rule, x) => clamp(1 + rule.k * Math.log2(x / rule.ref), rule.lo, rule.hi);

function sizeFactors(sp) {
  const kg = Math.max(sp.w / 10, 0.1);
  const m = Math.max(sp.h / 10, 0.1);
  return {
    mass: sizeRule(BODY_RULES.mass, kg),
    reach: sizeRule(BODY_RULES.reach, m),
    nimble: sizeRule(BODY_RULES.nimble, kg),
    hands: SHAPE_HANDS[sp.shape] ?? 0.6,
    legs: SHAPE_LEGS[sp.shape] ?? 0.6,
  };
}

function bodyFactor(b, f) {
  if (b.f === 'hands' || b.f === 'legs') return b.base + b.scale * f[b.f];
  const v = f[b.f];
  if (!b.pow || b.pow === 1) return v;
  return b.pow === 0.5 ? Math.sqrt(v) : v ** b.pow;
}

function rawAttributes(sp, s, level) {
  const f = sizeFactors(sp);
  // HP has a level bonus the other stats lack; remove it so the blends weigh like with like.
  const stats = { ...s, hp: Math.max(1, s.hp - level - 5), hi: Math.max(s.atk, s.spa), lo: Math.min(s.atk, s.spa) };
  const out = {};
  for (const [key, formula] of Object.entries(FORMULAS)) {
    let v = 0;
    for (const [k, w] of formula.mix) v += w * stats[k];
    for (const b of formula.body) v *= bodyFactor(b, f);
    out[key] = v;
  }
  return out;
}

// Step-by-step math for one rating of one player, for the Scouting page. Uses the same pieces as
// rate(), so the final number always matches the rating shown everywhere else.
export function explainRating(p, key) {
  const sp = DEX.get(p.species);
  const ability = abilityOf(p.species, p.abilitySlot);
  const s = realStats(p.species, p.level, p.ivs, p.nature, ability);
  const f = sizeFactors(sp);
  const stats = { ...s, hp: Math.max(1, s.hp - p.level - 5), hi: Math.max(s.atk, s.spa), lo: Math.min(s.atk, s.spa) };
  const formula = FORMULAS[key];
  const parts = formula.mix.map(([k, w]) => ({ stat: k, weight: w, value: stats[k] }));
  let v = 0;
  for (const part of parts) v += part.weight * part.value;
  const mix = v;
  const factors = formula.body.map((b) => {
    const x = bodyFactor(b, f);
    v *= x;
    return { f: b.f, value: x };
  });
  const abilityMod = RATING_ABILITIES[ability]?.[key] ?? 1;
  const statBoost = STAT_ABILITIES[ability] ?? null;
  const rating = clamp(Math.round((99 * v * abilityMod) / RATING_REF[key]), 1, 99);
  return { parts, mix, factors, raw: v, ability, abilityMod, statBoost, ref: RATING_REF[key], rating, kg: sp.w / 10, m: sp.h / 10, shape: sp.shape };
}

// The 99.5th-percentile raw value of each attribute among all Pokémon at level 100, perfect IVs.
export const RATING_REF = (() => {
  const perfect = [31, 31, 31, 31, 31, 31];
  const cols = Object.fromEntries(ATTR_KEYS.map((k) => [k, []]));
  for (const sp of POKEDEX) {
    const raw = rawAttributes(sp, realStats(sp.id, 100, perfect, NEUTRAL_NATURE, ''), 100);
    for (const k of ATTR_KEYS) cols[k].push(raw[k]);
  }
  return Object.fromEntries(ATTR_KEYS.map((k) => {
    const sorted = cols[k].sort((a, b) => a - b);
    return [k, sorted[Math.floor(sorted.length * 0.995)]];
  }));
})();

function weightedSum(attrs, pos) {
  const w = POSITIONS[pos].w;
  let sum = 0;
  for (const k in w) sum += w[k] * attrs[k];
  return sum;
}

// Position overalls use the same 99.5th-percentile anchor, so a 75 means the same thing at every position.
export const POSITION_REF = (() => {
  const perfect = [31, 31, 31, 31, 31, 31];
  const cols = Object.fromEntries(POS_KEYS.map((k) => [k, []]));
  for (const sp of POKEDEX) {
    const attrs = scaleAttributes(rawAttributes(sp, realStats(sp.id, 100, perfect, NEUTRAL_NATURE, ''), 100), {});
    for (const pos of POS_KEYS) cols[pos].push(weightedSum(attrs, pos));
  }
  return Object.fromEntries(POS_KEYS.map((k) => {
    const sorted = cols[k].sort((a, b) => a - b);
    return [k, sorted[Math.floor(sorted.length * 0.995)]];
  }));
})();

export function positionOvr(attrs, pos) {
  return clamp(Math.round((99 * weightedSum(attrs, pos)) / POSITION_REF[pos]), 1, 99);
}

function scaleAttributes(raw, mods) {
  const attrs = {};
  for (const k of ATTR_KEYS) attrs[k] = clamp(Math.round((99 * raw[k] * (mods[k] ?? 1)) / RATING_REF[k]), 1, 99);
  return attrs;
}

// Field positions only; kickers and punters are judged on their own two ratings.
export const FIELD_POS = POS_KEYS.filter((p) => POSITIONS[p].side !== 'ST');

const cache = new Map();
// A rated player: real stats, attributes (1-99), and an overall for every position.
export function rate(speciesId, level, ivs, natureIdx, abilitySlot) {
  const key = `${speciesId}|${level}|${ivs.join(',')}|${natureIdx}|${abilitySlot}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const sp = DEX.get(speciesId);
  const ability = abilityOf(speciesId, abilitySlot);
  const stats = realStats(speciesId, level, ivs, natureIdx, ability);
  const raw = rawAttributes(sp, stats, level);
  const mods = RATING_ABILITIES[ability] ?? {};
  const attrs = scaleAttributes(raw, mods);
  const ovr = {};
  let best = 'QB';
  for (const pos of POS_KEYS) {
    ovr[pos] = positionOvr(attrs, pos);
    if (POSITIONS[pos].side !== 'ST' && ovr[pos] > ovr[best]) best = pos;
  }
  const out = { stats, attrs, ovr, best, ability };
  if (cache.size > 50000) cache.clear();
  cache.set(key, out);
  return out;
}
