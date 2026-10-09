// Lineup slots, individual players, and the lineup optimizer.
import { POKEDEX, NATURES } from '../data/pokedex.js';
import { DEX, POSITIONS, rate, NEUTRAL_NATURE, abilityOf } from './ratings.js';
import { TYPE } from './perks.js';

export const SLOTS = [
  { id: 'QB', pos: 'QB' }, { id: 'RB', pos: 'RB' },
  { id: 'WR1', pos: 'WR' }, { id: 'WR2', pos: 'WR' }, { id: 'WR3', pos: 'WR' }, { id: 'TE', pos: 'TE' },
  { id: 'LT', pos: 'OL' }, { id: 'LG', pos: 'OL' }, { id: 'C', pos: 'OL' }, { id: 'RG', pos: 'OL' }, { id: 'RT', pos: 'OL' },
  { id: 'LE', pos: 'DL' }, { id: 'DT1', pos: 'DL' }, { id: 'DT2', pos: 'DL' }, { id: 'RE', pos: 'DL' },
  { id: 'WLB', pos: 'LB' }, { id: 'MLB', pos: 'LB' }, { id: 'SLB', pos: 'LB' },
  { id: 'CB1', pos: 'CB' }, { id: 'CB2', pos: 'CB' }, { id: 'FS', pos: 'S' }, { id: 'SS', pos: 'S' },
  { id: 'K', pos: 'K' }, { id: 'P', pos: 'P' },
];
export const SLOT_POS = Object.fromEntries(SLOTS.map((s) => [s.id, s.pos]));
export const SLOT_GROUPS = [
  { name: 'Offense', slots: ['QB', 'RB', 'WR1', 'WR2', 'WR3', 'TE', 'LT', 'LG', 'C', 'RG', 'RT'] },
  { name: 'Defense', slots: ['LE', 'DT1', 'DT2', 'RE', 'WLB', 'MLB', 'SLB', 'CB1', 'CB2', 'FS', 'SS'] },
  { name: 'Special teams', slots: ['K', 'P'] },
];

// How much one rating point at each position is worth to the team. Quarterback matters most.
export const IMPORTANCE = { QB: 1.7, RB: 0.9, WR: 1.05, TE: 0.8, OL: 0.95, DL: 1.0, LB: 0.85, CB: 1.05, S: 0.85, K: 0.55, P: 0.35 };

const PERFECT = [31, 31, 31, 31, 31, 31];

// A player is one individual Pokémon: species, level, IVs, nature and ability slot.
export function makePlayer({ pid, species, level, ivs = PERFECT, nature = NEUTRAL_NATURE, abilitySlot = 0, num = 0 }) {
  return { pid, species, level, ivs, nature, abilitySlot, num };
}

export function randomPlayer(rng, pid, species, level) {
  const sp = DEX.get(species);
  const slots = [0];
  if (sp.abil[1]) slots.push(1);
  const abilitySlot = sp.hidden && rng.chance(0.12) ? 2 : rng.pick(slots);
  return makePlayer({
    pid, species, level,
    ivs: Array.from({ length: 6 }, () => rng.int(0, 31)),
    nature: rng.int(0, NATURES.length - 1),
    abilitySlot,
  });
}

export const ratingOf = (p) => rate(p.species, p.level, p.ivs, p.nature, p.abilitySlot);
export const nameOf = (p) => DEX.get(p.species).name;

// Small extra value for game-time abilities, so the optimizer and AI GMs notice them.
const PERK_VALUE = {
  intimidate: 2, 'speed-boost': 2, regenerator: 1, moxie: 1, 'sticky-hold': 1, sturdy: 1, sniper: 1, technician: 1,
  truant: -12, 'slow-start': -6, defeatist: -3,
};
export const perkValue = (p) => PERK_VALUE[abilityOf(p.species, p.abilitySlot)] ?? 0;

export function slotValue(p, pos) {
  return IMPORTANCE[pos] * (ratingOf(p).ovr[pos] + perkValue(p));
}

// Exhibition players: perfect IVs, a neutral nature, and whichever ability slot rates best.
export function exhibitionPlayer(species, level, pid = `x${species}`) {
  const sp = DEX.get(species);
  let best = null;
  for (const slot of [0, 1, 2]) {
    if (slot === 1 && !sp.abil[1]) continue;
    if (slot === 2 && !sp.hidden) continue;
    const p = makePlayer({ pid, species, level, abilitySlot: slot });
    const r = ratingOf(p);
    const score = r.ovr[r.best] + perkValue(p);
    if (!best || score > best.score) best = { p, score };
  }
  return best.p;
}

// Fill every slot from a pool of players: greedy start, then swaps until no swap helps.
export function autoLineup(players, { locked = {} } = {}) {
  const lineup = Object.fromEntries(SLOTS.map((s) => [s.id, null]));
  const used = new Set();
  for (const [slot, pid] of Object.entries(locked)) {
    if (pid && players.some((p) => p.pid === pid)) { lineup[slot] = pid; used.add(pid); }
  }
  const byId = new Map(players.map((p) => [p.pid, p]));
  const open = SLOTS.filter((s) => !lineup[s.id]);
  const pairs = [];
  for (const p of players) {
    if (used.has(p.pid)) continue;
    for (const s of open) pairs.push({ p, s, v: slotValue(p, s.pos) });
  }
  pairs.sort((a, b) => b.v - a.v);
  for (const { p, s } of pairs) {
    if (lineup[s.id] || used.has(p.pid)) continue;
    lineup[s.id] = p.pid;
    used.add(p.pid);
  }
  const free = new Set(open.map((s) => s.id));
  const val = (pid, slot) => (pid ? slotValue(byId.get(pid), SLOT_POS[slot]) : 0);
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    const ids = [...free];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i], b = ids[j];
        if (SLOT_POS[a] === SLOT_POS[b]) continue;
        const now = val(lineup[a], a) + val(lineup[b], b);
        const swap = val(lineup[b], a) + val(lineup[a], b);
        if (swap > now + 0.01) { [lineup[a], lineup[b]] = [lineup[b], lineup[a]]; changed = true; }
      }
    }
    for (const p of players) {
      if (used.has(p.pid)) continue;
      let bestSlot = null, gain = 0.01;
      for (const s of ids) {
        const g = slotValue(p, SLOT_POS[s]) - val(lineup[s], s);
        if (g > gain) { gain = g; bestSlot = s; }
      }
      if (bestSlot) {
        if (lineup[bestSlot]) used.delete(lineup[bestSlot]);
        lineup[bestSlot] = p.pid;
        used.add(p.pid);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return lineup;
}

export function teamStrength(lineup, players) {
  const byId = new Map(players.map((p) => [p.pid, p]));
  let off = 0, def = 0, offW = 0, defW = 0;
  for (const s of SLOTS) {
    const p = byId.get(lineup[s.id]);
    const side = POSITIONS[s.pos].side;
    const w = IMPORTANCE[s.pos];
    const v = p ? ratingOf(p).ovr[s.pos] : 0;
    if (side === 'D') { def += w * v; defW += w; } else { off += w * v; offW += w; }
  }
  return { off: Math.round(off / offW), def: Math.round(def / defW), ovr: Math.round((off + def) / (offW + defW)) };
}

// ---- Theme pools for exhibition games ----
const STARTER_LINES = [1, 4, 7, 152, 155, 158, 252, 255, 258, 387, 390, 393, 495, 498, 501, 650, 653, 656, 722, 725, 728, 810, 813, 816, 906, 909, 912];
const PSEUDO_LINES = [147, 246, 371, 374, 443, 633, 704, 782, 885, 996];
const lineOf = (root) => {
  const out = [root];
  for (const p of POKEDEX) if (out.includes(p.from)) out.push(p.id);
  return out;
};

export const THEMES = (() => {
  const t = [];
  const gens = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar', 'Paldea'];
  gens.forEach((region, i) => t.push({ id: `gen${i + 1}`, name: `${region} All-Stars`, group: 'Region', filter: (p) => p.gen === i + 1 }));
  ['normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy']
    .forEach((type) => t.push({ id: `type-${type}`, name: `Team ${type[0].toUpperCase()}${type.slice(1)}`, group: 'Type', type }));
  const starters = new Set(STARTER_LINES.flatMap(lineOf));
  const pseudos = new Set(PSEUDO_LINES.flatMap(lineOf));
  t.push({ id: 'legends', name: 'Legends & Mythicals', group: 'Special', filter: (p) => p.leg || p.myth });
  t.push({ id: 'starters', name: 'Starter Squad', group: 'Special', filter: (p) => starters.has(p.id) });
  t.push({ id: 'pseudo', name: 'Pseudo-Legend Club', group: 'Special', filter: (p) => pseudos.has(p.id) });
  t.push({ id: 'standard', name: 'No Legends Allowed', group: 'Special', filter: (p) => !p.leg && !p.myth });
  t.push({ id: 'little', name: 'Little Cup (unevolved)', group: 'Special', filter: (p) => !p.from && !p.leg && !p.myth && POKEDEX.some((q) => q.from === p.id) });
  t.push({ id: 'everyone', name: 'Every Pokémon', group: 'Special', filter: () => true });
  return t;
})();

export function themePool(themeId) {
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
  if (theme.type) return POKEDEX.filter((p) => p.types.includes(TYPE[theme.type])).map((p) => p.id);
  return POKEDEX.filter(theme.filter).map((p) => p.id);
}
