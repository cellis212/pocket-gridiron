# Pocket Gridiron

A football general-manager sim in the style of Football Legacy Manager, where all 1,025 Pokémon are players.
Every Pokémon gets 16 football ratings computed from its real stats, size and body shape. Games are
simulated snap by snap from those ratings, with type matchups and abilities in every one-on-one battle.

**Play it:** open `dist/index.html` in any browser. It is one self-contained file and needs no install.

## Three modes

- **Exhibition.** Pick two lineups (regions, types, legends, starters, or every Pokémon), set the level,
  and kick off. Watch the play-by-play on a field diagram, read the box score and drive chart, or sim the
  same matchup 200 times to see win odds and the margin spread. Any of the 24 lineup slots can be swapped
  for any Pokémon.
- **Scouting.** All 1,025 Pokémon with their ratings at a level you choose. Sort by any rating or by
  overall at any position, filter by type and region, and open a full player card.
- **League (legacy mode).** Create a 4 to 12 team league, run a fantasy draft from the whole Pokédex, and
  play season after season: playoffs, awards, retirements, rookie drafts, free agency and a Hall of Fame.
  The league saves in your browser, and the Save tab gives you a save code to move it anywhere.

## How a Pokémon becomes a football player

1. **Real stats.** Each player's six stats come from the main-series formula:
   base stat, IVs, nature and level (`src/engine/ratings.js`, `realStats`). Huge Power and Pure Power
   double Attack, Fur Coat doubles Defense, and so on.
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
3. **The 1-99 scale.** 99 is the 99.5th percentile of all Pokémon at level 100 with perfect IVs. Ratings
   scale with real stats, so a level-50 Pokémon rates about half of its level-100 self.
4. **Position overall.** Each position weights the ratings that matter there (quarterback: accuracy,
   awareness and arm; offensive line: blocking and strength; and so on), on the same 1-99 scale.
5. **Potential.** The best overall an individual can reach at level 100 in any of its final evolutions.

## How a game is simulated

Every snap is a set of one-on-one matchups: blocker against defender, runner against tackler, receiver
against his cover man, rusher against the quarterback's protection. A matchup compares the two players'
rating blends as a ratio, so two level-50 teams play the same kind of football as two level-100 teams,
and a level-100 team crushes a level-50 one. `scripts/calibrate.mjs` measures the typical ratio for each
matchup across many lineups, so an even matchup produces league-average results.

On top of the ratings:

- **Types.** Both players' type matchups count in every duel, from the real type chart. A Ground-type
  tackler cannot touch a Levitate runner, and Normal and Ghost cannot hit each other.
- **Abilities.** 47 abilities do something on the field: Intimidate, Speed Boost, Truant (Slaking
  loafs on every other snap), Slow Start, Sturdy, Sticky Hold, Swift Swim, Drizzle and the other weather
  setters, Pressure, Sniper, Technician, Moxie and more. The player card lists each effect.
- **Weather.** Rain, sun, sandstorm and snow change passing, fumbles, type power and some speeds.
- **Coaching.** Down, distance, field position, score and clock drive the play call. Fourth-down
  aggression, run/pass balance and blitz rate are team settings.

With two equal teams, the engine lands close to NFL averages (`node scripts/engine-report.mjs`):

| | Sim | NFL |
|---|---|---|
| Points per team | 22.3 | ~22 |
| Yards per carry | 4.33 | ~4.3 |
| Completion % | 62.2 | ~64 |
| Yards per pass attempt | 6.7 | ~7.0 |
| Sacks per team | 2.3 | ~2.4 |
| Third-down conversion % | 40.1 | ~39 |

## Legacy mode details

- **Levels and experience.** Starters earn experience every game, and more against higher-level teams.
  Levels follow each species' real growth curve (fast, medium, slow, erratic, fluctuating), so rookies
  jump and veterans level slowly.
- **Evolution.** Players evolve at their real evolution level. Stone, trade and friendship evolutions
  have no level in the games, so the sim assigns one: level 12 for baby Pokémon, level 32 for a first
  evolution, and 14 levels after the previous stage (at least 40) for a second. Branching lines such as
  Eevee evolve into the form that suits the player's position.
- **Injuries.** Starters sometimes faint and miss one to four weeks.
- **Seasons.** Double round robin, then a four-team playoff (Elite Four Round, then the Champion Bowl).
  Awards: MVP, Offensive and Defensive Player of the Year, Rookie of the Year.
- **Offseason.** Veterans retire, a three-round rookie draft runs in reverse standings order, and rosters
  are trimmed to 32. Players with two awards or a big career enter the Hall of Fame.

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
- `src/engine/` holds the ratings, lineup optimizer, match engine and league. It has no browser code.
- `src/ui/` is plain JavaScript that renders HTML strings. `scripts/build.mjs` joins every module into one
  page, so every top-level name in `src/` must be unique. The build fails if two match.

## Credits

Pokémon data comes from [PokeAPI](https://github.com/PokeAPI/pokeapi) (BSD 3-Clause). The idea comes from
Football Legacy Manager. This is an unofficial fan project and is not affiliated with Nintendo, Game Freak,
Creatures or The Pokémon Company. Pokémon names are trademarks of their owners. No official artwork is
included.
