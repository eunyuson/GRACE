// Question Bridge 타입 정의
// 모든 콘텐츠가 공유하는 질문 기반 연결 시스템

export type ContentType = 'news' | 'concept' | 'reflection';

// 모든 콘텐츠 타입이 공유하는 기본 필드
export interface QuestionBridgeBase {
    id: string;
    type: ContentType;
    question: string; // 필수, 최대 120자
    createdAt?: any;
    updatedAt?: any;
}

// 증거 아이템 인터페이스 (A-B 패널용)
export interface EvidenceItem {
    id: string;                          // 고유 ID
    sourceId: string;                    // 원본 문서 ID (update 또는 memo)
    sourceType: 'news' | 'reflection';   // 소스 타입
    title?: string;                      // 뉴스 제목 또는 묵상 부모 제목
    excerpt: string;                     // 발췌된 내용
    why?: string;                        // 왜 이것이 A 또는 B인지 설명
    confidence?: number;                 // AI 제안시 신뢰도 (0-1)
    pinned: boolean;                     // 사용자가 확정한 증거
    createdBy: 'ai' | 'manual';          // 생성 방식
    addedAt: any;                        // 추가된 시간
}

// A-B Bridge 데이터 (Legacy - 기존 호환용)
export interface BridgeData {
    aStatement?: string;                 // "우리는 보통 ___를 ___라고 생각합니다"
    bStatement?: string;                 // "그러나 성경에서 ___는 ___라기보다 ___입니다"
    aEvidence: EvidenceItem[];           // -A 증거들 (세상/오해)
    bEvidence: EvidenceItem[];           // ~B 증거들 (성경/재해석)
}

// ============================================
// Sequence Card (Insight Drawer) 시스템
// ============================================

// 시퀀스 아이템 (뉴스/묵상 연결)
export interface SequenceItem {
    sourceType: 'news' | 'reflection';   // 소스 타입
    sourceId: string;                    // 원본 문서 ID
    sourcePath?: string;                 // 전체 Firestore 경로 (서브컬렉션용, 예: users/uid/memos/id)
    pinned: boolean;                     // 사용자가 확정한 연결
    confidence?: number;                 // AI 추천 신뢰도 (0-1)
    addedAt: any;                        // 추가된 시간
}

// 반응 스니펫 (감정/오해/긴장)
export interface ResponseSnippet {
    id: string;                          // 고유 ID
    text: string;                        // 반응 텍스트 (짧게)
    pinned: boolean;                     // 사용자가 확정
    source: 'ai' | 'manual';             // 생성 방식
    status?: 'suggested' | 'selected' | 'rejected';  // AI 제안 상태
    createdAt: any;                      // 생성 시간
}

// AI 결론 제안
export interface AIConclusionSuggestion {
    id: string;
    text: string;                        // 결론 문장
    status: 'suggested' | 'selected' | 'rejected';
    createdAt: any;
}

// AI 묵상 추천
export interface AIScriptureSuggestion {
    reflectionId: string;                // 묵상 ID
    reason: string;                      // 추천 이유 (1줄)
    status: 'suggested' | 'pinned';      // 제안됨 / 핀됨
    similarity?: number;                 // 유사도 (0-1)
}

// 시퀀스 데이터 (4섹션 구조 + AI 제안)
export interface SequenceData {
    // 섹션1: RECENT (현실) - 뉴스
    recent: SequenceItem[];

    // 섹션2: RESPONSE (반응/오해)
    responses: ResponseSnippet[];
    aStatement?: string;                 // A문장: "우리는 보통 ___를 ___라고 생각합니다"

    // AI 반응 제안 (섹션2용)
    aiReactionSuggestions?: ResponseSnippet[];

    // AI 결론 제안 (섹션3용)
    aiConclusionSuggestions?: AIConclusionSuggestion[];

    // 섹션4: SCRIPTURE SUPPORT (말씀 근거) - 묵상
    scriptureSupport: SequenceItem[];

    // AI 묵상 추천 (섹션4용)
    aiScriptureSuggestions?: AIScriptureSuggestion[];
}

// 개념 카드 인터페이스
export interface ConceptCard extends QuestionBridgeBase {
    type: 'concept';
    conceptName: string;       // 필수: 개념 이름 (예: "주도권")
    conceptPhrase?: string;    // 선택: 개념을 설명하는 한 문장
    roles?: string[];          // 선택: 역할들 (예: ["방향 제시"])
    snapshots?: {
        bible: string[];
        theology: string[];
        life: string[];
    };

    // 섹션3: CONCLUSION (결론) - B문장
    conclusion?: string;       // "그러나 성경에서 ___는 ___라기보다 ___입니다"

    // Sequence Card 데이터 (4섹션)
    sequence?: SequenceData;

    // Legacy fields (deprecated)
    bridge?: BridgeData;
    worldEvidence?: EvidenceItem[];
    bibleEvidence?: EvidenceItem[];

    userId: string;
    userName?: string;
}

// 질문으로 연결된 아이템
export interface RelatedItem {
    id: string;
    type: ContentType;
    title: string;        // 뉴스 제목 / 개념 이름 / 묵상 부모 제목
    question: string;
    preview?: string;     // 짧은 미리보기
    createdAt?: any;
}

// 같은 질문을 품은 기록들 그룹
export interface QuestionGroup {
    question: string;
    items: RelatedItem[];
}

// 질문 유사도 결과
export interface SimilarityResult {
    item: RelatedItem;
    score: number; // 0-1
}

// Question Bridge 상수
export const QUESTION_MAX_LENGTH = 120;

// 질문 입력 프롬프트
export const QUESTION_PROMPTS = {
    news: {
        title: "이 뉴스가 던지는 질문",
        placeholder: "이 뉴스는 어떤 질문을 우리에게 던지고 있나요?",
        hint: "(의견이나 답을 쓰지 말고, 질문만 적어주세요)"
    },
    concept: {
        title: "이 개념이 붙잡고 있는 질문",
        placeholder: "이 개념이 계속 붙잡고 있는 질문은 무엇인가요?",
        hint: "(아직 정리되지 않아도 괜찮습니다)"
    },
    reflection: {
        title: "이 묵상이 붙잡고 있는 질문",
        placeholder: "이 묵상은 어떤 질문 앞에 머물고 있나요?",
        hint: "(깊이 생각한 질문을 한 문장으로 적어주세요)"
    }
} as const;

// 질문 유효성 검사
export const validateQuestion = (question: string): { valid: boolean; error?: string } => {
    if (!question || question.trim().length === 0) {
        return { valid: false, error: "질문을 입력해주세요" };
    }
    if (question.length > QUESTION_MAX_LENGTH) {
        return { valid: false, error: `질문은 ${QUESTION_MAX_LENGTH}자 이하로 입력해주세요` };
    }
    return { valid: true };
};

// 간단한 질문 유사도 계산 (키워드 기반)
export const calculateQuestionSimilarity = (q1: string, q2: string): number => {
    if (!q1 || !q2) return 0;

    // 정규화
    const normalize = (s: string) => s.toLowerCase().trim();
    const n1 = normalize(q1);
    const n2 = normalize(q2);

    // 완전 일치
    if (n1 === n2) return 1;

    // 핵심 키워드 추출 (조사, 어미 제거)
    const extractKeywords = (s: string): string[] => {
        // 한국어 조사/어미 패턴 제거
        const cleaned = s
            .replace(/[은는이가을를의에서로와과도만까지부터]$/g, '')
            .replace(/[?？!！.。,，]/g, '');

        return cleaned
            .split(/\s+/)
            .filter(w => w.length > 1);
    };

    const keywords1 = extractKeywords(n1);
    const keywords2 = extractKeywords(n2);

    if (keywords1.length === 0 || keywords2.length === 0) return 0;

    // Jaccard 유사도
    const set1 = new Set(keywords1);
    const set2 = new Set(keywords2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
};

// 유사한 질문들 찾기 (threshold 이상)
export const findSimilarQuestions = (
    targetQuestion: string,
    items: RelatedItem[],
    threshold: number = 0.3
): SimilarityResult[] => {
    return items
        .map(item => ({
            item,
            score: calculateQuestionSimilarity(targetQuestion, item.question)
        }))
        .filter(result => result.score >= threshold)
        .sort((a, b) => b.score - a.score);
};
