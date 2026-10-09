import test from 'node:test';
import assert from 'node:assert/strict';
import { POKEDEX, TYPES } from '../src/data/pokedex.js';
import {
  DEX, realStats, rate, expForLevel, levelForExp, NEUTRAL_NATURE, ATTR_KEYS, POS_KEYS, potential, SHAPE_HANDS,
} from '../src/engine/ratings.js';
import { typeFactor, TYPE } from '../src/engine/perks.js';
import { exhibitionPlayer, autoLineup, SLOTS, themePool, THEMES } from '../src/engine/lineup.js';

const PERFECT = [31, 31, 31, 31, 31, 31];

test('the Pokédex has all 1,025 species with six base stats and real types', () => {
  assert.equal(POKEDEX.length, 1025);
  assert.equal(new Set(POKEDEX.map((p) => p.id)).size, 1025);
  for (const p of POKEDEX) {
    assert.equal(p.base.length, 6, p.name);
    assert.ok(p.types.length >= 1 && p.types.length <= 2, p.name);
    for (const t of p.types) assert.ok(t >= 0 && t < TYPES.length, p.name);
  }
  assert.deepEqual(DEX.get(445).base, [108, 130, 95, 80, 85, 102]); // Garchomp
});

test('real stats follow the main-series formula', () => {
  // Garchomp, level 78, Adamant (+Atk, -SpA), IVs 24/12/30/16/23/5, no EVs.
  const ivs = [24, 12, 30, 16, 23, 5];
  const adamant = 0; // NATURES is sorted by name; adamant is first
  const s = realStats(445, 78, ivs, adamant, '');
  const core = (b, iv) => Math.floor(((2 * b + iv) * 78) / 100);
  assert.equal(s.hp, core(108, 24) + 78 + 10);
  assert.equal(s.atk, Math.floor((core(130, 12) + 5) * 1.1));
  assert.equal(s.def, core(95, 30) + 5);
  assert.equal(s.spa, Math.floor((core(80, 16) + 5) * 0.9));
  assert.equal(s.spe, core(102, 5) + 5);
  assert.equal(realStats(292, 50, PERFECT, NEUTRAL_NATURE, '').hp, 1, 'Shedinja always has 1 HP');
});

test('Huge Power doubles Attack', () => {
  const thickFat = realStats(184, 50, PERFECT, NEUTRAL_NATURE, 'thick-fat');
  const hugePower = realStats(184, 50, PERFECT, NEUTRAL_NATURE, 'huge-power');
  assert.equal(hugePower.atk, thickFat.atk * 2);
});

test('ratings stay on the 1-99 scale and rise with level', () => {
  for (const p of POKEDEX) {
    const r = rate(p.id, 100, PERFECT, NEUTRAL_NATURE, 0);
    for (const k of ATTR_KEYS) assert.ok(r.attrs[k] >= 1 && r.attrs[k] <= 99, `${p.name} ${k}`);
    const low = rate(p.id, 30, PERFECT, NEUTRAL_NATURE, 0);
    for (const pos of POS_KEYS) assert.ok(low.ovr[pos] <= r.ovr[pos], `${p.name} ${pos}`);
  }
});

test('body shape matters: fins cannot throw like hands', () => {
  assert.ok(SHAPE_HANDS.fish < SHAPE_HANDS.humanoid);
  const machamp = rate(68, 100, PERFECT, NEUTRAL_NATURE, 0);
  const magikarp = rate(129, 100, PERFECT, NEUTRAL_NATURE, 0);
  assert.ok(machamp.attrs.THA > magikarp.attrs.THA);
});

test('potential looks ahead to the final evolution', () => {
  const karp = { species: 129, level: 10, ivs: PERFECT, nature: NEUTRAL_NATURE, abilitySlot: 0 };
  const gyarados = rate(130, 100, PERFECT, NEUTRAL_NATURE, 0);
  assert.equal(potential(karp, 'DL'), gyarados.ovr.DL);
  assert.ok(potential(karp) > rate(129, 100, PERFECT, NEUTRAL_NATURE, 0).ovr.CB);
});

test('experience curves match the games at level 100', () => {
  assert.equal(expForLevel('fast', 100), 800000);
  assert.equal(expForLevel('medium', 100), 1000000);
  assert.equal(expForLevel('medium-slow', 100), 1059860);
  assert.equal(expForLevel('slow', 100), 1250000);
  assert.equal(expForLevel('slow-then-very-fast', 100), 600000);
  assert.equal(expForLevel('fast-then-very-slow', 100), 1640000);
  for (const g of ['fast', 'medium', 'medium-slow', 'slow', 'slow-then-very-fast', 'fast-then-very-slow']) {
    for (const lvl of [2, 10, 37, 50, 69, 99]) assert.equal(levelForExp(g, expForLevel(g, lvl)), lvl, `${g} ${lvl}`);
  }
});

test('type chart and type abilities', () => {
  const t = (name) => [TYPE[name]];
  assert.equal(typeFactor(t('fire'), '', t('grass'), ''), 2);
  assert.equal(typeFactor(t('water'), '', t('fire'), ''), 2);
  assert.equal(typeFactor(t('normal'), '', t('ghost'), ''), 0);
  assert.equal(typeFactor(t('ground'), '', t('flying'), ''), 0);
  assert.equal(typeFactor(t('ground'), '', t('electric'), 'levitate'), 0);
  assert.equal(typeFactor(t('normal'), 'scrappy', t('ghost'), ''), 1);
  assert.equal(typeFactor(t('fire'), '', t('normal'), 'thick-fat'), 0.5);
  assert.equal(typeFactor(t('ice'), '', [TYPE.dragon, TYPE.ground], ''), 4);
});

test('the lineup optimizer fills all 24 slots with different players', () => {
  for (const theme of THEMES) {
    const ids = themePool(theme.id);
    if (ids.length < 24) continue;
    const players = ids.map((s) => exhibitionPlayer(s, 100));
    const lineup = autoLineup(players);
    const used = Object.values(lineup);
    assert.equal(used.length, SLOTS.length, theme.id);
    assert.ok(used.every(Boolean), theme.id);
    assert.equal(new Set(used).size, used.length, theme.id);
  }
});
