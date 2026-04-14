# SMS 발송 이슈 종합 분석 — 2026-04-14

> 4개 에이전트(Architect, Hacker, Contrarian, Fixer) 병렬 분석 결과 통합

---

## 배경

- MacroDroid(갤럭시 폰)가 SMS를 한 명씩 발송하는 구조
- PWA(브라우저)에서 발송 요청 → Supabase DB에 `pending` 기록 → MacroDroid 폴링 → 발송
- 5분 내에 MacroDroid가 처리 안 하면 브라우저 setTimeout → Solapi(유료) fallback

---

## 발생한 이벤트

### 이벤트 1 — 4월 12일: 187명 발송 (request: `cb1bfe09`)

| 필드 | 값 |
|------|-----|
| created_at | 2026-04-12 14:17:36 |
| dispatched_at | 2026-04-12 14:30:02 |
| sent_at / completed_at | 2026-04-12 14:31:19 |
| duration | 822초 (~13.7분) |
| status | `sent_via_macrodroid` |
| success_count | **null** |
| sms_delivery_results | **0건** |
| fallback_note | `보유 잔액이 부족하여 발송에 실패하였습니다. (prior status: processing)` |

**타임라인:**
```
14:17:36  요청 생성 (pending)
          MacroDroid 픽업 → next-receiver로 한 명씩 받아가며 발송
          → success_count가 1, 2, 3... 올라가는 것 확인
~14:22    Fallback 타이머(5분) 발동 → Solapi 호출 → 잔액 0원 → 실패
          → fallback_note에 잔액부족 에러 기록
14:30:02  dispatched_at 기록
14:31:19  MacroDroid /complete 호출 → sent_via_macrodroid
```

### 이벤트 2 — 4월 14일: 1명 발송 (request: `04f4abb3`)

MacroDroid 주기가 10분인데 fallback 타이머가 5분이라 MacroDroid보다 먼저 Solapi 발동 → 유료 발송됨.

---

## 핵심 진단 (Architect)

### "신뢰의 위치가 잘못되어 있다"

비즈니스 크리티컬한 결정(fallback 트리거, 상태 전이)을 신뢰할 수 없는 환경에 위임하는 것이 모든 문제의 근원.

```
현재 구조 (분산된 제어):

Browser (신뢰 불가)          MacroDroid (신뢰 불가)
    │ setTimeout 5분               │ 폴링 10분
    │ fallback 트리거              │ success_count 조작
    ▼                             ▼
[/api/sms/fallback]     [/api/sms/macrodroid/*]
    │                             │
    └─────────── Supabase ────────┘
                  (상태 보관만, 오케스트레이터 없음)

필요한 구조:

Browser                   MacroDroid
    │ 요청만                   │ 폴링만
    ▼                         ▼
[/api/sms] ──→ Supabase DB
                   │
           [Edge Function Cron]  ← 오케스트레이터 (서버 소유)
              - timeout 판단
              - fallback 트리거
              - 상태 전이 검증
```

---

## 확인된 버그 (Fixer — 즉시 수정 가능)

### Bug 1 — 타이머 불일치 (`src/app/sms/page.tsx:27`)

```typescript
// 현재 (잘못됨)
const FALLBACK_TIMEOUT_MS = 5 * 60 * 1000;    // 5분 — MacroDroid 10분 주기보다 짧음
const HARD_TIMEOUT_EXTRA_MS = 2 * 60 * 1000;  // total 7분

// 수정안
const FALLBACK_TIMEOUT_MS = 12 * 60 * 1000;   // 12분 — 10분 주기 + 여유 2분
const HARD_TIMEOUT_EXTRA_MS = 3 * 60 * 1000;  // total 15분
```

관련 주석(line 16-28, 97, 101)도 같이 수정 필요.

### Bug 2 — success_count null 덮어쓰기 (`complete/route.ts:131`)

```typescript
// 현재 (잘못됨)
{ success_count: successCountNum }  // null이면 187이 사라짐

// 수정안
...(successCountNum !== null && { success_count: successCountNum })

// + NaN 방어 추가
const successCountNum: number | null = (() => {
    if (typeof success_count === 'number' && isFinite(success_count)) return success_count;
    if (typeof success_count === 'string' && success_count !== '') {
        const parsed = parseInt(success_count, 10);
        return isFinite(parsed) ? parsed : null;
    }
    return null;
})();
```

### Bug 3 — fallback 실패 시 status guard 없음 (`fallback/route.ts:204`)

```typescript
// 현재 (잘못됨)
.eq('id', request_id)  // MacroDroid 완료 후에도 'failed'로 덮어쓸 수 있음

// 수정안
.eq('id', request_id)
.eq('status', 'fallback_in_progress')  // ← 이 한 줄 추가

// 성공 경로(line 212-224)에도 동일하게 추가 권장
```

---

## 숨겨진 실패 시나리오 (Hacker)

### 높음 심각도

| # | 시나리오 | 유형 |
|---|---------|------|
| **1-A** | `next-receiver`의 non-atomic SELECT+UPDATE → 같은 번호 두 번 반환 가능 | 중복 발송 |
| **1-B** | MacroDroid가 루프 진입 후 fallback이 선점 → 187명 × 2 = 374개 발송 가능 | 중복 발송 |
| **3-A** | 번호 반환 후 SMS 발송 실패 시 인덱스는 이미 증가 → 영구 누락 | 누락 발송 |
| **6-B** | `fallback_in_progress` 기록 후 서버 크래시 → 재트리거 주체 없음 → 영구 고착 | 발송 불가 |
| **8-C** | `/api/sms` POST에 인증 없음 → 스팸 발송 벡터 | 보안 취약 |
| **8-D** | 187명 × 3.2초 = 약 10분 > fallback 5분 → fallback이 선점, MacroDroid 중단 | 중복 발송 (운영 조건에서 발생 확실) |

### 중간 심각도

| # | 시나리오 | 유형 |
|---|---------|------|
| **2-A** | `next-receiver`의 UPDATE 실패 무시 → 같은 번호 무한 반환 루프 | 중복/무한루프 |
| **2-B** | fallback이 `fallback_in_progress`로 바꾼 순간 MacroDroid가 `DONE` 수신 | 조기 종료 누락 |
| **4-A** | MacroDroid 재시작 시 `processing` 상태 레코드 영구 무시 | 발송 불가 |
| **7-B** | fallback fetch 도중 탭 닫기 → `keepalive: true` 없어 중단 가능 | 고착 |
| **8-F** | 번호 포맷 검증 없음 (`010-1234-5678` vs `01012345678`) → 조용한 누락 | 누락 발송 |

### 구조적 결함

- **`success_count` pre-increment**: "번호를 건네줬다"는 시점에 증가 → "발송 완료"를 보장하지 않음
- **재개 메커니즘 없음**: MacroDroid가 중간에 종료되면 `processing` 상태로 고착, 재시작 시 재개 불가
- **8-A (연쇄 효과)**: `success_count`가 null로 기록 후 MacroDroid 재시도 시 `idx = 0`으로 리셋 → 전체 재발송 트리거

---

## 근본 가정에 대한 반론 (Contrarian)

### "14,000원을 아끼려고 수백 줄의 race condition 코드를 짰다"

| 가정 | 실제 |
|------|------|
| MacroDroid가 무료라 좋다 | LMS 187명 = 4,675원/회, 연 3회 = ~14,000원 vs 수백 줄 복잡도 |
| 이중 경로가 신뢰성을 높인다 | 실패 지점이 1개 → 7개로 증가 |
| 브라우저 타이머로 충분하다 | 폰이 꺼진 최악의 상황에 fallback도 같이 꺼짐 |
| success_count 하나로 충분하다 | 두 경로가 같은 필드를 다른 의미로 써서 덮어씌움 불가피 |

**가장 근본적인 비판:**
> 현재 시스템이 풀고 있는 문제: "MacroDroid와 Solapi race condition을 어떻게 막는가"
> 실제 문제: "아버지가 동창회 모임 전에 187명에게 안내 문자를 보내고 싶다"

**제안하는 최소 시스템:**
1. Supabase에 연락처 저장
2. 발송 버튼 → Solapi 직접 호출
3. 결과 표시

→ MacroDroid 경로, 폴링 큐, success_count 인덱스, fallback 타이머, race condition 코드 전부 삭제 가능

---

## 개선 로드맵 (Architect)

### 단계 1: 즉시 수정 (버그 3개, 각 1-2줄)

- `FALLBACK_TIMEOUT_MS` 5분 → 12분
- `success_count` null 스프레드 조건부
- fallback 실패 업데이트 status guard 추가

### 단계 2: 아키텍처 수정 (Supabase Edge Function 1개)

Supabase Edge Function cron으로 fallback 오케스트레이션을 서버로 이전:
```sql
-- 매 1분 실행
SELECT * FROM sms_requests
WHERE status = 'pending' AND created_at < NOW() - INTERVAL '12 minutes'
   OR status = 'processing' AND dispatched_at < NOW() - INTERVAL '15 minutes'
```
→ 브라우저 타이머는 UX 전용으로만 유지

### 단계 3: 구조 수정 (컬럼 추가)

`next_receiver_index` 컬럼 추가로 `success_count` 이중 역할 분리:
- `next_receiver_index`: MacroDroid가 다음에 받아갈 인덱스 (0→187)
- `success_count`: `/complete` 호출 시만 기록하는 실제 발송 건수

### 단계 4 (선택): 전면 재설계

Solapi 단일 경로 + Supabase Edge Function = 코드 1/5, 실패 지점 1개

---

## 우선순위 수정 목록

| 우선순위 | 파일 | 수정 내용 | 변경량 |
|---------|------|----------|--------|
| 🔴 즉시 | `src/app/sms/page.tsx:27` | fallback 타이머 12분으로 | 상수 2개 + 주석 |
| 🔴 즉시 | `fallback/route.ts:204` | `.eq('status', 'fallback_in_progress')` 추가 | 1줄 |
| 🔴 즉시 | `complete/route.ts:131` | null 시 success_count 유지 | 1줄 |
| 🟡 중요 | Supabase | Edge Function cron으로 fallback 트리거 이전 | 신규 |
| 🟡 중요 | `next-receiver/route.ts` | SELECT+UPDATE → atomic RPC 처리 | 리팩토링 |
| 🟡 중요 | DB migration | `next_receiver_index` 컬럼 분리 | 마이그레이션 |
| 🟡 중요 | `/api/sms/fallback` | fallback fetch에 `keepalive: true` 추가 | 1줄 |
| 🟢 보안 | `/api/sms` POST | 인증 추가 또는 RLS 설정 | 별도 검토 |

---

## 의문점 → 해결됨 (2026-04-15)

### DB 실측 타임라인 재확인 (cb1bfe09)

| 구간 | 시간 |
|---|---|
| created_at → dispatched_at (대기) | 12분 26초 |
| dispatched_at → completed_at (실제 발송) | **77초** |
| created_at → completed_at (전체) | **822초** (~13.7분) |

- "888초" 라고 알고 있던 수치는 `created_at → completed_at` 기준이었음
- 실제 발송은 **77초** (187명 ÷ 77s ≈ 2.4명/초)
- 12분 대기는 MacroDroid 10분 폴링을 방금 놓친 것

### 의문 1 — `dispatched_at`은 `/api/sms/macrodroid/pending`의 atomic claim 시 기록됨 ✅

### 의문 2 — 4/12 최종 status `sent_via_macrodroid`인 이유 ✅

```
14:17:36  pending 생성
~14:22    fallback 타이머(5분) → Solapi 호출 → 잔액 0 → 실패 → fallback_note 기록
14:30:02  MacroDroid 픽업 (status: processing)
14:31:19  187명 발송 완료 → sent_via_macrodroid
```
Solapi는 실패했지만 MacroDroid가 나중에 성공 → 최종 status는 sent_via_macrodroid.
race condition이 아니라 타이머 불일치(fallback 5분 < MacroDroid 10분)가 원인.

---

## 수정 완료 (2026-04-15)

| 항목 | 내용 |
|---|---|
| Solapi/fallback 전체 제거 | `fallback/route.ts` 삭제, 관련 타입/상태/코드 모두 제거 |
| `success_count` null 덮어쓰기 | `complete/route.ts` — null이면 spread 제외 |
| `next-receiver` 오류 무시 | `next-receiver/route.ts` — DB 실패 시 ERROR 반환 |
| `'sent'` 레거시 상태 처리 | `queries.ts` — SMS_SUCCESS_STATUSES에 추가 |
| PWA hard timeout | `page.tsx` — 20분 → **10분** |
| stale 레코드 정리 | `migrations/20260415000000_cleanup_stale_sms_requests.sql` |

**MacroDroid 앱 설정 (직접 변경 필요):** 폴링 타이머 10분 → 5분
