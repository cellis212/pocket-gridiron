// "How ratings are calculated" on the Scouting page. Every number here comes from the engine's own
// tables (FORMULAS, BODY_RULES, shape tables, position weights, ability modifiers), so the
// description always matches the math.
import { POKEDEX, ABILITIES } from '../data/pokedex.js';
import {
  DEX, ATTRS, FORMULAS, MIX_LABELS, BODY_RULES, POSITIONS, POS_KEYS, SHAPE_HANDS, SHAPE_LEGS, SHAPE_LABELS,
  STAT_ABILITIES, RATING_ABILITIES, explainRating,
} from '../engine/ratings.js';
import { exhibitionPlayer, ratingOf } from '../engine/lineup.js';
import { esc, mon } from './common.js';

const hrPct = (w) => `${Math.round(w * 100)}%`;
const hrX = (v) => `×${v.toFixed(2)}`;
const hrAttrName = Object.fromEntries(ATTRS.map((a) => [a.key, a.name]));
const HR_RANGE_WORDS = {
  mass: ['lightest', 'heaviest'], nimble: ['heaviest', 'lightest'], reach: ['shortest', 'tallest'],
};

// One body factor as a readable range, e.g. "weight ×0.80 (lightest) to ×1.20 (heaviest)".
function hrBodyText(b) {
  if (b.f === 'hands' || b.f === 'legs') {
    const table = b.f === 'hands' ? SHAPE_HANDS : SHAPE_LEGS;
    const lo = b.base + b.scale * Math.min(...Object.values(table));
    const hi = b.base + b.scale * Math.max(...Object.values(table));
    return `${b.f} ${hrX(lo)} (fins) to ${hrX(hi)} (humanoid)`;
  }
  const rule = BODY_RULES[b.f];
  const pow = b.pow ?? 1;
  const label = { mass: 'weight', nimble: 'light body', reach: 'height' }[b.f];
  const [loWord, hiWord] = HR_RANGE_WORDS[b.f];
  return `${label} ${hrX(rule.lo ** pow)} (${loWord}) to ${hrX(rule.hi ** pow)} (${hiWord})`;
}

function hrMixText(mix) {
  return mix.map(([k, w]) => `${hrPct(w)} ${MIX_LABELS[k]}`).join(' + ');
}

// How many Pokémon hit 99 in each rating, as the range across all 16 ratings.
let hrTopRange = null;
function hrTopCount() {
  if (hrTopRange) return hrTopRange;
  const counts = Object.fromEntries(ATTRS.map((a) => [a.key, 0]));
  for (const sp of POKEDEX) {
    const r = ratingOf(exhibitionPlayer(sp.id, 100));
    for (const a of ATTRS) if (r.attrs[a.key] === 99) counts[a.key]++;
  }
  hrTopRange = [Math.min(...Object.values(counts)), Math.max(...Object.values(counts))];
  return hrTopRange;
}

function hrShapeExamples() {
  const first = {};
  for (const sp of POKEDEX) if (!first[sp.shape]) first[sp.shape] = sp.id;
  return first;
}

function hrWorkedExample(player, key) {
  const sp = DEX.get(player.species);
  const e = explainRating(player, key);
  const bodyLine = e.factors.map((x) => {
    if (x.f === 'hands' || x.f === 'legs') return `${hrX(x.value)} for ${x.f} (${esc(SHAPE_LABELS[e.shape] ?? e.shape)} body)`;
    if (x.f === 'reach') return `${hrX(x.value)} for height (${e.m.toFixed(1)} m)`;
    return `${hrX(x.value)} for ${x.f === 'mass' ? 'weight' : 'light body'} (${e.kg.toFixed(1)} kg)`;
  });
  const abilityName = ABILITIES[e.ability] ?? e.ability;
  return `<div class="stack" style="gap:6px">
    <div class="row" style="gap:8px">${mon(sp.id, '', 'xs')}<b>${esc(sp.name)}: ${hrAttrName[key]}</b>
      <select id="sc-how-attr" data-action="sc-how-attr" aria-label="Rating to explain">${ATTRS.map((a) => `<option value="${a.key}"${a.key === key ? ' selected' : ''}>${a.name}</option>`).join('')}</select></div>
    <ol class="small" style="margin:0;padding-left:20px;display:grid;gap:4px">
      <li>Stats at full strength: ${e.parts.map((x) => `${MIX_LABELS[x.stat]} ${x.value} × ${hrPct(x.weight)}`).join(' + ')} = <b>${e.mix.toFixed(1)}</b>${e.statBoost ? ` (after ${esc(abilityName)})` : ''}</li>
      ${bodyLine.length ? `<li>Body: ${bodyLine.join(', ')} → <b>${e.raw.toFixed(1)}</b></li>` : ''}
      ${e.abilityMod !== 1 ? `<li>${esc(abilityName)}: ${hrX(e.abilityMod)}</li>` : ''}
      <li>Scale: 99 × ${e.raw.toFixed(1)}${e.abilityMod !== 1 ? ` × ${e.abilityMod}` : ''} ÷ ${e.ref.toFixed(1)} (the 99.5th-percentile Pokémon) = <b>${hrAttrName[key]} ${e.rating}</b></li>
    </ol>
    <div class="faint small">Pick any Pokémon in the table to see its math.</div>
  </div>`;
}

export function ratingsExplainer(open, player, exampleKey) {
  const summary = `<p style="margin:0;max-width:75ch">Every rating comes from three things: the Pokémon's real base stats, its size, and its body shape. Everyone plays at full strength (level 100, perfect IVs, neutral nature) with whichever of its abilities rates best. Each of the 16 football ratings blends a few stats, adjusts for size and shape, and is scaled so that 99 matches the top 0.5% of all 1,025 Pokémon. A position overall is a weighted mix of those ratings.</p>`;
  const toggle = `<button class="btn small" data-action="sc-how" aria-expanded="${open}">${open ? 'Hide the formulas' : 'Show the formulas'}</button>`;
  if (!open) {
    return `<div class="panel stack"><div class="spread"><h2>How ratings are calculated</h2>${toggle}</div>${summary}</div>`;
  }
  const examples = hrShapeExamples();
  const shapes = Object.keys(SHAPE_HANDS).sort((a, b) => SHAPE_HANDS[b] - SHAPE_HANDS[a] || SHAPE_LEGS[b] - SHAPE_LEGS[a]);
  const abilityRows = [...new Set([...Object.keys(STAT_ABILITIES), ...Object.keys(RATING_ABILITIES)])].map((slug) => {
    const effects = [
      ...Object.entries(STAT_ABILITIES[slug] ?? {}).map(([k, v]) => `${MIX_LABELS[k]} ${hrX(v)}`),
      ...Object.entries(RATING_ABILITIES[slug] ?? {}).map(([k, v]) => `${hrAttrName[k]} ${hrX(v)}`),
    ];
    return `<tr><td class="l"><b>${esc(ABILITIES[slug] ?? slug)}</b></td><td class="l">${effects.join(', ')}</td></tr>`;
  }).join('');
  return `<div class="panel stack">
    <div class="spread"><h2>How ratings are calculated</h2>${toggle}</div>
    ${summary}
    <div class="grid-2" style="align-items:start">
      <div class="stack">
        <div><h3>1. Real stats</h3>
          <p class="small" style="margin:4px 0 0">Each stat uses the main-series formula at full strength: <b>2 × base + 36</b>, and HP is <b>2 × base + 141</b>. A 100 base stat becomes 236. In the blends below, HP drops its level bonus so it weighs the same as the other stats. A few abilities change a stat first (see step 6).</p></div>
        <div><h3>2. Football ratings</h3>
          <p class="small" style="margin:4px 0 6px">Each rating blends real stats, then multiplies by its body factors.</p>
          <div class="table-wrap"><table class="data wrap"><thead><tr><th class="l">Rating</th><th class="l">Stat blend</th><th class="l">Body factors</th></tr></thead><tbody>
          ${ATTRS.map((a) => `<tr><td class="l"><b>${a.name}</b> <span class="faint">${a.key}</span></td><td class="l small">${hrMixText(FORMULAS[a.key].mix)}</td><td class="l small">${FORMULAS[a.key].body.map(hrBodyText).join('; ') || '<span class="faint">none</span>'}</td></tr>`).join('')}
          </tbody></table></div></div>
        <div><h3>3. The 1-99 scale</h3>
          <p class="small" style="margin:4px 0 0">A rating is 99 × the Pokémon's raw value ÷ the raw value of the Pokémon at the 99.5th percentile for that rating, rounded and kept between 1 and 99. Only ${hrTopCount()[0]} to ${hrTopCount()[1]} Pokémon reach 99 in each rating. A Pokémon with half the top raw value rates about 50.</p></div>
      </div>
      <div class="stack">
        <div><h3>Worked example</h3>${player ? hrWorkedExample(player, exampleKey) : ''}</div>
        <div><h3>4. Body shape</h3>
          <p class="small" style="margin:4px 0 6px">The Pokédex body shape sets how well a Pokémon can hold a ball (hands) and kick one (legs). Weight helps blocking, tackling and strength. A light body helps agility and coverage. Height helps catching. Each size factor is 1 + k × log₂(size ÷ reference): reference ${BODY_RULES.mass.ref} kg for weight and ${BODY_RULES.reach.ref} m for height.</p>
          <div class="table-wrap"><table class="data"><thead><tr><th class="l">Body shape</th><th class="l">First Pokémon with it</th><th>Hands</th><th>Legs</th></tr></thead><tbody>
          ${shapes.map((sh) => `<tr><td class="l">${esc(SHAPE_LABELS[sh])}</td><td class="l"><span class="who">${mon(examples[sh], '', 'xs')}<span>${esc(DEX.get(examples[sh]).name)}</span></span></td><td>${hrPct(SHAPE_HANDS[sh])}</td><td>${hrPct(SHAPE_LEGS[sh])}</td></tr>`).join('')}
          </tbody></table></div></div>
      </div>
    </div>
    <div class="grid-2" style="align-items:start">
      <div><h3>5. Position overall</h3>
        <p class="small" style="margin:4px 0 6px">The overall at a position is a weighted mix of ratings, scaled the same way (99 = the 99.5th percentile at that position). You choose each Pokémon's position, so this is only a guide.</p>
        <div class="table-wrap"><table class="data wrap"><thead><tr><th class="l">Position</th><th class="l">Weights</th></tr></thead><tbody>
        ${POS_KEYS.map((k) => `<tr><td class="l"><b>${POSITIONS[k].name}</b></td><td class="l small">${Object.entries(POSITIONS[k].w).sort((a, b) => b[1] - a[1]).map(([r, w]) => `${hrAttrName[r]} ${hrPct(w)}`).join(' · ')}</td></tr>`).join('')}
        </tbody></table></div></div>
      <div><h3>6. Abilities that change ratings</h3>
        <p class="small" style="margin:4px 0 6px">These abilities change a stat or a rating before any game. Each Pokémon uses whichever of its abilities rates best. Other abilities, such as Intimidate or Truant, act during games instead; the player card lists each effect.</p>
        <div class="table-wrap"><table class="data wrap"><tbody>${abilityRows}</tbody></table></div>
        <p class="small muted" style="margin:10px 0 0">Ratings leave out types and weather. Those count during games: in every one-on-one matchup, each player's types are checked against the other's with the real type chart.</p></div>
    </div>
  </div>`;
}
