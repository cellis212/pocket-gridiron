// Shared view pieces: badges, rating bars, scoreboard, field, play-by-play, box score, player card.
import { TYPES, ABILITIES } from '../data/pokedex.js';
import { DEX, ATTRS, POSITIONS, POS_KEYS, STAT_LABELS, SHAPE_LABELS, SHAPE_HANDS, SHAPE_LEGS, EVOLVES_TO, rate, realStats, potentials } from '../engine/ratings.js';
import { PERKS, WEATHER } from '../engine/perks.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const TYPE_COLORS = {
  normal: '#8f8f6e', fighting: '#b0392d', flying: '#7486d6', poison: '#8f479f', ground: '#b98c3c', rock: '#9c8435',
  bug: '#839a1c', ghost: '#5b4a8c', steel: '#7c8597', fire: '#dc5f25', water: '#3a78d0', grass: '#478f35',
  electric: '#c99a0c', psychic: '#d8486f', ice: '#3f9fac', dragon: '#5a3dcf', dark: '#5a4638', fairy: '#c76aa1',
};
export const typeLabel = (i) => TYPES[i][0].toUpperCase() + TYPES[i].slice(1);
export const typeChip = (i) => `<span class="chip" style="background:${TYPE_COLORS[TYPES[i]]};color:#fff">${typeLabel(i)}</span>`;
export const typeChips = (species) => `<span class="chips">${DEX.get(species).types.map(typeChip).join('')}</span>`;

export function jersey(species, num, size = '') {
  const t = DEX.get(species).types;
  const c1 = TYPE_COLORS[TYPES[t[0]]];
  const c2 = TYPE_COLORS[TYPES[t[1] ?? t[0]]];
  return `<span class="jersey ${size}" style="--j1:${c1};--j2:${c2}" aria-hidden="true">${esc(num)}</span>`;
}

export function ovrTier(v) {
  if (v >= 85) return 't1';
  if (v >= 75) return 't2';
  if (v >= 65) return 't3';
  if (v >= 50) return 't4';
  return 't5';
}
export const ovrBadge = (v, title = '') => `<span class="ovr ${ovrTier(v)}"${title ? ` title="${esc(title)}"` : ''}>${v}</span>`;

export const abilityTitle = (slug) => (slug ? ABILITIES[slug] ?? slug : 'None');
export const perkText = (slug) => PERKS[slug] ?? 'No football effect.';

export function barRows(items) {
  return `<div class="bars">${items.map((it) => `
    <div class="bar-row" title="${esc(it.title ?? '')}">
      <span class="lbl">${esc(it.label)}</span>
      <span class="bar-track"><span class="bar-fill${it.hot ? ' hot' : ''}" style="width:${Math.max(0, Math.min(100, it.value))}%"></span></span>
      <span class="val">${it.value}</span>
    </div>`).join('')}</div>`;
}

export const ordinal = (n) => ['', '1st', '2nd', '3rd', '4th'][n] ?? `${n}th`;
export const fmtClock = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, Math.round(s)) % 60).padStart(2, '0')}`;
export const qLabel = (q) => (q <= 4 ? `Q${q}` : q === 5 ? 'OT' : `${q - 4}OT`);

export function spotText(teams, poss, yl) {
  const y = Math.round(yl);
  if (y === 50) return 'midfield';
  return y < 50 ? `${teams[poss].abbr} ${y}` : `${teams[1 - poss].abbr} ${100 - y}`;
}

// ---------------------------------------------------------------- scoreboard
export function scoreboard(result, { at = null, title = '' } = {}) {
  const teams = result.teams;
  const score = at ? at.score : result.score;
  const quarters = result.byQuarter[0].length;
  const qs = Array.from({ length: quarters }, (_, i) => i);
  const final = !at;
  const lose = (side) => final && result.winner !== null && result.winner !== side;
  const qScore = (side, i) => {
    if (!at) return result.byQuarter[side][i] ?? 0;
    return at.q > i + 1 ? result.byQuarter[side][i] ?? 0 : at.q === i + 1 ? '·' : '';
  };
  const status = at ? `${qLabel(at.q)} ${fmtClock(at.clock)}` : `Final${result.ot ? ' (OT)' : ''}`;
  const w = WEATHER[result.weather];
  return `<div class="scoreboard" style="--qs:${quarters}">
    <div class="sb-row sb-head"><span></span><span class="eyebrow" style="color:inherit;opacity:.7">${esc(title || status)}</span>${qs.map((i) => `<span class="q">${i < 4 ? i + 1 : 'OT'}</span>`).join('')}<span class="t">T</span></div>
    ${[0, 1].map((side) => `<div class="sb-row${lose(side) ? ' lose' : ''}">
      <span class="sb-dot" style="background:${teams[side].color}"></span>
      <span class="team">${esc(teams[side].name)}</span>
      ${qs.map((i) => `<span class="q">${qScore(side, i)}</span>`).join('')}
      <span class="t">${score[side]}</span></div>`).join('')}
    <div class="sb-meta"><span>${esc(title ? status : '')}</span><span>Weather: ${esc(w.name)}${result.weatherSource ? ` (${esc(result.weatherSource.name)}'s ${esc(abilityTitle(result.weatherSource.ability))})` : ''}</span></div>
  </div>`;
}

// ---------------------------------------------------------------- field
const fieldX = (poss, yl) => (poss === 0 ? 100 + yl * 10 : 1100 - yl * 10);

// Where the ball sits before each logged play, and after the last one.
export function ballSpots(result) {
  const log = result.log;
  const spots = [];
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    if (e.kind === 'note') { spots.push(null); continue; }
    const start = e.startYl ?? e.yl;
    let end = null;
    for (let j = i + 1; j < log.length; j++) {
      const n = log[j];
      if (n.kind === 'note' || n.kind === 'pat') continue;
      if (n.kind === 'kickoff') break;
      end = { poss: n.poss, yl: n.startYl ?? n.yl };
      break;
    }
    if (!end) {
      if (e.scoring === 'TD') end = { poss: e.poss, yl: 100 };
      else if (e.scoring === 'SAFETY') end = { poss: e.poss, yl: 0 };
      else if (e.kind === 'kickoff') end = { poss: e.poss, yl: e.yl };
      else end = { poss: e.poss, yl: Math.max(0, Math.min(100, start + (e.yards ?? 0))) };
    }
    spots.push({ poss: e.poss, start, end, down: e.down, dist: e.dist, kind: e.kind });
  }
  return spots;
}

export function fieldSvg(result, spot) {
  const teams = result.teams;
  const lines = [];
  for (let y = 0; y <= 100; y += 5) {
    const x = 100 + y * 10;
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="260" stroke="rgb(255 255 255 / ${y % 10 === 0 ? 0.55 : 0.28})" stroke-width="${y % 10 === 0 ? 2 : 1}"/>`);
    if (y % 10 === 0 && y > 0 && y < 100) {
      const label = y <= 50 ? y : 100 - y;
      lines.push(`<text x="${x}" y="236" text-anchor="middle" font-family="Graduate, Georgia, serif" font-size="22" fill="rgb(255 255 255 / .7)">${label}</text>`);
      lines.push(`<text x="${x}" y="42" text-anchor="middle" font-family="Graduate, Georgia, serif" font-size="22" fill="rgb(255 255 255 / .7)" transform="rotate(180 ${x} 34)">${label}</text>`);
    }
  }
  const stripes = [];
  for (let i = 0; i < 10; i++) stripes.push(`<rect x="${100 + i * 100}" y="0" width="100" height="260" style="fill:${i % 2 ? 'var(--turf-2)' : 'var(--turf)'}"/>`);
  let marks = '';
  if (spot) {
    const los = fieldX(spot.poss, spot.start);
    const fd = spot.down ? fieldX(spot.poss, Math.min(100, spot.start + spot.dist)) : null;
    const endX = fieldX(spot.end.poss, spot.end.yl);
    const color = teams[spot.poss].color;
    marks += `<line x1="${los}" y1="0" x2="${los}" y2="260" stroke="#8fd0ff" stroke-width="4"/>`;
    if (fd !== null) marks += `<line x1="${fd}" y1="0" x2="${fd}" y2="260" stroke="#f2c230" stroke-width="4"/>`;
    if (Math.abs(endX - los) > 2) {
      marks += `<path d="M ${los} 130 Q ${(los + endX) / 2} ${spot.kind === 'pass' ? 60 : 118} ${endX} 130" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" opacity="0.95"/>`;
    }
    marks += `<g class="ball" transform="translate(${endX} 130)"><ellipse rx="15" ry="10" fill="#7a4a24" stroke="#fff" stroke-width="2.5"/><line x1="-6" y1="0" x2="6" y2="0" stroke="#fff" stroke-width="2"/></g>`;
  }
  const ez = (side) => {
    const x = side === 0 ? 0 : 1100;
    const cx = x + 50;
    return `<rect x="${x}" y="0" width="100" height="260" fill="${teams[side].color}"/>
      <text x="${cx}" y="130" text-anchor="middle" dominant-baseline="middle" font-family="Graduate, Georgia, serif" font-size="30" fill="#fff" transform="rotate(${side === 0 ? -90 : 90} ${cx} 130)">${esc(teams[side].abbr)}</text>`;
  };
  return `<div class="field-wrap"><svg viewBox="0 0 1200 260" role="img" aria-label="Football field showing the ball position">
    ${stripes.join('')}${ez(0)}${ez(1)}${lines.join('')}
    <rect x="1" y="1" width="1198" height="258" fill="none" stroke="rgb(255 255 255 / .8)" stroke-width="3"/>
    ${marks}
  </svg></div>`;
}

// ---------------------------------------------------------------- play-by-play
export function playList(result, { upTo = null, current = null } = {}) {
  const teams = result.teams;
  const rows = [];
  const last = upTo ?? result.log.length - 1;
  for (let i = 0; i <= last; i++) {
    const e = result.log[i];
    if (e.kind === 'note') { rows.push(`<div class="play note"><span class="when">${qLabel(e.q)}</span><span class="txt">${esc(e.text)}</span></div>`); continue; }
    const sit = e.down && e.kind !== 'kickoff' && e.kind !== 'pat' ? `${ordinal(e.down)} & ${e.yl + e.dist >= 100 ? 'Goal' : e.dist} at ${spotText(teams, e.poss, e.yl)}` : '';
    rows.push(`<div class="play${e.scoring ? ' score' : ''}${current === i ? ' cur' : ''}" data-action="show-play" data-i="${i}">
      <span class="when">${qLabel(e.q)} ${fmtClock(e.clock)}</span>
      <span class="txt"><span class="tm-tag" style="background:${teams[e.poss]?.color}"></span>${sit ? `<span class="sit">${esc(sit)}</span><br>` : ''}${esc(e.text)}</span>
    </div>`);
  }
  return `<div class="plays" id="plays">${rows.reverse().join('')}</div>`;
}

// ---------------------------------------------------------------- box score
export function boxScore(result) {
  const t = result.teamStats;
  const teams = result.teams;
  const top = (s) => fmtClock(s);
  const rows = [
    ['First downs', t[0].firstDowns, t[1].firstDowns],
    ['Total yards', t[0].yards, t[1].yards],
    ['Passing yards', t[0].passYds, t[1].passYds],
    ['Rushing yards', t[0].rushYds, t[1].rushYds],
    ['Rushes', t[0].rushAtt, t[1].rushAtt],
    ['Third downs', `${t[0].thirdConv}/${t[0].thirdAtt}`, `${t[1].thirdConv}/${t[1].thirdAtt}`],
    ['Fourth downs', `${t[0].fourthConv}/${t[0].fourthAtt}`, `${t[1].fourthConv}/${t[1].fourthAtt}`],
    ['Sacks allowed', t[0].sacked, t[1].sacked],
    ['Turnovers', t[0].turnovers, t[1].turnovers],
    ['Penalties', `${t[0].penalties}-${t[0].penYds}`, `${t[1].penalties}-${t[1].penYds}`],
    ['Time of possession', top(t[0].top), top(t[1].top)],
  ];
  const teamTable = `<div class="table-wrap"><table class="data"><thead><tr><th class="l">Team stats</th><th>${esc(teams[0].abbr)}</th><th>${esc(teams[1].abbr)}</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td class="l">${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table></div>`;

  const section = (title, cols, pick, fmt) => {
    const body = [0, 1].map((side) => {
      const lines = result.players.filter((p) => p.side === side && pick(p)).sort((a, b) => pick(b) - pick(a));
      if (!lines.length) return '';
      return lines.map((p) => `<tr><td class="l"><span class="tm-tag" style="background:${teams[side].color}"></span>${esc(p.name)} <span class="faint">${esc(p.slot)}</span></td>${fmt(p).map((v) => `<td>${v}</td>`).join('')}</tr>`).join('');
    }).join('');
    if (!body) return '';
    return `<div class="table-wrap"><table class="data"><thead><tr><th class="l">${title}</th>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
  };
  const avg = (a, b) => (b ? (a / b).toFixed(1) : '0.0');
  return `<div class="stack">
    ${teamTable}
    ${section('Passing', ['C/Att', 'Yds', 'TD', 'Int', 'Sck', 'Lng'], (p) => p.pass.att + p.pass.sk, (p) => [`${p.pass.cmp}/${p.pass.att}`, p.pass.yds, p.pass.td, p.pass.int, p.pass.sk, p.pass.lng])}
    ${section('Rushing', ['Car', 'Yds', 'Avg', 'TD', 'Lng', 'Fum'], (p) => p.rush.car, (p) => [p.rush.car, p.rush.yds, avg(p.rush.yds, p.rush.car), p.rush.td, p.rush.lng, p.rush.fum])}
    ${section('Receiving', ['Rec', 'Tgt', 'Yds', 'Avg', 'TD', 'Lng'], (p) => p.rec.tgt, (p) => [p.rec.rec, p.rec.tgt, p.rec.yds, avg(p.rec.yds, p.rec.rec), p.rec.td, p.rec.lng])}
    ${section('Defense', ['Tkl', 'TFL', 'Sck', 'Int', 'PD', 'FF'], (p) => p.def.tkl + p.def.int * 3 + p.def.pd + p.def.sck * 2, (p) => [p.def.tkl, p.def.tfl, p.def.sck, p.def.int, p.def.pd, p.def.ff])}
    ${section('Kicking', ['FG', 'Lng', 'XP'], (p) => p.kick.fga + p.kick.xpa, (p) => [`${p.kick.fgm}/${p.kick.fga}`, p.kick.lng, `${p.kick.xpm}/${p.kick.xpa}`])}
    ${section('Punting', ['No', 'Yds', 'Avg', 'Lng'], (p) => p.punt.n, (p) => [p.punt.n, p.punt.yds, avg(p.punt.yds, p.punt.n), p.punt.lng])}
    ${section('Returns', ['No', 'Yds', 'TD'], (p) => p.ret.n, (p) => [p.ret.n, p.ret.yds, p.ret.td])}
  </div>`;
}

// ---------------------------------------------------------------- drive chart
export function driveChart(result) {
  const teams = result.teams;
  if (!result.drives.length) return '<div class="empty">No drives.</div>';
  const rows = result.drives.map((d) => {
    const a = fieldX(d.team, d.startYl) / 12;
    const b = fieldX(d.team, d.endYl) / 12;
    const left = Math.min(a, b);
    const width = Math.max(0.8, Math.abs(b - a));
    return `<tr>
      <td class="l"><span class="tm-tag" style="background:${teams[d.team].color}"></span>${esc(teams[d.team].abbr)}</td>
      <td class="l">${qLabel(d.q)} ${fmtClock(d.clock)}</td>
      <td class="l">${esc(spotText(teams, d.team, d.startYl))}</td>
      <td>${d.plays}</td><td>${d.yards}</td><td>${fmtClock(d.top)}</td>
      <td class="l" style="min-width:160px"><svg viewBox="0 0 100 10" width="100%" height="12" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="4" width="100" height="2" style="fill:var(--bar-track)"/><rect x="${left}" y="1" width="${width}" height="8" rx="1.5" fill="${teams[d.team].color}"/></svg></td>
      <td class="l">${d.points ? `<b>${esc(d.result)}</b>` : esc(d.result)}</td>
    </tr>`;
  }).join('');
  return `<div class="legend" style="padding:10px 14px 0">${teams.map((t) => `<span><span class="sw" style="background:${t.color}"></span>${esc(t.name)}</span>`).join('')}<span class="faint">Bars show where each drive started and ended on the field.</span></div>
  <div class="table-wrap"><table class="data"><thead><tr><th class="l">Team</th><th class="l">Start</th><th class="l">From</th><th>Plays</th><th>Yds</th><th>Time</th><th class="l">Field</th><th class="l">Result</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ---------------------------------------------------------------- player card
export function playerCard(p, { contextPos = null, actions = '', extra = '' } = {}) {
  const sp = DEX.get(p.species);
  const r = rate(p.species, p.level, p.ivs, p.nature, p.abilitySlot);
  const pos = contextPos ?? r.best;
  const pots = potentials(p);
  const base = sp.base;
  const real = realStats(p.species, p.level, p.ivs, p.nature, r.ability);
  const realVals = [real.hp, real.atk, real.def, real.spa, real.spd, real.spe];
  const posBars = POS_KEYS.map((k) => ({ label: POSITIONS[k].name, value: r.ovr[k], hot: k === pos, title: `Potential ${pots[k]}` }));
  const keyAttrs = new Set(Object.keys(POSITIONS[pos].w));
  const attrBars = ATTRS.map((a) => ({ label: a.name, value: r.attrs[a.key], hot: keyAttrs.has(a.key), title: `From ${a.from}` }));
  return `<div class="stack">
    <div class="card-head">
      ${jersey(p.species, p.num || sp.id, 'lg')}
      <div style="min-width:0">
        <div class="eyebrow">#${String(sp.id).padStart(4, '0')} · ${esc(sp.genus)} · Gen ${sp.gen}</div>
        <h2>${esc(sp.name)}</h2>
        <div class="row" style="gap:6px;margin-top:4px">${typeChips(p.species)}<span class="pill">Lv ${p.level}</span>${sp.leg ? '<span class="pill flag">Legendary</span>' : ''}${sp.myth ? '<span class="pill flag">Mythical</span>' : ''}</div>
      </div>
      <div class="big-ovr"><div class="eyebrow">${pos} OVR</div><div class="v">${r.ovr[pos]}</div><div class="faint small">POT ${pots[pos]}</div></div>
    </div>
    ${actions ? `<div class="row">${actions}</div>` : ''}
    ${extra}
    <div class="card-section"><div class="eyebrow" style="margin-bottom:6px">Ability</div>
      <b>${esc(abilityTitle(r.ability))}</b> <span class="muted">${esc(perkText(r.ability))}</span></div>
    <div class="card-section"><div class="spread" style="margin-bottom:8px"><span class="eyebrow">Overall by position</span><span class="faint small">Hover for potential</span></div>${barRows(posBars)}</div>
    <div class="card-section"><div class="spread" style="margin-bottom:8px"><span class="eyebrow">Football ratings at Lv ${p.level}</span><span class="faint small">Highlighted = used at ${pos}</span></div>${barRows(attrBars)}</div>
    <div class="card-section"><div class="eyebrow" style="margin-bottom:8px">Real stats (base → at Lv ${p.level})</div>
      <div class="statgrid">${STAT_LABELS.map((l, i) => `<div><div class="k">${l}</div><div class="v">${base[i]}</div><div class="faint small num">${realVals[i]}</div></div>`).join('')}</div>
      <div class="faint small" style="margin-top:6px">Base stat total ${base.reduce((a, b) => a + b, 0)}. IVs ${p.ivs.join('/')}.</div></div>
    <div class="card-section"><div class="eyebrow" style="margin-bottom:6px">Body</div>
      <div class="small">${(sp.h / 10).toFixed(1)} m · ${(sp.w / 10).toFixed(1)} kg · ${esc(SHAPE_LABELS[sp.shape] ?? sp.shape)} body: hands ${Math.round(SHAPE_HANDS[sp.shape] * 100)}%, kicking legs ${Math.round(SHAPE_LEGS[sp.shape] * 100)}%</div></div>
    ${evolutionRow(sp)}
  </div>`;
}

function evolutionRow(sp) {
  let root = sp;
  while (root.from) root = DEX.get(root.from);
  const parts = [];
  const walk = (s, depth) => {
    parts.push(`${depth ? `<span class="arrow">→ Lv ${s.evoLvl}</span>` : ''}<span>${s.id === sp.id ? `<b>${esc(s.name)}</b>` : esc(s.name)}</span>`);
    for (const k of EVOLVES_TO.get(s.id) ?? []) walk(DEX.get(k), depth + 1);
  };
  walk(root, 0);
  if (parts.length === 1) return '<div class="card-section"><div class="eyebrow" style="margin-bottom:6px">Evolution</div><div class="small muted">Does not evolve.</div></div>';
  return `<div class="card-section"><div class="eyebrow" style="margin-bottom:6px">Evolution line</div><div class="evo">${parts.join('')}</div></div>`;
}

// ---------------------------------------------------------------- margin histogram
export function marginHistogram(margins, teams) {
  const binSize = 7;
  const lo = -42;
  const hi = 42;
  const bins = [];
  for (let m = lo; m <= hi; m += binSize) bins.push({ from: m - 3, to: m + 3, center: m, n: 0 });
  for (const m of margins) {
    const c = Math.max(lo, Math.min(hi, Math.round(m / binSize) * binSize));
    bins.find((b) => b.center === c).n++;
  }
  const max = Math.max(...bins.map((b) => b.n), 1);
  const W = 600, H = 200, padL = 34, padB = 26, padT = 10;
  const bw = (W - padL) / bins.length;
  const yTicks = niceTicks(max);
  const y = (v) => H - padB - ((H - padB - padT) * v) / yTicks.at(-1);
  const bars = bins.map((b, i) => {
    const x = padL + i * bw + 2;
    const w = Math.min(24, bw - 4);
    const x0 = x + (bw - 4 - w) / 2;
    const h = H - padB - y(b.n);
    const fill = b.center > 0 ? 'var(--home)' : b.center < 0 ? 'var(--away)' : 'var(--ink-3)';
    const who = b.center > 0 ? `${teams[0].name} by ${Math.max(1, b.from)}-${b.to}` : b.center < 0 ? `${teams[1].name} by ${Math.max(1, -b.to)}-${-b.from}` : 'Within 3 points';
    const label = b.center === lo ? `${teams[1].name} by 39+` : b.center === hi ? `${teams[0].name} by 39+` : who;
    const path = h > 0 ? `M ${x0} ${H - padB} V ${y(b.n) + 4} Q ${x0} ${y(b.n)} ${x0 + 4} ${y(b.n)} H ${x0 + w - 4} Q ${x0 + w} ${y(b.n)} ${x0 + w} ${y(b.n) + 4} V ${H - padB} Z` : '';
    return `<g data-tip="${esc(label)}: ${b.n} game${b.n === 1 ? '' : 's'}"><rect x="${padL + i * bw}" y="${padT}" width="${bw}" height="${H - padB - padT}" fill="transparent"/>${path ? `<path d="${path}" style="fill:${fill}"/>` : ''}</g>`;
  }).join('');
  const grid = yTicks.map((t) => `<line x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}" style="stroke:var(--line)" stroke-width="1"/><text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end" font-size="11" style="fill:var(--ink-3)">${t}</text>`).join('');
  const xLabels = bins.map((b, i) => (i % 2 === 0 ? `<text x="${padL + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="11" style="fill:var(--ink-3)">${b.center === 0 ? '0' : b.center > 0 ? `+${b.center}` : b.center}</text>` : '')).join('');
  return `<div class="hist"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Final margin histogram">${grid}${bars}${xLabels}</svg></div>
    <div class="legend"><span><span class="sw" style="background:var(--home)"></span>${esc(teams[0].name)} won by (points)</span><span><span class="sw" style="background:var(--away)"></span>${esc(teams[1].name)} won by</span><span><span class="sw" style="background:var(--ink-3)"></span>Within 3</span></div>`;
}

function niceTicks(max) {
  const step = max <= 5 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : max <= 100 ? 20 : 50;
  const ticks = [];
  for (let t = 0; t <= max + step - 1; t += step) ticks.push(t);
  if (ticks.at(-1) < max) ticks.push(ticks.at(-1) + step);
  return ticks;
}
