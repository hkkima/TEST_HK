// Made-hand naming and a light Monte-Carlo win-probability estimate, all
// client-side. Used to show "내 핸드" and an approximate equity to the player.

import { Card, freshDeck } from './cards';
import { evaluate } from './evaluator';

export const HAND_KO: Record<string, string> = {
  'High Card': '하이카드',
  'One Pair': '원페어',
  'Two Pair': '투페어',
  'Three of a Kind': '트리플',
  'Straight': '스트레이트',
  'Flush': '플러시',
  'Full House': '풀하우스',
  'Four of a Kind': '포카드',
  'Straight Flush': '스트레이트 플러시',
};

// The best made hand from my hole + the current board (needs ≥5 total cards).
export function madeHandName(hole: Card[], board: Card[]): string | null {
  const cards = [...hole, ...board];
  if (cards.length < 5) return null;
  return HAND_KO[evaluate(cards).name] ?? evaluate(cards).name;
}

// Deterministic-ish PRNG (mulberry32) so estimates don't jump every render —
// seeded from the known cards. No Math.random (kept stable across re-renders).
function seededRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(cards: Card[]): number {
  let h = 2166136261;
  for (const c of cards) for (const ch of c) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Approximate win probability (%) against `opponents` random hands, Monte Carlo.
export function estimateEquity(hole: Card[], board: Card[], opponents: number, sims = 1000): number | null {
  if (hole.length !== 2 || opponents < 1) return null;
  const known = new Set([...hole, ...board]);
  const deck = freshDeck().filter((c) => !known.has(c));
  const rng = seededRng(seedFrom([...hole, ...board, String(opponents)]));

  let win = 0, tie = 0;
  for (let s = 0; s < sims; s++) {
    // Shuffle a working copy of the remaining deck (Fisher-Yates with seeded rng).
    const d = deck.slice();
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    let p = 0;
    const fullBoard = board.slice();
    while (fullBoard.length < 5) fullBoard.push(d[p++]);
    const myScore = evaluate([...hole, ...fullBoard]).score;
    let best = myScore, ties = 0, lost = false;
    for (let o = 0; o < opponents; o++) {
      const oppScore = evaluate([d[p++], d[p++], ...fullBoard]).score;
      if (oppScore > best) { lost = true; break; }
      if (oppScore === best) ties++;
    }
    if (lost) continue;
    if (ties > 0) tie++; else win++;
  }
  return Math.round(((win + tie / 2) / sims) * 100);
}
