// Firebase Realtime Database operations. All state mutations that must be
// consistent across the 4 clients go through runTransaction on the room node,
// so simultaneous actions never corrupt the game.

import {
  ref, get, set, runTransaction, onValue, onDisconnect, update, Unsubscribe,
} from 'firebase/database';
import { getDb } from '../firebase';
import { Room, RoomConfig, ActionType } from '../types';
import { startHand, applyAction, occupiedSeats } from '../poker/engine';

// Hold'em seats 2 hole cards each + 5 board from a 52-card deck (no burns),
// so 9 players (2×9+5 = 23) is well within a single deck.
export const MAX_PLAYERS = 9;

export const DEFAULT_CONFIG: RoomConfig = {
  initialChips: 10000,
  initialBB: 100,
  sbRatio: 0.5,
  handsPerLevel: 6,
  blindMultiplier: 2,
  maxPlayers: 6,
};

export function makeId(len = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function getPlayerId(): string {
  let id = localStorage.getItem('holdem.playerId');
  if (!id) { id = makeId(10); localStorage.setItem('holdem.playerId', id); }
  return id;
}

function roomRef(roomId: string) {
  return ref(getDb(), `rooms/${roomId}`);
}

export async function createRoom(config: RoomConfig, hostName: string, hostId: string): Promise<string> {
  const roomId = makeId(5);
  const room: Room = {
    meta: { name: hostName + "님의 방", hostId, createdAt: Date.now() },
    config,
    status: 'waiting',
    players: {
      0: { id: hostId, name: hostName, chips: config.initialChips, connected: true, joinedAt: Date.now() },
    },
    game: null,
  };
  await set(roomRef(roomId), room);
  return roomId;
}

export async function joinRoom(roomId: string, name: string, playerId: string): Promise<number> {
  let assignedSeat = -1;
  await runTransaction(roomRef(roomId), (room: Room | null) => {
    if (!room) throw new Error('방을 찾을 수 없습니다.');
    if (!room.players) room.players = {} as any;
    // Already seated? (re-join / reconnect)
    for (const s of occupiedSeats(room)) {
      if (room.players[s].id === playerId) {
        room.players[s].name = name;
        room.players[s].connected = true;
        assignedSeat = s;
        return room;
      }
    }
    const occ = occupiedSeats(room);
    const cap = room.config.maxPlayers || DEFAULT_CONFIG.maxPlayers;
    if (occ.length >= cap) throw new Error(`방이 가득 찼습니다 (최대 ${cap}명).`);
    // Find first free seat.
    let seat = 0;
    while (room.players[seat]) seat++;
    room.players[seat] = {
      id: playerId, name,
      chips: room.config.initialChips,
      connected: true, joinedAt: Date.now(),
    };
    assignedSeat = seat;
    return room;
  });
  return assignedSeat;
}

export async function leaveRoom(roomId: string, playerId: string): Promise<void> {
  await runTransaction(roomRef(roomId), (room: Room | null) => {
    if (!room || !room.players) return room;
    for (const s of occupiedSeats(room)) {
      if (room.players[s].id === playerId) {
        // Can't remove mid-hand without breaking the pot; just mark folded/disconnected.
        if (room.status === 'playing' && room.game && room.game.seats && (room.game.seats as any)[s]) {
          room.players[s].connected = false;
        } else {
          delete (room.players as any)[s];
        }
      }
    }
    return room;
  });
}

export async function startNewHand(roomId: string): Promise<void> {
  await runTransaction(roomRef(roomId), (room: Room | null) => {
    if (!room) throw new Error('방을 찾을 수 없습니다.');
    startHand(room);
    return room;
  });
}

export async function doAction(
  roomId: string, seat: number, action: ActionType, amount = 0,
): Promise<void> {
  await runTransaction(roomRef(roomId), (room: Room | null) => {
    if (!room) throw new Error('방을 찾을 수 없습니다.');
    applyAction(room, seat, action, amount);
    return room;
  });
}

export async function addChips(roomId: string, seat: number, amount: number): Promise<void> {
  await runTransaction(roomRef(roomId), (room: Room | null) => {
    if (!room || !room.players || !room.players[seat]) return room;
    if (room.status === 'playing' && room.game && !room.game.result) {
      throw new Error('핸드 진행 중에는 칩을 추가할 수 없습니다.');
    }
    room.players[seat].chips += amount;
    return room;
  });
}

// Voluntarily reveal your own (folded) hole cards to everyone at the table.
export async function showFoldedHand(roomId: string, seat: number): Promise<void> {
  await update(ref(getDb(), `rooms/${roomId}/game/seats/${seat}`), { showFold: true });
}

export function subscribeRoom(roomId: string, cb: (room: Room | null) => void): Unsubscribe {
  return onValue(roomRef(roomId), (snap) => cb(snap.val()));
}

export async function roomExists(roomId: string): Promise<boolean> {
  const snap = await get(roomRef(roomId));
  return snap.exists();
}

// Mark a player connected and auto-mark disconnected when the tab closes.
export async function markPresence(roomId: string, seat: number): Promise<void> {
  const pRef = ref(getDb(), `rooms/${roomId}/players/${seat}/connected`);
  await update(ref(getDb(), `rooms/${roomId}/players/${seat}`), { connected: true });
  onDisconnect(pRef).set(false);
}
