import { useState } from 'react';
import { RoomConfig } from '../types';
import { createRoom, joinRoom, roomExists, getPlayerId, DEFAULT_CONFIG } from '../game/actions';
import { clearConfig } from '../firebase';

export function Home({ onEnter }: { onEnter: (roomId: string, seat: number) => void }) {
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [name, setName] = useState(localStorage.getItem('holdem.name') || '');
  const [joinCode, setJoinCode] = useState('');
  const [cfg, setCfg] = useState<RoomConfig>(DEFAULT_CONFIG);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function num(v: string, min = 1): number {
    const n = Math.floor(Number(v));
    return isNaN(n) || n < min ? min : n;
  }

  async function handleCreate() {
    if (!name.trim()) return setError('이름을 입력하세요.');
    setBusy(true); setError('');
    try {
      localStorage.setItem('holdem.name', name.trim());
      const id = getPlayerId();
      const roomId = await createRoom(cfg, name.trim(), id);
      onEnter(roomId, 0);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally { setBusy(false); }
  }

  async function handleJoin() {
    if (!name.trim()) return setError('이름을 입력하세요.');
    const code = joinCode.trim().toUpperCase();
    if (!code) return setError('방 코드를 입력하세요.');
    setBusy(true); setError('');
    try {
      localStorage.setItem('holdem.name', name.trim());
      if (!(await roomExists(code))) throw new Error('방을 찾을 수 없습니다.');
      const seat = await joinRoom(code, name.trim(), getPlayerId());
      onEnter(code, seat);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally { setBusy(false); }
  }

  return (
    <div className="screen">
      <div className="panel">
        <h1>🃏 Texas Hold'em</h1>
        <div className="tabs">
          <button className={tab === 'create' ? 'tab active' : 'tab'} onClick={() => setTab('create')}>방 만들기</button>
          <button className={tab === 'join' ? 'tab active' : 'tab'} onClick={() => setTab('join')}>참가하기</button>
        </div>

        <label>내 이름
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={12} placeholder="닉네임" />
        </label>

        {tab === 'create' ? (
          <>
            <div className="grid2">
              <label>초기 칩
                <input type="number" value={cfg.initialChips}
                  onChange={(e) => setCfg({ ...cfg, initialChips: num(e.target.value, 100) })} />
              </label>
              <label>초기 BB
                <input type="number" value={cfg.initialBB}
                  onChange={(e) => setCfg({ ...cfg, initialBB: num(e.target.value, 2) })} />
              </label>
              <label>BB 상승 주기 (핸드)
                <input type="number" value={cfg.handsPerLevel}
                  onChange={(e) => setCfg({ ...cfg, handsPerLevel: num(e.target.value, 1) })} />
              </label>
              <label>BB 상승 배수
                <input type="number" step="0.1" value={cfg.blindMultiplier}
                  onChange={(e) => setCfg({ ...cfg, blindMultiplier: Math.max(1.1, Number(e.target.value) || 2) })} />
              </label>
            </div>
            <p className="muted small">SB는 BB의 절반, 최대 4인. {cfg.handsPerLevel}핸드마다 BB가 ×{cfg.blindMultiplier} 상승합니다.</p>
            <button className="btn primary" disabled={busy} onClick={handleCreate}>방 만들기</button>
          </>
        ) : (
          <>
            <label>방 코드
              <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={5} placeholder="예: ABCDE" style={{ textTransform: 'uppercase' }} />
            </label>
            <button className="btn primary" disabled={busy} onClick={handleJoin}>참가</button>
          </>
        )}

        {error && <div className="error">{error}</div>}
        <button className="btn link" onClick={() => { clearConfig(); location.reload(); }}>Firebase 설정 변경</button>
      </div>
    </div>
  );
}
