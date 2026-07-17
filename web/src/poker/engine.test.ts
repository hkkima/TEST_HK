// Lightweight assertion-based tests. Run: npx tsx src/poker/engine.test.ts
import { evaluate } from './evaluator';
import { buildPots, applyAction, startHand } from './engine';
import { Room } from '../types';

let passed = 0, failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) { passed++; } else { failed++; console.error('  ✗ ' + msg); }
}
function eq(a: any, b: any, msg: string) { ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

// ---- evaluator ----
console.log('evaluator:');
ok(evaluate(['As', 'Ks', 'Qs', 'Js', 'Ts']).name === 'Straight Flush', 'royal is straight flush');
ok(evaluate(['5h', '4h', '3h', '2h', 'Ah']).name === 'Straight Flush', 'wheel flush');
ok(evaluate(['9c', '9d', '9h', '9s', '2c']).name === 'Four of a Kind', 'quads');
ok(evaluate(['Kc', 'Kd', 'Kh', '2s', '2c']).name === 'Full House', 'full house');
ok(evaluate(['Ah', '2c', '3d', '4s', '5h']).name === 'Straight', 'wheel straight');
ok(evaluate(['Ac', 'Kc', 'Qc', '2c', '3c']).name === 'Flush', 'flush');
// best-of-7: pair of aces beats nothing
ok(evaluate(['As', 'Ad', 'Kc', 'Qh', 'Jc', '9c', '2d']).name === 'One Pair', '7-card one pair');
// higher two pair wins comparison
ok(evaluate(['As', 'Ad', 'Kc', 'Kh', '2c']).score > evaluate(['Qs', 'Qd', 'Jc', 'Jh', '3c']).score, 'AAKK > QQJJ');
// full house beats flush
ok(evaluate(['Kc', 'Kd', 'Kh', '2c', '2d', '5c', '9c']).score > evaluate(['Ac', 'Qc', '9c', '5c', '2c', '3d', '4h']).score, 'full house > flush');

// ---- side pots ----
console.log('side pots:');
// Three players all-in for different amounts: 100 / 200 / 200
{
  const game: any = { seats: {
    0: { committedTotal: 100, folded: false },
    1: { committedTotal: 200, folded: false },
    2: { committedTotal: 200, folded: false },
  }};
  const pots = buildPots(game);
  // main pot 300 (all 3 eligible), side pot 200 (seats 1&2)
  eq(pots.length, 2, 'two pots');
  eq(pots[0].amount, 300, 'main pot = 300');
  eq(pots[0].eligibleSeats.sort(), [0, 1, 2], 'main eligible all');
  eq(pots[1].amount, 200, 'side pot = 200');
  eq(pots[1].eligibleSeats.sort(), [1, 2], 'side eligible 1,2');
}
// Folded player's chips stay in pot but they can't win
{
  const game: any = { seats: {
    0: { committedTotal: 50, folded: true },
    1: { committedTotal: 100, folded: false },
    2: { committedTotal: 100, folded: false },
  }};
  const pots = buildPots(game);
  const total = pots.reduce((a, p) => a + p.amount, 0);
  eq(total, 250, 'total chips preserved incl folded');
  ok(!pots.some((p) => p.eligibleSeats.includes(0)), 'folded seat never eligible');
}

// ---- full hand flow (4 players) ----
console.log('hand flow:');
{
  const room: Room = {
    meta: { name: 't', hostId: 'a', createdAt: 0 },
    config: { initialChips: 1000, initialBB: 20, sbRatio: 0.5, handsPerLevel: 4, blindMultiplier: 2, maxPlayers: 4 },
    status: 'waiting',
    players: {
      0: { id: 'a', name: 'A', chips: 1000, connected: true, joinedAt: 0 },
      1: { id: 'b', name: 'B', chips: 1000, connected: true, joinedAt: 0 },
      2: { id: 'c', name: 'C', chips: 1000, connected: true, joinedAt: 0 },
      3: { id: 'd', name: 'D', chips: 1000, connected: true, joinedAt: 0 },
    } as any,
    game: null,
  };
  startHand(room);
  const g = room.game!;
  eq(g.sb, 10, 'sb=10'); eq(g.bb, 20, 'bb=20');
  eq(g.dealerSeat, 0, 'dealer seat 0');
  // SB=1, BB=2, UTG=3 acts first
  eq(g.toAct, 3, 'UTG (seat 3) acts first preflop');
  eq(g.seats[1].committedThisStreet, 10, 'SB posted 10');
  eq(g.seats[2].committedThisStreet, 20, 'BB posted 20');

  // Everyone folds to BB -> BB wins uncontested
  applyAction(room, 3, 'fold');
  applyAction(room, 0, 'fold');
  applyAction(room, 1, 'fold');
  ok(g.result !== null, 'hand resolved uncontested');
  eq(room.players[2].chips, 1010, 'BB wins SB+BB = +10 net (1000-20+30)'); // wait check below
}

// blind escalation check
{
  const room: Room = {
    meta: { name: 't', hostId: 'a', createdAt: 0 },
    config: { initialChips: 1000, initialBB: 20, sbRatio: 0.5, handsPerLevel: 2, blindMultiplier: 2, maxPlayers: 4 },
    status: 'waiting',
    players: {
      0: { id: 'a', name: 'A', chips: 1000, connected: true, joinedAt: 0 },
      1: { id: 'b', name: 'B', chips: 1000, connected: true, joinedAt: 0 },
    } as any,
    game: null,
  };
  // simulate handsPlayed via repeated quick hands (heads-up all fold)
  for (let i = 0; i < 2; i++) {
    startHand(room);
    const g = room.game!;
    // heads-up: dealer=SB acts first; SB folds -> BB wins
    applyAction(room, g.toAct!, 'fold');
  }
  startHand(room);
  eq(room.game!.bb, 40, 'BB doubled after 2 hands (level 1)');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
