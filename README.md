# Pocket Gridiron

A free football GM sim in the style of Football Legacy Manager, where all 1,025 Pokémon are players.
Every Pokémon gets 16 football ratings computed from its real base stats, size and body shape. Games are
simulated snap by snap from those ratings, with type matchups and abilities in every one-on-one battle.

**Play it:** https://cellis212.github.io/pocket-gridiron/ (or open `dist/index.html` in any browser).

## What you can do

- **Exhibition.** Pick two lineups (regions, types, legends, starters, or every Pokémon) and kick off.
  Watch the play-by-play on a field diagram, read the box score and drive chart, or sim the same
  matchup 200 times to see win odds and the margin spread. Any of the 24 lineup slots can be swapped
  for any Pokémon.
- **Season.** Draft a team from all 1,025 Pokémon in a snake draft against the computer. Pokémon have no
  positions: you draft on their ratings, then put a Pokémon in each of the 24 lineup slots yourself (each
  slot's list shows how every Pokémon on your roster would rate there). Then play a full regular season and
  the playoffs for the Champion Bowl. Starters sometimes faint and miss a few weeks, so backups matter. The
  season saves in your browser, and the Save tab gives you a save code to load it anywhere.
- **Scouting.** All 1,025 Pokémon with their ratings. Sort by any rating, rate everyone as any position,
  filter by type and region, and open a full player card. "How ratings are calculated" shows every
  formula, the body-shape table, the position weights, and the step-by-step math for any Pokémon.

Every Pokémon always plays at full strength with its best ability. There are no levels, experience or
evolutions: a player's ratings never change, so the draft decides the season.

## How a Pokémon becomes a football player

1. **Real stats.** Each Pokémon's six stats come from the main-series stat formula at full strength
   (level 100, perfect IVs, neutral nature). Huge Power and Pure Power double Attack, Fur Coat doubles
   Defense, and so on.
2. **Football ratings.** Each rating is a fixed blend of those stats, adjusted for body size and shape.

   | Rating | Built from |
   |---|---|
   | Speed | Spe |
   | Agility | Spe, SpD, light body |
   | Strength | Atk, HP, weight |
   | Awareness | SpA, SpD |
   | Throw power | Atk, SpA, hands |
   | Throw accuracy | SpA, SpD, hands |
   | Catching | SpD, Spe, SpA, hands, height |
   | Carrying | HP, Def, hands |
   | Run block / pass block | Def, Atk or SpD, HP, weight |
   | Pass rush | Atk, Spe, HP, weight |
   | Tackling | Atk, Def, HP, weight |
   | Coverage | Spe, SpD, SpA, light body |
   | Kick power / accuracy | Atk or SpA and SpD, legs |
   | Stamina | HP, Def |

   "Hands" and "legs" come from the Pokédex body shape: a humanoid has full hands, a fish has fins.
   Machamp can throw. Magikarp cannot.
3. **The 1-99 scale.** 99 is the 99.5th percentile of all 1,025 Pokémon.
4. **Position overall.** Each position weights the ratings that matter there (quarterback: accuracy,
   awareness and arm; offensive line: blocking and strength; and so on), on the same 1-99 scale.

## How a game is simulated

Every snap is a set of one-on-one matchups: blocker against defender, runner against tackler, receiver
against his cover man, rusher against the quarterback's protection. A matchup compares the two players'
rating blends as a ratio. `scripts/calibrate.mjs` measures the typical ratio for each matchup across many
lineups, so an even matchup produces league-average results.

On top of the ratings:

- **Types.** Both players' type matchups count in every duel, from the real type chart. A Ground-type
  tackler cannot touch a Levitate runner, and Normal and Ghost cannot hit each other.
- **Abilities.** 47 abilities do something on the field: Intimidate, Speed Boost, Truant (Slaking loafs on
  every other snap), Slow Start, Sturdy, Sticky Hold, Swift Swim, Drizzle and the other weather setters,
  Pressure, Sniper, Technician, Moxie and more. The player card lists each effect.
- **Weather.** Rain, sun, sandstorm and snow change passing, fumbles, type power and some speeds.
- **Coaching.** Down, distance, field position, score and clock drive the play call. Fourth-down
  aggression, run/pass balance and blitz rate are team settings.

With two equal teams, the engine lands close to NFL averages (`node scripts/engine-report.mjs`):

| | Sim | NFL |
|---|---|---|
| Points per team | 25.7 | 22 to 25 |
| Yards per carry | 4.29 | ~4.3 |
| Completion % | 61.9 | ~64 |
| Yards per pass attempt | 7.3 | ~7.0 |
| Sacks per team | 2.4 | ~2.4 |
| Third-down conversion % | 40.6 | ~39 |

## Development

No dependencies. Node 20 or newer.

```bash
npm test                 # unit tests (node --test)
npm run build            # bundle src/ into dist/index.html
npm run dev              # serve the repo at http://localhost:5190/src/ (live ES modules)
npm run data             # rebuild src/data/pokedex.js from PokeAPI (pinned commit)
npm run calibrate        # re-measure matchup baselines after changing ratings or blends
node scripts/engine-report.mjs   # league-average stats for equal teams
```

- `src/data/pokedex.js` is generated from PokeAPI's CSV tables at a pinned commit. Do not edit it by hand.
- `src/engine/` holds the ratings, lineup optimizer, match engine and season. It has no browser code.
- `src/ui/` is plain JavaScript that renders HTML strings. `scripts/build.mjs` joins every module into one
  page, so every top-level name in `src/` must be unique. The build fails if two match.
- Every push to `main` runs the tests, builds the page and deploys it to GitHub Pages
  (`.github/workflows/pages.yml`).

## Credits

Pokémon data comes from [PokeAPI](https://github.com/PokeAPI/pokeapi) (BSD 3-Clause). Sprites and official
artwork load from PokeAPI's [sprite repository](https://github.com/PokeAPI/sprites) when the page opens;
this repo stores no images. The idea comes from Football Legacy Manager.

This is a free, non-commercial, unofficial fan project. It is not affiliated with or endorsed by Nintendo,
Game Freak, Creatures or The Pokémon Company. Pokémon, Pokémon character names and Pokémon artwork are
trademarks and copyrights of their respective owners.
