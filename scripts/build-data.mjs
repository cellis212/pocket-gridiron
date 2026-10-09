// Builds src/data/pokedex.js from PokeAPI's CSV tables.
// The tables are pinned to one PokeAPI commit so the data never shifts under the sim.
// Usage: node scripts/build-data.mjs
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const POKEAPI_SHA = 'c80757193bd0889054e36f4209762360bdaa4b95';
const CACHE = join(ROOT, '.cache', 'pokeapi', POKEAPI_SHA);
const TABLES = [
  'pokemon', 'pokemon_stats', 'pokemon_types', 'types', 'pokemon_species', 'pokemon_species_names',
  'pokemon_abilities', 'abilities', 'ability_names', 'pokemon_evolution', 'pokemon_shapes',
  'type_efficacy', 'natures', 'growth_rates',
];
const ENGLISH = '9';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.length > 1 || r[0] !== '');
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

async function loadTable(name) {
  const path = join(CACHE, `${name}.csv`);
  try {
    await access(path);
  } catch {
    const url = `https://raw.githubusercontent.com/PokeAPI/pokeapi/${POKEAPI_SHA}/data/v2/csv/${name}.csv`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed for ${url}: HTTP ${res.status}`);
    await mkdir(CACHE, { recursive: true });
    await writeFile(path, await res.text());
  }
  return parseCsv(await readFile(path, 'utf8'));
}

const t = Object.fromEntries(await Promise.all(TABLES.map(async (n) => [n, await loadTable(n)])));

// The 18 battle types, in PokeAPI id order (1..18).
const typeRows = t.types.filter((r) => Number(r.id) >= 1 && Number(r.id) <= 18);
const TYPES = typeRows.map((r) => r.identifier);
const typeIndex = new Map(typeRows.map((r, i) => [r.id, i]));

const TYPE_CHART = TYPES.map(() => TYPES.map(() => 100));
for (const r of t.type_efficacy) {
  if (typeIndex.has(r.damage_type_id) && typeIndex.has(r.target_type_id)) {
    TYPE_CHART[typeIndex.get(r.damage_type_id)][typeIndex.get(r.target_type_id)] = Number(r.damage_factor);
  }
}

const statKey = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 }; // PokeAPI stat id -> index in [hp, atk, def, spa, spd, spe]
const NATURES = t.natures
  .map((r) => ({
    name: r.identifier,
    up: r.increased_stat_id === r.decreased_stat_id ? 0 : statKey[r.increased_stat_id],
    down: r.increased_stat_id === r.decreased_stat_id ? 0 : statKey[r.decreased_stat_id],
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const GROWTH = Object.fromEntries(t.growth_rates.map((r) => [r.id, r.identifier]));
const SHAPES = Object.fromEntries(t.pokemon_shapes.map((r) => [r.id, r.identifier]));

const speciesName = new Map();
const speciesGenus = new Map();
for (const r of t.pokemon_species_names) {
  if (r.local_language_id === ENGLISH) {
    speciesName.set(r.pokemon_species_id, r.name);
    speciesGenus.set(r.pokemon_species_id, r.genus);
  }
}
const abilitySlug = new Map(t.abilities.map((r) => [r.id, r.identifier]));
const abilityName = new Map();
for (const r of t.ability_names) if (r.local_language_id === ENGLISH) abilityName.set(r.ability_id, r.name);

const statsBy = new Map();
for (const r of t.pokemon_stats) {
  if (!statsBy.has(r.pokemon_id)) statsBy.set(r.pokemon_id, [0, 0, 0, 0, 0, 0]);
  statsBy.get(r.pokemon_id)[Number(r.stat_id) - 1] = Number(r.base_stat);
}
const typesBy = new Map();
for (const r of t.pokemon_types) {
  if (!typesBy.has(r.pokemon_id)) typesBy.set(r.pokemon_id, []);
  typesBy.get(r.pokemon_id)[Number(r.slot) - 1] = typeIndex.get(r.type_id);
}
const abilitiesBy = new Map();
for (const r of t.pokemon_abilities) {
  if (!abilitiesBy.has(r.pokemon_id)) abilitiesBy.set(r.pokemon_id, { regular: [], hidden: null });
  const slug = abilitySlug.get(r.ability_id);
  if (r.is_hidden === '1') abilitiesBy.get(r.pokemon_id).hidden = slug;
  else abilitiesBy.get(r.pokemon_id).regular[Number(r.slot) - 1] = slug;
}

// Evolution level. Level-up evolutions keep their real minimum level. Stone, trade and
// friendship evolutions have no level, so the sim assigns one by stage (documented in README).
const speciesById = new Map(t.pokemon_species.map((r) => [r.id, r]));
const realLevel = new Map();
for (const r of t.pokemon_evolution) {
  if (!r.minimum_level) continue;
  const lvl = Number(r.minimum_level);
  const prev = realLevel.get(r.evolved_species_id);
  if (prev === undefined || lvl < prev) realLevel.set(r.evolved_species_id, lvl);
}
const evoLevelCache = new Map();
function evoLevel(id) {
  if (evoLevelCache.has(id)) return evoLevelCache.get(id);
  const sp = speciesById.get(id);
  let lvl = null;
  if (sp.evolves_from_species_id) {
    const parent = speciesById.get(sp.evolves_from_species_id);
    if (realLevel.has(id)) lvl = realLevel.get(id);
    else if (parent.is_baby === '1') lvl = 12;
    else {
      const parentLvl = evoLevel(parent.id);
      lvl = parentLvl === null ? 32 : Math.max(parentLvl + 14, 40);
    }
  }
  evoLevelCache.set(id, lvl);
  return lvl;
}

const POKEDEX = [];
const usedAbilities = new Set();
for (const p of t.pokemon) {
  if (p.is_default !== '1') continue;
  const sp = speciesById.get(p.species_id);
  const ab = abilitiesBy.get(p.id) ?? { regular: [], hidden: null };
  const regular = ab.regular.filter(Boolean);
  for (const a of [...regular, ab.hidden]) if (a) usedAbilities.add(a);
  POKEDEX.push({
    id: Number(sp.id),
    name: speciesName.get(sp.id) ?? sp.identifier,
    slug: sp.identifier,
    genus: speciesGenus.get(sp.id) ?? '',
    gen: Number(sp.generation_id),
    types: typesBy.get(p.id).filter((x) => x !== undefined),
    base: statsBy.get(p.id),
    h: Number(p.height),
    w: Number(p.weight),
    shape: SHAPES[sp.shape_id] ?? 'upright',
    growth: GROWTH[sp.growth_rate_id],
    leg: sp.is_legendary === '1' ? 1 : 0,
    myth: sp.is_mythical === '1' ? 1 : 0,
    baby: sp.is_baby === '1' ? 1 : 0,
    from: sp.evolves_from_species_id ? Number(sp.evolves_from_species_id) : 0,
    evoLvl: evoLevel(sp.id) ?? 0,
    abil: regular,
    hidden: ab.hidden ?? '',
  });
}
POKEDEX.sort((a, b) => a.id - b.id);

const ABILITIES = Object.fromEntries(
  [...usedAbilities].sort().map((slug) => {
    const id = [...abilitySlug].find(([, s]) => s === slug)[0];
    return [slug, abilityName.get(id) ?? slug];
  }),
);

const out = `// Generated by scripts/build-data.mjs from PokeAPI data (commit ${POKEAPI_SHA.slice(0, 8)}). Do not edit.
// Fields: id, name, slug, genus, gen, types (indexes into TYPES), base [hp, atk, def, spa, spd, spe],
// h (decimetres), w (hectograms), shape, growth, leg, myth, baby, from (pre-evolution id), evoLvl,
// abil (regular abilities), hidden (hidden ability).
export const DATA_SOURCE = ${JSON.stringify({ name: 'PokeAPI', url: 'https://github.com/PokeAPI/pokeapi', commit: POKEAPI_SHA })};
export const TYPES = ${JSON.stringify(TYPES)};
export const TYPE_CHART = ${JSON.stringify(TYPE_CHART)};
export const NATURES = ${JSON.stringify(NATURES)};
export const ABILITIES = ${JSON.stringify(ABILITIES)};
export const POKEDEX = [
${POKEDEX.map((p) => '  ' + JSON.stringify(p)).join(',\n')}
];
`;
await writeFile(join(ROOT, 'src', 'data', 'pokedex.js'), out);
console.log(`Wrote ${POKEDEX.length} Pokémon, ${TYPES.length} types, ${NATURES.length} natures, ${Object.keys(ABILITIES).length} abilities.`);
