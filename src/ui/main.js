// App shell: top bar, tab routing, event delegation, and focus-safe re-rendering.
import { S, setRenderer, loadUi, saveUi, loadLeague } from './state.js';
import { esc } from './common.js';
import { renderExhibition, handleExhibition } from './exhibition.js';
import { renderScout, handleScout } from './scout.js';
import { renderLeague, renderLeagueModal, handleLeague, handleLeaguePlay } from './leagueview.js';

const NAV = [['exhibition', 'Exhibition'], ['scout', 'Scouting'], ['league', 'League']];
const root = document.getElementById('app');

function shell() {
  const body = S.tab === 'scout' ? renderScout() : S.tab === 'league' ? renderLeague() : renderExhibition();
  return `<header class="topbar"><div class="topbar-inner">
      <div class="wordmark">POCKET GRIDIRON<small>Every Pokémon, rated for football</small></div>
      <nav class="nav" aria-label="Sections">${NAV.map(([k, l]) => `<button data-action="nav" data-tab="${k}"${S.tab === k ? ' aria-current="page"' : ''}>${l}</button>`).join('')}</nav>
    </div></header>
    <main id="main">${body}</main>
    <footer class="footer">Unofficial fan project. Not affiliated with Nintendo, Game Freak, Creatures or The Pokémon Company. Pokémon data from PokeAPI.</footer>
    ${renderLeagueModal()}
    ${S.toast ? `<div class="toast" role="status">${esc(S.toast)}</div>` : ''}`;
}

function render() {
  const active = document.activeElement;
  const focusId = active && active !== document.body ? active.id : null;
  let sel = null;
  try { if (active && typeof active.selectionStart === 'number') sel = [active.selectionStart, active.selectionEnd]; } catch { sel = null; }
  const scrolls = {};
  for (const el of root.querySelectorAll('[id]')) if (el.scrollTop) scrolls[el.id] = el.scrollTop;
  root.innerHTML = shell();
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus({ preventScroll: true });
      if (sel && el.setSelectionRange) { try { el.setSelectionRange(sel[0], sel[1]); } catch { /* not a text field */ } }
    }
  }
  for (const [id, top] of Object.entries(scrolls)) {
    const el = document.getElementById(id);
    if (el) el.scrollTop = top;
  }
}

function dispatch(action, el) {
  let changed = false;
  if (action === 'nav') {
    S.tab = el.dataset.tab;
    S.modal = null;
    saveUi();
    changed = true;
    window.scrollTo({ top: 0 });
  } else if (action === 'modal-close') {
    S.modal = null;
    changed = true;
  } else {
    changed = handleLeaguePlay(action, el) || handleExhibition(action, el) || handleScout(action, el) || handleLeague(action, el);
  }
  if (changed) render();
}

root.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el || !root.contains(el)) return;
  if (el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
  // Clicks inside a dialog never reach the backdrop's close action.
  const inside = ev.target.closest('[data-stop]');
  if (el.dataset.action === 'modal-close' && inside && el.contains(inside)) return;
  dispatch(el.dataset.action, el);
});
root.addEventListener('change', (ev) => {
  const el = ev.target;
  if (!el.dataset?.action) return;
  if (el.tagName === 'SELECT' || el.type === 'checkbox') dispatch(el.dataset.action, el);
});
root.addEventListener('input', (ev) => {
  const el = ev.target;
  if (!el.dataset?.action) return;
  if ((el.tagName === 'INPUT' && el.type !== 'checkbox') || el.tagName === 'TEXTAREA') dispatch(el.dataset.action, el);
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && S.modal) { S.modal = null; render(); }
});

// Hover tooltips for chart marks.
const tip = document.createElement('div');
tip.className = 'tip';
tip.hidden = true;
document.body.appendChild(tip);
root.addEventListener('mousemove', (ev) => {
  const t = ev.target.closest?.('[data-tip]');
  if (!t) { tip.hidden = true; return; }
  tip.textContent = t.dataset.tip;
  tip.hidden = false;
  tip.style.left = `${Math.min(window.innerWidth - tip.offsetWidth - 8, ev.clientX + 12)}px`;
  tip.style.top = `${ev.clientY - 34}px`;
});
root.addEventListener('mouseleave', () => { tip.hidden = true; });

loadUi();
S.lg = loadLeague();
setRenderer(render);
render();
