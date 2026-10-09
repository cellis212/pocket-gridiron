// Season mode: a fantasy draft from every Pokémon, a regular season, and playoffs.
// Every Pokémon plays at full strength from its real base stats, so a player never changes
// during the season. The draft is the whole game.
import { POKEDEX } from '../data/pokedex.js';
import { makeRng } from './rng.js';
import { POSITIONS, POS_KEYS } from './ratings.js';
import { SLOTS, SLOT_POS, IMPORTANCE, exhibitionPlayer, ratingOf, nameOf, autoLineup, perkValue, teamStrength } from './lineup.js';
import { simulateGame } from './match.js';

export const LEAGUE_VERSION = 2;
export const ROSTER_SIZE = 28; // drafted: 24 starters and 4 backups
export const ROSTER_MAX = 30; // free-agent signings may go two over
export const ROSTER_MIN = 24; // healthy players needed to field a lineup
export const FULL_STRENGTH = 100;

export const TEAM_POOL = [
  { name: 'Pallet Pioneers', abbr: 'PAL', color: '#c8102e' },
  { name: 'Cerulean Surge', abbr: 'CER', color: '#1f6fd1' },
  { name: 'Vermilion Volts', abbr: 'VER', color: '#e0a100' },
  { name: 'Celadon Thorns', abbr: 'CEL', color: '#2e8b3e' },
  { name: 'Saffron Seers', abbr: 'SAF', color: '#8a3fb8' },
  { name: 'Cinnabar Blaze', abbr: 'CIN', color: '#e2561b' },
  { name: 'Goldenrod Rush', abbr: 'GLD', color: '#b8860b' },
  { name: 'Ecruteak Phantoms', abbr: 'ECR', color: '#4b3a8c' },
  { name: 'Olivine Anchors', abbr: 'OLV', color: '#2f6b6b' },
  { name: 'Mahogany Frost', abbr: 'MAH', color: '#3b9cc4' },
  { name: 'Lilycove Tide', abbr: 'LIL', color: '#118a9c' },
  { name: 'Mauville Sparks', abbr: 'MAU', color: '#d4a017' },
  { name: 'Fortree Talons', abbr: 'FOR', color: '#5c7c2b' },
  { name: 'Snowpoint Avalanche', abbr: 'SNO', color: '#6a8fb3' },
  { name: 'Castelia Skyline', abbr: 'CAS', color: '#41505e' },
  { name: 'Lumiose Lights', abbr: 'LUM', color: '#b8336a' },
];

const NUMBER_RANGES = {
  QB: [[1, 19]], RB: [[20, 49]], WR: [[10, 19], [80, 89]], TE: [[80, 89], [40, 49]], OL: [[50, 79]],
  DL: [[90, 99], [50, 79]], LB: [[40, 59], [90, 99]], CB: [[20, 49]], S: [[20, 49]], K: [[1, 19]], P: [[1, 19]],
};

// ---------------------------------------------------------------- creation
export function createLeague({ seed = 1, teamCount = 8, userName, userAbbr, userColor, teamIndex = 0 } = {}) {
  const rng = makeRng(seed);
  const pool = rng.shuffle(TEAM_POOL.map((t) => ({ ...t })));
  const teams = [];
  for (let i = 0; i < teamCount; i++) {
    const meta = pool[i];
    teams.push({
      id: `t${i}`, name: meta.name, abbr: meta.abbr, color: meta.color,
      roster: [], lineup: {}, autoLineup: true, user: false,
      strategy: { runBias: Number(rng.normal(0, 0.4).toFixed(2)), aggression: Number(rng.next().toFixed(2)), blitz: Number(rng.next().toFixed(2)) },
    });
  }
  const user = teams[Math.min(Math.max(teamIndex, 0), teamCount - 1)];
  user.user = true;
  user.strategy = { runBias: 0, aggression: 0.5, blitz: 0.5 };
  if (userName) user.name = userName;
  if (userAbbr) user.abbr = userAbbr.toUpperCase().slice(0, 4);
  if (userColor) user.color = userColor;

  const league = {
    version: LEAGUE_VERSION, seed, rng: 0, phase: 'draft', week: 0,
    userTeam: user.id, teams, players: {}, schedule: [], playoffs: null,
    draft: null, freeAgents: [], news: [], games: {}, logs: {}, final: null,
  };
  // Every Pokémon is in the pool, at full strength with its best ability.
  for (const sp of POKEDEX) {
    const p = exhibitionPlayer(sp.id, FULL_STRENGTH, `p${sp.id}`);
    Object.assign(p, { team: null, num: 0, injury: 0, stats: {}, awards: [], draft: null });
    league.players[p.pid] = p;
    league.freeAgents.push(p.pid);
  }
  const order = rng.shuffle(teams.map((t) => t.id));
  league.draft = makeDraft(order, ROSTER_SIZE, [...league.freeAgents]);
  addNews(league, `The draft is set: ${league.draft.picks.length} picks, ${ROSTER_SIZE} rounds, snake order. Every Pokémon is in the pool.`);
  league.rng = rng.state;
  return league;
}

function makeDraft(order, rounds, pool) {
  const picks = [];
  for (let r = 0; r < rounds; r++) {
    const ids = r % 2 === 1 ? [...order].reverse() : order;
    for (const t of ids) picks.push({ round: r + 1, team: t, pid: null });
  }
  return { order, rounds, picks, current: 0, pool };
}

export const userTeam = (league) => league.teams.find((t) => t.id === league.userTeam);
export const teamById = (league, id) => league.teams.find((t) => t.id === id);
export const rosterOf = (league, team) => team.roster.map((pid) => league.players[pid]);

function addNews(league, text, kind = 'info') {
  league.news.unshift({ week: league.week, phase: league.phase, text, kind });
  if (league.news.length > 200) league.news.length = 200;
}

function withRng(league, fn) {
  const rng = makeRng(1);
  rng.state = league.rng || league.seed;
  const out = fn(rng);
  league.rng = rng.state;
  return out;
}

// ---------------------------------------------------------------- valuation
export function playerValue(p) {
  const r = ratingOf(p);
  let best = 0;
  for (const pos of POS_KEYS) best = Math.max(best, IMPORTANCE[pos] * r.ovr[pos]);
  return best + perkValue(p);
}

// How many starters a team still lacks at each position, from its current roster.
function positionNeeds(league, team) {
  const roster = rosterOf(league, team);
  const need = {};
  for (const s of SLOTS) need[s.pos] = (need[s.pos] ?? 0) + 1;
  if (!roster.length) return need;
  const lineup = autoLineup(roster);
  for (const s of SLOTS) if (lineup[s.id]) need[s.pos]--;
  return need;
}

function pickScore(p, needs) {
  const r = ratingOf(p);
  let best = -Infinity;
  for (const pos of POS_KEYS) {
    let v = IMPORTANCE[pos] * r.ovr[pos];
    if (needs[pos] > 0) v += 10 * IMPORTANCE[pos];
    if (v > best) best = v;
  }
  return best + perkValue(p);
}

// ---------------------------------------------------------------- drafting
export function currentPick(league) {
  const d = league.draft;
  if (!d || d.current >= d.picks.length) return null;
  return d.picks[d.current];
}

export function draftPlayer(league, pid) {
  const d = league.draft;
  const pick = currentPick(league);
  if (!pick) throw new Error('The draft is over.');
  const i = d.pool.indexOf(pid);
  if (i < 0) throw new Error('That player is not available.');
  d.pool.splice(i, 1);
  const p = league.players[pid];
  const team = teamById(league, pick.team);
  pick.pid = pid;
  p.draft = { round: pick.round, pick: d.current + 1, team: team.id };
  league.freeAgents = league.freeAgents.filter((x) => x !== pid);
  signToTeam(league, team, p);
  d.current++;
  if (team.user) addNews(league, `You drafted ${nameOf(p)} in round ${pick.round}.`, 'user');
  if (d.current >= d.picks.length) finishDraft(league);
}

export function aiPick(league) {
  const pick = currentPick(league);
  if (!pick) return null;
  const team = teamById(league, pick.team);
  const needs = positionNeeds(league, team);
  return withRng(league, (rng) => {
    const scored = league.draft.pool.map((pid) => ({ pid, s: pickScore(league.players[pid], needs) }));
    scored.sort((a, b) => b.s - a.s);
    const top = scored.slice(0, 3);
    const choice = rng.weighted(top, (x) => Math.exp((x.s - top[0].s) / 3));
    draftPlayer(league, choice.pid);
    return choice.pid;
  });
}

export function bestAvailable(league, teamId = league.userTeam, n = 1) {
  const team = teamById(league, teamId);
  const needs = positionNeeds(league, team);
  return league.draft.pool
    .map((pid) => ({ pid, s: pickScore(league.players[pid], needs) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.pid);
}

// AI teams pick until it is the user's turn (or the draft ends).
export function simToUserPick(league) {
  let guard = 0;
  while (currentPick(league) && currentPick(league).team !== league.userTeam && guard++ < 2000) aiPick(league);
}

export function autoDraftRest(league) {
  let guard = 0;
  while (currentPick(league) && guard++ < 4000) {
    if (currentPick(league).team === league.userTeam) draftPlayer(league, bestAvailable(league)[0]);
    else aiPick(league);
  }
}

function finishDraft(league) {
  league.draft = null;
  for (const t of league.teams) setLineup(league, t);
  league.phase = 'preseason';
  makeSchedule(league);
  addNews(league, 'The draft is complete. Set your lineup, then start the season.');
}

function signToTeam(league, team, p) {
  p.team = team.id;
  team.roster.push(p.pid);
  p.num = jerseyNumber(league, team, p);
}

function jerseyNumber(league, team, p) {
  const taken = new Set(rosterOf(league, team).filter((x) => x.pid !== p.pid).map((x) => x.num));
  const ranges = NUMBER_RANGES[ratingOf(p).best] ?? [[1, 99]];
  for (const [lo, hi] of ranges) for (let n = lo; n <= hi; n++) if (!taken.has(n)) return n;
  for (let n = 1; n <= 99; n++) if (!taken.has(n)) return n;
  return 0;
}

export function releasePlayer(league, pid) {
  const p = league.players[pid];
  const team = teamById(league, p.team);
  if (!team) return;
  if (team.roster.length <= ROSTER_MIN) throw new Error(`You need at least ${ROSTER_MIN} players. Sign someone first.`);
  team.roster = team.roster.filter((x) => x !== pid);
  for (const s of Object.keys(team.lineup)) if (team.lineup[s] === pid) team.lineup[s] = null;
  p.team = null;
  league.freeAgents.push(pid);
  if (team.user) addNews(league, `You released ${nameOf(p)}.`, 'user');
}

export function signFreeAgent(league, pid, teamId = league.userTeam) {
  const team = teamById(league, teamId);
  if (team.roster.length >= ROSTER_MAX) throw new Error(`Your roster is full (${ROSTER_MAX}). Release a player first.`);
  const p = league.players[pid];
  if (p.team) throw new Error('That player is not a free agent.');
  league.freeAgents = league.freeAgents.filter((x) => x !== pid);
  signToTeam(league, team, p);
  if (team.user) addNews(league, `You signed ${nameOf(p)}.`, 'user');
}

// Teams with too few healthy players sign the best free agent they need.
function fillRoster(league, team) {
  let guard = 0;
  while (team.roster.filter((pid) => !league.players[pid].injury).length < ROSTER_MIN && league.freeAgents.length && guard++ < 20) {
    const needs = positionNeeds(league, team);
    const best = league.freeAgents
      .map((pid) => league.players[pid])
      .map((p) => ({ p, s: pickScore(p, needs) }))
      .sort((a, b) => b.s - a.s)[0];
    league.freeAgents = league.freeAgents.filter((x) => x !== best.p.pid);
    signToTeam(league, team, best.p);
    if (team.user) addNews(league, `Too many players fainted, so ${nameOf(best.p)} signed as a free agent.`, 'user');
  }
}

// ---------------------------------------------------------------- lineups
export function setLineup(league, team) {
  const healthy = rosterOf(league, team).filter((p) => !p.injury);
  if (team.autoLineup || !team.user) {
    team.lineup = autoLineup(healthy);
    return;
  }
  const locked = {};
  for (const [slot, pid] of Object.entries(team.lineup)) {
    const p = league.players[pid];
    if (p && p.team === team.id && !p.injury) locked[slot] = pid;
  }
  team.lineup = autoLineup(healthy, { locked });
}

export function assignSlot(league, slot, pid) {
  const team = userTeam(league);
  team.autoLineup = false;
  for (const s of Object.keys(team.lineup)) if (team.lineup[s] === pid) team.lineup[s] = null;
  team.lineup[slot] = pid;
  setLineup(league, team);
}

export function matchTeam(league, team) {
  setLineup(league, team);
  return {
    id: team.id, name: team.name, abbr: team.abbr, color: team.color,
    players: rosterOf(league, team), lineup: team.lineup, strategy: team.strategy,
  };
}

// ---------------------------------------------------------------- schedule
function makeSchedule(league) {
  const ids = league.teams.map((t) => t.id);
  const n = ids.length;
  const arr = [...ids];
  const half = [];
  for (let r = 0; r < n - 1; r++) {
    const games = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      games.push(r % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
    }
    half.push(games);
    arr.splice(1, 0, arr.pop());
  }
  const weeks = [...half, ...half.map((gs) => gs.map((g) => ({ home: g.away, away: g.home })))];
  league.schedule = weeks.map((games, w) => ({
    week: w + 1,
    games: games.map((g, i) => ({ id: `w${w + 1}g${i}`, ...g, result: null })),
  }));
  league.week = 0;
}

export function startSeason(league) {
  if (league.phase !== 'preseason') throw new Error('The season can start only after the draft.');
  for (const t of league.teams) { fillRoster(league, t); setLineup(league, t); }
  league.phase = 'regular';
  league.week = 1;
  addNews(league, 'The season kicks off.');
}

// ---------------------------------------------------------------- games
function playGame(league, game, { neutral = false, playoff = false } = {}) {
  const home = teamById(league, game.home);
  const away = teamById(league, game.away);
  fillRoster(league, home);
  fillRoster(league, away);
  const seed = withRng(league, (rng) => rng.int(1, 2 ** 31));
  const userGame = home.user || away.user;
  const res = simulateGame(matchTeam(league, home), matchTeam(league, away), { seed, neutral, allowTie: !playoff, log: userGame });
  game.result = { score: res.score, ot: res.ot, winner: res.winner === null ? null : res.winner === 0 ? home.id : away.id };
  league.games[game.id] = summarizeGame(game, res, userGame);
  if (userGame) {
    league.logs[game.id] = { log: res.log, drives: res.drives };
    // Keep play-by-play for the five most recent user games so saves stay small.
    const ids = Object.keys(league.logs);
    for (const id of ids.slice(0, Math.max(0, ids.length - 5))) delete league.logs[id];
  }
  applyGame(league, res, home, away, playoff);
  return res;
}

function summarizeGame(game, res, full) {
  const top = (pick, label) => {
    const best = res.players.filter((p) => pick(p) > 0).sort((a, b) => pick(b) - pick(a))[0];
    return best ? { pid: best.pid, name: best.name, side: best.side, text: label(best) } : null;
  };
  return {
    id: game.id, home: game.home, away: game.away, score: res.score, byQuarter: res.byQuarter, ot: res.ot,
    weather: res.weather, weatherSource: res.weatherSource, teamStats: res.teamStats, seed: res.seed,
    leaders: [
      top((p) => p.pass.yds, (p) => `${p.name}: ${p.pass.cmp}/${p.pass.att}, ${p.pass.yds} yds, ${p.pass.td} TD, ${p.pass.int} INT`),
      top((p) => p.rush.yds, (p) => `${p.name}: ${p.rush.car} car, ${p.rush.yds} yds, ${p.rush.td} TD`),
      top((p) => p.rec.yds, (p) => `${p.name}: ${p.rec.rec} rec, ${p.rec.yds} yds, ${p.rec.td} TD`),
      top((p) => p.def.tkl + 4 * p.def.sck + 5 * p.def.int, (p) => `${p.name}: ${p.def.tkl} tkl, ${p.def.sck} sck, ${p.def.int} INT`),
    ].filter(Boolean),
    players: full ? res.players : null,
  };
}

const STAT_GROUPS = ['pass', 'rush', 'rec', 'def', 'kick', 'punt', 'ret'];
const MAX_KEYS = new Set(['lng']);

function applyGame(league, res, home, away, playoff) {
  const key = playoff ? 'post' : 'reg';
  const played = new Set();
  for (const line of res.players) {
    const p = league.players[line.pid];
    if (!p) continue;
    played.add(p.pid);
    const s = (p.stats[key] ??= { team: p.team, gp: 0, pass: {}, rush: {}, rec: {}, def: {}, kick: {}, punt: {}, ret: {} });
    s.gp++;
    s.slot = SLOT_POS[line.slot];
    for (const grp of STAT_GROUPS) {
      for (const [k, v] of Object.entries(line[grp])) s[grp][k] = MAX_KEYS.has(k) ? Math.max(s[grp][k] ?? 0, v) : (s[grp][k] ?? 0) + v;
    }
  }
  // Starters sometimes faint and miss a few weeks.
  withRng(league, (rng) => {
    for (const t of [home, away]) {
      for (const p of rosterOf(league, t)) {
        if (p.injury > 0) p.injury--;
        else if (played.has(p.pid) && rng.chance(0.006 + 0.006 * (1 - ratingOf(p).attrs.STA / 99))) {
          p.injury = rng.int(1, 4);
          addNews(league, `${t.abbr} ${nameOf(p)} fainted and will miss ${p.injury} week${p.injury > 1 ? 's' : ''}.`, t.user ? 'user' : 'injury');
        }
      }
    }
  });
}

export function currentWeekGames(league) {
  return league.schedule.find((w) => w.week === league.week)?.games ?? [];
}

export function playWeek(league) {
  if (league.phase === 'playoffs') return playPlayoffRound(league);
  if (league.phase !== 'regular') throw new Error('No games to play right now.');
  for (const t of league.teams) setLineup(league, t);
  for (const game of currentWeekGames(league)) if (!game.result) playGame(league, game);
  league.week++;
  if (league.week > league.schedule.length) startPlayoffs(league);
}

export function simToPlayoffs(league) {
  let guard = 0;
  while (league.phase === 'regular' && guard++ < 60) playWeek(league);
}

export function simSeason(league) {
  let guard = 0;
  while ((league.phase === 'regular' || league.phase === 'playoffs') && guard++ < 80) playWeek(league);
}

// ---------------------------------------------------------------- standings and playoffs
export function standings(league) {
  const rows = new Map(league.teams.map((t) => [t.id, { team: t.id, w: 0, l: 0, t: 0, pf: 0, pa: 0, streak: '' }]));
  for (const wk of league.schedule) {
    for (const g of wk.games) {
      if (!g.result) continue;
      const h = rows.get(g.home);
      const a = rows.get(g.away);
      h.pf += g.result.score[0]; h.pa += g.result.score[1];
      a.pf += g.result.score[1]; a.pa += g.result.score[0];
      if (g.result.winner === g.home) { h.w++; a.l++; h.streak = streak(h.streak, 'W'); a.streak = streak(a.streak, 'L'); }
      else if (g.result.winner === g.away) { a.w++; h.l++; a.streak = streak(a.streak, 'W'); h.streak = streak(h.streak, 'L'); }
      else { h.t++; a.t++; h.streak = streak(h.streak, 'T'); a.streak = streak(a.streak, 'T'); }
    }
  }
  const list = [...rows.values()];
  for (const r of list) r.pct = r.w + r.l + r.t ? (r.w + 0.5 * r.t) / (r.w + r.l + r.t) : 0;
  return list.sort((x, y) => y.pct - x.pct || (y.pf - y.pa) - (x.pf - x.pa) || y.pf - x.pf);
}
function streak(prev, c) {
  if (prev && prev[0] === c) return c + (Number(prev.slice(1)) + 1);
  return c + '1';
}

function startPlayoffs(league) {
  const table = standings(league);
  const size = league.teams.length >= 6 ? 4 : 2;
  const seeds = table.slice(0, size).map((r) => r.team);
  league.phase = 'playoffs';
  if (size === 4) {
    league.playoffs = {
      seeds, round: 1,
      rounds: [
        { name: 'Elite Four Round', games: [{ id: 'p1g0', home: seeds[0], away: seeds[3], result: null }, { id: 'p1g1', home: seeds[1], away: seeds[2], result: null }] },
        { name: 'Champion Bowl', games: [] },
      ],
      champion: null,
    };
  } else {
    league.playoffs = { seeds, round: 2, rounds: [null, { name: 'Champion Bowl', games: [{ id: 'p2g0', home: seeds[0], away: seeds[1], result: null }] }], champion: null };
  }
  addNews(league, `Playoffs set. Seeds: ${seeds.map((id) => teamById(league, id).name).join(', ')}.`);
}

export function playPlayoffRound(league) {
  const po = league.playoffs;
  const round = po.rounds[po.round - 1];
  for (const t of league.teams) setLineup(league, t);
  for (const g of round.games) if (!g.result) playGame(league, g, { neutral: po.round === 2, playoff: true });
  if (po.round === 1) {
    const winners = round.games.map((g) => g.result.winner);
    winners.sort((a, b) => po.seeds.indexOf(a) - po.seeds.indexOf(b));
    po.rounds[1].games = [{ id: 'p2g0', home: winners[0], away: winners[1], result: null }];
    po.round = 2;
    addNews(league, `${teamById(league, winners[0]).name} and ${teamById(league, winners[1]).name} advance to the Champion Bowl.`);
    return;
  }
  const final = round.games[0];
  po.champion = final.result.winner;
  const champ = teamById(league, po.champion);
  addNews(league, `${champ.name} win the Champion Bowl, ${Math.max(...final.result.score)}-${Math.min(...final.result.score)}!`, champ.user ? 'user' : 'champion');
  endSeason(league, final.result.winner === final.home ? final.away : final.home);
}

// ---------------------------------------------------------------- awards
export function seasonScore(line) {
  if (!line) return 0;
  const g = (grp, k) => line[grp]?.[k] ?? 0;
  const off = g('pass', 'yds') / 25 + g('pass', 'td') * 4 - g('pass', 'int') * 2 + g('rush', 'yds') / 10 + g('rush', 'td') * 6
    + g('rec', 'yds') / 10 + g('rec', 'td') * 6 + g('rec', 'rec') * 0.5 - g('rush', 'fum') * 2;
  const dfn = g('def', 'tkl') + g('def', 'sck') * 4 + g('def', 'tfl') + g('def', 'ff') * 3 + g('def', 'int') * 6 + g('def', 'pd') * 1.5 + g('def', 'td') * 6;
  return off + dfn * 1.3;
}

function endSeason(league, runnerUp) {
  const active = Object.values(league.players).filter((p) => p.stats.reg);
  const scoreOf = (p) => seasonScore(p.stats.reg);
  const isDef = (p) => POSITIONS[p.stats.reg.slot ?? ratingOf(p).best]?.side === 'D';
  const table = standings(league);
  const winPct = new Map(table.map((r) => [r.team, r.pct]));
  const mvpScore = (p) => scoreOf(p) * (0.7 + 0.6 * (winPct.get(p.team) ?? 0));
  const offense = active.filter((p) => !isDef(p) && !['K', 'P'].includes(p.stats.reg.slot));
  const mvp = [...offense].sort((a, b) => mvpScore(b) - mvpScore(a))[0];
  const opoy = offense.filter((p) => p !== mvp).sort((a, b) => scoreOf(b) - scoreOf(a))[0];
  const dpoy = active.filter(isDef).sort((a, b) => scoreOf(b) - scoreOf(a))[0];
  const awards = {};
  for (const [name, p] of [['MVP', mvp], ['Offensive Player of the Year', opoy], ['Defensive Player of the Year', dpoy]]) {
    if (!p) continue;
    p.awards.push(name);
    awards[name] = { pid: p.pid, name: nameOf(p), team: p.team };
    addNews(league, `${name}: ${nameOf(p)} (${teamById(league, p.team)?.abbr ?? 'FA'}).`, 'award');
  }
  league.final = {
    champion: league.playoffs.champion, runnerUp, awards,
    userFinish: table.findIndex((r) => r.team === league.userTeam) + 1,
  };
  league.phase = 'complete';
}

// ---------------------------------------------------------------- views
export function teamRating(league, team) {
  setLineup(league, team);
  return teamStrength(team.lineup, rosterOf(league, team));
}

export function seasonLeaders(league, n = 5) {
  const lines = Object.values(league.players).filter((p) => p.stats.reg).map((p) => ({ p, s: p.stats.reg }));
  const top = (f) => lines.filter((x) => f(x.s) > 0).sort((a, b) => f(b.s) - f(a.s)).slice(0, n).map((x) => ({ pid: x.p.pid, name: nameOf(x.p), team: x.s.team, value: f(x.s) }));
  return {
    'Passing yards': top((s) => s.pass.yds ?? 0),
    'Passing TD': top((s) => s.pass.td ?? 0),
    'Rushing yards': top((s) => s.rush.yds ?? 0),
    'Receiving yards': top((s) => s.rec.yds ?? 0),
    'Total TD': top((s) => (s.rush.td ?? 0) + (s.rec.td ?? 0)),
    Tackles: top((s) => s.def.tkl ?? 0),
    Sacks: top((s) => s.def.sck ?? 0),
    Interceptions: top((s) => s.def.int ?? 0),
    'Field goals': top((s) => s.kick.fgm ?? 0),
  };
}
