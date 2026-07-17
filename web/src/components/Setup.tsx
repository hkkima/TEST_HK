import { useState } from 'react';
import { FirebaseConfig, saveConfig } from '../firebase';

// One-time screen to paste the Firebase Web config. Stored only in this browser.
export function Setup({ onDone }: { onDone: (cfg: FirebaseConfig) => void }) {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState('');

  function parseConfig(text: string): FirebaseConfig | null {
    // Accept either a JSON object or a JS "const firebaseConfig = {...}" snippet.
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;
      // Turn JS object literal into JSON (quote keys, use double quotes).
      const jsonish = match[0]
        .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":')
        .replace(/'/g, '"')
        .replace(/,(\s*[}\]])/g, '$1');
      const obj = JSON.parse(jsonish);
      if (!obj.apiKey || !obj.projectId) return null;
      if (!obj.databaseURL) {
        obj.databaseURL = `https://${obj.projectId}-default-rtdb.firebaseio.com`;
      }
      return obj as FirebaseConfig;
    } catch {
      return null;
    }
  }

  function submit() {
    const cfg = parseConfig(raw);
    if (!cfg) {
      setError('설정을 파싱할 수 없습니다. Firebase 콘솔의 웹 앱 config 전체를 붙여넣어 주세요.');
      return;
    }
    saveConfig(cfg);
    onDone(cfg);
  }

  return (
    <div className="screen">
      <div className="panel">
        <h1>🃏 Texas Hold'em</h1>
        <p className="muted">4인 원격 텍사스 홀덤 · Firebase 실시간 동기화</p>
        <h2>Firebase 연결</h2>
        <ol className="steps">
          <li>Firebase 콘솔에서 프로젝트를 만들고 <b>Realtime Database</b>를 활성화하세요.</li>
          <li>프로젝트 설정 → 웹 앱 등록 후 <code>firebaseConfig</code> 객체를 복사하세요.</li>
          <li>아래에 붙여넣으세요. (이 브라우저에만 저장됩니다)</li>
        </ol>
        <textarea
          className="config-input"
          placeholder={`const firebaseConfig = {\n  apiKey: "...",\n  authDomain: "...",\n  databaseURL: "https://...firebaseio.com",\n  projectId: "...",\n  appId: "..."\n};`}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={10}
        />
        {error && <div className="error">{error}</div>}
        <button className="btn primary" onClick={submit}>연결</button>
      </div>
    </div>
  );
}
