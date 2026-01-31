# Question Bridge 구현 계획서

## 프로젝트 목적
세상과 성경이 '같은 질문'을 하고 있다는 사실을 나중에 발견하게 만드는 사고의 구조를 UI로 구현

## 핵심 원칙
- 태그 기반 자동 매칭 ❌
- 주제 일치 기반 연결 ❌
- 강제적 연결 ❌
- **질문(Question)을 중심으로 한 느슨한 연결 구조** ⭕

## 데이터 구조

### 1. UpdateItem (뉴스) - 수정
```typescript
interface UpdateItem {
  id: string;
  type: 'news';
  title: string;
  subtitle: string;
  desc: string;
  image?: string;
  content: { id?: string; text: string; date?: string; keyword?: string }[];
  question: string; // 필수, 최대 120자
  tags: string[];
  createdAt?: any;
  // ... 기존 필드들
}
```

### 2. Memo (묵상) - 수정
```typescript
interface Memo {
  id: string;
  type: 'reflection';
  text: string;
  question: string; // 필수, 최대 120자
  tags?: string[];
  // ... 기존 필드들
}
```

### 3. ConceptCard (개념 카드) - 신규
```typescript
interface ConceptCard {
  id: string;
  type: 'concept';
  conceptName: string;       // 필수: 개념 이름
  conceptPhrase?: string;    // 선택: 개념을 설명하는 한 문장
  question: string;          // 필수: 이 개념이 붙잡고 있는 질문
  roles?: string[];          // 선택: 역할들
  snapshots?: {
    bible: string[];
    theology: string[];
    life: string[];
  };
  createdAt?: any;
  updatedAt?: any;
  userId: string;
}
```

## 구현 단계

### Phase 1: 데이터 구조 및 인터페이스 (오늘)
1. ✅ types/questionBridge.ts 생성 - 공통 타입 정의
2. ✅ ConceptCards.tsx 컴포넌트 생성
3. ✅ QuestionBridgeView.tsx - 연결된 질문 보기 컴포넌트

### Phase 2: 기존 컴포넌트 수정
1. RecentUpdates.tsx - 질문 입력 UI 추가
2. MyReflections.tsx - 질문 입력 UI 추가
3. App.tsx - 개념 카드 탭 추가

### Phase 3: 질문 연결 시스템
1. 질문 유사도 계산 (기본: 완전 매칭 + 부분 매칭)
2. "같은 질문을 품은 기록들" 섹션 구현

## UI 가이드

### 질문 입력 프롬프트
- 뉴스: "이 뉴스는 어떤 질문을 우리에게 던지고 있나요?"
- 개념: "이 개념이 계속 붙잡고 있는 질문은 무엇인가요?"
- 묵상: "이 묵상은 어떤 질문 앞에 머물고 있나요?"

### 출력 UI
각 카드에 ❓ 아이콘과 함께 질문 표시
→ 클릭 시 "같은 질문을 품은 기록들" 팝업
