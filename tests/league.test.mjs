import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLeague, autoDraftRest, startSeason, simSeason, playWeek, standings, advanceOffseason, gainExp,
  userTeam, rosterOf, ROSTER_MAX, simToUserPick, currentPick, draftPlayer, bestAvailable,
} from '../src/engine/league.js';
import { SLOTS, makePlayer } from '../src/engine/lineup.js';
import { expForLevel, DEX, NEUTRAL_NATURE } from '../src/engine/ratings.js';

test('a league drafts full rosters and legal lineups', () => {
  const lg = createLeague({ seed: 7, teamCount: 6 });
  simToUserPick(lg);
  assert.equal(currentPick(lg).team, lg.userTeam);
  const pid = bestAvailable(lg)[0];
  draftPlayer(lg, pid);
  assert.equal(lg.players[pid].team, lg.userTeam);
  autoDraftRest(lg);
  assert.equal(lg.phase, 'preseason');
  for (const t of lg.teams) {
    assert.ok(t.roster.length >= 26 && t.roster.length <= ROSTER_MAX, `${t.abbr} has ${t.roster.length}`);
    const starters = SLOTS.map((s) => t.lineup[s.id]);
    assert.ok(starters.every(Boolean));
    assert.equal(new Set(starters).size, SLOTS.length);
    const nums = rosterOf(lg, t).map((p) => p.num);
    assert.equal(new Set(nums).size, nums.length, 'jersey numbers are unique');
  }
});

test('a full season, playoffs, awards and offseason run in order', () => {
  const lg = createLeague({ seed: 11, teamCount: 8 });
  autoDraftRest(lg);
  startSeason(lg);
  simSeason(lg);
  assert.equal(lg.phase, 'offseason');
  for (const row of standings(lg)) assert.equal(row.w + row.l + row.t, 14);
  assert.equal(lg.history.length, 1);
  assert.ok(lg.history[0].champion);
  assert.ok(lg.history[0].awards.MVP);
  advanceOffseason(lg);
  assert.equal(lg.phase, 'rookie-draft');
  assert.equal(lg.season, 2);
  autoDraftRest(lg);
  assert.equal(lg.phase, 'preseason');
  for (const t of lg.teams) assert.ok(t.roster.length <= ROSTER_MAX);
  // A saved league reloads and keeps playing.
  const copy = JSON.parse(JSON.stringify(lg));
  startSeason(copy);
  playWeek(copy);
  assert.equal(copy.week, 2);
});

test('levels follow growth curves and evolution happens at the real level', () => {
  const charmander = makePlayer({ pid: 'c', species: 4, level: 10 });
  charmander.exp = expForLevel(DEX.get(4).growth, 10);
  charmander.lineage = [4];
  gainExp(null, charmander, expForLevel('medium-slow', 16) - charmander.exp);
  assert.equal(charmander.level, 16);
  assert.equal(charmander.species, 5, 'Charmeleon at 16');
  gainExp(null, charmander, expForLevel('medium-slow', 36) - charmander.exp);
  assert.equal(charmander.species, 6, 'Charizard at 36');
  assert.deepEqual(charmander.lineage, [4, 5, 6]);
});

test('branching evolutions pick the form that fits the position', () => {
  const eevee = makePlayer({ pid: 'e', species: 133, level: 31, nature: NEUTRAL_NATURE });
  eevee.exp = expForLevel('medium', 31);
  eevee.lineage = [133];
  gainExp(null, eevee, expForLevel('medium', 40) - eevee.exp, 'CB');
  assert.notEqual(eevee.species, 133);
  assert.ok(DEX.get(eevee.species).from === 133);
  assert.equal(userTeam(createLeague({ seed: 1, teamCount: 4 })).user, true);
});
