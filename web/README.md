# 🃏 Texas Hold'em — 4인 원격 웹앱

친구 4명이 원격에서 함께 즐기는 텍사스 홀덤. React + TypeScript + Vite 프론트엔드,
Firebase Realtime Database 실시간 동기화. 별도 서버 코드 없이 클라이언트 + Firebase만으로 동작합니다.

## 기능

- **최대 4인** 방 생성 / 코드로 참가
- 프리플롭 → 플롭 → 턴 → 리버 → 쇼다운 전체 진행
- 베팅: **체크 / 콜 / 벳 / 레이즈 / 폴드 / 올인** (팟 기준 빠른 베팅 버튼 포함)
- SB / BB 블라인드, 딜러 버튼 자동 로테이션 (헤즈업 규칙 포함)
- **사이드 팟** 자동 계산 (서로 다른 금액 올인 처리)
- 7장 중 최선 5장 **핸드 평가** (스트레이트 플러시 ~ 하이카드, 스플릿 팟·홀수 칩 처리)
- **BB 자동 상승**: 설정한 핸드 수마다 BB가 배수만큼 인상
- **초기 칩 / 초기 BB / 상승 주기 / 상승 배수** 방 생성 시 입력
- 새로고침 후 자동 재입장, 접속 상태 표시, 리바이

## 실행 (로컬)

```bash
cd web
npm install
npm run dev
```

## Firebase 설정 (필수)

1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트 생성
2. **빌드 → Realtime Database** 생성 (테스트 모드로 시작해도 됨)
3. **프로젝트 설정 → 내 앱 → 웹 앱(</>)** 등록 후 `firebaseConfig` 복사
4. 앱 첫 화면에 `firebaseConfig` 를 붙여넣으면 이 브라우저에 저장됨 (코드에 비밀키 미포함)

### 보안 규칙

`web/database.rules.json` 을 Realtime Database 규칙에 적용하세요 (익명 로그인 사용자만 접근):

```json
{ "rules": { "rooms": { "$roomId": { ".read": "auth != null", ".write": "auth != null" } } } }
```

Firebase 콘솔에서 **Authentication → 로그인 방법 → 익명** 을 활성화하세요.

## 배포 (GitHub Pages)

이 저장소는 `.github/workflows/deploy-pages.yml` 로 자동 배포됩니다.
저장소 **Settings → Pages → Source = GitHub Actions** 로 설정하면 push 시 빌드/배포됩니다.

- 배포 URL: `https://hkkima.github.io/TEST_HK/`
- 다른 경로/호스팅(예: Firebase Hosting)으로 배포할 땐 `VITE_BASE` 환경변수로 base 경로 지정:
  ```bash
  VITE_BASE=/ npm run build
  ```

## 신뢰 모델 (중요)

서버 코드 없이 클라이언트가 카드를 섞고 나눠주는 구조라, 이론상 개발자 도구로
DB를 열면 상대 홀 카드를 볼 수 있습니다. **친구들끼리 신뢰하는 게임** 용도로 설계되었습니다.
완전한 부정 방지가 필요하면 Firebase Cloud Functions로 딜링을 서버화하고 홀 카드 읽기 권한을
플레이어별로 제한하는 확장이 필요합니다.

## 구조

```
web/src/
  poker/
    cards.ts       카드/덱/셔플
    evaluator.ts   7장 핸드 평가
    engine.ts      게임 상태 머신 · 베팅 · 사이드팟 (순수 함수)
    engine.test.ts 검증 테스트 (npx tsx src/poker/engine.test.ts)
  game/actions.ts  Firebase 트랜잭션 기반 액션
  firebase.ts      Firebase 초기화 (런타임 config)
  components/       Setup · Home · Table · Controls · CardView
```
