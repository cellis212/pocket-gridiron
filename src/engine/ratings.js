// Turns a Pokémon's real stats into football ratings.
// Step 1: real in-game stats at the player's level (base stat, IV, nature, the main-series formula).
// Step 2: football attributes, each a fixed blend of those stats plus body size and body shape.
// Step 3: a 1-99 scale, where 99 is the 99.5th percentile of every Pokémon at level 100 with perfect IVs.
import { POKEDEX, TYPES, NATURES, ABILITIES } from '../data/pokedex.js';
import { clamp } from './rng.js';

export const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
export const STAT_LABELS = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];
export const DEX = new Map(POKEDEX.map((p) => [p.id, p]));
export const EVOLVES_TO = new Map();
for (const p of POKEDEX) {
  if (!p.from) continue;
  if (!EVOLVES_TO.has(p.from)) EVOLVES_TO.set(p.from, []);
  EVOLVES_TO.get(p.from).push(p.id);
}
export const NEUTRAL_NATURE = NATURES.findIndex((n) => n.name === 'hardy');

export const ATTRS = [
  { key: 'SPD', name: 'Speed', from: 'Spe' },
  { key: 'AGI', name: 'Agility', from: 'Spe, SpD, light body' },
  { key: 'STR', name: 'Strength', from: 'Atk, HP, weight' },
  { key: 'AWR', name: 'Awareness', from: 'SpA, SpD' },
  { key: 'THP', name: 'Throw Power', from: 'Atk, SpA, hands' },
  { key: 'THA', name: 'Throw Accuracy', from: 'SpA, SpD, hands' },
  { key: 'CTH', name: 'Catching', from: 'SpD, Spe, SpA, hands, height' },
  { key: 'CAR', name: 'Carrying', from: 'HP, Def, hands' },
  { key: 'RBK', name: 'Run Block', from: 'Def, Atk, HP, weight' },
  { key: 'PBK', name: 'Pass Block', from: 'Def, SpD, HP, weight' },
  { key: 'PRS', name: 'Pass Rush', from: 'Atk, Spe, HP, weight' },
  { key: 'TAK', name: 'Tackling', from: 'Atk, Def, HP, weight' },
  { key: 'COV', name: 'Coverage', from: 'Spe, SpD, SpA, light body' },
  { key: 'KPW', name: 'Kick Power', from: 'Atk, legs' },
  { key: 'KAC', name: 'Kick Accuracy', from: 'SpA, SpD, legs' },
  { key: 'STA', name: 'Stamina', from: 'HP, Def' },
];
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
const STAT_ABILITIES = {
  'huge-power': { atk: 2 },
  'pure-power': { atk: 2 },
  'gorilla-tactics': { atk: 1.5 },
  hustle: { atk: 1.5 },
  'fur-coat': { def: 2 },
};
const RATING_ABILITIES = {
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
export const abilityName = (slug) => ABILITIES[slug] ?? slug;

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

function sizeFactors(sp) {
  const kg = Math.max(sp.w / 10, 0.1);
  const m = Math.max(sp.h / 10, 0.1);
  return {
    mass: clamp(1 + 0.07 * Math.log2(kg / 60), 0.8, 1.2),
    reach: clamp(1 + 0.06 * Math.log2(m / 1.5), 0.88, 1.12),
    nimble: clamp(1 - 0.04 * Math.log2(kg / 60), 0.88, 1.1),
    hands: SHAPE_HANDS[sp.shape] ?? 0.6,
    legs: SHAPE_LEGS[sp.shape] ?? 0.6,
  };
}

function rawAttributes(sp, s, level) {
  const f = sizeFactors(sp);
  // HP has a level bonus the other stats lack; remove it so the blends weigh like with like.
  const hp = Math.max(1, s.hp - level - 5);
  return {
    SPD: s.spe,
    AGI: (0.7 * s.spe + 0.3 * s.spd) * f.nimble,
    STR: (0.7 * s.atk + 0.3 * hp) * f.mass,
    AWR: 0.5 * s.spa + 0.5 * s.spd,
    THP: (0.6 * Math.max(s.atk, s.spa) + 0.4 * Math.min(s.atk, s.spa)) * (0.55 + 0.45 * f.hands),
    THA: (0.65 * s.spa + 0.35 * s.spd) * (0.3 + 0.7 * f.hands),
    CTH: (0.45 * s.spd + 0.3 * s.spe + 0.25 * s.spa) * (0.3 + 0.7 * f.hands) * f.reach,
    CAR: (0.5 * hp + 0.5 * s.def) * (0.6 + 0.4 * f.hands),
    RBK: (0.45 * s.def + 0.35 * s.atk + 0.2 * hp) * f.mass,
    PBK: (0.45 * s.def + 0.3 * s.spd + 0.25 * hp) * f.mass,
    PRS: (0.5 * s.atk + 0.3 * s.spe + 0.2 * hp) * Math.sqrt(f.mass),
    TAK: (0.5 * s.atk + 0.3 * s.def + 0.2 * hp) * f.mass ** 0.7,
    COV: (0.5 * s.spe + 0.3 * s.spd + 0.2 * s.spa) * f.nimble,
    KPW: s.atk * (0.3 + 0.7 * f.legs),
    KAC: (0.6 * s.spa + 0.4 * s.spd) * (0.3 + 0.7 * f.legs),
    STA: 0.6 * hp + 0.4 * s.def,
  };
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

// Every species this one can still become, including itself.
export function evolutionLine(speciesId) {
  const out = [speciesId];
  for (const child of EVOLVES_TO.get(speciesId) ?? []) out.push(...evolutionLine(child));
  return out;
}
export function finalForms(speciesId) {
  const kids = EVOLVES_TO.get(speciesId) ?? [];
  if (!kids.length) return [speciesId];
  return kids.flatMap(finalForms);
}

// Potential: the best overall this individual can reach at level 100 in any final form.
// It does not depend on the current level, so it is cached per individual.
const potCache = new Map();
export function potentials(player) {
  const key = `${player.species}|${player.ivs.join(',')}|${player.nature}|${player.abilitySlot}`;
  let hit = potCache.get(key);
  if (hit) return hit;
  hit = {};
  for (const form of finalForms(player.species)) {
    const r = rate(form, 100, player.ivs, player.nature, player.abilitySlot);
    for (const pos of POS_KEYS) hit[pos] = Math.max(hit[pos] ?? 0, r.ovr[pos]);
  }
  hit.best = Math.max(...FIELD_POS.map((pos) => hit[pos]));
  if (potCache.size > 20000) potCache.clear();
  potCache.set(key, hit);
  return hit;
}
export function potential(player, pos) {
  const pots = potentials(player);
  return pos ? pots[pos] : pots.best;
}

// ---- Experience and levels (the main-series growth-rate curves) ----
export function expForLevel(growth, n) {
  if (n <= 1) return 0;
  const n3 = n ** 3;
  switch (growth) {
    case 'fast': return Math.floor((4 * n3) / 5);
    case 'medium': return n3;
    case 'slow': return Math.floor((5 * n3) / 4);
    case 'medium-slow': return Math.max(0, Math.floor((6 * n3) / 5 - 15 * n * n + 100 * n - 140));
    case 'slow-then-very-fast':
      if (n <= 50) return Math.floor((n3 * (100 - n)) / 50);
      if (n <= 68) return Math.floor((n3 * (150 - n)) / 100);
      if (n <= 98) return Math.floor((n3 * Math.floor((1911 - 10 * n) / 3)) / 500);
      return Math.floor((n3 * (160 - n)) / 100);
    case 'fast-then-very-slow':
      if (n <= 15) return Math.floor((n3 * (Math.floor((n + 1) / 3) + 24)) / 50);
      if (n <= 36) return Math.floor((n3 * (n + 14)) / 50);
      return Math.floor((n3 * (Math.floor(n / 2) + 32)) / 50);
    default: return n3;
  }
}
export function levelForExp(growth, exp) {
  let lvl = 1;
  while (lvl < 100 && expForLevel(growth, lvl + 1) <= exp) lvl++;
  return lvl;
}

export const typeName = (i) => TYPES[i];
export function speciesTypes(speciesId) {
  return DEX.get(speciesId).types;
}
