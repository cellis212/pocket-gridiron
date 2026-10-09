// Exhibition: pick two lineups, kick off, watch the play-by-play, or sim 200 games.
import { POKEDEX } from '../data/pokedex.js';
import { DEX, POSITIONS } from '../engine/ratings.js';
import { SLOTS, SLOT_POS, SLOT_GROUPS, THEMES, themePool, exhibitionPlayer, autoLineup, ratingOf, teamStrength } from '../engine/lineup.js';
import { simulateGame } from '../engine/match.js';
import { randomSeed } from '../engine/rng.js';
import { S, rerender, toast, saveUi } from './state.js';
import { esc, jersey, typeChips, ovrBadge, scoreboard, fieldSvg, ballSpots, playList, boxScore, driveChart, marginHistogram } from './common.js';

const THEME_ABBR = {
  gen1: 'KAN', gen2: 'JOH', gen3: 'HOE', gen4: 'SIN', gen5: 'UNO', gen6: 'KAL', gen7: 'ALO', gen8: 'GAL', gen9: 'PAL',
  legends: 'LEG', starters: 'STR', pseudo: 'PSL', standard: 'STD', little: 'LCP', everyone: 'ALL',
};
const SLOT_NUMBERS = {
  QB: [7, 12, 9], RB: [22, 28, 32], WR: [11, 81, 84, 13, 17], TE: [87, 85], OL: [71, 66, 52, 64, 76, 70, 61],
  DL: [93, 97, 90, 99, 95], LB: [54, 50, 56, 44], CB: [24, 21, 23], S: [31, 20, 33], K: [3], P: [5],
};
const STYLE = { balanced: 0, run: 0.8, pass: -0.8 };
const AGGR = { conservative: 0.15, normal: 0.5, aggressive: 0.9 };

const built = { home: null, away: null };

export function exTeam(side) {
  const cfg = S.ex[side];
  const key = JSON.stringify(cfg);
  if (built[side]?.key === key) return built[side].team;
  const theme = THEMES.find((t) => t.id === cfg.theme) ?? THEMES[0];
  const ids = new Set(themePool(theme.id));
  for (const sp of Object.values(cfg.overrides)) if (sp) ids.add(sp);
  const players = [...ids].map((s) => exhibitionPlayer(s, cfg.level, `${side}-${s}`));
  const locked = {};
  for (const [slot, sp] of Object.entries(cfg.overrides)) if (sp) locked[slot] = `${side}-${sp}`;
  const lineup = autoLineup(players, { locked });
  const byId = new Map(players.map((p) => [p.pid, p]));
  const used = {};
  for (const s of SLOTS) {
    const p = byId.get(lineup[s.id]);
    if (!p) continue;
    const list = SLOT_NUMBERS[s.pos];
    used[s.pos] = (used[s.pos] ?? 0) + 1;
    p.num = list[used[s.pos] - 1] ?? 40 + used[s.pos];
  }
  const other = side === 'home' ? S.ex.away : S.ex.home;
  let abbr = THEME_ABBR[theme.id] ?? theme.id.replace('type-', '').slice(0, 3).toUpperCase();
  let name = theme.name;
  if (side === 'away' && other.theme === cfg.theme) { abbr = abbr.slice(0, 2) + '2'; name += ' II'; }
  const team = {
    id: side, name, abbr, color: side === 'home' ? 'var(--home)' : 'var(--away)', players, lineup,
    strategy: { runBias: STYLE[cfg.style] ?? 0, aggression: AGGR[cfg.aggr] ?? 0.5, blitz: AGGR[cfg.aggr] ?? 0.5 },
  };
  built[side] = { key, team };
  return team;
}

export function kickOff() {
  const home = exTeam('home');
  const away = exTeam('away');
  S.ex.result = simulateGame(home, away, { seed: randomSeed() });
  S.ex.cur = lastPlayIndex(S.ex.result);
  S.ex.watchI = null;
  S.ex.multi = null;
  if (S.ex.view === 'multi') S.ex.view = 'plays';
}

function lastPlayIndex(result) {
  for (let i = result.log.length - 1; i >= 0; i--) if (result.log[i].kind !== 'note') return i;
  return 0;
}

function simMany(n = 200) {
  const home = exTeam('home');
  const away = exTeam('away');
  const out = { n, wins: [0, 0, 0], pts: [0, 0], margins: [], yds: [[0, 0], [0, 0]], to: [0, 0], players: new Map(), teams: null };
  for (let i = 0; i < n; i++) {
    const r = simulateGame(home, away, { seed: randomSeed(), log: false });
    out.teams = r.teams;
    out.wins[r.winner === null ? 2 : r.winner]++;
    out.pts[0] += r.score[0];
    out.pts[1] += r.score[1];
    out.margins.push(r.score[0] - r.score[1]);
    for (const side of [0, 1]) {
      out.yds[side][0] += r.teamStats[side].passYds;
      out.yds[side][1] += r.teamStats[side].rushYds;
      out.to[side] += r.teamStats[side].turnovers;
    }
    for (const p of r.players) {
      const a = out.players.get(p.pid) ?? { name: p.name, side: p.side, slot: p.slot, passYds: 0, passTd: 0, rushYds: 0, recYds: 0, td: 0, tkl: 0, sck: 0, int: 0 };
      a.passYds += p.pass.yds; a.passTd += p.pass.td; a.rushYds += p.rush.yds; a.recYds += p.rec.yds;
      a.td += p.rush.td + p.rec.td; a.tkl += p.def.tkl; a.sck += p.def.sck; a.int += p.def.int;
      out.players.set(p.pid, a);
    }
  }
  S.ex.multi = out;
  S.ex.view = 'multi';
}

let watchTimer = null;
function stopWatch() {
  clearInterval(watchTimer);
  watchTimer = null;
}
function startWatch() {
  stopWatch();
  S.ex.watchI = 0;
  S.ex.view = 'plays';
  watchTimer = setInterval(() => {
    const r = S.ex.result;
    if (!r || S.ex.watchI === null) return stopWatch();
    S.ex.watchI++;
    if (S.ex.watchI >= r.log.length - 1) { S.ex.watchI = null; S.ex.cur = lastPlayIndex(r); stopWatch(); }
    if (S.tab === 'exhibition') rerender();
  }, 650);
}

// ---------------------------------------------------------------- view
export function renderExhibition() {
  if (!S.ex.result) kickOff();
  return `<div class="layout ex">
    <aside class="stack">
      ${teamPanel('home')}
      <div class="row">
        <button class="btn primary big" data-action="ex-kick" style="flex:1">Kick off</button>
        <button class="btn big" data-action="ex-multi" title="Play the same matchup 200 times">Sim 200</button>
      </div>
      ${teamPanel('away')}
      <p class="faint small" style="margin:0">Every Pokémon plays at the level you pick, with perfect IVs, a neutral nature, and its best ability. Ratings come from real base stats, size and body shape.</p>
    </aside>
    <section class="stack" style="min-width:0">${resultArea()}</section>
  </div>`;
}

function teamPanel(side) {
  const cfg = S.ex[side];
  const team = exTeam(side);
  const st = teamStrength(team.lineup, team.players);
  const groups = {};
  for (const t of THEMES) (groups[t.group] ??= []).push(t);
  const open = S.ex.open[side];
  const nOver = Object.values(cfg.overrides).filter(Boolean).length;
  return `<div class="panel teamcard stack" style="--tc:${team.color}">
    <div class="spread">
      <div style="min-width:0"><div class="eyebrow">${side === 'home' ? 'Home' : 'Away'}</div><h2>${esc(team.name)}</h2></div>
      <div class="row" style="gap:6px"><span class="pill">OVR ${st.ovr}</span><span class="pill">OFF ${st.off}</span><span class="pill">DEF ${st.def}</span></div>
    </div>
    <div class="ctl-grid">
      <label class="field">Team
        <select id="ex-${side}-theme" data-action="ex-theme" data-side="${side}">
          ${Object.entries(groups).map(([g, ts]) => `<optgroup label="${g}">${ts.map((t) => `<option value="${t.id}"${t.id === cfg.theme ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</optgroup>`).join('')}
        </select></label>
      <label class="field">Level
        <select id="ex-${side}-level" data-action="ex-level" data-side="${side}">
          ${[5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((l) => `<option value="${l}"${l === cfg.level ? ' selected' : ''}>Lv ${l}</option>`).join('')}
        </select></label>
      <label class="field">Play style
        <select id="ex-${side}-style" data-action="ex-style" data-side="${side}">
          ${[['balanced', 'Balanced'], ['run', 'Run first'], ['pass', 'Air raid']].map(([v, l]) => `<option value="${v}"${v === cfg.style ? ' selected' : ''}>${l}</option>`).join('')}
        </select></label>
      <label class="field">Fourth downs and blitzes
        <select id="ex-${side}-aggr" data-action="ex-aggr" data-side="${side}">
          ${[['conservative', 'Conservative'], ['normal', 'Normal'], ['aggressive', 'Aggressive']].map(([v, l]) => `<option value="${v}"${v === cfg.aggr ? ' selected' : ''}>${l}</option>`).join('')}
        </select></label>
    </div>
    <div class="spread">
      <button class="btn small" data-action="ex-toggle" data-side="${side}" aria-expanded="${open}">${open ? 'Hide lineup' : 'Show and edit lineup'}</button>
      ${nOver ? `<button class="btn small ghost" data-action="ex-reset" data-side="${side}">Reset ${nOver} change${nOver > 1 ? 's' : ''}</button>` : `<span class="faint small">${keyStarters(team)}</span>`}
    </div>
    ${open ? lineupList(side, team) : ''}
  </div>`;
}

function keyStarters(team) {
  const byId = new Map(team.players.map((p) => [p.pid, p]));
  const n = (slot) => DEX.get(byId.get(team.lineup[slot]).species).name;
  return `QB ${esc(n('QB'))} · RB ${esc(n('RB'))}`;
}

function lineupList(side, team) {
  const byId = new Map(team.players.map((p) => [p.pid, p]));
  const editing = S.ex.editing?.side === side ? S.ex.editing.slot : null;
  return `<div>${SLOT_GROUPS.map((g) => `<div class="group-label">${g.name}</div><div class="slot-list">${g.slots.map((slot) => {
    const p = byId.get(team.lineup[slot]);
    const r = ratingOf(p);
    const pos = SLOT_POS[slot];
    const locked = S.ex[side].overrides[slot];
    return `<button class="slot${editing === slot ? ' cur' : ''}" data-action="ex-edit" data-side="${side}" data-slot="${slot}" title="${locked ? 'Your pick' : 'Picked by the optimizer'}">
      <span class="pos">${slot}${locked ? ' •' : ''}</span>
      <span class="who">${jersey(p.species, p.num, 'sm')}<span style="min-width:0"><span class="who-name">${esc(DEX.get(p.species).name)}</span> ${typeChips(p.species)}</span></span>
      ${ovrBadge(r.ovr[pos], `${POSITIONS[pos].name} overall`)}
    </button>${editing === slot ? picker(side, slot) : ''}`;
  }).join('')}</div>`).join('')}</div>`;
}

function picker(side, slot) {
  const pos = SLOT_POS[slot];
  const level = S.ex[side].level;
  const q = S.ex.pickQ.trim().toLowerCase();
  const list = POKEDEX
    .filter((sp) => !q || sp.name.toLowerCase().includes(q))
    .map((sp) => ({ sp, ovr: ratingOf(exhibitionPlayer(sp.id, level)).ovr[pos] }))
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, 60);
  return `<div class="picker" style="margin:4px 0 8px">
    <div style="padding:8px"><input type="search" id="ex-pick-q" data-action="ex-pick-q" placeholder="Search all 1,025 Pokémon for ${slot}" value="${esc(S.ex.pickQ)}" style="width:100%"></div>
    <div class="picker-list">${list.map(({ sp, ovr }) => `<button class="picker-item" data-action="ex-pick" data-side="${side}" data-slot="${slot}" data-sp="${sp.id}">
      <span class="who">${jersey(sp.id, sp.id, 'sm')}<span style="min-width:0"><span class="who-name">${esc(sp.name)}</span> ${typeChips(sp.id)}</span></span>${ovrBadge(ovr)}</button>`).join('') || '<div class="empty">No Pokémon match.</div>'}</div>
  </div>`;
}

function resultArea() {
  const r = S.ex.result;
  const views = [['plays', 'Play-by-play'], ['box', 'Box score'], ['drives', 'Drive chart']];
  if (S.ex.multi) views.push(['multi', `${S.ex.multi.n} games`]);
  const watching = S.ex.watchI !== null;
  const at = watching ? atEntry(r, S.ex.watchI) : null;
  const curI = watching ? S.ex.watchI : S.ex.cur;
  const spots = ballSpots(r);
  const spot = curI !== null ? spots[curI] ?? nearestSpot(spots, curI) : null;
  let body = '';
  if (S.ex.view === 'plays') body = playList(r, { upTo: watching ? S.ex.watchI : null, current: curI });
  else if (S.ex.view === 'box') body = `<div style="padding:12px">${boxScore(r)}</div>`;
  else if (S.ex.view === 'drives') body = driveChart(r);
  else if (S.ex.view === 'multi') body = multiView();
  return `${scoreboard(r, { at })}
    ${S.ex.view === 'multi' ? '' : fieldSvg(r, spot)}
    <div class="row">
      ${watching ? '<button class="btn" data-action="ex-stop">Skip to final</button>' : '<button class="btn" data-action="ex-watch">Watch it live</button>'}
      <span class="faint small">${watching ? 'Watching play by play.' : 'Click any play to see it on the field.'}</span>
    </div>
    <div class="panel flush">
      <div class="tabs" role="tablist">${views.map(([v, l]) => `<button role="tab" aria-selected="${S.ex.view === v}" data-action="ex-view" data-view="${v}">${l}</button>`).join('')}</div>
      ${body}
    </div>`;
}

function atEntry(r, i) {
  for (let j = i; j >= 0; j--) {
    const e = r.log[j];
    if (e.kind !== 'note' || j === 0) return { q: e.q, clock: e.clock, score: e.score };
  }
  return { q: 1, clock: 900, score: [0, 0] };
}

function nearestSpot(spots, i) {
  for (let j = i; j >= 0; j--) if (spots[j]) return spots[j];
  return null;
}

function multiView() {
  const m = S.ex.multi;
  const teams = m.teams;
  const pct = (x) => `${Math.round((100 * x) / m.n)}%`;
  const avg = (x) => (x / m.n).toFixed(1);
  const top = (side) => {
    const ps = [...m.players.values()].filter((p) => p.side === side);
    const best = (f) => ps.sort((a, b) => f(b) - f(a))[0];
    const qb = best((p) => p.passYds);
    const rb = best((p) => p.rushYds);
    const wr = best((p) => p.recYds);
    const d = best((p) => p.tkl + 4 * p.sck + 6 * p.int);
    return `<ul class="small" style="margin:6px 0 0;padding-left:18px">
      <li>${esc(qb.name)}: ${avg(qb.passYds)} pass yds, ${avg(qb.passTd)} TD</li>
      <li>${esc(rb.name)}: ${avg(rb.rushYds)} rush yds</li>
      <li>${esc(wr.name)}: ${avg(wr.recYds)} rec yds</li>
      <li>${esc(d.name)}: ${avg(d.tkl)} tkl, ${avg(d.sck)} sck, ${avg(d.int)} INT</li></ul>`;
  };
  return `<div class="stack" style="padding:14px">
    <div class="tiles">
      <div class="tile"><div class="k">${esc(teams[0].abbr)} win</div><div class="v">${pct(m.wins[0])}</div><div class="s">${m.wins[0]} of ${m.n}</div></div>
      <div class="tile"><div class="k">${esc(teams[1].abbr)} win</div><div class="v">${pct(m.wins[1])}</div><div class="s">${m.wins[1]} of ${m.n}${m.wins[2] ? `, ${m.wins[2]} ties` : ''}</div></div>
      <div class="tile"><div class="k">Average score</div><div class="v">${avg(m.pts[0])}–${avg(m.pts[1])}</div><div class="s">${esc(teams[0].abbr)} first</div></div>
      <div class="tile"><div class="k">Turnovers a game</div><div class="v">${avg(m.to[0])}–${avg(m.to[1])}</div><div class="s">Pass yds ${avg(m.yds[0][0])}–${avg(m.yds[1][0])}</div></div>
    </div>
    <div><div class="eyebrow" style="margin-bottom:6px">Final margin, ${m.n} games</div>${marginHistogram(m.margins, teams)}</div>
    <div class="grid-2">
      <div><div class="eyebrow">${esc(teams[0].name)} per game</div>${top(0)}</div>
      <div><div class="eyebrow">${esc(teams[1].name)} per game</div>${top(1)}</div>
    </div>
  </div>`;
}

// On phones the result sits above the controls, so bring it into view.
function toTop() {
  if (window.innerWidth < 900) window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------------------------------------------------------------- actions
export function handleExhibition(action, el) {
  const side = el.dataset.side;
  switch (action) {
    case 'ex-kick': stopWatch(); kickOff(); toTop(); return true;
    case 'ex-multi': stopWatch(); S.ex.watchI = null; simMany(200); toTop(); return true;
    case 'ex-watch': startWatch(); return true;
    case 'ex-stop': stopWatch(); S.ex.watchI = null; S.ex.cur = lastPlayIndex(S.ex.result); return true;
    case 'ex-view': S.ex.view = el.dataset.view; return true;
    case 'show-play': if (S.ex.watchI === null) S.ex.cur = Number(el.dataset.i); return true;
    case 'ex-theme': S.ex[side].theme = el.value; S.ex[side].overrides = {}; saveUi(); return true;
    case 'ex-level': S.ex[side].level = Number(el.value); saveUi(); return true;
    case 'ex-style': S.ex[side].style = el.value; saveUi(); return true;
    case 'ex-aggr': S.ex[side].aggr = el.value; saveUi(); return true;
    case 'ex-toggle': S.ex.open[side] = !S.ex.open[side]; S.ex.editing = null; return true;
    case 'ex-reset': S.ex[side].overrides = {}; S.ex.editing = null; saveUi(); return true;
    case 'ex-edit': {
      const cur = S.ex.editing;
      S.ex.editing = cur && cur.side === side && cur.slot === el.dataset.slot ? null : { side, slot: el.dataset.slot };
      S.ex.pickQ = '';
      return true;
    }
    case 'ex-pick-q': S.ex.pickQ = el.value; return true;
    case 'ex-pick': {
      const sp = Number(el.dataset.sp);
      const ov = S.ex[side].overrides;
      for (const k of Object.keys(ov)) if (ov[k] === sp) delete ov[k];
      ov[el.dataset.slot] = sp;
      S.ex.editing = null;
      saveUi();
      toast(`${DEX.get(sp).name} now starts at ${el.dataset.slot}.`);
      return true;
    }
    default: return false;
  }
}

// Put a scouted Pokémon into a lineup at the weakest slot of a position.
export function addToLineup(side, species, pos) {
  const team = exTeam(side);
  const byId = new Map(team.players.map((p) => [p.pid, p]));
  const slots = SLOTS.filter((s) => s.pos === pos).map((s) => s.id);
  const weakest = slots.sort((a, b) => ratingOf(byId.get(team.lineup[a])).ovr[pos] - ratingOf(byId.get(team.lineup[b])).ovr[pos])[0];
  const ov = S.ex[side].overrides;
  for (const k of Object.keys(ov)) if (ov[k] === species) delete ov[k];
  ov[weakest] = species;
  S.ex.open[side] = true;
  saveUi();
  return weakest;
}
