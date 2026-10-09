// Season screens: new season, draft room, dashboard, roster and depth chart, schedule,
// standings, leaders, free agents and save codes.
import { DEX, ATTRS, POSITIONS, POS_KEYS } from '../engine/ratings.js';
import { SLOTS, SLOT_POS, SLOT_GROUPS, ratingOf, nameOf } from '../engine/lineup.js';
import {
  createLeague, userTeam, teamById, rosterOf, currentPick, draftPlayer, simToUserPick, autoDraftRest,
  bestAvailable, startSeason, playWeek, simToPlayoffs, simSeason, standings, releasePlayer, signFreeAgent,
  assignSlot, fillEmptySlots, clearDepth, openSlots, setLineup, teamRating, seasonLeaders, currentWeekGames, playerValue,
  ROSTER_MAX, ROSTER_SIZE, TEAM_POOL, LEAGUE_VERSION,
} from '../engine/league.js';
import { randomSeed } from '../engine/rng.js';
import { S, toast, saveLeague } from './state.js';
import { esc, mon, typeChips, ovrBadge, scoreboard, fieldSvg, ballSpots, playList, boxScore, driveChart, playerCard } from './common.js';

const LG_TABS = [
  ['home', 'Dashboard'], ['draft', 'Draft'], ['roster', 'Lineup'], ['schedule', 'Schedule'], ['standings', 'Standings'],
  ['stats', 'Leaders'], ['fa', 'Free agents'], ['save', 'Save'],
];
const SWATCHES = ['#c8102e', '#1f6fd1', '#e0a100', '#2e8b3e', '#8a3fb8', '#e2561b', '#118a9c', '#41505e'];
const PHASE_LABEL = {
  draft: 'Draft', preseason: 'Preseason', regular: 'Regular season', playoffs: 'Playoffs', complete: 'Season complete',
};

const lgPlayer = (pid) => S.lg.players[pid];
const teamName = (id) => teamById(S.lg, id)?.name ?? 'Free agent';
const teamAbbr = (id) => teamById(S.lg, id)?.abbr ?? 'FA';
const teamColor = (id) => teamById(S.lg, id)?.color ?? 'var(--ink-3)';

function who(p, sub = '') {
  return `<span class="who">${mon(p.species, p.num || '')}<span style="min-width:0"><span class="who-name">${esc(nameOf(p))}</span> ${typeChips(p.species)}${sub ? `<br><span class="who-sub">${sub}</span>` : ''}</span></span>`;
}

// ---------------------------------------------------------------- shell
export function renderLeague() {
  if (!S.lg) return newLeagueForm();
  const lg = S.lg;
  const me = userTeam(lg);
  const tabs = LG_TABS.filter(([k]) => k !== 'draft' || lg.draft);
  if (S.lgTab === 'draft' && !lg.draft) S.lgTab = 'home';
  const row = standings(lg).find((r) => r.team === me.id);
  const views = { home: dashboard, roster, draft: draftRoom, schedule, standings: standingsView, stats: leadersView, fa: freeAgents, save: saveView };
  return `<div class="stack">
    <div class="spread">
      <div class="row" style="gap:12px">
        <span class="sb-dot" style="background:${me.color};height:44px;width:8px"></span>
        <div><div class="eyebrow">${PHASE_LABEL[lg.phase]}${lg.phase === 'regular' ? ` · Week ${lg.week} of ${lg.schedule.length}` : ''}</div>
        <h1>${esc(me.name)}</h1></div>
        ${lg.phase !== 'draft' ? `<span class="pill">${row.w}-${row.l}${row.t ? `-${row.t}` : ''}</span>` : ''}
      </div>
      <div class="row">${primaryActions(lg)}</div>
    </div>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${S.lgTab === k}" data-action="lg-tab" data-tab="${k}">${l}</button>`).join('')}</div>
    ${views[S.lgTab]()}
  </div>`;
}

function primaryActions(lg) {
  switch (lg.phase) {
    case 'draft':
      return S.lgTab === 'draft' ? '' : '<button class="btn primary" data-action="lg-tab" data-tab="draft">Go to the draft room</button>';
    case 'preseason': {
      const open = openSlots(lg).length;
      if (open) return S.lgTab === 'roster' ? '' : `<button class="btn primary" data-action="lg-tab" data-tab="roster">Set your lineup (${open} empty)</button>`;
      return '<button class="btn primary" data-action="lg-start">Start the season</button>';
    }
    case 'regular':
      return `<button class="btn primary" data-action="lg-week">Play week ${lg.week}</button><button class="btn" data-action="lg-to-playoffs">Sim to playoffs</button>`;
    case 'playoffs': {
      const round = lg.playoffs.rounds[lg.playoffs.round - 1];
      return `<button class="btn primary" data-action="lg-week">Play the ${esc(round.name)}</button><button class="btn" data-action="lg-sim-season">Sim to the end</button>`;
    }
    case 'complete':
      return `<button class="btn primary" data-action="lg-new-draft">${S.lgUi.confirmNew ? 'Click again to start a new draft' : 'Start a new draft'}</button>`;
    default:
      return '';
  }
}

// ---------------------------------------------------------------- new season
function newLeagueForm() {
  const u = S.lgUi;
  u.newName ??= 'Route 1 Rumblers';
  u.newAbbr ??= 'R1R';
  u.newColor ??= SWATCHES[0];
  u.newTeams ??= 8;
  return `<div class="layout" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">
    <div class="panel stack">
      <div><div class="eyebrow">Draft season</div><h1>Draft a team</h1></div>
      <p class="muted" style="margin:0">Every Pokémon is in the draft pool. Pick ${ROSTER_SIZE} players in a snake draft against the computer, set your depth chart, then play a full season and the playoffs for the Champion Bowl.</p>
      <div class="grid-2" style="gap:10px">
        <label class="field">Team name<input type="text" id="lg-new-name" data-action="lg-new" data-k="newName" value="${esc(u.newName)}" maxlength="32"></label>
        <label class="field">Abbreviation<input type="text" id="lg-new-abbr" data-action="lg-new" data-k="newAbbr" value="${esc(u.newAbbr)}" maxlength="4"></label>
        <label class="field">Teams in the league
          <select id="lg-new-teams" data-action="lg-new" data-k="newTeams">${[4, 6, 8, 10, 12].map((n) => `<option value="${n}"${n === u.newTeams ? ' selected' : ''}>${n} teams · ${2 * (n - 1)} games</option>`).join('')}</select></label>
        <div class="field">Team color<div class="row" style="gap:6px">${SWATCHES.map((c) => `<button class="btn small" data-action="lg-color" data-c="${c}" aria-pressed="${c === u.newColor}" aria-label="Color ${c}" style="width:30px;height:30px;padding:0;background:${c};border:${c === u.newColor ? '3px solid var(--ink)' : '1px solid var(--line)'}"></button>`).join('')}</div></div>
      </div>
      <div class="row"><button class="btn primary big" data-action="lg-create">Start the draft</button></div>
      <p class="faint small" style="margin:0">Your season saves in this browser. The Save tab gives you a save code to load it anywhere.</p>
    </div>
    <div class="panel stack">
      <div><div class="eyebrow">Have a save code?</div><h2>Load a season</h2></div>
      <textarea id="lg-load-code" data-action="lg-load-code" placeholder="Paste a save code here">${esc(S.lgUi.loadCode)}</textarea>
      <div><button class="btn" data-action="lg-load">Load season</button></div>
      <div class="card-section small muted">Your rivals: ${TEAM_POOL.slice(0, 8).map((t) => esc(t.name)).join(', ')}, and more.</div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- dashboard
function dashboard() {
  const lg = S.lg;
  const me = userTeam(lg);
  const table = standings(lg);
  const next = nextUserGame(lg);
  const last = lastUserGame(lg);
  return `<div class="layout" style="grid-template-columns:minmax(0,1fr) minmax(300px,420px)">
    <div class="stack">
      ${lg.final ? finalCard(lg) : phaseCard(lg)}
      ${next ? matchupCard(next) : ''}
      ${last ? lastGameCard(last) : ''}
      <div class="panel flush"><div class="panel-head"><h3>League news</h3></div><div class="news">${lg.news.slice(0, 18).map((n) => `<div class="news-item ${n.kind}"><span class="when">${n.phase === 'regular' && n.week ? `Wk ${n.week}` : esc(PHASE_LABEL[n.phase] ?? '').split(' ')[0]}</span><span class="txt">${esc(n.text)}</span></div>`).join('')}</div></div>
    </div>
    <div class="stack">
      <div class="panel flush"><div class="panel-head"><h3>Standings</h3><button class="btn small ghost" data-action="lg-tab" data-tab="standings">Full table</button></div>
        <div class="table-wrap"><table class="data"><thead><tr><th class="l">Team</th><th>W</th><th>L</th><th>T</th><th>Diff</th></tr></thead><tbody>
        ${table.map((r) => `<tr class="${r.team === me.id ? 'me' : ''}"><td class="l"><span class="tm-tag" style="background:${teamColor(r.team)}"></span>${esc(teamName(r.team))}</td><td>${r.w}</td><td>${r.l}</td><td>${r.t}</td><td>${r.pf - r.pa > 0 ? '+' : ''}${r.pf - r.pa}</td></tr>`).join('')}
        </tbody></table></div></div>
      ${teamSummaryCard(me)}
    </div>
  </div>`;
}

function phaseCard(lg) {
  const text = {
    draft: 'Every team drafts its roster from the full Pokédex in a snake draft. Pokémon have no positions yet: draft on their ratings, then decide who plays where.',
    preseason: 'Set your lineup: choose a Pokémon for each of the 24 slots. Each list shows how every Pokémon on your roster would rate at that position.',
    regular: 'Play one week at a time, or sim to the playoffs. Starters sometimes faint and miss a few weeks, so your backups matter.',
    playoffs: 'The top four teams play the Elite Four Round. The two winners meet in the Champion Bowl.',
  }[lg.phase];
  return `<div class="panel"><div class="eyebrow">${PHASE_LABEL[lg.phase]}</div><p style="margin:6px 0 0">${text}</p></div>`;
}

function finalCard(lg) {
  const f = lg.final;
  const mine = f.champion === lg.userTeam;
  return `<div class="panel stack" style="border-top:4px solid ${teamColor(f.champion)}">
    <div class="eyebrow">Champion Bowl</div>
    <h2>${mine ? 'You won the Champion Bowl!' : `${esc(teamName(f.champion))} are the champions`}</h2>
    <div class="small muted">Runner-up: ${esc(teamName(f.runnerUp))}. Your regular-season finish: ${ordinalPlace(f.userFinish)} of ${lg.teams.length}.</div>
    <div class="tiles">${Object.entries(f.awards).map(([k, a]) => `<div class="tile clickable" data-action="lg-player" data-pid="${a.pid}"><div class="k">${esc(k)}</div><div class="v" style="font-size:20px">${esc(a.name)}</div><div class="s">${esc(teamName(a.team))}</div></div>`).join('')}</div>
  </div>`;
}
const ordinalPlace = (n) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

function nextUserGame(lg) {
  if (lg.phase === 'regular') {
    const g = currentWeekGames(lg).find((x) => x.home === lg.userTeam || x.away === lg.userTeam);
    return g ? { ...g, label: `Week ${lg.week}` } : null;
  }
  if (lg.phase === 'playoffs') {
    const round = lg.playoffs.rounds[lg.playoffs.round - 1];
    const g = round.games.find((x) => !x.result && (x.home === lg.userTeam || x.away === lg.userTeam));
    return g ? { ...g, label: round.name } : null;
  }
  return null;
}

function lastUserGame(lg) {
  const ids = Object.keys(lg.games).filter((id) => {
    const g = lg.games[id];
    return g.home === lg.userTeam || g.away === lg.userTeam;
  });
  return ids.length ? lg.games[ids.at(-1)] : null;
}

function matchupCard(g) {
  const lg = S.lg;
  const h = teamById(lg, g.home);
  const a = teamById(lg, g.away);
  const hr = teamRating(lg, h);
  const ar = teamRating(lg, a);
  const side = (t, r) => `<div style="min-width:0"><div class="row" style="gap:8px"><span class="tm-tag" style="background:${t.color};width:12px;height:12px"></span><b>${esc(t.name)}</b></div>
    <div class="row small muted" style="gap:6px;margin-top:4px"><span class="pill">OVR ${r.ovr}</span><span class="pill">OFF ${r.off}</span><span class="pill">DEF ${r.def}</span></div></div>`;
  return `<div class="panel stack"><div class="spread"><span class="eyebrow">Next game · ${esc(g.label)}</span><span class="faint small">${esc(h.abbr)} at home</span></div>
    <div class="grid-2">${side(h, hr)}${side(a, ar)}</div></div>`;
}

function lastGameCard(g) {
  const lg = S.lg;
  const h = teamById(lg, g.home);
  const a = teamById(lg, g.away);
  return `<div class="panel stack"><div class="spread"><span class="eyebrow">Last game</span><button class="btn small" data-action="lg-game" data-id="${g.id}">Box score${S.lg.logs[g.id] ? ' and plays' : ''}</button></div>
    <div class="row" style="font:700 22px/1.2 var(--font-head)"><span>${esc(h.abbr)} ${g.score[0]}</span><span class="faint">–</span><span>${g.score[1]} ${esc(a.abbr)}</span>${g.ot ? '<span class="pill">OT</span>' : ''}</div>
    <ul class="small muted" style="margin:0;padding-left:18px">${g.leaders.map((l) => `<li><span class="tm-tag" style="background:${l.side === 0 ? h.color : a.color}"></span>${esc(l.text)}</li>`).join('')}</ul></div>`;
}

function teamSummaryCard(team) {
  const lg = S.lg;
  const roster = rosterOf(lg, team);
  if (roster.length < SLOTS.length) return `<div class="panel stack"><h3>Your team</h3><p class="small muted" style="margin:0">${roster.length} of ${ROSTER_SIZE} players drafted.</p></div>`;
  const open = openSlots(lg, team).length;
  if (open) return `<div class="panel stack"><div class="spread"><h3>Your team</h3><button class="btn small" data-action="lg-tab" data-tab="roster">Set lineup</button></div><p class="small muted" style="margin:0">${roster.length} players drafted. ${open} of 24 lineup slots are still empty.</p></div>`;
  const r = teamRating(lg, team);
  const hurt = roster.filter((p) => p.injury);
  return `<div class="panel stack"><div class="spread"><h3>Your team</h3><button class="btn small ghost" data-action="lg-tab" data-tab="roster">Roster</button></div>
    <div class="tiles"><div class="tile"><div class="k">Overall</div><div class="v">${r.ovr}</div><div class="s">OFF ${r.off} · DEF ${r.def}</div></div>
    <div class="tile"><div class="k">Roster</div><div class="v">${roster.length}</div><div class="s">${hurt.length ? `${hurt.length} fainted` : 'All healthy'}</div></div></div>
    ${hurt.length ? `<div class="small"><span class="pill warn">Fainted</span> ${hurt.map((p) => `${esc(nameOf(p))} (${p.injury} wk)`).join(', ')}</div>` : ''}</div>`;
}

// ---------------------------------------------------------------- lineup
function roster() {
  const lg = S.lg;
  const me = userTeam(lg);
  const players = rosterOf(lg, me);
  if (!players.length) return '<div class="panel empty">Your roster fills up as you draft.</div>';
  const drafting = !!lg.draft;
  const open = openSlots(lg, me);
  if (!drafting && !open.length) setLineup(lg, me);
  const slotOf = new Map(Object.entries(me.depth).filter(([, pid]) => pid).map(([s, pid]) => [pid, s]));
  const ordered = [...players].sort((a, b) => {
    const sa = slotOf.has(a.pid) ? SLOTS.findIndex((s) => s.id === slotOf.get(a.pid)) : 99;
    const sb = slotOf.has(b.pid) ? SLOTS.findIndex((s) => s.id === slotOf.get(b.pid)) : 99;
    return sa - sb || DEX.get(b.species).base.reduce((x, y) => x + y, 0) - DEX.get(a.species).base.reduce((x, y) => x + y, 0);
  });
  const u = S.lgUi;
  const head = drafting
    ? '<p class="faint small" style="margin:0">You set positions after the draft.</p>'
    : `<p class="faint small" style="margin:0">${open.length ? `Choose a Pokémon for each slot. ${open.length} of 24 are empty.` : 'Every slot is set. A fainted starter is replaced by the best healthy backup for that game only.'} Each list shows your roster rated at that slot's position.</p>
      <div class="row">${open.length ? `<button class="btn small" data-action="lg-fill">Fill ${open.length === 24 ? 'all slots' : 'empty slots'} with best fits</button>` : ''}${lg.phase === 'preseason' ? `<button class="btn small ghost" data-action="lg-clear">${u.confirmClear ? 'Click again to clear' : 'Clear lineup'}</button>` : ''}</div>`;
  return `<div class="layout">
    <div class="stack">
      <div class="panel stack">
        <div class="spread"><h3>Lineup</h3>${!drafting && !open.length && lg.phase === 'preseason' ? '<button class="btn small primary" data-action="lg-start">Start the season</button>' : ''}</div>
        ${head}
        ${drafting ? '' : SLOT_GROUPS.map((g) => `<div><div class="group-label">${g.name}</div>${g.slots.map((slot) => depthRow(me, players, slot, slotOf)).join('')}</div>`).join('')}
      </div>
      <div class="panel stack"><h3>Game plan</h3>
        <label class="field">Play style<select id="lg-style" data-action="lg-strat" data-k="runBias">${[[0.8, 'Run first'], [0, 'Balanced'], [-0.8, 'Air raid']].map(([v, l]) => `<option value="${v}"${Number(me.strategy.runBias) === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field">Fourth downs<select id="lg-aggr" data-action="lg-strat" data-k="aggression">${[[0.15, 'Conservative'], [0.5, 'Normal'], [0.9, 'Aggressive']].map(([v, l]) => `<option value="${v}"${Number(me.strategy.aggression) === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field">Blitzing<select id="lg-blitz" data-action="lg-strat" data-k="blitz">${[[0.15, 'Rarely'], [0.5, 'Sometimes'], [0.9, 'Often']].map(([v, l]) => `<option value="${v}"${Number(me.strategy.blitz) === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
    </div>
    <div class="panel flush" style="min-width:0">
      <div class="panel-head"><h3>Roster</h3><span class="faint small">${players.length} of ${ROSTER_MAX} · click a player for the full card</span></div>
      <div class="table-wrap"><table class="data"><thead><tr><th class="l">Player</th><th class="l">Slot</th><th>OVR</th><th>BST</th><th class="l">This season</th></tr></thead><tbody>
      ${ordered.map((p) => {
        const slot = slotOf.get(p.pid);
        return `<tr class="clickable" data-action="lg-player" data-pid="${p.pid}"><td class="l">${who(p)}</td>
          <td class="l">${slot ? `<b>${slot}</b>` : '<span class="faint">Bench</span>'}${p.injury ? ` <span class="pill warn">Out ${p.injury}</span>` : ''}</td>
          <td>${slot ? ovrBadge(ratingOf(p).ovr[SLOT_POS[slot]]) : ''}</td><td>${DEX.get(p.species).base.reduce((x, y) => x + y, 0)}</td>
          <td class="l small muted">${statSummary(p.stats.reg)}</td></tr>`;
      }).join('')}
      </tbody></table></div>
    </div>
  </div>`;
}

function depthRow(team, players, slot, slotOf) {
  const pos = SLOT_POS[slot];
  const cur = team.depth[slot] && S.lg.players[team.depth[slot]]?.team === team.id ? team.depth[slot] : null;
  const curP = cur ? lgPlayer(cur) : null;
  const sub = curP?.injury ? lgPlayer(team.lineup[slot]) : null;
  const options = [...players].sort((a, b) => ratingOf(b).ovr[pos] - ratingOf(a).ovr[pos]);
  return `<div style="padding:2px 0">
    <div class="row" style="gap:8px;flex-wrap:nowrap">
      <span style="width:38px;font:700 12px/1 var(--font-head);letter-spacing:.08em;color:var(--ink-3)">${slot}</span>
      <select id="lg-slot-${slot}" data-action="lg-assign" data-slot="${slot}" aria-label="${POSITIONS[pos].name} ${slot}" style="flex:1;min-width:0${cur ? '' : ';border-color:var(--flag)'}">
        <option value=""${cur ? '' : ' selected'}>Empty: choose a ${POSITIONS[pos].name.toLowerCase()}</option>
        ${options.map((p) => {
          const at = slotOf.get(p.pid);
          return `<option value="${p.pid}"${p.pid === cur ? ' selected' : ''}>${esc(nameOf(p))} · ${ratingOf(p).ovr[pos]}${at && at !== slot ? ` (now ${at})` : ''}${p.injury ? ' (fainted)' : ''}</option>`;
        }).join('')}
      </select>
      ${cur ? ovrBadge(ratingOf(curP).ovr[pos]) : '<span class="ovr" aria-hidden="true">–</span>'}
    </div>
    ${sub && sub !== curP ? `<div class="small muted" style="padding:2px 0 0 46px">${esc(nameOf(curP))} fainted (${curP.injury} wk). ${esc(nameOf(sub))} fills in.</div>` : ''}
  </div>`;
}

function statSummary(s) {
  if (!s) return '';
  const parts = [`${s.gp} GP`];
  if (s.pass.att) parts.push(`${s.pass.yds} pass yds, ${s.pass.td} TD`);
  if (s.rush.car) parts.push(`${s.rush.yds} rush yds`);
  if (s.rec.rec) parts.push(`${s.rec.rec} rec, ${s.rec.yds} yds`);
  if (s.def.tkl || s.def.sck || s.def.int) parts.push(`${s.def.tkl ?? 0} tkl${s.def.sck ? `, ${s.def.sck} sck` : ''}${s.def.int ? `, ${s.def.int} INT` : ''}`);
  if (s.kick.fga) parts.push(`${s.kick.fgm}/${s.kick.fga} FG`);
  return parts.join(' · ');
}

// ---------------------------------------------------------------- draft room
const bstOf = (p) => DEX.get(p.species).base.reduce((x, y) => x + y, 0);

function draftRoom() {
  const lg = S.lg;
  const d = lg.draft;
  const pick = currentPick(lg);
  const onClock = pick && pick.team === lg.userTeam;
  const u = S.lgUi;
  const q = u.draftQ.trim().toLowerCase();
  const pos = u.draftPos === 'none' ? null : u.draftPos;
  const recommend = onClock ? bestAvailable(lg, lg.userTeam, 1)[0] : null;
  const val = (row) => (u.draftSort === 'ovr' ? row.ovr : u.draftSort === 'bst' ? row.bst : u.draftSort === 'name' ? row.name : row.r.attrs[u.draftSort]);
  const pool = d.pool
    .map((pid) => lgPlayer(pid))
    .filter((p) => !q || nameOf(p).toLowerCase().includes(q))
    .map((p) => {
      const r = ratingOf(p);
      return { p, r, name: nameOf(p), bst: bstOf(p), ovr: pos ? r.ovr[pos] : 0 };
    })
    .sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * u.draftDir || b.bst - a.bst;
    })
    .slice(0, 80);
  const recent = d.picks.slice(Math.max(0, d.current - 14), d.current).reverse();
  const mine = d.picks.filter((p) => p.team === lg.userTeam && p.pid);
  const th = (key, label, cls = '') => `<th class="${cls}"><button data-action="lg-draft-sort" data-key="${key}" aria-pressed="${u.draftSort === key}">${label}${u.draftSort === key ? (u.draftDir < 0 ? ' ↓' : ' ↑') : ''}</button></th>`;
  return `<div class="stack">
    <div class="panel spread" style="border-left:6px solid ${pick ? teamColor(pick.team) : 'var(--line)'}">
      <div><div class="eyebrow">Round ${pick?.round ?? d.rounds} of ${d.rounds} · Pick ${Math.min(d.current + 1, d.picks.length)} of ${d.picks.length}</div>
        <h2>${pick ? (onClock ? 'You are on the clock' : `${esc(teamName(pick.team))} are picking`) : 'The draft is over'}</h2></div>
      <div class="row">
        ${onClock && recommend ? `<button class="btn primary" data-action="lg-draft" data-pid="${recommend}">Draft ${esc(nameOf(lgPlayer(recommend)))}</button>` : ''}
        ${!onClock && pick ? '<button class="btn primary" data-action="lg-sim-pick">Sim to my pick</button>' : ''}
        <button class="btn" data-action="lg-auto-draft">Auto-draft the rest</button>
      </div>
    </div>
    <div class="layout" style="grid-template-columns:minmax(0,1fr) minmax(240px,300px)">
      <div class="panel flush" style="min-width:0">
        <div class="panel-head">
          <div class="row"><input type="search" id="lg-draft-q" data-action="lg-draft-q" placeholder="Search the pool" value="${esc(u.draftQ)}" aria-label="Search the draft pool">
          <label class="row small" style="gap:6px">Rate as <select id="lg-draft-pos" data-action="lg-draft-pos"><option value="none">Any position</option>${POS_KEYS.map((k) => `<option value="${k}"${u.draftPos === k ? ' selected' : ''}>${POSITIONS[k].name}</option>`).join('')}</select></label></div>
          <span class="faint small">${d.pool.length} available · top 80 shown · click a column to sort</span>
        </div>
        <div class="table-wrap"><table class="data"><thead><tr><th></th>${th('name', 'Pokémon', 'l')}${pos ? th('ovr', `${pos} OVR`) : ''}${th('bst', 'BST')}${ATTRS.map((a) => th(a.key, a.key)).join('')}</tr></thead><tbody>
        ${pool.map(({ p, r, bst, ovr }) => `<tr>
          <td>${onClock ? `<button class="btn small primary" data-action="lg-draft" data-pid="${p.pid}">Draft</button>` : ''}</td>
          <td class="l clickable" data-action="lg-player" data-pid="${p.pid}">${who(p, esc(DEX.get(p.species).genus))}</td>
          ${pos ? `<td>${ovrBadge(ovr)}</td>` : ''}<td>${bst}</td>
          ${ATTRS.map((a) => `<td${pos && POSITIONS[pos].w[a.key] ? ' style="font-weight:700"' : pos ? ' class="faint"' : ''}>${r.attrs[a.key]}</td>`).join('')}</tr>`).join('')}
        </tbody></table></div>
      </div>
      <div class="stack">
        <div class="panel flush"><div class="panel-head"><h3>Your picks</h3><span class="faint small">${mine.length} of ${d.rounds}</span></div>
          <div class="news">${mine.slice().reverse().map((pk) => `<div class="news-item"><span class="when">Rd ${pk.round}</span><span class="txt">${esc(nameOf(lgPlayer(pk.pid)))}</span></div>`).join('') || '<div class="empty small">No picks yet.</div>'}</div></div>
        <div class="panel flush"><div class="panel-head"><h3>Recent picks</h3></div>
          <div class="news">${recent.map((pk) => `<div class="news-item"><span class="when">${esc(teamAbbr(pk.team))}</span><span class="txt">${esc(nameOf(lgPlayer(pk.pid)))}</span></div>`).join('') || '<div class="empty small">No picks yet.</div>'}</div></div>
      </div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- schedule
function schedule() {
  const lg = S.lg;
  const po = lg.playoffs;
  const gameRow = (g) => {
    const res = g.result;
    const mine = g.home === lg.userTeam || g.away === lg.userTeam;
    return `<tr class="${mine ? 'me ' : ''}${res ? 'clickable' : ''}"${res ? ` data-action="lg-game" data-id="${g.id}"` : ''}>
      <td class="l"><span class="tm-tag" style="background:${teamColor(g.away)}"></span>${esc(teamName(g.away))}</td><td>${res ? res.score[1] : ''}</td>
      <td class="faint">at</td>
      <td class="l"><span class="tm-tag" style="background:${teamColor(g.home)}"></span>${esc(teamName(g.home))}</td><td>${res ? res.score[0] : ''}</td>
      <td class="l faint">${res ? (res.ot ? 'Final (OT)' : 'Final') : ''}</td></tr>`;
  };
  return `<div class="stack">
    ${po ? `<div class="panel flush"><div class="panel-head"><h3>Playoffs</h3>${po.champion ? `<span class="pill flag">Champion: ${esc(teamName(po.champion))}</span>` : ''}</div>
      <div class="table-wrap"><table class="data"><tbody>${po.rounds.filter(Boolean).map((r) => `<tr><td class="l" colspan="6"><b>${esc(r.name)}</b></td></tr>${r.games.map(gameRow).join('')}`).join('')}</tbody></table></div></div>` : ''}
    ${lg.schedule.map((w) => `<div class="panel flush"><div class="panel-head"><h3>Week ${w.week}</h3>${w.week === lg.week && lg.phase === 'regular' ? '<span class="pill flag">Next up</span>' : ''}</div>
      <div class="table-wrap"><table class="data"><tbody>${w.games.map(gameRow).join('')}</tbody></table></div></div>`).join('') || '<div class="panel empty">The schedule appears after the draft.</div>'}
  </div>`;
}

// ---------------------------------------------------------------- standings
function standingsView() {
  const lg = S.lg;
  const rows = standings(lg);
  return `<div class="panel flush"><div class="table-wrap"><table class="data"><thead><tr><th class="l">Team</th><th>W</th><th>L</th><th>T</th><th>Pct</th><th>PF</th><th>PA</th><th>Diff</th><th>Streak</th><th>OVR</th><th>OFF</th><th>DEF</th></tr></thead><tbody>
    ${rows.map((r, i) => {
      const t = teamById(lg, r.team);
      const tr = t.roster.length >= SLOTS.length ? teamRating(lg, t) : { ovr: '–', off: '–', def: '–' };
      return `<tr class="${t.user ? 'me' : ''}"><td class="l">${i + 1}. <span class="tm-tag" style="background:${t.color}"></span>${esc(t.name)}</td><td>${r.w}</td><td>${r.l}</td><td>${r.t}</td><td>${r.pct.toFixed(3).replace(/^0/, '')}</td><td>${r.pf}</td><td>${r.pa}</td><td>${r.pf - r.pa > 0 ? '+' : ''}${r.pf - r.pa}</td><td>${r.streak}</td><td>${tr.ovr}</td><td>${tr.off}</td><td>${tr.def}</td></tr>`;
    }).join('')}
  </tbody></table></div><p class="faint small" style="padding:0 14px">Top four make the playoffs. Ties break on point differential, then points scored.</p></div>`;
}

// ---------------------------------------------------------------- leaders
function leadersView() {
  const lg = S.lg;
  const leaders = seasonLeaders(lg, 5);
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">
    ${Object.entries(leaders).map(([cat, list]) => `<div class="panel flush"><div class="panel-head"><h3>${cat}</h3></div>
      ${list.length ? `<table class="data"><tbody>${list.map((x, i) => `<tr class="clickable${teamById(lg, x.team)?.user ? ' me' : ''}" data-action="lg-player" data-pid="${x.pid}"><td class="l">${i + 1}. <span class="tm-tag" style="background:${teamColor(x.team)}"></span>${esc(x.name)} <span class="faint">${esc(teamAbbr(x.team))}</span></td><td><b>${x.value}</b></td></tr>`).join('')}</tbody></table>` : '<div class="empty small">No games yet.</div>'}</div>`).join('')}
  </div>`;
}

// ---------------------------------------------------------------- free agents
function freeAgents() {
  const lg = S.lg;
  const u = S.lgUi;
  const me = userTeam(lg);
  const full = me.roster.length >= ROSTER_MAX;
  const drafting = !!lg.draft;
  const q = u.faQ.trim().toLowerCase();
  const list = lg.freeAgents
    .map((pid) => lgPlayer(pid))
    .filter((p) => p && (!q || nameOf(p).toLowerCase().includes(q)))
    .map((p) => {
      const pos = u.faPos === 'none' ? null : u.faPos;
      return { p, pos, ovr: pos ? ratingOf(p).ovr[pos] : 0, bst: bstOf(p) };
    })
    .sort((a, b) => b.ovr - a.ovr || b.bst - a.bst)
    .slice(0, 60);
  const ratePos = u.faPos === 'none' ? null : u.faPos;
  return `<div class="panel flush">
    <div class="panel-head"><div class="row"><input type="search" id="lg-fa-q" data-action="lg-fa-q" placeholder="Search free agents" value="${esc(u.faQ)}" aria-label="Search free agents">
      <label class="row small" style="gap:6px">Rate as <select id="lg-fa-pos" data-action="lg-fa-pos"><option value="none">Any position</option>${POS_KEYS.map((k) => `<option value="${k}"${u.faPos === k ? ' selected' : ''}>${POSITIONS[k].name}</option>`).join('')}</select></label></div>
      <span class="faint small">${drafting ? 'Free agency opens after the draft.' : full ? `Your roster is full (${ROSTER_MAX}). Release someone to sign.` : `${me.roster.length} of ${ROSTER_MAX} roster spots used`}</span></div>
    <div class="table-wrap"><table class="data"><thead><tr><th class="l">Player</th>${ratePos ? `<th>${ratePos} OVR</th>` : ''}<th>BST</th><th></th></tr></thead><tbody>
    ${list.map(({ p, pos, ovr, bst }) => `<tr><td class="l clickable" data-action="lg-player" data-pid="${p.pid}">${who(p)}</td>${pos ? `<td>${ovrBadge(ovr)}</td>` : ''}<td>${bst}</td><td><button class="btn small" data-action="lg-sign" data-pid="${p.pid}"${full || drafting ? ' disabled' : ''}>Sign</button></td></tr>`).join('')}
    </tbody></table></div></div>`;
}

// ---------------------------------------------------------------- save
function saveView() {
  const u = S.lgUi;
  return `<div class="grid-2">
    <div class="panel stack"><h3>Save code</h3>
      <p class="small muted" style="margin:0">The season saves in this browser after every action. To move it, copy the save code and paste it into "Load a season" on another device.</p>
      <div class="row"><button class="btn" data-action="lg-copy">Copy save code</button><button class="btn ghost" data-action="lg-show-code">Show code</button></div>
      ${u.saveCode ? `<textarea id="lg-save-code" readonly aria-label="Save code">${esc(u.saveCode)}</textarea>` : ''}
    </div>
    <div class="panel stack"><h3>Start over</h3>
      <p class="small muted" style="margin:0">Delete this season from this browser and start a new draft. Copy the save code first if you want to keep it.</p>
      <div><button class="btn danger" data-action="lg-delete">${u.confirmDelete ? 'Click again to delete the season' : 'Delete season'}</button></div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- modals
export function renderLeagueModal() {
  const m = S.modal;
  if (!m || !S.lg) return '';
  if (m.kind === 'game') return gameModal(m);
  if (m.kind === 'player') return playerModal(m);
  return '';
}

function gameModal(m) {
  const lg = S.lg;
  const g = lg.games[m.id];
  if (!g) return '';
  const h = teamById(lg, g.home);
  const a = teamById(lg, g.away);
  const winner = g.score[0] === g.score[1] ? null : g.score[0] > g.score[1] ? 0 : 1;
  const logData = lg.logs[g.id];
  const result = {
    teams: [h, a].map((t) => ({ id: t.id, name: t.name, abbr: t.abbr, color: t.color })),
    score: g.score, byQuarter: g.byQuarter, ot: g.ot, winner, weather: g.weather, weatherSource: g.weatherSource,
    teamStats: g.teamStats, players: g.players ?? [], log: logData?.log ?? [], drives: logData?.drives ?? [],
  };
  const view = m.view ?? (logData ? 'plays' : 'box');
  const tabs = [['box', 'Box score']];
  if (logData) tabs.unshift(['plays', 'Play-by-play'], ['drives', 'Drive chart']);
  let body;
  if (view === 'plays' && logData) {
    const spots = ballSpots(result);
    const cur = m.cur ?? spots.length - 1;
    let spot = null;
    for (let j = cur; j >= 0 && !spot; j--) spot = spots[j];
    body = `${fieldSvg(result, spot)}<div class="panel flush">${playList(result, { current: cur })}</div>`;
  } else if (view === 'drives' && logData) body = `<div class="panel flush">${driveChart(result)}</div>`;
  else if (g.players) body = `<div class="panel">${boxScore(result)}</div>`;
  else body = `<div class="panel stack"><div class="eyebrow">Top performers</div><ul class="small" style="margin:0;padding-left:18px">${g.leaders.map((l) => `<li>${esc(l.text)}</li>`).join('')}</ul><p class="faint small" style="margin:0">Full box scores are kept for your own games.</p></div>`;
  return `<div class="modal-back" data-action="modal-close"><div class="modal" data-stop="1" role="dialog" aria-label="Game details">
    <div class="spread"><h2>${esc(a.name)} at ${esc(h.name)}</h2><button class="btn small" data-action="modal-close">Close</button></div>
    ${scoreboard(result)}
    <div class="tabs">${tabs.map(([k, l]) => `<button aria-selected="${view === k}" data-action="lg-game-view" data-view="${k}">${l}</button>`).join('')}</div>
    ${body}
  </div></div>`;
}

function playerModal(m) {
  const lg = S.lg;
  const p = lgPlayer(m.pid);
  if (!p) return '';
  const me = userTeam(lg);
  const mine = p.team === me.id;
  const isFa = !p.team && !lg.draft;
  const onClock = lg.draft && currentPick(lg)?.team === lg.userTeam && lg.draft.pool.includes(p.pid);
  const slot = mine ? Object.entries(me.depth).find(([, pid]) => pid === p.pid)?.[0] : null;
  const pos = slot ? SLOT_POS[slot] : null;
  const actions = [
    onClock ? `<button class="btn small primary" data-action="lg-draft" data-pid="${p.pid}">Draft</button>` : '',
    mine && !lg.draft ? `<button class="btn small danger" data-action="lg-release" data-pid="${p.pid}">${m.confirm ? 'Click again to release' : 'Release'}</button>` : '',
    isFa ? `<button class="btn small primary" data-action="lg-sign" data-pid="${p.pid}">Sign</button>` : '',
  ].join('');
  const lines = [['reg', 'Regular season'], ['post', 'Playoffs']].filter(([k]) => p.stats[k]);
  const where = p.team ? teamName(p.team) : lg.draft ? 'In the draft pool' : 'Free agent';
  const extra = `<div class="small muted">${esc(where)}${slot ? ` · starts at ${slot}` : ''}${p.draft ? ` · drafted round ${p.draft.round}, pick ${p.draft.pick}` : ''}${p.injury ? ` · <span class="pill warn">Fainted, out ${p.injury} wk</span>` : ''}</div>
    ${p.awards.length ? `<div class="row">${p.awards.map((a) => `<span class="pill flag">${esc(a)}</span>`).join('')}</div>` : ''}
    ${lines.length ? `<div class="table-wrap"><table class="data"><thead><tr><th class="l"></th><th>GP</th><th>Pass</th><th>TD</th><th>Rush</th><th>Rec</th><th>Tkl</th><th>Sck</th><th>Int</th></tr></thead><tbody>${lines.map(([k, label]) => {
      const s = p.stats[k];
      return `<tr><td class="l">${label}</td><td>${s.gp}</td><td>${s.pass.yds ?? 0}</td><td>${(s.pass.td ?? 0) + (s.rush.td ?? 0) + (s.rec.td ?? 0)}</td><td>${s.rush.yds ?? 0}</td><td>${s.rec.yds ?? 0}</td><td>${s.def.tkl ?? 0}</td><td>${s.def.sck ?? 0}</td><td>${s.def.int ?? 0}</td></tr>`;
    }).join('')}</tbody></table></div>` : ''}`;
  return `<div class="modal-back" data-action="modal-close"><div class="modal" data-stop="1" role="dialog" aria-label="Player card" style="width:min(640px,100%)">
    <div class="spread"><span class="eyebrow">Player card</span><button class="btn small" data-action="modal-close">Close</button></div>
    ${playerCard(p, { contextPos: pos, actions, extra })}
  </div></div>`;
}

// ---------------------------------------------------------------- actions
export function handleLeague(action, el) {
  const lg = S.lg;
  const u = S.lgUi;
  const done = () => { if (!saveLeague()) toast('This browser would not save the season. Copy a save code from the Save tab.'); return true; };
  try {
    switch (action) {
      case 'lg-tab': S.lgTab = el.dataset.tab; return true;
      case 'lg-new': u[el.dataset.k] = el.dataset.k === 'newTeams' ? Number(el.value) : el.value; return false;
      case 'lg-color': u.newColor = el.dataset.c; return true;
      case 'lg-create': {
        S.lg = createLeague({ seed: randomSeed(), teamCount: u.newTeams, userName: u.newName.trim() || 'Route 1 Rumblers', userAbbr: (u.newAbbr.trim() || 'R1R').toUpperCase(), userColor: u.newColor });
        S.lgTab = 'draft';
        simToUserPick(S.lg);
        return done();
      }
      case 'lg-load-code': u.loadCode = el.value; return false;
      case 'lg-load': {
        const data = JSON.parse(u.loadCode.trim());
        if (!data || data.version !== LEAGUE_VERSION || !data.teams || !data.players) throw new Error('That is not a Pocket Gridiron save code.');
        S.lg = data;
        u.loadCode = '';
        S.lgTab = 'home';
        toast('Season loaded.');
        return done();
      }
      case 'lg-draft': {
        draftPlayer(lg, el.dataset.pid);
        S.modal = null;
        if (lg.draft) simToUserPick(lg);
        if (!lg.draft) S.lgTab = 'roster';
        return done();
      }
      case 'lg-sim-pick': simToUserPick(lg); return done();
      case 'lg-auto-draft': autoDraftRest(lg); S.lgTab = 'roster'; return done();
      case 'lg-draft-sort': {
        const key = el.dataset.key;
        if (u.draftSort === key) u.draftDir = -u.draftDir;
        else { u.draftSort = key; u.draftDir = key === 'name' ? 1 : -1; }
        return true;
      }
      case 'lg-draft-q': u.draftQ = el.value; return true;
      case 'lg-draft-pos': u.draftPos = el.value; u.draftSort = el.value === 'none' ? 'bst' : 'ovr'; u.draftDir = -1; return true;
      case 'lg-start': startSeason(lg); return done();
      case 'lg-week': {
        const before = Object.keys(lg.games).length;
        playWeek(lg);
        const mine = Object.values(lg.games).slice(before).find((g) => g.home === lg.userTeam || g.away === lg.userTeam);
        if (mine) {
          const margin = mine.home === lg.userTeam ? mine.score[0] - mine.score[1] : mine.score[1] - mine.score[0];
          toast(`${margin > 0 ? 'Win' : margin < 0 ? 'Loss' : 'Tie'}: ${teamAbbr(mine.home)} ${mine.score[0]}, ${teamAbbr(mine.away)} ${mine.score[1]}.`);
        }
        return done();
      }
      case 'lg-to-playoffs': simToPlayoffs(lg); return done();
      case 'lg-sim-season': simSeason(lg); return done();
      case 'lg-new-draft': {
        if (!u.confirmNew) { u.confirmNew = true; return true; }
        S.lg = null;
        u.confirmNew = false;
        u.saveCode = '';
        S.lgTab = 'home';
        saveLeague();
        return true;
      }
      case 'lg-assign': assignSlot(lg, el.dataset.slot, el.value || null); u.confirmClear = false; return done();
      case 'lg-fill': fillEmptySlots(lg); u.confirmClear = false; return done();
      case 'lg-clear': {
        if (!u.confirmClear) { u.confirmClear = true; return true; }
        clearDepth(lg);
        u.confirmClear = false;
        return done();
      }
      case 'lg-strat': userTeam(lg).strategy[el.dataset.k] = Number(el.value); return done();
      case 'lg-player': S.modal = { kind: 'player', pid: el.dataset.pid }; return true;
      case 'lg-game': S.modal = { kind: 'game', id: el.dataset.id }; return true;
      case 'lg-game-view': S.modal.view = el.dataset.view; return true;
      case 'lg-release': {
        if (!S.modal?.confirm) { S.modal = { ...S.modal, confirm: true }; return true; }
        releasePlayer(lg, el.dataset.pid);
        S.modal = null;
        return done();
      }
      case 'lg-sign': signFreeAgent(lg, el.dataset.pid); S.modal = null; toast(`Signed ${nameOf(lgPlayer(el.dataset.pid))}.`); return done();
      case 'lg-fa-q': u.faQ = el.value; return true;
      case 'lg-fa-pos': u.faPos = el.value; return true;
      case 'lg-show-code': u.saveCode = JSON.stringify(lg); return true;
      case 'lg-copy': {
        const code = JSON.stringify(lg);
        u.saveCode = code;
        navigator.clipboard?.writeText(code).then(() => toast('Save code copied.'), () => toast('Copy did not work. Select the code below and copy it.'));
        return true;
      }
      case 'lg-delete': {
        if (!u.confirmDelete) { u.confirmDelete = true; return true; }
        S.lg = null;
        u.confirmDelete = false;
        u.saveCode = '';
        S.lgTab = 'home';
        saveLeague();
        return true;
      }
      default: return false;
    }
  } catch (err) {
    toast(err.message || String(err));
    return true;
  }
}

export function handleLeaguePlay(action, el) {
  if (action === 'show-play' && S.modal?.kind === 'game') { S.modal.cur = Number(el.dataset.i); return true; }
  return false;
}
