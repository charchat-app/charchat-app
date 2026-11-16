# CharChat 앱 — Claude Code 작업 규칙

이 파일은 세션마다 읽힌다. 규칙과 구조는 여기서 정한 것을 따르고, 임의로 바꾸지 않는다.

## 1. 기준 문서 (source of truth)

- 요구·인수 조건: `kickoff/epics/` (01 생성, 02 대화, 03 탐색·마이페이지·부가)
- 생성 상세: `kickoff/creation/`
- DB 초안: `kickoff/creation/schema-draft.sql` (운영 적용 전 초안)
- 병렬 개발 담당: `kickoff/design/creation-parallel-strategy.md`
- 목업(시각 참고용, 확정 설계 아님): `kickoff/exports/mobile-creation-mockup-v15.html`
- `kickoff/06-decisions.md`는 재확인 필요 자료다. 근거로 쓰기 전에 확인한다.

문서에서 **확정**과 **제안**(또는 미정)이 섞여 있다. 확정된 내용만 구현하고, 제안·미정은 구현 전에 질문한다.

## 2. 기술 스택

- Expo (SDK는 `package.json` 기준) + Expo Router + TypeScript (`strict`)
- 서버 상태: TanStack Query / 저장: AsyncStorage (토큰은 expo-secure-store)
- 한글 폰트는 `assets/fonts/`에 두고 expo-font로 로드
- 새 라이브러리 추가는 작업 전에 이유와 대안을 제시하고 승인받는다

## 3. 폴더 구조

```
app/                  Expo Router. 파일 = 라우트. 로직 금지, 조립만
components/ui/        디자인 시스템. 도메인 모름. features를 import 금지
features/
  story-setup/        1·5·6번 (기본 정보·캐릭터·태그, 프로필 프리셋, 이미지)
  story-scene/        2·3·4번 (말투·퓨샷, 인트로, 초기 상태·관계·호감도)
  story-publish/      7번 (저장·공개·수정). 저장 조각을 모아 한 번에 저장
  story-insight/      8~10번 (AI 분류·이용 리포트·등급). 착수 전까지 비움
  chat/               대화 (CHAT-US-01~12). 생성 완료 후 합류
  discover/           홈·검색·추천 (EXTRA-US-01, 02)
  billing/            요금·사용 내역 (EXTRA-US-03, 04)
  profile/            마이페이지: 이용자 개인 프로필 (CREATE-US-05 개인 원본).
                      계정·로그인·설정은 계정 설계 전까지 만들지 않음
shared/
  story-types/        스토리·캐릭터·인트로·말풍선 타입. 여기서만 정의
  media/              이미지 업로드 API·형식·5MB 검사 (story-setup 소유)
  rating/             콘텐츠 등급 상수·표시
constants/theme.ts    색상·간격·라운드·폰트 토큰
hooks/                앱 전역 훅
lib/                  api-client.ts, storage.ts
mocks/seed/           백엔드 전 개발용 시드 데이터
```

도메인 폴더 내부는 모두 같다: `components/`, `hooks/`, `api.ts`, `types.ts`, `index.ts`. 파일이 한 폴더에 10개를 넘으면 그때 하위 폴더를 만든다.

## 4. 경계 규칙

1. **도메인 간 연결은 `index.ts`로만.** 다른 도메인의 내부 파일을 직접 import하지 않는다.
2. **`components/ui`는 `features`를 import하지 않는다.** 표시만 하는 부품을 두고, 동작이 있는 부품은 도메인 `components/`에 둔다.
3. **story-setup과 story-scene은 저장 조각을 내보낸다.** `toDraftPatch()`, `fromDraft()`, 화면 컴포넌트만 `index.ts`에서 노출한다. 저장 로직은 story-publish에만 둔다.
4. **공유 타입은 `shared/story-types`에서만 정의.** 이 파일을 바꾸면 두 담당자가 모두 리뷰한다.
5. **`mocks/seed/`로 백엔드 없이 개발.** API가 준비되면 `api.ts`만 교체한다.
6. **목업에 없는 화면은 임의로 만들지 않는다.** 홈 콘텐츠, 대화 화면, 이용 현황은 설계 후 구현한다.

## 5. 코드 규칙

- `any` 금지 (불가피하면 이유를 주석으로 남김)
- 파일명: 컴포넌트는 `PascalCase.tsx`, 나머지는 `camelCase.ts`
- 컴포넌트는 함수 컴포넌트, 이름 있는 export (`app/` 라우트 파일은 default export)
- 스타일은 `StyleSheet.create`, 색상과 간격은 `constants/theme.ts` 토큰만 사용
- 화면에서 `fetch` 직접 호출 금지. `api.ts`를 거친다
- 모든 화면은 로딩, 빈 상태, 에러 상태를 처리한다
- 환경변수: 클라이언트에 노출할 값만 `EXPO_PUBLIC_` 접두사. 비밀키는 클라이언트에 넣지 않는다
- import는 `@/` 경로 별칭 사용

## 6. 작업 방식

- 이 문서는 구조와 코드 규칙을 정한다. 작업 방식, 테스트, 커밋, 브랜치·PR·이슈 정책은 `CONVENTIONS.md`를 따른다.
- 작업 요청 1건 = 스토리 1개(또는 인수 조건 묶음). 시작 전에 계획을 제시하고 승인을 받는다.
- 변경 범위는 요청한 기능 폴더 안으로 제한한다. 다른 도메인을 건드리면 이유를 밝히고 승인받는다.
- 커밋은 `<type>: <한글 요약>` 형식이다. 예: `feat: 인트로 말풍선 순서 변경 추가`. PR 제목은 `[KAN-12] 피처 — 요약` 형식이다.
- 작업 완료 시 `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`를 실행하고 결과를 보고한다.
- 완료 보고에는 변경 파일 목록과 각 변경 이유를 포함한다.
- 인수 조건을 충족했다고 말하려면 실제 실행 결과를 근거로 제시한다. 시드 데이터 테스트만으로 완료 처리하지 않는다.

## 7. 금지

- `main` 브랜치에 직접 커밋
- 비밀키를 클라이언트 코드에 넣기
- 계정·인증 구조를 임의로 만들기 (계정 모델 설계 전)
- 다른 담당자 폴더를 허락 없이 수정하기 (CODEOWNERS 참고)
