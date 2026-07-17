// 7-card Texas Hold'em hand evaluator.
// Returns a single comparable numeric score (higher = better) plus a human name.

import { Card, RANK_VALUE } from './cards';

export const CATEGORY_NAMES = [
  'High Card',        // 0
  'One Pair',         // 1
  'Two Pair',         // 2
  'Three of a Kind',  // 3
  'Straight',         // 4
  'Flush',            // 5
  'Full House',       // 6
  'Four of a Kind',   // 7
  'Straight Flush',   // 8
];

export interface HandScore {
  score: number;      // comparable, higher is better
  category: number;   // 0..8
  name: string;
}

// Encode category + up to 5 tiebreak kickers (each 2..14) into one number, base 15.
function encode(category: number, tiebreaks: number[]): number {
  let v = category;
  for (let i = 0; i < 5; i++) {
    v = v * 15 + (tiebreaks[i] ?? 0);
  }
  return v;
}

// Evaluate exactly 5 cards.
function eval5(cards: Card[]): number {
  const values = cards.map((c) => RANK_VALUE[c[0]]).sort((a, b) => b - a);
  const suits = cards.map((c) => c[1]);
  const isFlush = suits.every((s) => s === suits[0]);

  // Count occurrences of each value.
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  // Sort by count desc, then value desc.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  // Straight detection (including wheel A-2-3-4-5).
  const uniq = [...new Set(values)].sort((a, b) => b - a);
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) straightHigh = 5; // wheel
  }

  if (straightHigh && isFlush) return encode(8, [straightHigh]);
  if (groups[0][1] === 4) return encode(7, [groups[0][0], groups[1][0]]);
  if (groups[0][1] === 3 && groups[1][1] === 2) return encode(6, [groups[0][0], groups[1][0]]);
  if (isFlush) return encode(5, values);
  if (straightHigh) return encode(4, [straightHigh]);
  if (groups[0][1] === 3) return encode(3, [groups[0][0], groups[1][0], groups[2][0]]);
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const [h, l] = [groups[0][0], groups[1][0]].sort((a, b) => b - a);
    return encode(2, [h, l, groups[2][0]]);
  }
  if (groups[0][1] === 2) return encode(1, [groups[0][0], groups[1][0], groups[2][0], groups[3][0]]);
  return encode(0, values);
}

// All C(n,5) combinations of indices.
function combos5(n: number): number[][] {
  const res: number[][] = [];
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) res.push([a, b, c, d, e]);
  return res;
}

// Evaluate best 5-card hand out of up to 7 cards.
export function evaluate(cards: Card[]): HandScore {
  let best = -1;
  const idxCombos = combos5(cards.length);
  for (const combo of idxCombos) {
    const s = eval5(combo.map((i) => cards[i]));
    if (s > best) best = s;
  }
  // Decode category (top of the base-15 encoding).
  const category = Math.floor(best / (15 ** 5));
  return { score: best, category, name: CATEGORY_NAMES[category] };
}
