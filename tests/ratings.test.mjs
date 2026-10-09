import test from 'node:test';
import assert from 'node:assert/strict';
import { POKEDEX, TYPES } from '../src/data/pokedex.js';
import { DEX, realStats, rate, NEUTRAL_NATURE, ATTR_KEYS, SHAPE_HANDS, explainRating, FORMULAS } from '../src/engine/ratings.js';
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

test('ratings stay on the 1-99 scale', () => {
  for (const p of POKEDEX) {
    const r = rate(p.id, 100, PERFECT, NEUTRAL_NATURE, 0);
    for (const k of ATTR_KEYS) assert.ok(r.attrs[k] >= 1 && r.attrs[k] <= 99, `${p.name} ${k}`);
  }
});

test('body shape matters: fins cannot throw like hands', () => {
  assert.ok(SHAPE_HANDS.fish < SHAPE_HANDS.humanoid);
  const machamp = rate(68, 100, PERFECT, NEUTRAL_NATURE, 0);
  const magikarp = rate(129, 100, PERFECT, NEUTRAL_NATURE, 0);
  assert.ok(machamp.attrs.THA > magikarp.attrs.THA);
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

test('the Scouting explainer shows the same math as the ratings', () => {
  assert.deepEqual(Object.keys(FORMULAS), ATTR_KEYS);
  for (const sp of POKEDEX) {
    const p = exhibitionPlayer(sp.id, 100);
    const r = rate(p.species, p.level, p.ivs, p.nature, p.abilitySlot);
    for (const k of ATTR_KEYS) {
      const e = explainRating(p, k);
      assert.equal(e.rating, r.attrs[k], `${sp.name} ${k}`);
      const weights = FORMULAS[k].mix.reduce((t, [, w]) => t + w, 0);
      assert.ok(Math.abs(weights - 1) < 1e-9, `${k} weights add to 100%`);
    }
  }
});
