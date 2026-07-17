import { Card } from './poker/cards';

export type Street = 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type RoomStatus = 'waiting' | 'playing' | 'finished';
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

export interface RoomConfig {
  initialChips: number;
  initialBB: number;
  sbRatio: number;          // small blind = round(bb * sbRatio), default 0.5
  handsPerLevel: number;    // increase blinds every N hands
  blindMultiplier: number;  // new BB = round(BB * multiplier)
  maxPlayers: number;       // fixed at 4
}

export interface PlayerRegistry {
  id: string;
  name: string;
  chips: number;
  connected: boolean;
  joinedAt: number;
}

export interface SeatState {
  playerId: string;
  name: string;
  chips: number;                 // live chips during the hand
  hole: [Card, Card] | null;
  committedThisStreet: number;
  committedTotal: number;        // total put in this whole hand (for side pots)
  folded: boolean;
  allIn: boolean;
  actedThisRound: boolean;
  inHand: boolean;               // dealt into this hand
  showFold?: boolean;            // player voluntarily revealed their folded hand
}

export interface PotResult {
  amount: number;
  eligibleSeats: number[];
  winnerSeats: number[];
  handName: string;
}

export interface HandResult {
  pots: PotResult[];
  reveal: Record<number, [Card, Card]>; // seat -> hole cards shown at showdown
  summary: string;
}

export interface GameState {
  handNumber: number;      // 1-based, current hand
  handsPlayed: number;     // completed hands (drives blind level)
  level: number;
  sb: number;
  bb: number;
  dealerSeat: number;
  street: Street;
  board: Card[];
  deck: Card[];            // remaining undealt cards
  pot: number;            // chips collected from completed streets
  currentBet: number;     // highest committedThisStreet this round
  minRaise: number;       // minimum raise increment
  toAct: number | null;   // seat index whose turn it is
  seats: Record<number, SeatState>;
  result: HandResult | null;
  lastAction: string;     // human readable, e.g. "Bob raised to 200"
}

export interface Room {
  meta: { name: string; hostId: string; createdAt: number };
  config: RoomConfig;
  status: RoomStatus;
  players: Record<number, PlayerRegistry>; // keyed by seat 0..3
  game: GameState | null;
}
