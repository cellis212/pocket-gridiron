import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLeague, autoDraftRest, startSeason, simSeason, playWeek, standings, rosterOf, userTeam,
  ROSTER_SIZE, simToUserPick, currentPick, draftPlayer, bestAvailable, assignSlot, fillEmptySlots,
  openSlots, setLineup, matchTeam,
} from '../src/engine/league.js';
import { SLOTS, ratingOf } from '../src/engine/lineup.js';

test('the draft fills every roster and every lineup', () => {
  const lg = createLeague({ seed: 7, teamCount: 6 });
  assert.equal(lg.draft.pool.length, 1025);
  simToUserPick(lg);
  assert.equal(currentPick(lg).team, lg.userTeam);
  const pid = bestAvailable(lg)[0];
  draftPlayer(lg, pid);
  assert.equal(lg.players[pid].team, lg.userTeam);
  autoDraftRest(lg);
  assert.equal(lg.phase, 'preseason');
  for (const t of lg.teams) {
    assert.equal(t.roster.length, ROSTER_SIZE, t.abbr);
    if (t.user) continue;
    const starters = SLOTS.map((s) => t.lineup[s.id]);
    assert.ok(starters.every(Boolean));
    assert.equal(new Set(starters).size, SLOTS.length);
  }
  for (const t of lg.teams) {
    const nums = rosterOf(lg, t).map((p) => p.num);
    assert.equal(new Set(nums).size, nums.length, 'jersey numbers are unique');
  }
  const drafted = lg.teams.flatMap((t) => t.roster);
  assert.equal(new Set(drafted).size, drafted.length, 'no Pokémon is drafted twice');
});

test('the user sets every position after the draft', () => {
  const lg = createLeague({ seed: 5, teamCount: 4 });
  autoDraftRest(lg);
  const me = userTeam(lg);
  assert.equal(openSlots(lg).length, 24, 'no positions are set by the draft');
  assert.throws(() => startSeason(lg), /Set your lineup first/);
  const [a, b] = me.roster;
  assignSlot(lg, 'QB', a);
  assignSlot(lg, 'K', b);
  assignSlot(lg, 'RB', a);
  assert.equal(me.depth.QB, null, 'a Pokémon holds one slot at a time');
  assert.equal(me.depth.RB, a);
  fillEmptySlots(lg);
  assert.equal(me.depth.RB, a, 'filling keeps the slots the user set');
  assert.equal(me.depth.K, b);
  assert.equal(openSlots(lg).length, 0);
  assert.equal(new Set(Object.values(me.depth)).size, 24);
  startSeason(lg);
  // A fainted starter sits out one game; the user's lineup keeps him.
  lg.players[a].injury = 2;
  setLineup(lg, me);
  assert.equal(me.depth.RB, a);
  assert.notEqual(me.lineup.RB, a);
  assert.ok(matchTeam(lg, me).lineup.RB);
});

test('a season runs from the draft to a champion', () => {
  const lg = createLeague({ seed: 11, teamCount: 8 });
  autoDraftRest(lg);
  fillEmptySlots(lg);
  const before = Object.fromEntries(Object.values(lg.players).map((p) => [p.pid, JSON.stringify([p.species, ratingOf(p).ovr])]));
  startSeason(lg);
  playWeek(lg);
  // A saved season reloads and keeps playing.
  const copy = JSON.parse(JSON.stringify(lg));
  playWeek(copy);
  assert.equal(copy.week, 3);
  simSeason(lg);
  assert.equal(lg.phase, 'complete');
  for (const row of standings(lg)) assert.equal(row.w + row.l + row.t, 14);
  assert.ok(lg.final.champion);
  assert.ok(lg.final.awards.MVP);
  // Players never change during a season: no levels, no evolution.
  for (const p of Object.values(lg.players)) assert.equal(JSON.stringify([p.species, ratingOf(p).ovr]), before[p.pid]);
});
