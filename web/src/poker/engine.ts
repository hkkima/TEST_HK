// Texas Hold'em game engine — pure functions that mutate a plain Room object.
// Designed to run inside a Firebase transaction so state transitions are atomic
// and deterministic. All four clients apply the same rules.

import { Card, freshDeck, shuffle } from './cards';
import { evaluate } from './evaluator';
import {
  Room, GameState, SeatState, ActionType, PotResult, HandResult, RoomConfig,
} from '../types';

// ---- seat / ring helpers ---------------------------------------------------

export function occupiedSeats(room: Room): number[] {
  return Object.keys(room.players || {})
    .map(Number)
    .filter((s) => !!room.players[s])
    .sort((a, b) => a - b);
}

function ring(game: GameState): number[] {
  return Object.keys(game.seats)
    .map(Number)
    .filter((s) => game.seats[s].inHand)
    .sort((a, b) => a - b);
}

function nextOccupied(seats: number[], from: number): number {
  const i = seats.indexOf(from);
  if (i === -1) return seats[0];
  return seats[(i + 1) % seats.length];
}

function seatNeedsToAct(game: GameState, seat: number): boolean {
  const s = game.seats[seat];
  if (!s.inHand || s.folded || s.allIn) return false;
  return !s.actedThisRound || s.committedThisStreet < game.currentBet;
}

// Next seat (clockwise, after `from`) that still needs to act; null if round done.
function nextToAct(game: GameState, from: number): number | null {
  const r = ring(game);
  if (r.length === 0) return null;
  const start = r.indexOf(from);
  const base = start === -1 ? 0 : start;
  for (let k = 1; k <= r.length; k++) {
    const seat = r[(base + k) % r.length];
    if (seatNeedsToAct(game, seat)) return seat;
  }
  return null;
}

function contenders(game: GameState): number[] {
  return ring(game).filter((s) => !game.seats[s].folded);
}

// ---- blinds ----------------------------------------------------------------

export function blindsForHand(config: RoomConfig, handsPlayed: number) {
  const level = Math.floor(handsPlayed / Math.max(1, config.handsPerLevel));
  let bb = config.initialBB;
  for (let i = 0; i < level; i++) bb = Math.round(bb * config.blindMultiplier);
  const sb = Math.max(1, Math.round(bb * config.sbRatio));
  return { level, bb, sb };
}

// ---- starting a hand -------------------------------------------------------

export function canStartHand(room: Room): boolean {
  const eligible = occupiedSeats(room).filter((s) => room.players[s].chips > 0);
  return eligible.length >= 2;
}

export function startHand(room: Room): void {
  const eligible = occupiedSeats(room).filter((s) => room.players[s].chips > 0);
  if (eligible.length < 2) throw new Error('칩이 있는 플레이어가 2명 이상 필요합니다.');

  const prev = room.game;
  const handsPlayed = prev ? prev.handsPlayed : 0;
  const handNumber = prev ? prev.handNumber + 1 : 1;
  const { level, bb, sb } = blindsForHand(room.config, handsPlayed);

  // Rotate dealer to next eligible seat.
  let dealerSeat: number;
  if (prev && eligible.includes(prev.dealerSeat)) {
    dealerSeat = nextOccupied(eligible, prev.dealerSeat);
  } else if (prev) {
    // previous dealer got eliminated — pick next in full occupied order
    const occ = occupiedSeats(room);
    let d = nextOccupied(occ, prev.dealerSeat);
    while (!eligible.includes(d)) d = nextOccupied(occ, d);
    dealerSeat = d;
  } else {
    dealerSeat = eligible[0];
  }

  const deck = shuffle(freshDeck());
  const seats: Record<number, SeatState> = {};
  for (const s of eligible) {
    const p = room.players[s];
    seats[s] = {
      playerId: p.id,
      name: p.name,
      chips: p.chips,
      hole: [deck.pop() as Card, deck.pop() as Card],
      committedThisStreet: 0,
      committedTotal: 0,
      folded: false,
      allIn: false,
      actedThisRound: false,
      inHand: true,
    };
  }

  const game: GameState = {
    handNumber,
    handsPlayed,
    level,
    sb,
    bb,
    dealerSeat,
    street: 'preflop',
    board: [],
    deck,
    pot: 0,
    currentBet: 0,
    minRaise: bb,
    toAct: null,
    seats,
    result: null,
    lastAction: '',
  };

  const heads = eligible.length === 2;
  let sbSeat: number;
  let bbSeat: number;
  if (heads) {
    sbSeat = dealerSeat;                 // dealer posts SB heads-up
    bbSeat = nextOccupied(eligible, dealerSeat);
  } else {
    sbSeat = nextOccupied(eligible, dealerSeat);
    bbSeat = nextOccupied(eligible, sbSeat);
  }

  postBlind(game, sbSeat, sb);
  postBlind(game, bbSeat, bb);
  game.currentBet = bb;
  game.minRaise = bb;
  // Blinds are forced — the posters still get to act voluntarily later.
  game.seats[sbSeat].actedThisRound = false;
  game.seats[bbSeat].actedThisRound = false;

  game.toAct = nextToAct(game, bbSeat);
  game.lastAction = `핸드 #${handNumber} 시작 · SB ${sb} / BB ${bb}`;
  room.game = game;
  room.status = 'playing';
}

function postBlind(game: GameState, seat: number, amount: number): void {
  const s = game.seats[seat];
  const pay = Math.min(amount, s.chips);
  s.chips -= pay;
  s.committedThisStreet += pay;
  s.committedTotal += pay;
  if (s.chips === 0) s.allIn = true;
}

// Firebase Realtime DB drops empty arrays (stores them as null) and may return
// arrays as objects. Rebuild them so the engine always sees real arrays.
export function normalizeGame(game: GameState | null): void {
  if (!game) return;
  const asArray = (v: any): any[] => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);
  game.board = asArray(game.board);
  game.deck = asArray(game.deck);
  for (const k of Object.keys(game.seats || {})) {
    const s = (game.seats as any)[k];
    if (s && s.hole && !Array.isArray(s.hole)) s.hole = Object.values(s.hole);
  }
}

// ---- applying an action ----------------------------------------------------

export function applyAction(room: Room, seat: number, action: ActionType, rawAmount = 0): void {
  const game = room.game;
  normalizeGame(game);
  if (!game) throw new Error('진행 중인 핸드가 없습니다.');
  if (game.result) throw new Error('핸드가 종료되었습니다.');
  if (game.toAct !== seat) throw new Error('당신의 차례가 아닙니다.');
  const s = game.seats[seat];
  if (!s || s.folded || s.allIn) throw new Error('행동할 수 없는 상태입니다.');

  const toCall = game.currentBet - s.committedThisStreet;

  switch (action) {
    case 'fold': {
      s.folded = true;
      s.actedThisRound = true;
      game.lastAction = `${s.name} 폴드`;
      break;
    }
    case 'check': {
      if (toCall > 0) throw new Error('체크할 수 없습니다. 콜 또는 폴드하세요.');
      s.actedThisRound = true;
      game.lastAction = `${s.name} 체크`;
      break;
    }
    case 'call': {
      if (toCall <= 0) throw new Error('콜할 금액이 없습니다.');
      const pay = Math.min(toCall, s.chips);
      commit(s, pay);
      s.actedThisRound = true;
      game.lastAction = `${s.name} 콜 ${pay}`;
      break;
    }
    case 'bet':
    case 'raise':
    case 'allin': {
      let targetCommit: number;
      if (action === 'allin') {
        targetCommit = s.committedThisStreet + s.chips;
      } else {
        // rawAmount is the total amount this player wants committed this street ("raise to").
        targetCommit = rawAmount;
        const maxCommit = s.committedThisStreet + s.chips;
        if (targetCommit > maxCommit) throw new Error('칩이 부족합니다.');
        const minTarget = game.currentBet + game.minRaise;
        // A non-all-in raise must reach at least currentBet + minRaise.
        if (targetCommit < minTarget && targetCommit < maxCommit) {
          throw new Error(`최소 ${minTarget}까지 올려야 합니다 (또는 올인).`);
        }
      }
      const raiseIncrement = targetCommit - game.currentBet;
      const pay = targetCommit - s.committedThisStreet;
      if (pay <= 0) throw new Error('유효하지 않은 금액입니다.');
      commit(s, pay);
      if (targetCommit > game.currentBet) {
        // Only a full raise resets the minimum-raise size.
        if (raiseIncrement >= game.minRaise) game.minRaise = raiseIncrement;
        game.currentBet = targetCommit;
      }
      s.actedThisRound = true;
      const verb = action === 'allin' ? '올인' : (game.board.length === 0 && action === 'bet' ? '벳' : '레이즈');
      game.lastAction = `${s.name} ${verb} ${targetCommit}${s.allIn ? ' (올인)' : ''}`;
      break;
    }
  }

  // Only one contender left → hand is over, no showdown needed.
  if (contenders(game).length === 1) {
    finishHand(room, true);
    return;
  }

  const next = nextToAct(game, seat);
  if (next !== null) {
    game.toAct = next;
  } else {
    closeBettingRound(room);
  }
}

function commit(s: SeatState, pay: number): void {
  s.chips -= pay;
  s.committedThisStreet += pay;
  s.committedTotal += pay;
  if (s.chips === 0) s.allIn = true;
}

// ---- street transitions ----------------------------------------------------

function closeBettingRound(room: Room): void {
  const game = room.game!;
  // Sweep this street's bets into the central pot.
  for (const seat of Object.keys(game.seats).map(Number)) {
    const s = game.seats[seat];
    game.pot += s.committedThisStreet;
    s.committedThisStreet = 0;
    s.actedThisRound = false;
  }
  game.currentBet = 0;
  game.minRaise = game.bb;

  if (contenders(game).length <= 1) {
    finishHand(room, true);
    return;
  }

  // Players still able to make betting decisions.
  const canAct = () => contenders(game).filter((s) => !game.seats[s].allIn).length;

  // Deal forward; if <2 players can act, run the board out to showdown.
  while (true) {
    if (game.street === 'preflop') {
      game.street = 'flop';
      game.board.push(game.deck.pop()!, game.deck.pop()!, game.deck.pop()!);
    } else if (game.street === 'flop') {
      game.street = 'turn';
      game.board.push(game.deck.pop()!);
    } else if (game.street === 'turn') {
      game.street = 'river';
      game.board.push(game.deck.pop()!);
    } else {
      finishHand(room, false);
      return;
    }
    if (canAct() >= 2) {
      game.toAct = nextToAct(game, game.dealerSeat);
      game.lastAction = streetLabel(game.street);
      return;
    }
    // else keep dealing (everyone all-in) — loop continues to river then showdown
  }
}

function streetLabel(street: string): string {
  return { flop: '플롭', turn: '턴', river: '리버' }[street] || street;
}

// ---- side pots + showdown --------------------------------------------------

export function buildPots(game: GameState): { amount: number; eligibleSeats: number[] }[] {
  const seatNums = Object.keys(game.seats).map(Number);
  const contribs = seatNums
    .map((s) => ({ seat: s, total: game.seats[s].committedTotal, folded: game.seats[s].folded }))
    .filter((c) => c.total > 0);

  const levels = [...new Set(contribs.map((c) => c.total))].sort((a, b) => a - b);
  const pots: { amount: number; eligibleSeats: number[] }[] = [];
  let prev = 0;
  let carry = 0;
  for (const level of levels) {
    const participants = contribs.filter((c) => c.total >= level);
    const amount = (level - prev) * participants.length + carry;
    carry = 0;
    const eligible = participants.filter((c) => !c.folded).map((c) => c.seat);
    if (eligible.length === 0) {
      carry = amount; // dead band — fold into next pot
    } else {
      pots.push({ amount, eligibleSeats: eligible });
    }
    prev = level;
  }
  if (carry > 0 && pots.length > 0) pots[0].amount += carry;
  return pots;
}

function finishHand(room: Room, uncontested: boolean): void {
  const game = room.game!;
  // Sweep any outstanding street bets (e.g. hand ended mid-street on a fold).
  for (const seat of Object.keys(game.seats).map(Number)) {
    const s = game.seats[seat];
    game.pot += s.committedThisStreet;
    s.committedThisStreet = 0;
  }

  const pots = buildPots(game);
  const results: PotResult[] = [];
  const reveal: Record<number, [Card, Card]> = {};

  if (uncontested) {
    const winner = contenders(game)[0];
    const total = pots.reduce((a, p) => a + p.amount, 0);
    game.seats[winner].chips += total;
    results.push({
      amount: total,
      eligibleSeats: [winner],
      winnerSeats: [winner],
      handName: '무無쇼다운',
    });
  } else {
    // Reveal all contenders' hole cards at showdown.
    for (const seat of contenders(game)) {
      reveal[seat] = game.seats[seat].hole!;
    }
    for (const pot of pots) {
      const scored = pot.eligibleSeats.map((seat) => ({
        seat,
        eval: evaluate([...game.board, ...(game.seats[seat].hole as Card[])]),
      }));
      const best = Math.max(...scored.map((x) => x.eval.score));
      const winners = scored.filter((x) => x.eval.score === best);
      const share = Math.floor(pot.amount / winners.length);
      let remainder = pot.amount - share * winners.length;
      // Odd chip goes to the first winner left of the dealer.
      const ordered = [...winners].sort((a, b) => a.seat - b.seat);
      for (const w of ordered) {
        let award = share;
        if (remainder > 0) { award += 1; remainder -= 1; }
        game.seats[w.seat].chips += award;
      }
      results.push({
        amount: pot.amount,
        eligibleSeats: pot.eligibleSeats,
        winnerSeats: winners.map((w) => w.seat),
        handName: winners[0].eval.name,
      });
    }
  }

  const summary = results
    .map((r) => r.winnerSeats.map((s) => game.seats[s].name).join(', ') + ` +${r.amount} (${r.handName})`)
    .join(' · ');

  const handResult: HandResult = { pots: results, reveal, summary };
  game.result = handResult;
  game.pot = 0;
  game.toAct = null;
  game.street = 'showdown';
  game.handsPlayed += 1;
  game.lastAction = '핸드 종료 · ' + summary;

  // Persist live chips back to the player registry.
  for (const seat of Object.keys(game.seats).map(Number)) {
    if (room.players[seat]) room.players[seat].chips = game.seats[seat].chips;
  }
}
