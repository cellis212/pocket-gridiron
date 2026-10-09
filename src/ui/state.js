// App state, rendering hook, saves and toasts.

export const S = {
  tab: 'exhibition',
  ex: {
    home: { theme: 'gen1', level: 100, overrides: {}, style: 'balanced', aggr: 'normal' },
    away: { theme: 'gen9', level: 100, overrides: {}, style: 'balanced', aggr: 'normal' },
    result: null, view: 'plays', cur: null, watchI: null, multi: null, editing: null, pickQ: '', open: { home: false, away: false },
  },
  scout: { q: '', type: 'all', gen: 'all', pos: 'best', level: 100, legend: 'all', sort: 'ovr', dir: -1, page: 0, sel: 445 },
  lg: null,
  lgTab: 'home',
  lgUi: { draftPos: 'all', draftQ: '', faPos: 'all', faQ: '', confirmDelete: false, saveCode: '', loadCode: '' },
  modal: null,
  toast: null,
};

let renderFn = () => {};
export function setRenderer(fn) { renderFn = fn; }
export function rerender() { renderFn(); }

let toastTimer = null;
export function toast(msg) {
  S.toast = msg;
  rerender();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { S.toast = null; rerender(); }, 2800);
}

const LEAGUE_KEY = 'pocket-gridiron:league:v1';
const UI_KEY = 'pocket-gridiron:ui:v1';

export function saveLeague() {
  try {
    if (S.lg) localStorage.setItem(LEAGUE_KEY, JSON.stringify(S.lg));
    else localStorage.removeItem(LEAGUE_KEY);
    return true;
  } catch {
    return false;
  }
}
export function loadLeague() {
  try {
    const raw = localStorage.getItem(LEAGUE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function saveUi() {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify({ tab: S.tab, lgTab: S.lgTab, home: S.ex.home, away: S.ex.away }));
  } catch { /* storage is optional */ }
}
export function loadUi() {
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (!raw) return;
    const u = JSON.parse(raw);
    if (u.tab) S.tab = u.tab;
    if (u.lgTab) S.lgTab = u.lgTab;
    if (u.home) S.ex.home = { ...S.ex.home, ...u.home };
    if (u.away) S.ex.away = { ...S.ex.away, ...u.away };
  } catch { /* storage is optional */ }
}
