// Type matchups and the abilities that act during a game.
import { TYPES, TYPE_CHART } from '../data/pokedex.js';

export const TYPE = Object.fromEntries(TYPES.map((t, i) => [t, i]));

// What each ability does on the field. Abilities missing from this list have no football effect.
export const PERKS = {
  'huge-power': 'Doubles its Attack stat.',
  'pure-power': 'Doubles its Attack stat.',
  'gorilla-tactics': 'Attack ×1.5.',
  hustle: 'Attack ×1.5, but throwing, catching and kicking accuracy ×0.8.',
  'fur-coat': 'Doubles its Defense stat.',
  'compound-eyes': 'Throwing, catching and kicking accuracy ×1.2.',
  'keen-eye': 'Coverage and catching ×1.06.',
  'no-guard': 'Throwing and catching ×1.1.',
  intimidate: 'Every opponent it faces in a matchup plays 6% worse.',
  'speed-boost': 'Speed and agility rise 4% each quarter.',
  'slow-start': 'Speed, strength, pass rush, tackling and kicking are halved in the first quarter.',
  truant: 'Loafs around on every other snap.',
  defeatist: 'Plays 25% worse while its team trails by 14 or more.',
  guts: 'Strength and tackling +10% while its team is behind.',
  sturdy: 'Fumbles 70% less often.',
  'sticky-hold': 'Never fumbles.',
  multiscale: 'Breaks the first tackle of a play more often.',
  'shadow-shield': 'Breaks the first tackle of a play more often.',
  'wonder-guard': 'Only super-effective tacklers can bring it down easily.',
  levitate: 'Ground-type defenders cannot touch it.',
  'thick-fat': 'Fire and Ice types are half as effective against it.',
  filter: 'Super-effective matchups against it are weaker.',
  'solid-rock': 'Super-effective matchups against it are weaker.',
  'prism-armor': 'Super-effective matchups against it are weaker.',
  scrappy: 'Its Normal and Fighting power hits Ghost types. Cannot be intimidated.',
  sniper: 'Deep passes complete more often.',
  technician: 'Short passes complete more often.',
  pressure: 'The opposing quarterback throws less accurately while it is on the field.',
  'super-luck': 'Intercepts passes more often.',
  'run-away': 'Breaks away for long runs more often.',
  regenerator: 'Never tires in the fourth quarter.',
  moxie: 'Pass rush +5% after each sack, up to +15%.',
  'swift-swim': 'Much faster in rain.',
  chlorophyll: 'Much faster in harsh sun.',
  'sand-rush': 'Much faster in a sandstorm.',
  'slush-rush': 'Much faster in snow.',
  drizzle: 'Makes it rain when it starts at home.',
  drought: 'Brings harsh sun when it starts at home.',
  'sand-stream': 'Whips up a sandstorm when it starts at home.',
  'snow-warning': 'Makes it snow when it starts at home.',
  'clear-body': 'Cannot be intimidated.',
  'white-smoke': 'Cannot be intimidated.',
  'full-metal-body': 'Cannot be intimidated.',
  'hyper-cutter': 'Cannot be intimidated.',
  'inner-focus': 'Cannot be intimidated.',
  oblivious: 'Cannot be intimidated.',
  'own-tempo': 'Cannot be intimidated.',
};

export const INTIMIDATE_IMMUNE = new Set([
  'clear-body', 'white-smoke', 'full-metal-body', 'hyper-cutter', 'inner-focus', 'oblivious', 'own-tempo', 'scrappy',
]);

export const WEATHER = {
  clear: { name: 'Clear', setter: null, rush: null },
  rain: { name: 'Rain', setter: 'drizzle', rush: 'swift-swim' },
  sun: { name: 'Harsh sun', setter: 'drought', rush: 'chlorophyll' },
  sand: { name: 'Sandstorm', setter: 'sand-stream', rush: 'sand-rush' },
  snow: { name: 'Snow', setter: 'snow-warning', rush: 'slush-rush' },
};
export const WEATHER_SETTERS = Object.fromEntries(
  Object.entries(WEATHER).filter(([, w]) => w.setter).map(([k, w]) => [w.setter, k]),
);

// The best multiplier any of the attacker's types gets against the defender, after the defender's ability.
export function typeFactor(attTypes, attAbility, defTypes, defAbility) {
  let best = 0;
  for (const a of attTypes) {
    let f = 1;
    for (const d of defTypes) {
      let x = TYPE_CHART[a][d] / 100;
      if (x === 0 && attAbility === 'scrappy' && d === TYPE.ghost && (a === TYPE.normal || a === TYPE.fighting)) x = 1;
      f *= x;
    }
    if (defAbility === 'levitate' && a === TYPE.ground) f = 0;
    if (defAbility === 'thick-fat' && (a === TYPE.fire || a === TYPE.ice)) f *= 0.5;
    if (f >= 2 && (defAbility === 'filter' || defAbility === 'solid-rock' || defAbility === 'prism-armor')) f *= 0.75;
    best = Math.max(best, f);
  }
  return best;
}

// Rating multiplier for a matchup: 0.92 (no effect) to 1.08 (4x super effective).
export function typeMod(factor) {
  if (factor === 0) return 0.92;
  return 1 + 0.04 * Math.max(-2, Math.min(2, Math.log2(factor)));
}
