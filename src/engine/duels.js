// The one-on-one matchups that decide every snap.
// A matchup compares two rating blends as a ratio, so two level-50 teams play the same brand of
// football as two level-100 teams. DUEL_REF (calibration.js) holds the typical log-ratio for
// starters at each matchup, so an edge of 0 means "an ordinary matchup".

export const BLENDS = {
  RBK: [['RBK', 1]],
  HOLD: [['TAK', 0.5], ['STR', 0.5]],
  ELUDE: [['AGI', 0.4], ['STR', 0.35], ['SPD', 0.25]],
  TAK: [['TAK', 1]],
  STR: [['STR', 1]],
  SPD: [['SPD', 1]],
  AGI: [['AGI', 1]],
  PRS: [['PRS', 1]],
  PBK: [['PBK', 1]],
  ROUTE: [['SPD', 0.45], ['AGI', 0.3], ['AWR', 0.25]],
  COVER: [['COV', 0.55], ['SPD', 0.3], ['AWR', 0.15]],
  THA: [['THA', 1]],
  COV: [['COV', 1]],
  CTH: [['CTH', 1]],
  YAC: [['SPD', 0.4], ['AGI', 0.4], ['STR', 0.2]],
};

// a = the first player's blend, b = the opponent's blend; pairs are typical slot matchups.
export const DUELS = {
  runBlock: { a: 'RBK', b: 'HOLD', pairs: [['LG', 'DT1'], ['C', 'DT2'], ['RG', 'MLB'], ['LT', 'RE'], ['RT', 'LE'], ['TE', 'SLB']] },
  elude: { a: 'ELUDE', b: 'TAK', pairs: [['RB', 'DT1'], ['RB', 'MLB'], ['RB', 'LE'], ['RB', 'WLB'], ['RB', 'SS']] },
  power: { a: 'STR', b: 'STR', pairs: [['RB', 'DT1'], ['RB', 'MLB'], ['RB', 'LE'], ['RB', 'WLB'], ['RB', 'SS']] },
  breakaway: { a: 'SPD', b: 'SPD', pairs: [['RB', 'FS'], ['RB', 'SS'], ['RB', 'CB1'], ['RB', 'CB2']] },
  passRush: { a: 'PRS', b: 'PBK', pairs: [['LE', 'RT'], ['DT1', 'RG'], ['DT2', 'LG'], ['RE', 'LT']] },
  route: { a: 'ROUTE', b: 'COVER', pairs: [['WR1', 'CB1'], ['WR2', 'CB2'], ['WR3', 'SLB'], ['TE', 'MLB'], ['RB', 'WLB']] },
  throw: { a: 'THA', b: 'COV', pairs: [['QB', 'CB1'], ['QB', 'CB2'], ['QB', 'SLB'], ['QB', 'MLB'], ['QB', 'FS']] },
  catch: { a: 'CTH', b: 'COV', pairs: [['WR1', 'CB1'], ['WR2', 'CB2'], ['WR3', 'SLB'], ['TE', 'MLB'], ['RB', 'WLB']] },
  yac: { a: 'YAC', b: 'TAK', pairs: [['WR1', 'CB1'], ['WR2', 'CB2'], ['WR3', 'SLB'], ['TE', 'MLB'], ['RB', 'WLB'], ['WR1', 'FS']] },
  escape: { a: 'AGI', b: 'SPD', pairs: [['QB', 'LE'], ['QB', 'RE'], ['QB', 'DT1']] },
  returns: { a: 'SPD', b: 'SPD', pairs: [['RB', 'WLB'], ['WR3', 'SLB'], ['CB2', 'SS']] },
};

export function blendValue(attrs, blend) {
  let v = 0;
  for (const [k, w] of BLENDS[blend]) v += w * attrs[k];
  return Math.max(1, v);
}
