import { useEffect, useState } from 'react';
import { Setup } from './components/Setup';
import { Home } from './components/Home';
import { Table } from './components/Table';
import { getStoredConfig, initFirebase, FirebaseConfig } from './firebase';

type View = 'loading' | 'setup' | 'home' | 'table';

export default function App() {
  const [view, setView] = useState<View>('loading');
  const [room, setRoom] = useState<{ id: string; seat: number } | null>(null);

  useEffect(() => {
    const cfg = getStoredConfig();
    if (!cfg) { setView('setup'); return; }
    initFirebase(cfg)
      .then(() => {
        // Restore an in-progress room after refresh.
        const saved = localStorage.getItem('holdem.room');
        if (saved) {
          try { setRoom(JSON.parse(saved)); setView('table'); return; } catch {}
        }
        setView('home');
      })
      .catch(() => setView('setup'));
  }, []);

  function connect(cfg: FirebaseConfig) {
    initFirebase(cfg).then(() => setView('home')).catch(() => setView('setup'));
  }

  function enter(id: string, seat: number) {
    const r = { id, seat };
    localStorage.setItem('holdem.room', JSON.stringify(r));
    setRoom(r);
    setView('table');
  }

  function leave() {
    localStorage.removeItem('holdem.room');
    setRoom(null);
    setView('home');
  }

  if (view === 'loading') return <div className="screen"><div className="panel"><p>불러오는 중…</p></div></div>;
  if (view === 'setup') return <Setup onDone={connect} />;
  if (view === 'table' && room) return <Table roomId={room.id} seat={room.seat} onLeave={leave} />;
  return <Home onEnter={enter} />;
}
