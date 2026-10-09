import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLeague, autoDraftRest, startSeason, simSeason, playWeek, standings, rosterOf,
  ROSTER_SIZE, simToUserPick, currentPick, draftPlayer, bestAvailable,
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
    const starters = SLOTS.map((s) => t.lineup[s.id]);
    assert.ok(starters.every(Boolean));
    assert.equal(new Set(starters).size, SLOTS.length);
    const nums = rosterOf(lg, t).map((p) => p.num);
    assert.equal(new Set(nums).size, nums.length, 'jersey numbers are unique');
  }
  const drafted = lg.teams.flatMap((t) => t.roster);
  assert.equal(new Set(drafted).size, drafted.length, 'no Pokémon is drafted twice');
});

test('a season runs from the draft to a champion', () => {
  const lg = createLeague({ seed: 11, teamCount: 8 });
  autoDraftRest(lg);
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
