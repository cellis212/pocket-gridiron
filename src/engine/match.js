// Play-by-play football game between two lineups of rated Pokémon.
// Every snap is a set of one-on-one matchups (blocker vs rusher, runner vs tackler, receiver vs
// cover man). Each matchup uses the two players' ratings, their type matchup, and their abilities.
import { makeRng, logistic, clamp } from './rng.js';
import { SLOTS, ratingOf, nameOf } from './lineup.js';
import { DEX } from './ratings.js';
import { TYPE, WEATHER, WEATHER_SETTERS, INTIMIDATE_IMMUNE, typeFactor, typeMod } from './perks.js';
import { BLENDS, DUELS } from './duels.js';
import { DUEL_REF } from './calibration.js';

const QUARTER = 900;
const OT_LENGTH = 600;
const SPEED_KEYS = new Set(['SPD', 'AGI']);
const POWER_KEYS = new Set(['SPD', 'AGI', 'STR', 'PRS', 'TAK', 'THP', 'KPW']);

export function toMatchPlayer(p, slot) {
  const r = ratingOf(p);
  return {
    pid: p.pid, slot, num: p.num ?? 0, level: p.level, species: p.species, name: nameOf(p),
    types: DEX.get(p.species).types, ability: r.ability, attrs: r.attrs, ovr: r.ovr,
    loafing: false, truantTick: 0, moxie: 0,
  };
}

// team: { name, abbr, color, lineup: {slot: pid}, players: [player], strategy }
export function prepareTeam(team) {
  const byId = new Map(team.players.map((p) => [p.pid, p]));
  const on = {};
  for (const s of SLOTS) {
    const p = byId.get(team.lineup[s.id]);
    if (!p) throw new Error(`${team.name} has no player at ${s.id}`);
    on[s.id] = toMatchPlayer(p, s.id);
  }
  return {
    id: team.id, name: team.name, abbr: team.abbr, color: team.color,
    on, strategy: { runBias: 0, aggression: 0.5, blitz: 0.5, ...(team.strategy ?? {}) },
  };
}

function pickWeather(rng, teams) {
  for (const t of teams) {
    for (const s of SLOTS) {
      const p = t.on[s.id];
      if (WEATHER_SETTERS[p.ability]) return { kind: WEATHER_SETTERS[p.ability], source: p, team: t };
    }
  }
  const r = rng.next();
  const kind = r < 0.62 ? 'clear' : r < 0.77 ? 'rain' : r < 0.87 ? 'sun' : r < 0.92 ? 'sand' : 'snow';
  return { kind, source: null, team: null };
}

const newPlayerLine = (p, side) => ({
  pid: p.pid, name: p.name, slot: p.slot, side, species: p.species, num: p.num,
  pass: { cmp: 0, att: 0, yds: 0, td: 0, int: 0, sk: 0, skYds: 0, lng: 0 },
  rush: { car: 0, yds: 0, td: 0, lng: 0, fum: 0 },
  rec: { tgt: 0, rec: 0, yds: 0, td: 0, lng: 0 },
  def: { tkl: 0, sck: 0, int: 0, ff: 0, pd: 0, tfl: 0, td: 0 },
  kick: { fgm: 0, fga: 0, lng: 0, xpm: 0, xpa: 0 },
  punt: { n: 0, yds: 0, lng: 0 },
  ret: { n: 0, yds: 0, td: 0 },
});
const newTeamLine = () => ({
  firstDowns: 0, plays: 0, yards: 0, passYds: 0, rushYds: 0, turnovers: 0, penalties: 0, penYds: 0,
  top: 0, thirdAtt: 0, thirdConv: 0, fourthAtt: 0, fourthConv: 0, sacked: 0, rushAtt: 0, passAtt: 0,
});

export function simulateGame(homeTeam, awayTeam, opts = {}) {
  const rng = makeRng(opts.seed ?? 1);
  const teams = [prepareTeam(homeTeam), prepareTeam(awayTeam)];
  const weather = opts.weather ? { kind: opts.weather, source: null, team: null } : pickWeather(rng, teams);
  const g = {
    rng, teams, weather: weather.kind, q: 1, clock: QUARTER, poss: 0, yl: 25, down: 1, dist: 10,
    score: [0, 0], byQuarter: [[0, 0, 0, 0], [0, 0, 0, 0]], over: false, ot: false,
    allowTie: opts.allowTie !== false, log: [], drives: [], drive: null, logOn: opts.log !== false,
    pendingPAT: null, kickoffBy: null, snapClock: QUARTER, freeKick: false, openingKicker: 0,
    players: new Map(), team: [newTeamLine(), newTeamLine()], neutral: !!opts.neutral,
  };
  for (const [side, t] of teams.entries()) for (const s of SLOTS) g.players.set(t.on[s.id].pid + '@' + side, newPlayerLine(t.on[s.id], side));

  if (weather.source) note(g, `${weather.source.name}'s ${abilityLabel(weather.source.ability)}: ${WEATHER[weather.kind].name.toLowerCase()} for the whole game.`);
  else if (weather.kind !== 'clear') note(g, `Weather: ${WEATHER[weather.kind].name.toLowerCase()}.`);

  const receiver = rng.chance(0.5) ? 0 : 1;
  g.openingKicker = 1 - receiver;
  g.kickoffBy = g.openingKicker;
  note(g, `${teams[receiver].name} win the toss and will receive.`);

  let guard = 0;
  while (!g.over && guard++ < 2000) {
    if (g.pendingPAT !== null) { afterTouchdown(g); continue; }
    if (g.clock <= 0) { endQuarter(g); continue; }
    if (g.kickoffBy !== null) { kickoff(g); continue; }
    scrimmage(g);
  }
  if (g.drive) endDrive(g, 'End of game');

  const winner = g.score[0] === g.score[1] ? null : g.score[0] > g.score[1] ? 0 : 1;
  return {
    seed: opts.seed ?? 1,
    teams: teams.map((t) => ({ id: t.id, name: t.name, abbr: t.abbr, color: t.color })),
    score: g.score, byQuarter: g.byQuarter, winner, ot: g.ot, weather: g.weather,
    weatherSource: weather.source ? { name: weather.source.name, ability: weather.source.ability } : null,
    log: g.log, drives: g.drives, teamStats: g.team,
    players: [...g.players.values()],
  };
}

// ---------- helpers ----------
const abilityLabel = (slug) => slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const off = (g) => g.teams[g.poss];
const def = (g) => g.teams[1 - g.poss];
const line = (g, p, side) => g.players.get(p.pid + '@' + side);
const diffFor = (g, side) => g.score[side] - g.score[1 - side];
const gameSecondsLeft = (g) => (g.q >= 5 ? g.clock : (4 - g.q) * QUARTER + g.clock);

function spot(g, yl) {
  const y = Math.round(yl);
  if (y === 50) return 'midfield';
  return y < 50 ? `${off(g).abbr} ${y}` : `${def(g).abbr} ${100 - y}`;
}

function note(g, text) {
  if (g.logOn) g.log.push({ kind: 'note', q: g.q, clock: g.clock, text, score: [...g.score] });
}

function logPlay(g, entry) {
  if (!g.logOn) return;
  g.log.push({
    q: g.q, clock: g.snapClock, poss: g.poss, down: g.down, dist: g.dist, yl: g.yl,
    score: [...g.score], ...entry,
  });
}

// A player's rating for this snap after weather, quarter, score and ability effects.
function eff(g, side, p, key) {
  let v = p.attrs[key];
  const ab = p.ability;
  const w = WEATHER[g.weather];
  if (SPEED_KEYS.has(key)) {
    if (w.rush && ab === w.rush) v *= 1.35;
    if (g.weather === 'snow' && !p.types.includes(TYPE.ice)) v *= 0.97;
    if (ab === 'speed-boost') v *= 1 + 0.04 * (Math.min(g.q, 4) - 1);
  }
  if (ab === 'slow-start' && g.q === 1 && POWER_KEYS.has(key)) v *= 0.5;
  if (ab === 'defeatist' && diffFor(g, side) <= -14) v *= 0.75;
  if (ab === 'guts' && diffFor(g, side) < 0 && (key === 'STR' || key === 'TAK')) v *= 1.1;
  if (ab === 'moxie' && key === 'PRS') v *= 1 + 0.05 * p.moxie;
  if (g.weather === 'rain') { if (p.types.includes(TYPE.water)) v *= 1.03; if (p.types.includes(TYPE.fire)) v *= 0.97; }
  if (g.weather === 'sun') { if (p.types.includes(TYPE.fire)) v *= 1.03; if (p.types.includes(TYPE.water)) v *= 0.97; }
  if (g.weather === 'sand' && [TYPE.rock, TYPE.ground, TYPE.steel].some((t) => p.types.includes(t))) v *= 1.03;
  if (g.weather === 'snow' && p.types.includes(TYPE.ice)) v *= 1.03;
  if (g.q >= 4 && ab !== 'regenerator') v *= 0.93 + 0.07 * (p.attrs.STA / 99);
  if (p.loafing) v *= 0.5;
  return v;
}

function blendEff(g, side, p, blend) {
  let v = 0;
  for (const [k, w] of BLENDS[blend]) v += w * eff(g, side, p, k);
  return Math.max(1, v);
}

// Edge of player a over player b in a named matchup (duels.js). 0 is an ordinary matchup;
// +0.1 means a is about 10% better than usual. Both players' type matchups count.
function duel(g, aSide, a, b, type) {
  const d = DUELS[type];
  const fa = typeFactor(a.types, a.ability, b.types, b.ability);
  const fb = typeFactor(b.types, b.ability, a.types, a.ability);
  let A = blendEff(g, aSide, a, d.a) * typeMod(fa);
  let B = blendEff(g, 1 - aSide, b, d.b) * typeMod(fb);
  if (b.ability === 'intimidate' && !INTIMIDATE_IMMUNE.has(a.ability)) A *= 0.94;
  if (a.ability === 'intimidate' && !INTIMIDATE_IMMUNE.has(b.ability)) B *= 0.94;
  if (a.ability === 'wonder-guard' && fb < 2) B *= 0.55;
  if (b.ability === 'wonder-guard' && fa < 2) A *= 0.55;
  // Damped and soft-capped at ±0.4, so a level-100 star against a level-50 rookie wins big but not absurdly.
  const edge = 0.4 * Math.tanh((0.8 * Math.log(A / B) - DUEL_REF[type]) / 0.4);
  return { edge, fa, fb };
}

// Tuning knobs: base rates give NFL-like averages when every edge is 0.
export const TUNE = {
  runBase: 1.6, runLine: 5, breakScale: 3, breakBase: -1.4, powerScale: 2, awayScale: 3.5, awayBase: -1.6,
  pressScale: 3.5, pressBase: -1.25, sackScale: 2.2, sackBase: -1.15, sepScale: 2.5, throwScale: 1.8, catchScale: 1.0,
  comp: { short: 1.15, medium: 0.3, deep: -0.55 },
  int: { short: -4.2, medium: -3.5, deep: -2.9 },
  yac: { short: 2.3, medium: 2.0, deep: 2.4 }, yacScale: 3.5,
  yacBreakScale: 3, yacBreakBase: -2.9,
};

function typeCallout(factor, target, other) {
  if (factor === 0) return ` It doesn't affect ${target.name}...`;
  if (factor >= 2) return " It's super effective!";
  if (factor <= 0.5) return ` ${other.name}'s tackle is not very effective...`;
  return '';
}

// ---------- drives, clock, scoring ----------
function startDrive(g) {
  g.drive = { team: g.poss, q: g.q, clock: g.clock, startYl: g.yl, plays: 0, yards: 0, top: 0, result: null, endYl: g.yl, points: 0 };
}
function endDrive(g, result, points = 0) {
  if (!g.drive) return;
  g.drive.result = result;
  g.drive.points = points;
  g.drive.endYl = clamp(g.yl, 0, 100);
  g.drives.push(g.drive);
  g.drive = null;
}

function useClock(g, secs) {
  const s = Math.min(secs, g.clock);
  g.clock -= s;
  g.team[g.poss].top += s;
  if (g.drive) g.drive.top += s;
}

function addPoints(g, side, pts) {
  g.score[side] += pts;
  const qi = Math.min(g.q, 5) - 1;
  for (const arr of g.byQuarter) while (arr.length <= qi) arr.push(0);
  g.byQuarter[side][qi] += pts;
}

function changePossession(g, newYl) {
  g.poss = 1 - g.poss;
  g.yl = clamp(newYl, 1, 99);
  g.down = 1;
  g.dist = Math.min(10, 100 - g.yl);
  startDrive(g);
}

function endQuarter(g) {
  if (g.q === 1 || g.q === 3) {
    note(g, `End of quarter ${g.q}. ${scoreline(g)}`);
    g.q += 1;
    g.clock = QUARTER;
    return;
  }
  if (g.q === 2) {
    note(g, `Halftime. ${scoreline(g)}`);
    if (g.drive) endDrive(g, 'End of half');
    g.q = 3;
    g.clock = QUARTER;
    g.kickoffBy = 1 - g.openingKicker;
    g.freeKick = false;
    return;
  }
  // End of regulation or of an overtime period.
  if (g.drive) endDrive(g, g.score[0] === g.score[1] ? 'End of period' : 'End of game');
  if (g.score[0] !== g.score[1] || (g.allowTie && g.q >= 5)) {
    g.over = true;
    note(g, `Final${g.q >= 5 ? ' (OT)' : ''}. ${scoreline(g)}`);
    return;
  }
  g.q += 1;
  g.ot = true;
  g.clock = OT_LENGTH;
  const kicker = g.rng.chance(0.5) ? 0 : 1;
  g.kickoffBy = kicker;
  g.freeKick = false;
  note(g, `Overtime. Sudden death. ${g.teams[1 - kicker].name} will receive.`);
}

function scoreline(g) {
  return `${g.teams[0].abbr} ${g.score[0]}, ${g.teams[1].abbr} ${g.score[1]}.`;
}

function suddenDeath(g) {
  if (g.q >= 5 && g.score[0] !== g.score[1]) {
    if (g.drive) endDrive(g, 'Game over');
    g.over = true;
    note(g, `Final (OT). ${scoreline(g)}`);
    return true;
  }
  return false;
}

function touchdown(g, side, text, entryExtra = {}) {
  addPoints(g, side, 6);
  logPlay(g, { ...entryExtra, text: `${text} TOUCHDOWN ${g.teams[side].name}.`, scoring: 'TD', score: [...g.score] });
  if (g.drive) endDrive(g, g.drive.team === side ? 'Touchdown' : entryExtra.turnover ?? 'Turnover', 6);
  if (suddenDeath(g)) return;
  g.pendingPAT = side;
}

function afterTouchdown(g) {
  const side = g.pendingPAT;
  g.pendingPAT = null;
  g.snapClock = g.clock;
  const t = g.teams[side];
  const k = t.on.K;
  const diff = diffFor(g, side);
  const late = g.q >= 4 && gameSecondsLeft(g) < 600;
  const goForTwo = late && [-2, -5, -10, 1, 5, -9].includes(diff);
  if (goForTwo) {
    const o = t.on;
    const d = g.teams[1 - side].on;
    const offPower = (eff(g, side, o.QB, 'THA') + eff(g, side, o.RB, 'STR') + eff(g, side, o.WR1, 'CTH')) / 3;
    const defPower = (eff(g, 1 - side, d.MLB, 'TAK') + eff(g, 1 - side, d.CB1, 'COV') + eff(g, 1 - side, d.FS, 'COV')) / 3;
    const ok = g.rng.chance(logistic((offPower - defPower) / 20 - 0.1));
    if (ok) addPoints(g, side, 2);
    logPlay(g, { kind: 'pat', text: `Two-point try is ${ok ? 'GOOD' : 'no good'}.`, scoring: ok ? '2PT' : null, poss: side, score: [...g.score] });
  } else {
    const kl = line(g, k, side);
    kl.kick.xpa++;
    const ok = g.rng.chance(fgProbability(g, side, k, 33) * 0.985);
    if (ok) { kl.kick.xpm++; addPoints(g, side, 1); }
    logPlay(g, { kind: 'pat', text: `${k.name} extra point is ${ok ? 'good' : 'NO GOOD'}.`, scoring: ok ? 'XP' : null, poss: side, score: [...g.score] });
  }
  g.kickoffBy = side;
  g.freeKick = false;
}

function fgProbability(g, side, k, dist) {
  const power = eff(g, side, k, 'KPW');
  const acc = eff(g, side, k, 'KAC');
  const range = 30 + 0.3 * power;
  let x = (range - dist) / 5.5 + (acc - 60) / 35 + 0.5;
  if (g.weather === 'rain' || g.weather === 'snow') x -= 0.35;
  if (g.weather === 'sand') x -= 0.2;
  return logistic(x);
}

// ---------- kickoffs and punts ----------
function returner(t) {
  const options = [t.on.RB, t.on.WR3, t.on.CB2];
  return options.reduce((a, b) => (b.attrs.SPD > a.attrs.SPD ? b : a));
}

function kickoff(g) {
  g.snapClock = g.clock;
  const kSide = g.kickoffBy;
  const rSide = 1 - kSide;
  g.kickoffBy = null;
  const kt = g.teams[kSide];
  const rt = g.teams[rSide];
  const k = kt.on.K;
  const freeKick = g.freeKick;
  g.freeKick = false;
  g.poss = rSide;

  const trailing = diffFor(g, kSide);
  const onside = !freeKick && g.q >= 4 && trailing < 0 && trailing >= -16 && gameSecondsLeft(g) < 150;
  if (onside) {
    const kept = g.rng.chance(0.12);
    useClock(g, 4);
    if (kept) {
      g.poss = kSide;
      g.yl = 47; g.down = 1; g.dist = 10;
      startDrive(g);
      logPlay(g, { kind: 'kickoff', text: `${k.name} onside kick... RECOVERED by ${kt.name}!`, yl: 47 });
    } else {
      g.yl = 53; g.down = 1; g.dist = 10;
      startDrive(g);
      logPlay(g, { kind: 'kickoff', text: `${k.name} onside kick is recovered by ${rt.name} at the ${spot(g, 53)}.`, yl: 53 });
    }
    return;
  }

  const power = eff(g, kSide, k, 'KPW');
  const touchback = !freeKick && g.rng.chance(logistic((power - 55) / 12));
  if (touchback) {
    g.yl = 30; g.down = 1; g.dist = 10;
    startDrive(g);
    logPlay(g, { kind: 'kickoff', text: `${k.name} kicks off into the end zone. Touchback.`, yl: 30 });
    return;
  }
  const r = returner(rt);
  const retEdge = duel(g, rSide, r, g.rng.pick([kt.on.WLB, kt.on.SLB, kt.on.SS]), 'returns').edge;
  const start = freeKick ? 18 : 0;
  let yds = Math.round(23 + 25 * retEdge + g.rng.normal(0, 6));
  if (g.rng.chance(logistic(6 * retEdge - 4.3))) yds = 100;
  const yl = clamp(start + yds, 5, 100);
  const rl = line(g, r, rSide);
  rl.ret.n++; rl.ret.yds += Math.min(yds, 100 - start);
  useClock(g, 6);
  if (yl >= 100) {
    rl.ret.td++;
    g.yl = 100;
    startDrive(g);
    touchdown(g, rSide, `${freeKick ? 'Free kick' : 'Kickoff'} returned by ${r.name} ALL THE WAY!`, { kind: 'kickoff', yards: 100 });
    return;
  }
  g.yl = yl; g.down = 1; g.dist = 10;
  startDrive(g);
  logPlay(g, { kind: 'kickoff', text: `${k.name} ${freeKick ? 'free kick' : 'kicks off'}. ${r.name} returns it ${yds} yards to the ${spot(g, yl)}.`, yl });
}

function punt(g) {
  const side = g.poss;
  const t = off(g);
  const rt = def(g);
  const p = t.on.P;
  const pl = line(g, p, side);
  const startYl = g.yl;
  const gross = Math.round(clamp(40 + (eff(g, side, p, 'KPW') - 60) * 0.15 + g.rng.normal(0, 5.5) - (g.weather === 'rain' ? 2 : 0), 20, 70));
  const land = startYl + gross;
  pl.punt.n++;
  useClock(g, 8);
  if (land >= 100) {
    pl.punt.yds += 100 - startYl;
    logPlay(g, { kind: 'punt', text: `${p.name} punts ${100 - startYl} yards into the end zone. Touchback.`, yards: 0 });
    endDrive(g, 'Punt');
    changePossession(g, 20);
    return;
  }
  pl.punt.yds += gross;
  pl.punt.lng = Math.max(pl.punt.lng, gross);
  const r = returner(rt);
  let ret = 0;
  let text = `${p.name} punts ${gross} yards`;
  if (land > 90 || g.rng.chance(0.45)) {
    text += `. Fair catch by ${r.name}.`;
  } else {
    ret = Math.max(0, Math.round(g.rng.normal(8, 6)));
    if (g.rng.chance(logistic(6 * duel(g, 1 - side, r, t.on.SS, 'returns').edge - 4))) ret = 100;
    const rl = line(g, r, 1 - side);
    rl.ret.n++;
    if (land - ret <= 0) {
      rl.ret.yds += land; rl.ret.td++;
      endDrive(g, 'Punt');
      g.poss = 1 - side; g.yl = 100;
      startDrive(g);
      touchdown(g, 1 - side, `${text}. ${r.name} takes it back for a score!`, { kind: 'punt' });
      return;
    }
    rl.ret.yds += ret;
    text += `. ${r.name} returns it ${ret} yards.`;
  }
  logPlay(g, { kind: 'punt', text, yards: 0 });
  endDrive(g, 'Punt');
  changePossession(g, 100 - (land - ret));
}

function fieldGoal(g) {
  const side = g.poss;
  const k = off(g).on.K;
  const kl = line(g, k, side);
  const dist = 100 - g.yl + 17;
  kl.kick.fga++;
  const ok = g.rng.chance(fgProbability(g, side, k, dist));
  useClock(g, 5);
  if (ok) {
    kl.kick.fgm++;
    kl.kick.lng = Math.max(kl.kick.lng, dist);
    addPoints(g, side, 3);
    logPlay(g, { kind: 'fg', text: `${k.name} ${dist}-yard field goal is GOOD.`, scoring: 'FG', score: [...g.score] });
    endDrive(g, 'Field goal', 3);
    if (suddenDeath(g)) return;
    g.kickoffBy = side;
  } else {
    logPlay(g, { kind: 'fg', text: `${k.name} ${dist}-yard field goal is NO GOOD.` });
    endDrive(g, 'Missed FG');
    changePossession(g, Math.max(20, 107 - g.yl));
  }
}

// ---------- play calling ----------
function hurry(g) {
  const diff = diffFor(g, g.poss);
  return (g.q === 2 && g.clock <= 120) || (g.q === 4 && g.clock <= 300 && diff < 0) || (g.q >= 5 && g.clock <= 120);
}

function callPlay(g) {
  const t = off(g);
  const diff = diffFor(g, g.poss);
  const left = gameSecondsLeft(g);
  const fgDist = 117 - g.yl;
  const kickP = fgProbability(g, g.poss, t.on.K, fgDist);

  if (g.q === 4 && diff > 0 && left <= 40 * (5 - g.down)) return 'kneel';
  if (g.q === 2 && g.clock <= 30 && g.yl < 45) return 'kneel';
  if ((g.q === 2 || (g.q === 4 && diff >= -3 && diff <= 0) || g.q >= 5) && g.clock <= 8 && kickP > 0.25) return 'fg';
  if (g.q >= 5 && g.down >= 3 && kickP > 0.8) return 'fg';

  if (g.down === 4) {
    const desperate = g.q >= 4 && diff < 0 && (left < 240 || (diff < -8 && left < 480));
    if (desperate && !(diff >= -3 && kickP > 0.6 && left < 30)) return pickOffense(g, true);
    const aggr = t.strategy.aggression;
    if (g.dist <= 1 && g.yl >= 40 && g.rng.chance(0.25 + 0.5 * aggr)) return pickOffense(g, true);
    if (g.dist <= 3 && g.yl >= 55 && kickP < 0.55 && g.rng.chance(0.3 + 0.5 * aggr)) return pickOffense(g, true);
    if (kickP >= 0.45 && g.yl >= 55) return 'fg';
    if (g.yl >= 63 && g.dist <= 6) return pickOffense(g, true);
    if (g.yl >= 65) return 'fg';
    return 'punt';
  }
  return pickOffense(g, false);
}

function pickOffense(g, fourth) {
  const t = off(g);
  const diff = diffFor(g, g.poss);
  const left = gameSecondsLeft(g);
  const o = t.on;
  let runP;
  if (g.down === 1) runP = 0.5;
  else if (g.down === 2) runP = g.dist <= 3 ? 0.6 : g.dist >= 8 ? 0.35 : 0.46;
  else runP = g.dist <= 1 ? 0.62 : g.dist <= 3 ? 0.4 : g.dist <= 5 ? 0.2 : 0.07;
  if (fourth) runP = g.dist <= 1 ? 0.65 : 0.2;
  if (g.q >= 4 && left < 420 && diff < 0) runP *= 0.45;
  if (g.q >= 4 && diff > 0) runP = Math.min(0.88, runP * 1.5);
  if (hurry(g)) runP *= 0.5;
  // Teams lean on what they do well.
  const runGame = (o.RB.ovr.RB + (o.LG.attrs.RBK + o.C.attrs.RBK + o.RG.attrs.RBK) / 3) / 2;
  const passGame = (o.QB.ovr.QB * 1.5 + (o.WR1.ovr.WR + o.WR2.ovr.WR) / 2) / 2.5;
  runP += clamp((runGame - passGame) / 120, -0.1, 0.1) + 0.12 * t.strategy.runBias;
  runP = clamp(runP, 0.03, 0.92);
  if (g.rng.chance(runP)) return 'run';
  let deep = 0.14, medium = 0.3;
  if (g.down === 3 && g.dist > 8) { deep = 0.2; medium = 0.45; }
  if (g.dist <= 3) { deep = 0.08; medium = 0.18; }
  if (g.q >= 4 && left < 300 && diff < -8) deep += 0.12;
  deep += clamp((o.QB.attrs.THP - 65) / 300, -0.05, 0.08);
  if (100 - g.yl < 20) { deep = 0; medium = 0.35; }
  const r = g.rng.next();
  return r < deep ? 'deep' : r < deep + medium ? 'medium' : 'short';
}

function penaltyRate(t) {
  let awr = 0;
  for (const s of SLOTS) awr += t.on[s.id].attrs.AWR;
  return clamp(1.6 - awr / SLOTS.length / 80, 0.6, 1.6);
}

// ---------- the snap ----------
function scrimmage(g) {
  if (!g.drive) startDrive(g);
  g.snapClock = g.clock;
  const call = callPlay(g);
  if (call === 'punt') return punt(g);
  if (call === 'fg') return fieldGoal(g);

  // Truant players loaf on every other snap.
  for (const t of g.teams) for (const s of SLOTS) {
    const p = t.on[s.id];
    if (p.ability === 'truant') { p.truantTick ^= 1; p.loafing = p.truantTick === 1; } else p.loafing = false;
  }

  if (call === 'kneel') {
    useClock(g, 40);
    g.team[g.poss].plays++;
    if (g.down === 4 && g.clock <= 0) {
      if (g.drive) g.drive.plays++;
      logPlay(g, { kind: 'kneel', yards: 0, startYl: g.yl, text: `${off(g).on.QB.name} takes a knee as time runs out.` });
      endDrive(g, 'End of game');
      return;
    }
    advance(g, g.yl > 1 ? -1 : 0, `${off(g).on.QB.name} takes a knee.`, { kind: 'kneel' });
    return;
  }

  // Pre-snap penalties.
  const oRate = penaltyRate(off(g));
  const dRate = penaltyRate(def(g));
  if (g.rng.chance(0.022 * oRate)) return penalty(g, 'O', 'False start', 5, true, 0);
  if (g.rng.chance(0.018 * dRate)) return penalty(g, 'D', 'Offside', 5, false, 0);

  if (call === 'run') runPlay(g);
  else passPlay(g, call);
}

function penalty(g, who, name, yards, offense, clockSecs) {
  const side = offense ? g.poss : 1 - g.poss;
  const t = g.teams[side];
  g.team[side].penalties++;
  useClock(g, clockSecs);
  if (offense) {
    const y = Math.min(yards, Math.floor(g.yl / 2));
    g.team[side].penYds += y;
    logPlay(g, { kind: 'penalty', text: `PENALTY on ${t.name}: ${name}, ${y} yards.`, yards: -y, startYl: g.yl });
    g.yl -= y;
    g.dist += y;
  } else {
    const y = Math.min(yards, Math.floor((100 - g.yl) / 2));
    g.team[side].penYds += y;
    const firstDown = g.dist - y <= 0;
    logPlay(g, { kind: 'penalty', text: `PENALTY on ${t.name}: ${name}, ${y} yards.${firstDown ? ' First down.' : ''}`, yards: y, startYl: g.yl });
    g.yl += y;
    g.dist -= y;
    if (firstDown) { g.down = 1; g.dist = Math.min(10, 100 - g.yl); g.team[g.poss].firstDowns++; }
  }
}

// Move the ball after a play from scrimmage and settle downs, scores and turnovers.
function advance(g, yards, text, extra = {}) {
  const side = g.poss;
  const startYl = g.yl;
  const newYl = startYl + yards;
  if (g.drive) { g.drive.plays++; g.drive.yards += yards; }
  if (newYl >= 100) {
    g.yl = 100;
    touchdown(g, side, text, { yards: 100 - startYl, startYl, yl: startYl, ...extra });
    return;
  }
  if (newYl <= 0) {
    addPoints(g, 1 - side, 2);
    g.yl = 0;
    logPlay(g, { ...extra, yards, startYl, text: `${text} SAFETY.`, scoring: 'SAFETY', score: [...g.score] });
    endDrive(g, 'Safety');
    if (suddenDeath(g)) return;
    g.kickoffBy = side;
    g.freeKick = true;
    return;
  }
  const wasDown = g.down;
  const wasDist = g.dist;
  g.yl = newYl;
  if (wasDown === 3) g.team[side].thirdAtt++;
  if (wasDown === 4) g.team[side].fourthAtt++;
  if (yards >= wasDist) {
    g.down = 1;
    g.dist = Math.min(10, 100 - newYl);
    g.team[side].firstDowns++;
    if (wasDown === 3) g.team[side].thirdConv++;
    if (wasDown === 4) g.team[side].fourthConv++;
    logPlay(g, { ...extra, yards, startYl, down: wasDown, dist: wasDist, yl: startYl, text, first: true });
    return;
  }
  if (wasDown === 4) {
    logPlay(g, { ...extra, yards, startYl, down: wasDown, dist: wasDist, yl: startYl, text: `${text} Turnover on downs.` });
    endDrive(g, 'Downs');
    changePossession(g, 100 - newYl);
    return;
  }
  g.down = wasDown + 1;
  g.dist = wasDist - yards;
  logPlay(g, { ...extra, yards, startYl, down: wasDown, dist: wasDist, yl: startYl, text });
}

function fumble(g, carrier, tackler, yards, text, extra) {
  const side = g.poss;
  line(g, carrier, side).rush.fum++;
  line(g, tackler, 1 - side).def.ff++;
  const lost = g.rng.chance(0.52);
  if (!lost) return advance(g, yards, `${text} ${carrier.name} FUMBLES but recovers.`, extra);
  const spotYl = clamp(g.yl + yards, 1, 99);
  g.team[side].turnovers++;
  if (g.drive) { g.drive.plays++; g.drive.yards += yards; }
  logPlay(g, { ...extra, yards, startYl: g.yl, text: `${text} FUMBLE forced by ${tackler.name}, recovered by ${def(g).name}.`, turnover: true });
  g.yl = spotYl;
  endDrive(g, 'Fumble');
  changePossession(g, 100 - spotYl);
}

function runPlay(g) {
  const side = g.poss;
  const o = off(g).on;
  const d = def(g).on;
  const rng = g.rng;
  const rb = o.RB;
  const outside = rng.chance(0.42);
  const left = rng.chance(0.5);
  const blockers = outside ? [left ? o.LT : o.RT, o.TE] : [o.LG, o.C, o.RG];
  const front = outside ? [left ? d.RE : d.LE, left ? d.SLB : d.WLB] : [d.DT1, d.DT2, d.MLB];

  let edge = 0;
  front.forEach((dp, i) => { edge += duel(g, side, blockers[i % blockers.length], dp, 'runBlock').edge; });
  edge /= front.length;

  let yards = Math.max(-7, rng.normal(TUNE.runBase + TUNE.runLine * edge, 2.1));
  const tackler1 = rng.chance(0.72) ? rng.weighted(front, (p) => eff(g, 1 - side, p, 'TAK')) : rng.pick([d.WLB, d.SLB, d.SS, d.FS]);
  const e1 = duel(g, side, rb, tackler1, 'elude');
  let breakX = TUNE.breakScale * e1.edge + TUNE.breakBase;
  if (rb.ability === 'multiscale' || rb.ability === 'shadow-shield') breakX += 0.35;
  const broke = rng.chance(logistic(breakX));
  let tackler = tackler1;
  let callout = '';
  let longRun = false;
  if (!broke) {
    yards += Math.max(-1, rng.normal(0.9 + TUNE.powerScale * duel(g, side, rb, tackler1, 'power').edge, 1.1));
    if (e1.fb >= 2) callout = typeCallout(e1.fb, rb, tackler1);
  } else {
    yards = Math.max(yards, 1) + 2.5 + rng.exp(2.2);
    if (e1.fb <= 0.5) callout = typeCallout(e1.fb, rb, tackler1);
    const t2 = rng.pick([d.FS, d.SS, d.CB1, d.CB2]);
    let speedX = TUNE.awayScale * duel(g, side, rb, t2, 'breakaway').edge + TUNE.awayBase;
    if (rb.ability === 'run-away') speedX += 0.3;
    if (rng.chance(logistic(speedX))) { yards += 9 + rng.exp(15); longRun = true; } else yards += rng.exp(2.5);
    tackler = t2;
  }
  yards = Math.round(yards);
  const gain = Math.min(yards, 100 - g.yl);

  const rl = line(g, rb, side);
  rl.rush.car++;
  g.team[side].rushAtt++;
  g.team[side].plays++;

  let fumP = 0.0085 * clamp(eff(g, 1 - side, tackler, 'TAK') / Math.max(15, eff(g, side, rb, 'CAR')), 0.4, 2.5) ** 1.5;
  if (g.weather === 'rain') fumP *= 1.5;
  if (rb.ability === 'sturdy') fumP *= 0.3;
  if (rb.ability === 'sticky-hold') fumP = 0;
  const dir = outside ? (left ? 'left end' : 'right end') : rng.pick(['up the middle', 'left guard', 'right guard']);
  const reachesEnd = g.yl + gain >= 100;
  const oob = outside && !reachesEnd && rng.chance(0.25);
  useClock(g, oob ? 7 : hurry(g) ? 18 : 41);

  if (!reachesEnd && rng.chance(fumP)) {
    rl.rush.yds += gain;
    g.team[side].rushYds += gain;
    g.team[side].yards += gain;
    line(g, tackler, 1 - side).def.tkl++;
    return fumble(g, rb, tackler, gain, `${rb.name} runs ${dir} for ${yardsText(gain)}.`, { kind: 'run', carrier: rb.pid });
  }
  if (gain > 3 && rng.chance(0.028 * penaltyRate(off(g)))) {
    rl.rush.car--;
    g.team[side].rushAtt--;
    return penalty(g, 'O', 'Holding', 10, true, 0);
  }

  rl.rush.yds += gain;
  rl.rush.lng = Math.max(rl.rush.lng, gain);
  g.team[side].rushYds += gain;
  g.team[side].yards += gain;
  let text = `${rb.name} runs ${dir} for ${yardsText(gain)}`;
  if (!reachesEnd) {
    const tl = line(g, tackler, 1 - side);
    tl.def.tkl++;
    if (gain < 0) tl.def.tfl++;
    text += ` (${tackler.name}).`;
  } else {
    text += longRun ? '. Nobody can catch up!' : '.';
    rl.rush.td++;
  }
  if (rb.loafing) text = `${rb.name} is loafing around! ` + text;
  advance(g, gain, text + callout, { kind: 'run', carrier: rb.pid, oob });
}

function yardsText(y) {
  if (y === 0) return 'no gain';
  if (y < 0) return `a loss of ${-y}`;
  return `${y} yard${y === 1 ? '' : 's'}`;
}

function passPlay(g, depth) {
  const side = g.poss;
  const o = off(g).on;
  const d = def(g).on;
  const dt = def(g);
  const rng = g.rng;
  const qb = o.QB;
  const ql = line(g, qb, side);

  const blitzRate = clamp(0.12 + 0.2 * dt.strategy.blitz + (g.down === 3 && g.dist > 6 ? 0.08 : 0), 0.05, 0.45);
  const blitz = rng.chance(blitzRate);
  const blitzer = blitz ? rng.pick([d.WLB, d.MLB, d.SLB]) : null;
  const rushers = [d.LE, d.DT1, d.DT2, d.RE];
  const blockers = [o.RT, rng.chance(0.5) ? o.C : o.RG, o.LG, o.LT];
  if (blitzer) { rushers.push(blitzer); blockers.push(rng.chance(0.5) ? o.C : o.RB); }

  let rushEdge = 0;
  const rushScores = rushers.map((r, i) => {
    const e = duel(g, 1 - side, r, blockers[i], 'passRush').edge;
    rushEdge += e;
    return { r, e };
  });
  rushEdge /= rushers.length;
  const depthAdj = depth === 'deep' ? 0.35 : depth === 'medium' ? 0.15 : -0.45;
  const pressured = rng.chance(logistic(TUNE.pressScale * rushEdge + TUNE.pressBase + (blitz ? 0.45 : 0) + depthAdj));
  const best = rushScores.reduce((a, b) => (b.e > a.e ? b : a));
  const escape = duel(g, side, qb, best.r, 'escape').edge;
  const sacked = pressured && rng.chance(logistic(TUNE.sackScale * rushEdge + TUNE.sackBase - 3 * escape));

  g.team[side].plays++;
  if (sacked) {
    const sacker = rng.weighted(rushScores, (x) => Math.exp(2.5 * x.e)).r;
    const loss = Math.min(Math.round(3 + rng.exp(3.5)), 15, g.yl);
    ql.pass.sk++; ql.pass.skYds += loss;
    g.team[side].sacked++;
    g.team[side].yards -= loss;
    const sl = line(g, sacker, 1 - side);
    sl.def.sck++; sl.def.tkl++; sl.def.tfl++;
    if (sacker.ability === 'moxie') sacker.moxie = Math.min(3, sacker.moxie + 1);
    useClock(g, hurry(g) ? 20 : 39);
    const text = `${qb.name} is SACKED by ${sacker.name} for a loss of ${loss}.`;
    if (rng.chance(0.09)) {
      sl.def.ff++;
      if (rng.chance(0.6)) {
        g.team[side].turnovers++;
        ql.rush.fum++;
        if (g.drive) { g.drive.plays++; g.drive.yards -= loss; }
        const spotYl = Math.max(1, g.yl - loss);
        logPlay(g, { kind: 'sack', yards: -loss, startYl: g.yl, text: `${text} FUMBLE! ${dt.name} recover.`, turnover: true });
        g.yl = spotYl;
        endDrive(g, 'Fumble');
        changePossession(g, 100 - spotYl);
        return;
      }
    }
    return advance(g, -loss, text, { kind: 'sack' });
  }

  // Coverage: each receiver against his cover man.
  const covers = [
    { r: o.WR1, c: d.CB1 }, { r: o.WR2, c: d.CB2 }, { r: o.WR3, c: blitzer === d.SLB ? d.FS : d.SLB },
    { r: o.TE, c: blitzer === d.MLB ? d.SS : d.MLB },
  ];
  if (blockers[4] !== o.RB) covers.push({ r: o.RB, c: blitzer === d.WLB ? d.SS : d.WLB });
  const targets = covers.filter((x) => depth !== 'deep' || x.r !== o.RB);
  for (const x of targets) {
    const rt = duel(g, side, x.r, x.c, 'route');
    x.catchEdge = duel(g, side, x.r, x.c, 'catch').edge;
    x.sep = TUNE.sepScale * rt.edge + rng.normal(0, 0.6);
    x.factor = rt.fb;
    x.look = x.sep + TUNE.catchScale * x.catchEdge + (depth === 'short' && x.r === o.RB ? 0.2 : 0);
  }
  // The quarterback's read: high awareness finds the open man, low awareness forces it.
  const temp = clamp(1.35 - eff(g, side, qb, 'AWR') / 110, 0.35, 1.2);
  const target = rng.weighted(targets, (x) => Math.exp(x.look / temp));
  const rec = target.r;
  const cov = target.c;
  const rl = line(g, rec, side);
  ql.pass.att++;
  rl.rec.tgt++;
  g.team[side].passAtt++;

  const throwEdge = duel(g, side, qb, cov, 'throw').edge;
  let compX = TUNE.comp[depth] + 0.7 * target.sep + TUNE.throwScale * throwEdge + TUNE.catchScale * target.catchEdge - (pressured ? 0.75 : 0);
  if (g.weather === 'rain') compX -= 0.3;
  if (g.weather === 'snow' || g.weather === 'sand') compX -= 0.15;
  if (qb.ability === 'sniper' && depth === 'deep') compX += 0.4;
  if (qb.ability === 'technician' && depth === 'short') compX += 0.35;
  if ([...rushers, d.MLB, d.WLB, d.SLB].some((p) => p.ability === 'pressure')) compX -= 0.18;
  let intX = TUNE.int[depth] - 0.45 * target.sep - 3 * throwEdge + (pressured ? 0.6 : 0);
  if (cov.ability === 'super-luck') intX += 0.35;
  const intP = logistic(intX);
  const compP = logistic(compX);
  const roll = rng.next();
  const air = airYards(rng, depth, rec === o.RB, 100 - g.yl);
  const dir = rng.pick(['left', 'middle', 'right']);
  const label = `${depth} ${dir}`;

  if (roll < intP) {
    const picker = rng.chance(0.75) ? cov : rng.pick([d.FS, d.SS]);
    const pl = line(g, picker, 1 - side);
    pl.def.int++; pl.def.pd++;
    ql.pass.int++;
    g.team[side].turnovers++;
    useClock(g, 10);
    const catchYl = clamp(g.yl + air, 1, 99);
    const retEdge = duel(g, 1 - side, picker, qb, 'returns').edge;
    let ret = Math.max(0, Math.round(rng.normal(6 + 12 * retEdge, 7)));
    if (rng.chance(logistic(5 * retEdge - 3.4))) ret = 100;
    const text = `${qb.name} pass ${label} intended for ${rec.name} is INTERCEPTED by ${picker.name}.`;
    if (g.drive) g.drive.plays++;
    const defYl = 100 - catchYl + ret;
    if (defYl >= 100) {
      endDrive(g, 'Interception');
      g.poss = 1 - side; g.yl = 100;
      pl.def.td++;
      startDrive(g);
      touchdown(g, 1 - side, `${text} PICK SIX! ${picker.name} returns it all the way.`, { kind: 'pass', turnover: 'Interception' });
      return;
    }
    logPlay(g, { kind: 'pass', yards: 0, startYl: g.yl, text: `${text} Returned ${ret} yards.`, turnover: true });
    endDrive(g, 'Interception');
    changePossession(g, defYl);
    return;
  }

  if (roll < intP + compP * (1 - intP)) {
    const tk = rng.chance(0.65) ? cov : rng.pick([d.FS, d.SS, d.MLB]);
    const ye = duel(g, side, rec, tk, 'yac');
    let yac = Math.max(0, rng.normal(TUNE.yac[depth] + TUNE.yacScale * ye.edge, 2.3));
    let callout = '';
    if (rng.chance(logistic(TUNE.yacBreakScale * ye.edge + TUNE.yacBreakBase))) {
      yac += 5 + rng.exp(10);
      if (ye.fb <= 0.5) callout = typeCallout(ye.fb, rec, tk);
    }
    let gain = Math.round(air + yac);
    gain = Math.min(gain, 100 - g.yl);
    const reachesEnd = g.yl + gain >= 100;
    ql.pass.cmp++; ql.pass.yds += gain; ql.pass.lng = Math.max(ql.pass.lng, gain);
    rl.rec.rec++; rl.rec.yds += gain; rl.rec.lng = Math.max(rl.rec.lng, gain);
    g.team[side].passYds += gain;
    g.team[side].yards += gain;
    const oob = !reachesEnd && depth !== 'short' && rng.chance(hurry(g) ? 0.45 : 0.18);
    useClock(g, oob ? 8 : hurry(g) ? 16 : 38);
    let text = `${qb.name} pass ${label} to ${rec.name} for ${yardsText(gain)}`;
    if (reachesEnd) { ql.pass.td++; rl.rec.td++; text += '.'; } else { line(g, tk, 1 - side).def.tkl++; text += ` (${tk.name}).`; }
    if (!callout && target.factor === 0) callout = ` ${cov.name}'s coverage doesn't affect ${rec.name}...`;
    return advance(g, gain, text + callout, { kind: 'pass', target: rec.pid, oob });
  }

  // Incomplete.
  useClock(g, 6);
  const defended = rng.chance(0.4);
  if (defended) line(g, cov, 1 - side).def.pd++;
  if (depth !== 'short' && rng.chance(0.07 * penaltyRate(dt))) {
    const y = Math.max(1, Math.min(air, 99 - g.yl));
    g.team[1 - side].penalties++;
    g.team[1 - side].penYds += y;
    if (g.drive) { g.drive.plays++; g.drive.yards += y; }
    logPlay(g, { kind: 'penalty', yards: y, startYl: g.yl, text: `${qb.name} pass ${label} to ${rec.name} is incomplete. PENALTY on ${dt.name}: Pass interference by ${cov.name}, ${y} yards. First down.` });
    g.yl += y;
    g.down = 1;
    g.dist = Math.min(10, 100 - g.yl);
    g.team[side].firstDowns++;
    return;
  }
  const why = pressured ? ' under pressure' : '';
  advance(g, 0, `${qb.name} pass ${label} to ${rec.name} is incomplete${why}${defended ? `, broken up by ${cov.name}` : ''}.`, { kind: 'pass', target: rec.pid, incomplete: true });
}

function airYards(rng, depth, toBack, toGoal) {
  let y;
  if (depth === 'short') y = toBack ? rng.int(-3, 3) : rng.int(1, 8);
  else if (depth === 'medium') y = rng.int(9, 18);
  else y = rng.int(19, 44);
  return Math.min(y, toGoal);
}
