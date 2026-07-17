import { useEffect, useMemo, useRef, useState } from 'react';
import { Room, ActionType } from '../types';
import {
  subscribeRoom, startNewHand, doAction, addChips, leaveRoom,
  getPlayerId, markPresence, showFoldedHand,
} from '../game/actions';
import { canStartHand } from '../poker/engine';
import { CardView } from './CardView';
import { Controls } from './Controls';

const fmt = (n: number) => n.toLocaleString();

export function Table({ roomId, seat, onLeave }: { roomId: string; seat: number; onLeave: () => void }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Local-only: hide my own hole cards on screen so a neighbour can't peek.
  const [hideMyCards, setHideMyCards] = useState(() => localStorage.getItem('holdem.hideCards') === '1');
  const [flash, setFlash] = useState(false);
  const myId = getPlayerId();

  function toggleHideMyCards() {
    setHideMyCards((v) => {
      const next = !v;
      localStorage.setItem('holdem.hideCards', next ? '1' : '0');
      return next;
    });
  }

  useEffect(() => {
    const unsub = subscribeRoom(roomId, setRoom);
    markPresence(roomId, seat).catch(() => {});
    return () => unsub();
  }, [roomId, seat]);

  const game = room?.game || null;
  const isHost = room?.meta.hostId === myId;

  // All-in flash when someone shoves.
  const lastActionRef = useRef('');
  useEffect(() => {
    const la = game?.lastAction || '';
    if (la !== lastActionRef.current) {
      lastActionRef.current = la;
      if (la.includes('올인')) {
        setFlash(true);
        const t = setTimeout(() => setFlash(false), 760);
        return () => clearTimeout(t);
      }
    }
  }, [game?.lastAction]);

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
            <div>
              <h2>대기실</h2>
              <span className="muted small">방 코드</span> <b className="code">{roomId}</b>
            </div>
            <button className="btn btn-ghost" onClick={() => run(async () => { await leaveRoom(roomId, myId); onLeave(); })}>나가기</button>
          </div>
          <p className="muted small">친구에게 방 코드 <b className="code">{roomId}</b> 를 공유하세요. (최대 4명)</p>
          <div className="lobby-list">
            {seats.map((s) => (
              <div key={s} className={`lobby-player${!room.players[s].connected ? ' off' : ''}`}>
                <span className="dot" /> {room.players[s].name}
                {room.meta.hostId === room.players[s].id && <span className="badge gold">HOST</span>}
                <span className="chips amount">{fmt(room.players[s].chips)}</span>
              </div>
            ))}
          </div>
          <div className="config-summary">
            초기칩 <span className="amount">{fmt(room.config.initialChips)}</span> · 초기 BB <span className="amount">{room.config.initialBB}</span> ·
            {' '}{room.config.handsPerLevel}핸드마다 ×{room.config.blindMultiplier}
          </div>
          {isHost ? (
            <button className="btn btn-primary btn-block" disabled={busy || !canStartHand(room)}
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

  function SeatCard({ s, hero }: { s: number; hero?: boolean }) {
    const gs = g.seats[s];
    const isMe = s === seat;
    const isTurn = g.toAct === s;
    const dealer = g.dealerSeat === s;
    if (!gs) {
      const p = room!.players[s];
      return (
        <div className="seat is-folded">
          <div className="seat-avatar">{p?.name?.[0] || '?'}</div>
          <div className="seat-plate"><div className="seat-name">{p?.name}</div><div className="seat-stack amount muted">대기</div></div>
        </div>
      );
    }
    const publiclyVisible = !!reveal[s] || !!gs.showFold;
    const cardSize = hero ? 'lg' : 'sm';
    const renderHole = () => {
      if (!gs.inHand) return <div className="hole-empty">—</div>;
      if (isMe) {
        return (
          <>
            <CardView card={gs.hole?.[0]} hidden={hideMyCards} size={cardSize} />
            <CardView card={gs.hole?.[1]} hidden={hideMyCards} size={cardSize} />
          </>
        );
      }
      if (gs.folded && !gs.showFold) return <div className="hole-empty">—</div>;
      return (
        <>
          <CardView card={gs.hole?.[0]} hidden={!publiclyVisible} size={cardSize} />
          <CardView card={gs.hole?.[1]} hidden={!publiclyVisible} size={cardSize} />
        </>
      );
    };
    const seatCls = [
      'seat',
      isTurn && !g.result ? 'is-active' : '',
      gs.folded ? 'is-folded' : '',
      winners.has(s) ? 'is-winner' : '',
    ].filter(Boolean).join(' ');
    return (
      <div className={seatCls}>
        <div className="seat-tags">
          {gs.allIn && <span className="badge red">ALL-IN</span>}
          {gs.folded && <span className="badge">FOLD</span>}
        </div>
        <div className={`seat-cards${hero ? ' lg' : ''}`}>{renderHole()}</div>
        <div className="seat-avatar">
          {gs.name[0]}
          {dealer && <span className="dealer-btn" style={{ position: 'absolute', bottom: -3, right: -3 }}>D</span>}
        </div>
        <div className="seat-plate">
          <div className="seat-name">{gs.name}</div>
          <div className="seat-stack amount">{fmt(gs.chips)}</div>
        </div>
        {gs.committedThisStreet > 0 && (
          <div className="seat-bet"><span className="mini-chip" /><span className="amount">{fmt(gs.committedThisStreet)}</span></div>
        )}
        {isMe && gs.inHand && (
          <button className="btn-eye" onClick={toggleHideMyCards}
            title={hideMyCards ? '내 손패 보기' : '내 손패 가리기'}>
            {hideMyCards ? '🙈' : '👁'}
          </button>
        )}
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
        <div className="hand-info">
          <div className="line1">Hand {g.handNumber} · Level {g.level + 1}</div>
          <div>블라인드 <span className="amount">{fmt(g.sb)}/{fmt(g.bb)}</span></div>
        </div>
        <button className="btn btn-ghost" onClick={() => run(async () => { await leaveRoom(roomId, myId); onLeave(); })}>나가기</button>
      </div>

      <div className="opponents">
        {others.map((s) => <SeatCard key={s} s={s} />)}
      </div>

      <div className="board-area felt">
        <span className={`pot${g.result ? ' collect' : ''}`}>
          <span className="pot-label">Pot</span>
          <span className="amount">{fmt(totalPot)}</span>
        </span>
        <div className="board">
          {[0, 1, 2, 3, 4].map((i) => (
            <CardView key={i} card={(g.board || [])[i]} hidden={!(g.board || [])[i]} />
          ))}
        </div>
        <div className="last-action">{g.lastAction}</div>
        {g.result && (
          <div className="result-banner">
            <span className="win-label">Winner</span>
            {g.result.summary}
          </div>
        )}
      </div>

      <div className="my-area">
        <SeatCard s={seat} hero />
        {g.seats[seat]?.inHand && g.seats[seat]?.folded && (
          g.seats[seat]?.showFold
            ? <p className="muted small">내 패를 공개했습니다.</p>
            : <button className="btn btn-secondary" disabled={busy}
                onClick={() => run(() => showFoldedHand(roomId, seat))}>내 패 공개</button>
        )}
        {myTurn && <Controls game={g} seat={seat} onAction={act} busy={busy} />}
        {!myTurn && !g.result && <p className="turn-wait">
          {g.toAct !== null ? `${g.seats[g.toAct]?.name}님의 차례…` : '진행 중…'}
        </p>}
        {g.result && (
          <div className="control-row">
            {isHost ? (
              <button className="btn btn-primary" disabled={busy || !canStartHand(room)}
                onClick={() => run(() => startNewHand(roomId))}>다음 핸드</button>
            ) : <p className="muted">방장이 다음 핸드를 시작하길 기다리는 중…</p>}
            {room.players[seat] && room.players[seat].chips <= 0 && (
              <button className="btn btn-secondary" disabled={busy}
                onClick={() => run(() => addChips(roomId, seat, room.config.initialChips))}>
                리바이 (+{fmt(room.config.initialChips)})
              </button>
            )}
          </div>
        )}
      </div>

      {flash && <><div className="allin-flash" /><div className="allin-text">ALL&nbsp;IN</div></>}
      {error && <div className="error toast">{error}</div>}
    </div>
  );
}
