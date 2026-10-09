// Scouting: every Pokémon's football ratings, sortable, with a full player card.
import { POKEDEX, TYPES } from '../data/pokedex.js';
import { ATTRS, POSITIONS, POS_KEYS } from '../engine/ratings.js';
import { exhibitionPlayer, ratingOf } from '../engine/lineup.js';
import { S, toast } from './state.js';
import { esc, mon, typeChips, ovrBadge, playerCard, typeLabel } from './common.js';
import { addToLineup, exTeam } from './exhibition.js';

const PAGE = 50;
const REGIONS = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar', 'Paldea'];

function scoutRows() {
  const f = S.scout;
  const q = f.q.trim().toLowerCase();
  const rows = [];
  for (const sp of POKEDEX) {
    if (q && !sp.name.toLowerCase().includes(q) && String(sp.id) !== q) continue;
    if (f.type !== 'all' && !sp.types.includes(Number(f.type))) continue;
    if (f.gen !== 'all' && sp.gen !== Number(f.gen)) continue;
    if (f.legend === 'none' && (sp.leg || sp.myth)) continue;
    if (f.legend === 'only' && !(sp.leg || sp.myth)) continue;
    const p = exhibitionPlayer(sp.id, 100);
    const r = ratingOf(p);
    const pos = f.pos === 'none' ? null : f.pos;
    rows.push({ sp, p, r, pos, ovr: pos ? r.ovr[pos] : 0 });
  }
  const key = f.sort;
  const val = (row) => {
    if (key === 'ovr') return row.ovr;
    if (key === 'id') return row.sp.id;
    if (key === 'name') return row.sp.name;
    if (key === 'bst') return row.sp.base.reduce((a, b) => a + b, 0);
    return row.r.attrs[key];
  };
  rows.sort((a, b) => {
    const x = val(a);
    const y = val(b);
    const c = typeof x === 'string' ? x.localeCompare(y) : x - y;
    return c * f.dir || b.sp.base.reduce((x, y) => x + y, 0) - a.sp.base.reduce((x, y) => x + y, 0) || a.sp.id - b.sp.id;
  });
  return rows;
}

export function renderScout() {
  const f = S.scout;
  const rows = scoutRows();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  f.page = Math.min(f.page, pages - 1);
  const shown = rows.slice(f.page * PAGE, f.page * PAGE + PAGE);
  const sel = POKEDEX.find((sp) => sp.id === f.sel) ?? rows[0]?.sp;
  const th = (key, label, cls = '') => `<th class="${cls}"><button data-action="sc-sort" data-key="${key}" aria-pressed="${f.sort === key}">${label}${f.sort === key ? (f.dir < 0 ? ' ↓' : ' ↑') : ''}</button></th>`;
  const selPlayer = sel ? exhibitionPlayer(sel.id, 100) : null;
  const selPos = sel && f.pos !== 'none' ? f.pos : null;
  const addPos = sel ? selPos ?? ratingOf(selPlayer).best : null;
  return `<div class="stack">
    <div class="spread">
      <div><h1>Scouting</h1><div class="muted">All ${POKEDEX.length.toLocaleString()} Pokémon, rated as football players from their real stats.</div></div>
    </div>
    <div class="panel">
      <div class="row" style="align-items:flex-end">
        <label class="field" style="flex:2 1 180px">Search<input type="search" id="sc-q" data-action="sc-q" placeholder="Name or Pokédex number" value="${esc(f.q)}"></label>
        <label class="field" style="flex:1 1 130px">Rate as
          <select id="sc-pos" data-action="sc-pos"><option value="none"${f.pos === 'none' ? ' selected' : ''}>Any position</option>${POS_KEYS.map((k) => `<option value="${k}"${f.pos === k ? ' selected' : ''}>${POSITIONS[k].name}</option>`).join('')}</select></label>
        <label class="field" style="flex:1 1 110px">Type
          <select id="sc-type" data-action="sc-type"><option value="all">All types</option>${TYPES.map((t, i) => `<option value="${i}"${String(i) === f.type ? ' selected' : ''}>${typeLabel(i)}</option>`).join('')}</select></label>
        <label class="field" style="flex:1 1 110px">Region
          <select id="sc-gen" data-action="sc-gen"><option value="all">All regions</option>${REGIONS.map((r, i) => `<option value="${i + 1}"${String(i + 1) === f.gen ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
        <label class="field" style="flex:1 1 120px">Legends
          <select id="sc-legend" data-action="sc-legend">${[['all', 'Include'], ['none', 'Leave out'], ['only', 'Only legends']].map(([v, l]) => `<option value="${v}"${f.legend === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
    </div>
    <div class="layout" style="grid-template-columns:minmax(0,1fr) minmax(300px,400px)">
      <div class="panel flush" style="min-width:0">
        <div class="panel-head"><span class="muted small">${rows.length.toLocaleString()} Pokémon · page ${f.page + 1} of ${pages}</span>
          <span class="row"><button class="btn small" data-action="sc-page" data-d="-1"${f.page === 0 ? ' disabled' : ''}>Previous</button><button class="btn small" data-action="sc-page" data-d="1"${f.page >= pages - 1 ? ' disabled' : ''}>Next</button></span></div>
        <div class="table-wrap"><table class="data">
          <thead><tr>${th('id', '#', 'l')}${th('name', 'Pokémon', 'l')}${f.pos !== 'none' ? th('ovr', `${f.pos} OVR`) : ''}${th('bst', 'BST')}${ATTRS.map((a) => th(a.key, a.key)).join('')}</tr></thead>
          <tbody>${shown.map((row) => `<tr class="clickable${row.sp.id === sel?.id ? ' sel' : ''}" data-action="sc-pick" data-id="${row.sp.id}">
            <td class="l faint">${row.sp.id}</td>
            <td class="l"><span class="who">${mon(row.sp.id, '', 'xs')}<span><b>${esc(row.sp.name)}</b> ${typeChips(row.sp.id)}</span></span></td>
            ${row.pos ? `<td>${ovrBadge(row.ovr)}</td>` : ''}<td>${row.sp.base.reduce((x, y) => x + y, 0)}</td>
            ${ATTRS.map((a) => `<td${row.pos && POSITIONS[row.pos].w[a.key] ? ' style="font-weight:700"' : row.pos ? ' class="faint"' : ''}>${row.r.attrs[a.key]}</td>`).join('')}</tr>`).join('') || `<tr><td class="l" colspan="20"><div class="empty">No Pokémon match these filters.</div></td></tr>`}</tbody>
        </table></div>
      </div>
      <div class="panel sticky-card" style="position:sticky;top:76px">${sel ? playerCard(selPlayer, {
        contextPos: selPos,
        actions: ['home', 'away'].map((side) => `<button class="btn small" data-action="sc-add" data-side="${side}" data-id="${sel.id}" data-pos="${addPos}">Start for ${esc(exTeam(side).abbr)} at ${addPos}</button>`).join(''),
      }) : '<div class="empty">Pick a Pokémon.</div>'}</div>
    </div>
  </div>`;
}

export function handleScout(action, el) {
  const f = S.scout;
  switch (action) {
    case 'sc-q': f.q = el.value; f.page = 0; return true;
    case 'sc-pos': f.pos = el.value; f.page = 0; f.sort = f.pos === 'none' ? 'bst' : 'ovr'; f.dir = -1; return true;
    case 'sc-type': f.type = el.value; f.page = 0; return true;
    case 'sc-gen': f.gen = el.value; f.page = 0; return true;
    case 'sc-legend': f.legend = el.value; f.page = 0; return true;
    case 'sc-page': f.page = Math.max(0, f.page + Number(el.dataset.d)); return true;
    case 'sc-sort': {
      const key = el.dataset.key;
      if (f.sort === key) f.dir = -f.dir;
      else { f.sort = key; f.dir = key === 'id' || key === 'name' ? 1 : -1; }
      f.page = 0;
      return true;
    }
    case 'sc-pick': f.sel = Number(el.dataset.id); return true;
    case 'sc-add': {
      const side = el.dataset.side;
      const slot = addToLineup(side, Number(el.dataset.id), el.dataset.pos);
      const team = exTeam(side);
      toast(`${POKEDEX.find((sp) => sp.id === Number(el.dataset.id)).name} now starts at ${slot} for ${team.name}.`);
      return true;
    }
    default: return false;
  }
}
