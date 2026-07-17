import { Card, SUIT_SYMBOL, isRed } from '../poker/cards';

export function CardView({ card, hidden, small }: { card?: Card | null; hidden?: boolean; small?: boolean }) {
  const cls = `card${small ? ' card-sm' : ''}`;
  if (hidden || !card) {
    return <div className={`${cls} card-back`} aria-label="hidden card" />;
  }
  const rank = card[0] === 'T' ? '10' : card[0];
  return (
    <div className={`${cls} ${isRed(card) ? 'card-red' : 'card-black'}`}>
      <span className="card-rank">{rank}</span>
      <span className="card-suit">{SUIT_SYMBOL[card[1]]}</span>
    </div>
  );
}
