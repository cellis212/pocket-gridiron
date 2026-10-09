// Plays mirror matches (equal teams) and prints league-wide averages next to NFL norms.
// Run it after changing the match engine: node scripts/engine-report.mjs [gamesPerPool]
import { POKEDEX } from '../src/data/pokedex.js';
import { makeRng } from '../src/engine/rng.js';
import { exhibitionPlayer, autoLineup, themePool } from '../src/engine/lineup.js';
import { simulateGame } from '../src/engine/match.js';

const N = Number(process.argv[2] ?? 40);
const rng = makeRng(99);
const pools = ['gen1', 'gen4', 'standard', 'type-water', 'gen9', 'type-steel'].map(themePool);
for (let i = 0; i < 6; i++) pools.push(rng.shuffle(POKEDEX.map((p) => p.id)).slice(0, 100));
const t = { games: 0, pts: 0, plays: 0, car: 0, rushYds: 0, att: 0, cmp: 0, passYds: 0, sacks: 0, ints: 0, to: 0, fga: 0, fgm: 0, third: [0, 0] };
for (const [pi, pool] of pools.entries()) {
  for (const lv of [100, 50]) {
    const mk = (id) => {
      const players = pool.map((s) => exhibitionPlayer(s, lv, `${id}-${s}`));
      return { id, name: id, abbr: id, color: '#333', players, lineup: autoLineup(players) };
    };
    const a = mk(`A${pi}`);
    const b = mk(`B${pi}`);
    for (let i = 0; i < N; i++) {
      const r = simulateGame(a, b, { seed: 500 + i + pi * 1000 + lv, log: false });
      t.games++;
      for (const side of [0, 1]) {
        const s = r.teamStats[side];
        t.pts += r.score[side]; t.plays += s.plays; t.car += s.rushAtt; t.rushYds += s.rushYds; t.att += s.passAtt;
        t.passYds += s.passYds; t.sacks += s.sacked; t.to += s.turnovers; t.third[0] += s.thirdConv; t.third[1] += s.thirdAtt;
      }
      for (const p of r.players) { t.cmp += p.pass.cmp; t.ints += p.pass.int; t.fga += p.kick.fga; t.fgm += p.kick.fgm; }
    }
  }
}
const per = (x) => (x / (2 * t.games)).toFixed(1);
const rows = [
  ['Points per team', per(t.pts), '~22'],
  ['Plays per team', per(t.plays), '~63'],
  ['Yards per carry', (t.rushYds / t.car).toFixed(2), '~4.3'],
  ['Completion %', ((100 * t.cmp) / t.att).toFixed(1), '~64'],
  ['Yards per attempt', (t.passYds / t.att).toFixed(2), '~7.0'],
  ['Sacks per team', per(t.sacks), '~2.4'],
  ['Interceptions per team', per(t.ints), '~0.8'],
  ['Turnovers per team', per(t.to), '~1.3'],
  ['Field goal %', ((100 * t.fgm) / t.fga).toFixed(1), '~85'],
  ['Third-down %', ((100 * t.third[0]) / t.third[1]).toFixed(1), '~39'],
];
console.log(`${t.games} mirror games\n`);
for (const [k, v, nfl] of rows) console.log(`${k.padEnd(24)} ${String(v).padStart(7)}   NFL ${nfl}`);
