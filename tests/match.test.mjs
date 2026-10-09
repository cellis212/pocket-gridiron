import test from 'node:test';
import assert from 'node:assert/strict';
import { exhibitionPlayer, autoLineup, themePool } from '../src/engine/lineup.js';
import { simulateGame } from '../src/engine/match.js';

function team(theme, level, id) {
  const players = themePool(theme).map((s) => exhibitionPlayer(s, level, `${id}-${s}`));
  return { id, name: id, abbr: id.slice(0, 3).toUpperCase(), color: '#333', players, lineup: autoLineup(players) };
}
const KANTO = team('gen1', 100, 'kanto');
const JOHTO = team('gen2', 100, 'johto');

const POINTS = { TD: 6, XP: 1, '2PT': 2, FG: 3 };

test('the same seed replays the same game', () => {
  const a = simulateGame(KANTO, JOHTO, { seed: 123 });
  const b = simulateGame(KANTO, JOHTO, { seed: 123 });
  assert.deepEqual(a.score, b.score);
  assert.equal(a.log.length, b.log.length);
  assert.equal(a.log.at(-1).text, b.log.at(-1).text);
});

test('every point in the final score comes from a logged scoring play', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const r = simulateGame(KANTO, JOHTO, { seed });
    const pts = [0, 0];
    for (const e of r.log) {
      if (!e.scoring) continue;
      if (e.scoring === 'SAFETY') pts[1 - e.poss] += 2;
      else pts[e.poss] += POINTS[e.scoring];
    }
    assert.deepEqual(pts, r.score, `seed ${seed}`);
    assert.deepEqual(r.byQuarter.map((q) => q.reduce((s, x) => s + x, 0)), r.score, `seed ${seed} quarters`);
  }
});

test('box score totals agree with player lines', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const r = simulateGame(KANTO, JOHTO, { seed, log: false });
    for (const side of [0, 1]) {
      const lines = r.players.filter((p) => p.side === side);
      const sum = (f) => lines.reduce((s, p) => s + f(p), 0);
      assert.equal(sum((p) => p.pass.yds), r.teamStats[side].passYds);
      assert.equal(sum((p) => p.rush.yds), r.teamStats[side].rushYds);
      assert.equal(sum((p) => p.rec.yds), sum((p) => p.pass.yds));
      assert.equal(sum((p) => p.rec.rec), sum((p) => p.pass.cmp));
      for (const p of lines) assert.ok(p.pass.cmp <= p.pass.att);
    }
  }
});

test('equal teams produce a normal football game on average', () => {
  const a = team('gen4', 100, 'a');
  const b = team('gen4', 100, 'b');
  let pts = 0, cmp = 0, att = 0, rushYds = 0, car = 0;
  const n = 120;
  for (let seed = 0; seed < n; seed++) {
    const r = simulateGame(a, b, { seed, log: false });
    pts += r.score[0] + r.score[1];
    for (const p of r.players) { cmp += p.pass.cmp; att += p.pass.att; rushYds += p.rush.yds; car += p.rush.car; }
  }
  const ppg = pts / (2 * n);
  assert.ok(ppg > 14 && ppg < 32, `points per team ${ppg}`);
  assert.ok(cmp / att > 0.55 && cmp / att < 0.72, `completion ${cmp / att}`);
  assert.ok(rushYds / car > 3.3 && rushYds / car < 5.5, `yards per carry ${rushYds / car}`);
});

test('a level-100 team beats the same team at level 50', () => {
  const lv50 = team('gen1', 50, 'kanto50');
  let wins = 0;
  for (let seed = 0; seed < 30; seed++) if (simulateGame(KANTO, lv50, { seed, log: false }).winner === 0) wins++;
  assert.ok(wins >= 29, `wins ${wins}`);
});

test('playoff games never end in a tie', () => {
  const a = team('gen4', 100, 'a');
  const b = team('gen4', 100, 'b');
  for (let seed = 0; seed < 150; seed++) {
    const r = simulateGame(a, b, { seed, log: false, allowTie: false });
    assert.notEqual(r.winner, null, `seed ${seed}`);
  }
});
