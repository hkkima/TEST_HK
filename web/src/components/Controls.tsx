import { useEffect, useState } from 'react';
import { GameState, ActionType } from '../types';

const fmt = (n: number) => n.toLocaleString();

// Nocturne action bar — fold / check / call outlined, raise the one gold fill.
export function Controls({ game, seat, onAction, busy }: {
  game: GameState;
  seat: number;
  onAction: (a: ActionType, amount?: number) => void;
  busy: boolean;
}) {
  const s = game.seats[seat];
  const toCall = game.currentBet - s.committedThisStreet;
  const isBet = game.currentBet === 0;            // no bet yet this street → "bet", else "raise"
  const minRaiseTo = isBet ? game.bb : game.currentBet + game.minRaise;
  const maxTo = s.committedThisStreet + s.chips;   // all-in total
  const clampedMin = Math.min(minRaiseTo, maxTo);
  const clamp = (n: number) => Math.max(clampedMin, Math.min(maxTo, n));

  // `amount` is the committed value; `text` is the raw input string so the user
  // can freely type (we only clamp on blur / submit, never per-keystroke — that
  // was the bug where the min value overwrote whatever you tried to type).
  const [amount, setAmount] = useState(clampedMin);
  const [text, setText] = useState(String(clampedMin));
  useEffect(() => {
    setAmount(clampedMin);
    setText(String(clampedMin));
  }, [game.currentBet, game.minRaise, game.street, seat]);

  const setBoth = (n: number) => { setAmount(n); setText(String(n)); };

  const canRaise = s.chips > toCall;   // can put more in than a call
  const canCheck = toCall <= 0;
  const callAmount = Math.min(toCall, s.chips);

  return (
    <div className="action-plate">
      <div className="action-bar">
        <button className="act act-fold" disabled={busy} onClick={() => onAction('fold')}>폴드</button>
        {canCheck ? (
          <button className="act act-check" disabled={busy} onClick={() => onAction('check')}>체크</button>
        ) : (
          <button className="act act-call" disabled={busy} onClick={() => onAction('call')}>
            콜 {fmt(callAmount)}{callAmount >= s.chips ? ' (올인)' : ''}
          </button>
        )}
        {canRaise && (
          <button className="act act-raise" disabled={busy}
            onClick={() => onAction(isBet ? 'bet' : 'raise', clamp(amount))}>
            {isBet ? '벳' : '레이즈'} {fmt(clamp(amount))}{clamp(amount) >= maxTo ? ' (올인)' : ''}
          </button>
        )}
        <button className="act act-check" disabled={busy} onClick={() => onAction('allin')}>
          올인 {fmt(maxTo)}
        </button>
      </div>

      {canRaise && (
        <div className="raise-row">
          <input type="range" className="bet-slider" min={clampedMin} max={maxTo} step={1}
            value={clamp(amount)} onChange={(e) => setBoth(Number(e.target.value))} aria-label="베팅 금액" />
          <input type="number" className="num" inputMode="numeric" min={clampedMin} max={maxTo}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const n = Number(e.target.value);
              if (e.target.value !== '' && !Number.isNaN(n)) setAmount(n); // store raw; clamp later
            }}
            onBlur={() => setBoth(clamp(Number(text) || clampedMin))} />
          <div className="quick">
            {[0.5, 0.75, 1].map((f) => {
              const target = Math.min(maxTo, Math.max(clampedMin, Math.round((game.pot + toCall) * f) + game.currentBet));
              return <button key={f} className="btn btn-ghost" onClick={() => setBoth(target)}>
                {f === 1 ? '팟' : `${f * 100}%`}
              </button>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
