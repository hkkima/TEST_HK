import { useEffect, useState } from 'react';
import { GameState, ActionType } from '../types';

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

  const [amount, setAmount] = useState(clampedMin);
  useEffect(() => { setAmount(clampedMin); }, [game.currentBet, game.minRaise, game.street, seat]);

  const canRaise = s.chips > toCall;   // can put more in than a call
  const canCheck = toCall <= 0;
  const callAmount = Math.min(toCall, s.chips);

  return (
    <div className="controls">
      <div className="control-row">
        <button className="btn danger" disabled={busy} onClick={() => onAction('fold')}>폴드</button>
        {canCheck ? (
          <button className="btn" disabled={busy} onClick={() => onAction('check')}>체크</button>
        ) : (
          <button className="btn" disabled={busy} onClick={() => onAction('call')}>
            콜 {callAmount}{callAmount >= s.chips ? ' (올인)' : ''}
          </button>
        )}
        {canRaise && (
          <button className="btn warn" disabled={busy}
            onClick={() => onAction(isBet ? 'bet' : 'raise', amount)}>
            {isBet ? '벳' : '레이즈'} {amount}{amount >= maxTo ? ' (올인)' : ''}
          </button>
        )}
        <button className="btn allin" disabled={busy} onClick={() => onAction('allin')}>올인 {maxTo}</button>
      </div>

      {canRaise && (
        <div className="control-row raise-row">
          <input type="range" min={clampedMin} max={maxTo} step={1}
            value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          <input type="number" min={clampedMin} max={maxTo}
            value={amount} onChange={(e) => setAmount(Math.max(clampedMin, Math.min(maxTo, Number(e.target.value))))} />
          <div className="quick">
            {[0.5, 0.75, 1].map((f) => {
              const target = Math.min(maxTo, Math.max(clampedMin, Math.round((game.pot + toCall) * f) + game.currentBet));
              return <button key={f} className="btn tiny" onClick={() => setAmount(target)}>
                {f === 1 ? '팟' : `${f * 100}%`}
              </button>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
