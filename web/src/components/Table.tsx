import { useEffect, useMemo, useRef, useState } from 'react';
import { Room, ActionType, GameState } from '../types';
import {
  subscribeRoom, startNewHand, doAction, addChips, leaveRoom,
  getPlayerId, markPresence, showFoldedHand, timeoutAction,
} from '../game/actions';
import { canStartHand } from '../poker/engine';
import { CardView } from './CardView';
import { Controls } from './Controls';

const fmt = (n: number) => n.toLocaleString();

// Opponent seats arranged on an ellipse's upper arc: left → top → right.
function polar(cx: number, cy: number, rx: number, ry: number, deg: number) {
  const r = (deg * Math.PI) / 180;
  return { left: cx + rx * Math.cos(r), top: cy + ry * Math.sin(r) };
}
function opponentPositions(m: number): { left: number; top: number }[] {
  const cx = 50, cy = 48, rx = 44, ry = 34;
  if (m <= 0) return [];
  if (m === 1) return [polar(cx, cy, rx, ry, 270)];
  const start = 200, end = 340; // left → over the top → right
  return Array.from({ length: m }, (_, i) =>
    polar(cx, cy, rx, ry, start + (end - start) * (i / (m - 1))));
}

export function Table({ roomId, seat, onLeave }: { roomId: string; seat: number; onLeave: () => void }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hideMyCards, setHideMyCards] = useState(() => localStorage.getItem('holdem.hideCards') === '1');
  const [flash, setFlash] = useState(false);
  const [, setTick] = useState(0);
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
  const timerSec = room?.config.actionTimerSec || 0;

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

  // Action-clock ticker: re-render for the countdown and fire the timeout.
  const lastTimeoutCall = useRef(0);
  useEffect(() => {
    if (!timerSec || !game || game.result || game.toAct === null || !game.deadline) return;
    const id = setInterval(() => {
      setTick((t) => t + 1);
      const g = room?.game;
      if (!g || g.result || g.toAct === null || !g.deadline) return;
      // The player on the clock enforces at the deadline; others after a grace
      // period (covers a disconnected player). Transaction keeps it single-shot.
      const grace = g.toAct === seat ? 0 : 2500;
      if (Date.now() >= g.deadline + grace && Date.now() - lastTimeoutCall.current > 1500) {
        lastTimeoutCall.current = Date.now();
        timeoutAction(roomId).catch(() => {});
      }
    }, 250);
    return () => clearInterval(id);
  }, [timerSec, game?.toAct, game?.deadline, game?.result, roomId, seat, room]);

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
          <p className="muted small">친구에게 방 코드 <b className="code">{roomId}</b> 를 공유하세요. (최대 {room.config.maxPlayers}명)</p>
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
            {timerSec ? ` · 제한 ${timerSec}초` : ' · 시간 무제한'}
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
  const g: GameState = game;
  const reveal = g.result?.reveal || {};
  const winners = new Set<number>();
  g.result?.pots.forEach((p) => p.winnerSeats.forEach((w) => winners.add(w)));

  const remainMs = g.deadline && !g.result ? Math.max(0, g.deadline - Date.now()) : 0;
  const timerFrac = timerSec ? Math.max(0, Math.min(1, remainMs / (timerSec * 1000))) : 0;

  function RingSeat({ s, pos }: { s: number; pos: { left: number; top: number } }) {
    const gs = g.seats[s];
    const isTurn = g.toAct === s && !g.result;
    const style = { left: `${pos.left}%`, top: `${pos.top}%` } as const;
    if (!gs) {
      const p = room!.players[s];
      return (
        <div className="ring-seat" style={style}>
          <div className="seat is-folded">
            <div className="seat-avatar">{p?.name?.[0] || '?'}</div>
            <div className="seat-plate"><div className="seat-name">{p?.name}</div><div className="seat-stack amount muted">대기</div></div>
          </div>
        </div>
      );
    }
    const publiclyVisible = !!reveal[s] || !!gs.showFold;
    const showFace = gs.inHand && (!gs.folded || gs.showFold);
    const seatCls = [
      'seat',
      isTurn ? 'is-active' : '',
      gs.folded ? 'is-folded' : '',
      winners.has(s) ? 'is-winner' : '',
    ].filter(Boolean).join(' ');
    return (
      <div className="ring-seat" style={style}>
        <div className={seatCls}>
          <div className="seat-tags">
            {gs.allIn && <span className="badge red">ALL-IN</span>}
            {gs.folded && <span className="badge">FOLD</span>}
          </div>
          <div className="seat-cards">
            {showFace ? (
              <>
                <CardView card={gs.hole?.[0]} hidden={!publiclyVisible} size="sm" />
                <CardView card={gs.hole?.[1]} hidden={!publiclyVisible} size="sm" />
              </>
            ) : gs.inHand ? <div className="hole-empty">—</div> : <div className="hole-empty muted small">대기</div>}
          </div>
          <div className="seat-avatar">
            {gs.name[0]}
            {g.dealerSeat === s && <span className="dealer-btn" style={{ position: 'absolute', bottom: -3, right: -3 }}>D</span>}
          </div>
          {isTurn && timerSec > 0 && (
            <div className="tbar"><i style={{ width: `${timerFrac * 100}%`, background: timerFrac < 0.25 ? 'var(--color-accent-2-400)' : 'var(--color-accent)' }} /></div>
          )}
          <div className="seat-plate">
            <div className="seat-name">{gs.name}</div>
            <div className="seat-stack amount">{fmt(gs.chips)}</div>
          </div>
          {gs.committedThisStreet > 0 && (
            <div className="seat-bet"><span className="mini-chip" /><span className="amount">{fmt(gs.committedThisStreet)}</span></div>
          )}
        </div>
      </div>
    );
  }

  const others = seats.filter((s) => s !== seat);
  const positions = opponentPositions(others.length);
  const me = g.seats[seat];
  const meInHand = me && me.inHand && !me.folded && !me.allIn;
  const myTurn = g.toAct === seat && !g.result && meInHand;
  const myCountdown = myTurn && timerSec > 0 ? Math.ceil(remainMs / 1000) : null;

  return (
    <div className="screen table-screen">
      <div className="table-header">
        <div className="hdr-left">
          <span>방 <b className="code">{roomId}</b></span>
          <span className="hand-info">
            <span className="line1">Hand {g.handNumber} · Lv {g.level + 1}{timerSec ? ` · ⏱${timerSec}s` : ''}</span>
            <span>블라인드 <span className="amount">{fmt(g.sb)}/{fmt(g.bb)}</span></span>
          </span>
        </div>
        <button className="btn btn-ghost" onClick={() => run(async () => { await leaveRoom(roomId, myId); onLeave(); })}>나가기</button>
      </div>

      <div className={`felt-wrap${others.length >= 6 ? ' crowded' : ''}`}>
        <div className="felt felt-oval" />

        <div className="center-stack">
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

        {others.map((s, i) => <RingSeat key={s} s={s} pos={positions[i]} />)}

        <div className="hero-dock">
          <div className="hero-cards">
            {me && me.inHand ? (
              <>
                <CardView card={me.hole?.[0]} hidden={hideMyCards} size="lg" />
                <CardView card={me.hole?.[1]} hidden={hideMyCards} size="lg" />
              </>
            ) : <div className="muted small">이번 핸드 미참여</div>}
          </div>

          <div className="hero-meta">
            <span className="hero-name">{me?.name ?? room.players[seat]?.name}
              {g.dealerSeat === seat && <span className="dealer-btn" style={{ marginLeft: 6 }}>D</span>}
            </span>
            <span className="seat-stack amount">{fmt(me?.chips ?? room.players[seat]?.chips ?? 0)}</span>
            {me?.allIn && <span className="badge red">ALL-IN</span>}
            {me?.folded && <span className="badge">FOLD</span>}
            {me?.inHand && (
              <button className="btn-eye" onClick={toggleHideMyCards}
                title={hideMyCards ? '내 손패 보기' : '내 손패 가리기'}>
                {hideMyCards ? '🙈' : '👁'}
              </button>
            )}
            {myCountdown !== null && <span className={`countdown${timerFrac < 0.25 ? ' low' : ''}`}>{myCountdown}s</span>}
          </div>

          {me?.inHand && me?.folded && (
            me?.showFold
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
      </div>

      {flash && <><div className="allin-flash" /><div className="allin-text">ALL&nbsp;IN</div></>}
      {error && <div className="error toast">{error}</div>}
    </div>
  );
}
