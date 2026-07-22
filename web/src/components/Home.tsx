import { useState } from 'react';
import { RoomConfig } from '../types';
import { createRoom, joinRoom, roomExists, getPlayerId, DEFAULT_CONFIG, MAX_PLAYERS } from '../game/actions';
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
        <div>
          <h1 className="brand">Nocturne</h1>
          <div className="brand-sub">Texas Hold'em · 4 players</div>
        </div>

        <div className="seg">
          <label className="seg-opt">
            <input type="radio" name="tab" checked={tab === 'create'} onChange={() => setTab('create')} />
            방 만들기
          </label>
          <label className="seg-opt">
            <input type="radio" name="tab" checked={tab === 'join'} onChange={() => setTab('join')} />
            참가하기
          </label>
        </div>

        <div className="field">
          <label>내 이름</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={12} placeholder="닉네임" />
        </div>

        {tab === 'create' ? (
          <>
            <div className="grid2">
              <div className="field">
                <label>초기 칩</label>
                <input className="input" type="number" value={cfg.initialChips}
                  onChange={(e) => setCfg({ ...cfg, initialChips: num(e.target.value, 100) })} />
              </div>
              <div className="field">
                <label>초기 BB</label>
                <input className="input" type="number" value={cfg.initialBB}
                  onChange={(e) => setCfg({ ...cfg, initialBB: num(e.target.value, 2) })} />
              </div>
              <div className="field">
                <label>BB 상승 주기 (핸드)</label>
                <input className="input" type="number" value={cfg.handsPerLevel}
                  onChange={(e) => setCfg({ ...cfg, handsPerLevel: num(e.target.value, 1) })} />
              </div>
              <div className="field">
                <label>BB 상승 배수</label>
                <input className="input" type="number" step="0.1" value={cfg.blindMultiplier}
                  onChange={(e) => setCfg({ ...cfg, blindMultiplier: Math.max(1.1, Number(e.target.value) || 2) })} />
              </div>
              <div className="field">
                <label>최대 인원 (2~{MAX_PLAYERS})</label>
                <input className="input" type="number" min={2} max={MAX_PLAYERS} value={cfg.maxPlayers}
                  onChange={(e) => setCfg({ ...cfg, maxPlayers: Math.max(2, Math.min(MAX_PLAYERS, num(e.target.value, 2))) })} />
              </div>
            </div>
            <p className="muted small">SB는 BB의 절반, 최대 {cfg.maxPlayers}인. {cfg.handsPerLevel}핸드마다 BB가 ×{cfg.blindMultiplier} 상승합니다.</p>
            <button className="btn btn-primary btn-block" disabled={busy} onClick={handleCreate}>방 만들기</button>
          </>
        ) : (
          <>
            <div className="field">
              <label>방 코드</label>
              <input className="input" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={5} placeholder="예: ABCDE" style={{ textTransform: 'uppercase' }} />
            </div>
            <button className="btn btn-primary btn-block" disabled={busy} onClick={handleJoin}>참가</button>
          </>
        )}

        {error && <div className="error">{error}</div>}
        <button className="btn btn-ghost" onClick={() => { clearConfig(); location.reload(); }}>Firebase 설정 변경</button>
      </div>
    </div>
  );
}
