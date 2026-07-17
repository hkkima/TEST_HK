import { useEffect, useMemo, useState } from 'react';
import { Room, ActionType } from '../types';
import {
  subscribeRoom, startNewHand, doAction, addChips, leaveRoom,
  getPlayerId, markPresence,
} from '../game/actions';
import { canStartHand } from '../poker/engine';
import { CardView } from './CardView';
import { Controls } from './Controls';

export function Table({ roomId, seat, onLeave }: { roomId: string; seat: number; onLeave: () => void }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const myId = getPlayerId();

  useEffect(() => {
    const unsub = subscribeRoom(roomId, setRoom);
    markPresence(roomId, seat).catch(() => {});
    return () => unsub();
  }, [roomId, seat]);

  const game = room?.game || null;
  const isHost = room?.meta.hostId === myId;

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError('');
    try { await fn(); } catch (e: any) { setError(e.message || String(e)); }
    finally { setBusy(false); }
  }

  const act = (a: ActionType, amount = 0) => run(() => doAction(roomId, seat, a, amount));

  const streetBets = useMemo(() => {
    if (!game) return 0;
    return Object.values(game.seats).reduce((a, s) => a + (s.committedThisStreet || 0), 0);
  }, [game]);

  if (!room) return <div className="screen"><div className="panel"><p>방을 불러오는 중…</p></div></div>;

  const seats = Object.keys(room.players || {}).map(Number).filter((s) => room.players[s]).sort((a, b) => a - b);
  const totalPot = (game?.pot || 0) + streetBets;

  // -------- Lobby (waiting) --------
  if (room.status === 'waiting' || !game) {
    return (
      <div className="screen">
        <div className="panel wide">
          <div className="room-head">
            <div><h2>대기실</h2><span className="muted">방 코드</span> <b className="code">{roomId}</b></div>
            <button className="btn link" onClick={() => run(async () => { await leaveRoom(roomId, myId); onLeave(); })}>나가기</button>
          </div>
          <p className="muted small">친구에게 방 코드 <b>{roomId}</b> 를 공유하세요. (최대 4명)</p>
          <div className="lobby-list">
            {seats.map((s) => (
              <div key={s} className={`lobby-player${!room.players[s].connected ? ' off' : ''}`}>
                <span className="dot" /> {room.players[s].name}
                {room.meta.hostId === room.players[s].id && <span className="badge">HOST</span>}
                <span className="chips">{room.players[s].chips.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="config-summary">
            초기칩 {room.config.initialChips.toLocaleString()} · 초기 BB {room.config.initialBB} ·
            {room.config.handsPerLevel}핸드마다 ×{room.config.blindMultiplier}
          </div>
          {isHost ? (
            <button className="btn primary" disabled={busy || !canStartHand(room)}
              onClick={() => run(() => startNewHand(roomId))}>
              {canStartHand(room) ? '게임 시작' : '2명 이상 필요'}
            </button>
          ) : <p className="muted">방장이 시작하기를 기다리는 중…</p>}
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    );
  }

  // -------- Game table --------
  const g = game;
  const reveal = g.result?.reveal || {};
  const winners = new Set<number>();
  g.result?.pots.forEach((p) => p.winnerSeats.forEach((w) => winners.add(w)));

  function SeatCard({ s }: { s: number }) {
    const gs = g.seats[s];
    const isMe = s === seat;
    const isTurn = g.toAct === s;
    const dealer = g.dealerSeat === s;
    if (!gs) {
      // seat exists in room but not in this hand (0 chips / joined late)
      const p = room!.players[s];
      return <div className="seat empty"><div className="seat-name">{p?.name}</div><div className="muted small">대기</div></div>;
    }
    const myHole = isMe ? gs.hole : (reveal[s] || null);
    const showCards = gs.inHand && !gs.folded;
    return (
      <div className={`seat${isMe ? ' me' : ''}${isTurn ? ' turn' : ''}${gs.folded ? ' folded' : ''}${winners.has(s) ? ' winner' : ''}`}>
        <div className="seat-top">
          <span className="seat-name">{gs.name}{dealer && <span className="btn-badge">D</span>}</span>
          {gs.allIn && <span className="badge red">ALL-IN</span>}
          {gs.folded && <span className="badge">FOLD</span>}
        </div>
        <div className="hole">
          {showCards ? (
            <>
              <CardView card={myHole?.[0]} hidden={!isMe && !reveal[s]} small />
              <CardView card={myHole?.[1]} hidden={!isMe && !reveal[s]} small />
            </>
          ) : <div className="hole-empty">—</div>}
        </div>
        <div className="seat-chips">{gs.chips.toLocaleString()}</div>
        {gs.committedThisStreet > 0 && <div className="seat-bet">벳 {gs.committedThisStreet}</div>}
      </div>
    );
  }

  const others = seats.filter((s) => s !== seat);
  const meInHand = g.seats[seat] && g.seats[seat].inHand && !g.seats[seat].folded && !g.seats[seat].allIn;
  const myTurn = g.toAct === seat && !g.result && meInHand;

  return (
    <div className="screen table-screen">
      <div className="table-header">
        <div>방 <b className="code">{roomId}</b></div>
        <div>핸드 #{g.handNumber} · 레벨 {g.level + 1} · SB {g.sb}/BB {g.bb}</div>
        <button className="btn link" onClick={() => run(async () => { await leaveRoom(roomId, myId); onLeave(); })}>나가기</button>
      </div>

      <div className="opponents">
        {others.map((s) => <SeatCard key={s} s={s} />)}
      </div>

      <div className="board-area">
        <div className="pot">POT <b>{totalPot.toLocaleString()}</b></div>
        <div className="board">
          {[0, 1, 2, 3, 4].map((i) => (
            <CardView key={i} card={(g.board || [])[i]} hidden={!(g.board || [])[i]} />
          ))}
        </div>
        <div className="last-action">{g.lastAction}</div>
        {g.result && <div className="result-banner">🏆 {g.result.summary}</div>}
      </div>

      <div className="my-area">
        <SeatCard s={seat} />
        {myTurn && <Controls game={g} seat={seat} onAction={act} busy={busy} />}
        {!myTurn && !g.result && <p className="muted turn-wait">
          {g.toAct !== null ? `${g.seats[g.toAct]?.name}님의 차례…` : '진행 중…'}
        </p>}
        {g.result && (
          <div className="control-row">
            {isHost ? (
              <button className="btn primary" disabled={busy || !canStartHand(room)}
                onClick={() => run(() => startNewHand(roomId))}>다음 핸드</button>
            ) : <p className="muted">방장이 다음 핸드를 시작하길 기다리는 중…</p>}
            {room.players[seat] && room.players[seat].chips <= 0 && (
              <button className="btn" disabled={busy}
                onClick={() => run(() => addChips(roomId, seat, room.config.initialChips))}>
                리바이 (+{room.config.initialChips.toLocaleString()})
              </button>
            )}
          </div>
        )}
      </div>

      {error && <div className="error toast">{error}</div>}
    </div>
  );
}
