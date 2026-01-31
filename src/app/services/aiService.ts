/**
 * AI Service Layer for Insight Flow
 * 
 * AI 사용 원칙:
 * - AI는 의미를 '결정'하지 않고, 사고를 '열어주는 도구'로만 사용
 * - 추천 + 초안 제안까지이며, 확정·핀·결론은 항상 사용자의 몫
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// Gemini API 초기화
const getGenAI = () => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
        console.warn('VITE_GEMINI_API_KEY not set. AI features will be disabled.');
        return null;
    }
    return new GoogleGenerativeAI(apiKey);
};

// ============================================
// AI 터치포인트 1: 뉴스 → 반응 스니펫 생성
// ============================================

interface ReactionSnippetResult {
    success: boolean;
    snippets: string[];
    error?: string;
}

/**
 * 뉴스 내용을 기반으로 사용자의 반응 스니펫 3개 생성
 * 
 * UX 규칙:
 * - 해석하지 말 것
 * - 성경 언어 사용 금지
 * - 감정 / 긴장 / 오해 중심
 * - "나는 이렇게 느낄 수도 있겠다" 수준
 */
export const generateReactionSnippets = async (
    newsTitle: string,
    newsContent: string,
    conceptName: string
): Promise<ReactionSnippetResult> => {
    const genAI = getGenAI();
    if (!genAI) {
        return { success: false, snippets: [], error: 'API key not configured' };
    }

    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `당신은 사람의 내면 반응을 언어로 꺼내주는 도우미입니다.

다음 뉴스를 읽은 사람이 "${conceptName}"라는 개념과 관련해서 느꼈을 법한 내면의 반응을 3개 생성하세요.

뉴스 제목: ${newsTitle}
뉴스 내용: ${newsContent}
관련 개념: ${conceptName}

규칙:
1. 해석하거나 분석하지 마세요
2. 성경 언어나 종교적 표현 사용 금지
3. 감정, 긴장, 불안, 오해 중심으로 작성
4. "나는 ~한 느낌이다" 또는 "~것 같다" 형식
5. 각 반응은 한 문장, 최대 30자 이내

반드시 아래 JSON 형식으로만 응답하세요:
{
  "reaction_snippets": [
    "첫 번째 반응",
    "두 번째 반응", 
    "세 번째 반응"
  ]
}`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        // JSON 파싱
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Failed to parse AI response');
        }

        const parsed = JSON.parse(jsonMatch[0]);
        return {
            success: true,
            snippets: parsed.reaction_snippets || []
        };
    } catch (error: any) {
        console.error('AI reaction generation error:', error);
        return {
            success: false,
            snippets: [],
            error: error.message
        };
    }
};

// ============================================
// AI 터치포인트 2: 반응 → 결론 후보 생성
// ============================================

interface ConclusionCandidateResult {
    success: boolean;
    candidates: string[];
    error?: string;
}

/**
 * 선택된 반응 스니펫을 기반으로 결론 후보 2-3개 생성
 * 
 * UX 규칙:
 * - "그러나 성경에서 ___는 ___라기보다 ___입니다" 구조 유지
 * - 완성형이 아니라 다듬을 여지가 있어야 함
 */
export const generateConclusionCandidates = async (
    selectedReactions: string[],
    conceptName: string,
    conceptQuestion: string
): Promise<ConclusionCandidateResult> => {
    const genAI = getGenAI();
    if (!genAI) {
        return { success: false, candidates: [], error: 'API key not configured' };
    }

    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `당신은 성경적 관점으로 사고를 열어주는 도우미입니다.

사용자가 "${conceptName}"에 대해 다음과 같은 반응을 보였습니다:
${selectedReactions.map((r, i) => `${i + 1}. ${r}`).join('\n')}

그리고 이 개념이 붙잡고 있는 질문은: "${conceptQuestion}"

이 반응들을 토대로, 성경에서 이 개념을 어떻게 다르게 볼 수 있는지 결론 후보 3개를 생성하세요.

규칙:
1. 반드시 "그러나 성경에서 ${conceptName}은(는) ___라기보다 ___입니다." 구조 사용
2. 사용자의 반응(오해/긴장)을 인정하면서 다른 관점 제시
3. 각 문장은 완성형이지만 수정 가능한 여지를 남김
4. 너무 추상적이지 않게, 구체적인 방향 제시

반드시 아래 JSON 형식으로만 응답하세요:
{
  "conclusion_candidates": [
    "그러나 성경에서 ${conceptName}은(는) ...라기보다 ...입니다.",
    "그러나 성경에서 ${conceptName}은(는) ...라기보다 ...입니다.",
    "그러나 성경에서 ${conceptName}은(는) ...라기보다 ...입니다."
  ]
}`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Failed to parse AI response');
        }

        const parsed = JSON.parse(jsonMatch[0]);
        return {
            success: true,
            candidates: parsed.conclusion_candidates || []
        };
    } catch (error: any) {
        console.error('AI conclusion generation error:', error);
        return {
            success: false,
            candidates: [],
            error: error.message
        };
    }
};

// ============================================
// AI 터치포인트 3: 결론 → 묵상 추천
// ============================================

interface ScriptureCandidate {
    reflectionId: string;
    reason: string;
    similarity: number;
}

interface ScriptureRecommendResult {
    success: boolean;
    candidates: ScriptureCandidate[];
    error?: string;
}

interface ReflectionForAI {
    id: string;
    content: string;
    bibleRef?: string;
    parentTitle?: string;
}

/**
 * 확정된 결론을 기반으로 연관 묵상 3개 추천
 * 
 * 추천 기준:
 * - 결론 문장과 묵상 텍스트의 의미 유사도
 * - 성경 본문 태그 (보조)
 * - 최근 작성된 묵상 우선
 */
export const recommendScriptures = async (
    conclusion: string,
    reflections: ReflectionForAI[]
): Promise<ScriptureRecommendResult> => {
    const genAI = getGenAI();
    if (!genAI) {
        return { success: false, candidates: [], error: 'API key not configured' };
    }

    if (reflections.length === 0) {
        return { success: true, candidates: [] };
    }

    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        // 최대 20개의 묵상만 분석 (토큰 제한)
        const limitedReflections = reflections.slice(0, 20);

        const prompt = `당신은 묵상과 결론 사이의 연관성을 찾아주는 도우미입니다.

다음 결론을 떠받치는 묵상 3개를 추천하세요:
결론: "${conclusion}"

묵상 목록:
${limitedReflections.map((r, i) =>
            `[${i}] ${r.bibleRef ? `(${r.bibleRef}) ` : ''}${r.content.substring(0, 150)}...`
        ).join('\n')}

규칙:
1. 결론의 핵심 주제와 의미적으로 연결되는 묵상 선택
2. 각 추천에 대해 왜 이 묵상이 결론을 떠받치는지 한 줄 이유 제시
3. 가장 관련성 높은 순서로 3개 선택

반드시 아래 JSON 형식으로만 응답하세요:
{
  "scripture_candidates": [
    {"index": 0, "reason": "마음의 보존이 인간의 통제가 아닌 주님의 역사로 이동"},
    {"index": 1, "reason": "일의 주체가 나가 아니라 하나님임을 전제"},
    {"index": 2, "reason": "주도권을 내려놓을 때 생기는 참된 평안"}
  ]
}`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Failed to parse AI response');
        }

        const parsed = JSON.parse(jsonMatch[0]);

        // 인덱스를 실제 ID로 변환
        const candidates: ScriptureCandidate[] = (parsed.scripture_candidates || [])
            .filter((c: any) => c.index >= 0 && c.index < limitedReflections.length)
            .map((c: any, i: number) => ({
                reflectionId: limitedReflections[c.index].id,
                reason: c.reason,
                similarity: 1 - (i * 0.1) // 순위 기반 유사도
            }));

        return {
            success: true,
            candidates
        };
    } catch (error: any) {
        console.error('AI scripture recommendation error:', error);
        return {
            success: false,
            candidates: [],
            error: error.message
        };
    }
};

// ============================================
// 유틸리티: AI 상태 체크
// ============================================

export const isAIEnabled = (): boolean => {
    return !!import.meta.env.VITE_GEMINI_API_KEY;
};
