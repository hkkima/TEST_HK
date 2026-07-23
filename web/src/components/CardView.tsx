import { Card, SUIT_SYMBOL, isRed } from '../poker/cards';

// Nocturne .pcard — a 5:7 flip card. Face-down shows the wine-and-gold back;
// .face-up flips to the engraved face. `dealt` plays the deal-in animation.
export function CardView({ card, hidden, size, dealt, delay }: {
  card?: Card | null;
  hidden?: boolean;
  size?: 'sm' | 'lg';
  dealt?: boolean;
  delay?: number;
}) {
  const faceUp = !hidden && !!card;
  const cls = [
    'pcard',
    size === 'sm' ? 'pcard-sm' : size === 'lg' ? 'pcard-lg' : '',
    faceUp ? 'face-up' : '',
    dealt ? 'dealt' : '',
  ].filter(Boolean).join(' ');
  const rank = card ? (card[0] === 'T' ? '10' : card[0]) : '';
  const suit = card ? SUIT_SYMBOL[card[1]] : '';
  return (
    <div className={cls} style={delay ? { animationDelay: `${delay}ms` } : undefined}>
      <div className="pcard-inner">
        <div className="pcard-back" />
        <div className={`pcard-face ${card && isRed(card) ? 'is-red' : 'is-black'}`}>
          {card && (
            <>
              <span className="pcard-corner">{rank}<span className="s">{suit}</span></span>
              <span className="pcard-center"><span className="pcard-rank">{rank}</span><span className="pcard-suit">{suit}</span></span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
