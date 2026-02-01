'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Pin, PinOff, Plus, Edit3, ChevronRight, Book, MessageCircle, Lightbulb, Eye, EyeOff, Sparkles, Check, XCircle, Loader2, Search, Trash2 } from 'lucide-react';
import { collection, collectionGroup, doc, getDoc, getDocs, updateDoc, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { ConceptCard, SequenceItem, ResponseSnippet, SequenceData, AIConclusionSuggestion, AIScriptureSuggestion } from '../../types/questionBridge';
import { generateReactionSnippets, generateConclusionCandidates, recommendScriptures, isAIEnabled } from '../../services/aiService';

// 뉴스 아이템 타입 (RecentUpdates에서 가져옴)
interface NewsItem {
    id: string;
    title: string;
    subtitle?: string;
    content?: string;
    images?: string[];
    createdAt: any;
}

// 묵상 아이템 타입 (MyReflections에서 가져옴)
interface ReflectionItem {
    id: string;
    parentTitle?: string;
    content: string;
    text?: string; // 일부 묵상은 text 필드 사용
    bibleRef?: string;
    verse?: string;
    createdAt: any;
    imageUrl?: string; // 묵상 이미지
    parentImage?: string; // 부모(설교 등) 이미지
    _path?: string; // 문서 경로 (서브컬렉션 참조용)
}

interface InsightDrawerProps {
    concept: ConceptCard;
    isOpen: boolean;
    onClose: () => void;
    onUpdate: (updatedConcept: ConceptCard) => void;
    isNewMode?: boolean; // 새 카드 생성 모드
    onCreateNew?: (newConcept: ConceptCard) => Promise<ConceptCard | null>; // 새 카드 생성 콜백
}

export const InsightDrawer: React.FC<InsightDrawerProps> = ({
    concept,
    isOpen,
    onClose,
    onUpdate,
    isNewMode = false,
    onCreateNew
}) => {
    // 로컬 상태
    const [localConcept, setLocalConcept] = useState<ConceptCard>(concept);
    const [newsItems, setNewsItems] = useState<Map<string, NewsItem>>(new Map());
    const [reflectionItems, setReflectionItems] = useState<Map<string, ReflectionItem>>(new Map());
    const [allReflections, setAllReflections] = useState<ReflectionItem[]>([]);
    const [allNews, setAllNews] = useState<NewsItem[]>([]);
    const [newResponse, setNewResponse] = useState('');
    const [isAddingResponse, setIsAddingResponse] = useState(false);
    const [loading, setLoading] = useState(true);

    // 읽기/편집 모드: 새 카드 모드면 편집 모드로 시작, 아니면 읽기 모드로 시작
    const [isViewMode, setIsViewMode] = useState(!isNewMode);

    // 뉴스/묵상 선택 모달 상태
    const [showNewsPicker, setShowNewsPicker] = useState(false);
    const [showReflectionPicker, setShowReflectionPicker] = useState(false);
    const [newsSearchQuery, setNewsSearchQuery] = useState('');
    const [reflectionSearchQuery, setReflectionSearchQuery] = useState('');

    // AI 상태
    const [aiReactionsLoading, setAiReactionsLoading] = useState(false);
    const [aiConclusionsLoading, setAiConclusionsLoading] = useState(false);
    const [aiScripturesLoading, setAiScripturesLoading] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);

    // 시퀀스 초기화
    const getSequence = (): SequenceData => {
        return localConcept.sequence || {
            recent: [],
            responses: [],
            aStatement: '',
            scriptureSupport: [],
            aiReactionSuggestions: [],
            aiConclusionSuggestions: [],
            aiScriptureSuggestions: []
        };
    };

    // 연결된 뉴스/묵상 데이터 로드 + 전체 목록 로드
    useEffect(() => {
        const loadLinkedItems = async () => {
            setLoading(true);
            const sequence = getSequence();

            // 연결된 뉴스 로드
            const newsMap = new Map<string, NewsItem>();
            for (const item of sequence.recent) {
                if (item.sourceType === 'news') {
                    try {
                        const docRef = doc(db, 'updates', item.sourceId);
                        const docSnap = await getDoc(docRef);
                        if (docSnap.exists()) {
                            newsMap.set(item.sourceId, { id: item.sourceId, ...docSnap.data() } as NewsItem);
                        }
                    } catch (e) {
                        console.error('Error loading news:', e);
                    }
                }
            }
            setNewsItems(newsMap);

            // 연결된 묵상 로드
            const reflectionMap = new Map<string, ReflectionItem>();
            for (const item of sequence.scriptureSupport) {
                if (item.sourceType === 'reflection') {
                    try {
                        let docRef;
                        // sourcePath가 있으면 해당 경로 사용 (서브컬렉션 지원), 없으면 하위 호환성(memos 컬렉션)
                        if (item.sourcePath) {
                            docRef = doc(db, item.sourcePath);
                        } else {
                            docRef = doc(db, 'memos', item.sourceId);
                        }

                        const docSnap = await getDoc(docRef);
                        if (docSnap.exists()) {
                            reflectionMap.set(item.sourceId, { id: item.sourceId, ...docSnap.data() } as ReflectionItem);
                        }
                    } catch (e) {
                        console.error('Error loading reflection:', e);
                    }
                }
            }
            setReflectionItems(reflectionMap);

            setLoading(false);
        };

        // 전체 뉴스 목록 로드
        const loadAllNews = async () => {
            try {
                const q = query(collection(db, 'updates'), orderBy('createdAt', 'desc'), limit(50));
                const snapshot = await getDocs(q);
                const items = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                } as NewsItem));
                setAllNews(items);
            } catch (e) {
                console.error('Error loading all news:', e);
            }
        };

        // 전체 묵상 목록 로드 (collectionGroup으로 모든 서브컬렉션에서 가져오기)
        const loadAllReflections = async () => {
            try {
                // collectionGroup을 사용하여 모든 memos 서브컬렉션에서 가져오기
                // users/{uid}/memos, gallery/{id}/memos, updates/{id}/memos 등
                // 참고: Firebase 인덱스 없이 작동하도록 orderBy 제거, 클라이언트에서 정렬
                const q = query(collectionGroup(db, 'memos'), limit(200));
                const snapshot = await getDocs(q);
                const items = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        // text 또는 content 필드 지원
                        content: data.content || data.text || '',
                        imageUrl: data.imageUrl,
                        parentImage: data.parentImage,
                        _path: doc.ref.path
                    } as ReflectionItem;
                });

                // 클라이언트에서 createdAt 기준 내림차순 정렬
                items.sort((a, b) => {
                    const aTime = a.createdAt?.toDate?.() || new Date(0);
                    const bTime = b.createdAt?.toDate?.() || new Date(0);
                    return bTime.getTime() - aTime.getTime();
                });

                setAllReflections(items);
                console.log('[InsightDrawer] Loaded reflections:', items.length);
            } catch (e: any) {
                console.error('Error loading all reflections:', e);
                // 인덱스 오류 시 대체 방법 시도
                if (e.code === 'failed-precondition') {
                    console.warn('인덱스 오류. 대체 방법으로 시도합니다...');
                    try {
                        // 인덱스 없이도 가능한 단순 쿼리
                        const simpleQ = query(collectionGroup(db, 'memos'));
                        const snapshot = await getDocs(simpleQ);
                        const items = snapshot.docs.map(doc => {
                            const data = doc.data();
                            return {
                                id: doc.id,
                                ...data,
                                content: data.content || data.text || '',
                                imageUrl: data.imageUrl,
                                parentImage: data.parentImage,
                                _path: doc.ref.path
                            } as ReflectionItem;
                        });
                        items.sort((a, b) => {
                            const aTime = a.createdAt?.toDate?.() || new Date(0);
                            const bTime = b.createdAt?.toDate?.() || new Date(0);
                            return bTime.getTime() - aTime.getTime();
                        });
                        setAllReflections(items.slice(0, 100));
                        console.log('[InsightDrawer] Fallback loaded reflections:', items.length);
                    } catch (fallbackError) {
                        console.error('Fallback also failed:', fallbackError);
                    }
                }
            }
        };

        if (isOpen) {
            loadLinkedItems();
            loadAllNews();
            loadAllReflections();
        }
    }, [isOpen, localConcept.id]);

    // 뉴스 연결 추가
    const handleAddNewsLink = (newsId: string) => {
        const sequence = getSequence();

        // 이미 연결되어 있는지 확인
        if (sequence.recent.some(item => item.sourceId === newsId)) {
            return;
        }

        const newItem: SequenceItem = {
            sourceType: 'news',
            sourceId: newsId,
            pinned: false,
            confidence: 1.0,
            addedAt: Timestamp.now()
        };

        const updated = {
            ...localConcept,
            sequence: {
                ...sequence,
                recent: [...sequence.recent, newItem]
            }
        };

        // newsItems에도 추가
        const newsItem = allNews.find(n => n.id === newsId);
        if (newsItem) {
            setNewsItems(prev => new Map(prev).set(newsId, newsItem));
        }

        setLocalConcept(updated);
        saveToFirestore(updated);
        setShowNewsPicker(false);
        setNewsSearchQuery('');
    };

    // 뉴스 연결 해제
    const handleRemoveNewsLink = (newsId: string) => {
        const sequence = getSequence();
        const updated = {
            ...localConcept,
            sequence: {
                ...sequence,
                recent: sequence.recent.filter(item => item.sourceId !== newsId)
            }
        };
        setLocalConcept(updated);
        saveToFirestore(updated);
    };

    // 묵상 연결 추가
    const handleAddReflectionLink = (reflectionId: string) => {
        const sequence = getSequence();

        // 이미 연결되어 있는지 확인
        if (sequence.scriptureSupport.some(item => item.sourceId === reflectionId)) {
            return;
        }

        // path 찾기
        const reflectionItem = allReflections.find(r => r.id === reflectionId);

        const newItem: SequenceItem = {
            sourceType: 'reflection',
            sourceId: reflectionId,
            sourcePath: reflectionItem?._path || undefined, // 전체 경로 저장 (undefined 방지)
            pinned: false,
            confidence: 1.0,
            addedAt: Timestamp.now()
        };

        const updated = {
            ...localConcept,
            sequence: {
                ...sequence,
                scriptureSupport: [...sequence.scriptureSupport, newItem]
            }
        };

        // reflectionItems에도 추가
        if (reflectionItem) {
            setReflectionItems(prev => new Map(prev).set(reflectionId, reflectionItem));
        }

        setLocalConcept(updated);
        saveToFirestore(updated);
        setShowReflectionPicker(false);
        setReflectionSearchQuery('');
    };

    // 묵상 연결 해제
    const handleRemoveReflectionLink = (reflectionId: string) => {
        const sequence = getSequence();
        const updated = {
            ...localConcept,
            sequence: {
                ...sequence,
                scriptureSupport: sequence.scriptureSupport.filter(item => item.sourceId !== reflectionId)
            }
        };
        setLocalConcept(updated);
        saveToFirestore(updated);
    };

    // Firestore에 변경 저장
    const saveToFirestore = async (updatedConcept: ConceptCard) => {
        // 새 카드 모드(임시 ID)일 때는 Firestore 저장 건너뛰기
        // 최종 저장 버튼에서 onCreateNew로 저장함
        if (updatedConcept.id.startsWith('temp_')) {
            onUpdate(updatedConcept);
            return;
        }

        try {
            const docRef = doc(db, 'concepts', updatedConcept.id);
            await updateDoc(docRef, {
                conclusion: updatedConcept.conclusion,
                sequence: updatedConcept.sequence,
                updatedAt: Timestamp.now()
            });
            onUpdate(updatedConcept);
        } catch (e) {
            console.error('Error saving concept:', e);
        }
    };

    // 반응 추가
    const handleAddResponse = () => {
        if (!newResponse.trim()) return;

        const sequence = getSequence();
        const newSnippet: ResponseSnippet = {
            id: `resp_${Date.now()}`,
            text: newResponse.trim(),
            pinned: false,
            source: 'manual',
            createdAt: Timestamp.now()
        };

        const updated = {
            ...localConcept,
            sequence: {
                ...sequence,
                responses: [...(sequence.responses || []), newSnippet]
            }
        };

        setLocalConcept(updated);
        saveToFirestore(updated);
        setNewResponse('');
        setIsAddingResponse(false);
    };

    // 반응 핀 토글
    const handleToggleResponsePin = (responseId: string) => {
        const sequence = getSequence();
        const updated = {
            ...localConcept,
            sequence: {
                ...sequence,
                responses: sequence.responses.map(r =>
                    r.id === responseId ? { ...r, pinned: !r.pinned } : r
                )
            }
        };
        setLocalConcept(updated);
        saveToFirestore(updated);
    };

    // 반응 삭제
    const handleDeleteResponse = (responseId: string) => {
        const sequence = getSequence();
        const updated = {
            ...localConcept,
            sequence: {
                ...sequence,
                responses: sequence.responses.filter(r => r.id !== responseId)
            }
        };
        setLocalConcept(updated);
        saveToFirestore(updated);
    };

    // 시퀀스 아이템 핀 토글
    const handleToggleItemPin = (type: 'recent' | 'scripture', sourceId: string) => {
        const sequence = getSequence();
        const key = type === 'recent' ? 'recent' : 'scriptureSupport';
        const updated = {
            ...localConcept,
            sequence: {
                ...sequence,
                [key]: sequence[key].map(item =>
                    item.sourceId === sourceId ? { ...item, pinned: !item.pinned } : item
                )
            }
        };
        setLocalConcept(updated);
        saveToFirestore(updated);
    };

    // ============================================
    // AI 터치포인트 1: 뉴스 → 반응 스니펫 생성
    // ============================================
    const handleGenerateReactions = async () => {
        if (!isAIEnabled()) {
            setAiError('AI 기능이 비활성화되어 있습니다. API 키를 설정하세요.');
            return;
        }

        const seq = getSequence();
        if (seq.recent.length === 0) {
            setAiError('연결된 뉴스가 없습니다. 먼저 뉴스를 연결하세요.');
            return;
        }

        setAiReactionsLoading(true);
        setAiError(null);

        try {
            // 첫 번째 뉴스의 내용 사용
            const firstNews = newsItems.get(seq.recent[0].sourceId);
            if (!firstNews) throw new Error('뉴스 데이터를 찾을 수 없습니다.');

            const result = await generateReactionSnippets(
                firstNews.title,
                firstNews.content || firstNews.subtitle || '',
                localConcept.conceptName
            );

            if (result.success && result.snippets.length > 0) {
                const suggestions: ResponseSnippet[] = result.snippets.map((text, i) => ({
                    id: `ai_react_${Date.now()}_${i}`,
                    text,
                    pinned: false,
                    source: 'ai' as const,
                    status: 'suggested' as const,
                    createdAt: Timestamp.now()
                }));

                const updated = {
                    ...localConcept,
                    sequence: { ...seq, aiReactionSuggestions: suggestions }
                };
                setLocalConcept(updated);
                saveToFirestore(updated);
            } else {
                setAiError(result.error || 'AI 반응 생성 실패');
            }
        } catch (e: any) {
            setAiError(e.message);
        } finally {
            setAiReactionsLoading(false);
        }
    };

    // AI 반응 선택 (제안 → 확정)
    const handleSelectAIReaction = (snippetId: string) => {
        const seq = getSequence();
        const suggestion = seq.aiReactionSuggestions?.find(s => s.id === snippetId);
        if (!suggestion) return;

        // 확정된 반응으로 이동
        const confirmedSnippet: ResponseSnippet = {
            ...suggestion,
            status: 'selected',
            pinned: true
        };

        const updated = {
            ...localConcept,
            sequence: {
                ...seq,
                responses: [...seq.responses, confirmedSnippet],
                aiReactionSuggestions: seq.aiReactionSuggestions?.filter(s => s.id !== snippetId)
            }
        };
        setLocalConcept(updated);
        saveToFirestore(updated);
    };

    // AI 반응 제외
    const handleRejectAIReaction = (snippetId: string) => {
        const seq = getSequence();
        const updated = {
            ...localConcept,
            sequence: {
                ...seq,
                aiReactionSuggestions: seq.aiReactionSuggestions?.filter(s => s.id !== snippetId)
            }
        };
        setLocalConcept(updated);
        saveToFirestore(updated);
    };

    // ============================================
    // AI 터치포인트 2: 반응 → 결론 후보 생성
    // ============================================
    const handleGenerateConclusions = async () => {
        if (!isAIEnabled()) {
            setAiError('AI 기능이 비활성화되어 있습니다.');
            return;
        }

        const seq = getSequence();
        const selectedReactions = seq.responses.filter(r => r.pinned).map(r => r.text);

        if (selectedReactions.length === 0) {
            setAiError('먼저 반응을 선택(핀)하세요.');
            return;
        }

        setAiConclusionsLoading(true);
        setAiError(null);

        try {
            const result = await generateConclusionCandidates(
                selectedReactions,
                localConcept.conceptName,
                localConcept.question || ''
            );

            if (result.success && result.candidates.length > 0) {
                const suggestions: AIConclusionSuggestion[] = result.candidates.map((text, i) => ({
                    id: `ai_concl_${Date.now()}_${i}`,
                    text,
                    status: 'suggested' as const,
                    createdAt: Timestamp.now()
                }));

                const updated = {
                    ...localConcept,
                    sequence: { ...seq, aiConclusionSuggestions: suggestions }
                };
                setLocalConcept(updated);
                saveToFirestore(updated);
            } else {
                setAiError(result.error || 'AI 결론 생성 실패');
            }
        } catch (e: any) {
            setAiError(e.message);
        } finally {
            setAiConclusionsLoading(false);
        }
    };

    // AI 결론 선택 (확정)
    const handleSelectAIConclusion = (conclusionId: string) => {
        const seq = getSequence();
        const suggestion = seq.aiConclusionSuggestions?.find(c => c.id === conclusionId);
        if (!suggestion) return;

        const updated = {
            ...localConcept,
            conclusion: suggestion.text,
            sequence: {
                ...seq,
                aiConclusionSuggestions: seq.aiConclusionSuggestions?.map(c =>
                    c.id === conclusionId ? { ...c, status: 'selected' as const } : { ...c, status: 'rejected' as const }
                )
            }
        };
        setLocalConcept(updated);
        saveToFirestore(updated);

        // 결론 확정 후 자동으로 묵상 추천 시작
        setTimeout(() => handleGenerateScriptures(), 500);
    };

    // ============================================
    // AI 터치포인트 3: 결론 → 묵상 추천
    // ============================================
    const handleGenerateScriptures = async () => {
        if (!isAIEnabled()) return;
        if (!localConcept.conclusion) return;

        setAiScripturesLoading(true);
        setAiError(null);

        try {
            const result = await recommendScriptures(
                localConcept.conclusion,
                allReflections.map(r => ({
                    id: r.id,
                    content: r.content,
                    bibleRef: r.bibleRef,
                    parentTitle: r.parentTitle
                }))
            );

            if (result.success && result.candidates.length > 0) {
                const suggestions: AIScriptureSuggestion[] = result.candidates.map(c => ({
                    reflectionId: c.reflectionId,
                    reason: c.reason,
                    status: 'suggested' as const,
                    similarity: c.similarity
                }));

                const seq = getSequence();
                const updated = {
                    ...localConcept,
                    sequence: { ...seq, aiScriptureSuggestions: suggestions }
                };
                setLocalConcept(updated);
                saveToFirestore(updated);
            }
        } catch (e: any) {
            console.error('Scripture recommendation error:', e);
        } finally {
            setAiScripturesLoading(false);
        }
    };

    // AI 묵상 핀 확정
    const handlePinAIScripture = (reflectionId: string) => {
        const seq = getSequence();

        // scripture에 추가
        const newItem: SequenceItem = {
            sourceType: 'reflection',
            sourceId: reflectionId,
            pinned: true,
            confidence: 1.0,
            addedAt: Timestamp.now()
        };

        const updated = {
            ...localConcept,
            sequence: {
                ...seq,
                scriptureSupport: [...seq.scriptureSupport, newItem],
                aiScriptureSuggestions: seq.aiScriptureSuggestions?.filter(s => s.reflectionId !== reflectionId)
            }
        };
        setLocalConcept(updated);
        saveToFirestore(updated);
    };

    const sequence = getSequence();

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-[4000] bg-black/70 backdrop-blur-sm"
                    />

                    {/* Modal Panel (Centered) */}
                    <div className="fixed inset-0 z-[4001] flex items-center justify-center p-4 md:p-8 pointer-events-none">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="w-full max-w-5xl h-[90vh] bg-[#0F0F12] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col pointer-events-auto"
                        >
                            {/* Header - 고정 */}
                            <div className="flex-shrink-0 p-4 md:p-6 border-b border-white/10">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Lightbulb className="w-5 h-5 text-yellow-400" />
                                            {isViewMode ? (
                                                <h2 className="text-xl md:text-2xl font-bold text-white">
                                                    {localConcept.conceptName || '개념 이름'}
                                                </h2>
                                            ) : (
                                                <input
                                                    type="text"
                                                    value={localConcept.conceptName}
                                                    onChange={(e) => setLocalConcept(prev => ({ ...prev, conceptName: e.target.value }))}
                                                    placeholder="개념 이름을 입력하세요"
                                                    className="text-xl md:text-2xl font-bold text-white bg-transparent border-b border-white/30 focus:border-white/60 focus:outline-none placeholder-white/30 w-full"
                                                />
                                            )}
                                        </div>
                                        {isViewMode ? (
                                            <p className="text-sm text-white/60">
                                                {localConcept.question || '질문이 없습니다'}
                                            </p>
                                        ) : (
                                            <input
                                                type="text"
                                                value={localConcept.question}
                                                onChange={(e) => setLocalConcept(prev => ({ ...prev, question: e.target.value }))}
                                                placeholder="이 개념이 붙잡고 있는 질문은?"
                                                className="text-sm text-white/60 bg-transparent border-b border-white/20 focus:border-white/40 focus:outline-none placeholder-white/30 w-full"
                                            />
                                        )}
                                        <p className="text-xs text-white/40 mt-1 italic">
                                            정의/결론이 아니라 흐름
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {/* View/Edit Toggle */}
                                        <button
                                            onClick={() => setIsViewMode(!isViewMode)}
                                            className={`p-2 rounded-full transition-colors ${isViewMode ? 'bg-indigo-500/30 text-indigo-300' : 'bg-orange-500/30 text-orange-300'}`}
                                            title={isViewMode ? '편집 모드로 전환' : '읽기 모드로 전환'}
                                        >
                                            {isViewMode ? (
                                                <Edit3 className="w-5 h-5" />
                                            ) : (
                                                <Eye className="w-5 h-5" />
                                            )}
                                        </button>
                                        <button
                                            onClick={onClose}
                                            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                                        >
                                            <X className="w-5 h-5 text-white" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Scrollable Content */}
                            <div className="flex-1 overflow-y-auto">
                                {loading ? (
                                    <div className="flex items-center justify-center h-32 text-white/50">
                                        로딩 중...
                                    </div>
                                ) : isViewMode ? (
                                    /* ========== 읽기 모드: 스토리텔링 뷰 ========== */
                                    <div className="p-4 md:p-6 space-y-8">
                                        {/* A 문장: 세상의 관점 */}
                                        <section className="space-y-4">
                                            <div className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border border-orange-500/20 rounded-2xl p-5">
                                                <p className="text-lg text-white leading-relaxed">
                                                    <span className="text-white/60">"우리는 보통 </span>
                                                    <span className="text-orange-300 font-semibold">{localConcept.conceptName}</span>
                                                    <span className="text-white/60">를(을) </span>
                                                    {sequence.aStatement ? (
                                                        <span className="text-white font-medium">{sequence.aStatement}</span>
                                                    ) : (
                                                        <span className="text-white/40 italic">___</span>
                                                    )}
                                                    <span className="text-white/60">라고 생각합니다."</span>
                                                </p>
                                            </div>

                                            {/* 연결된 뉴스 표시 */}
                                            {sequence.recent.length > 0 && (
                                                <div className="space-y-3">
                                                    {sequence.recent.map((item) => {
                                                        const news = newsItems.get(item.sourceId);
                                                        if (!news) return null;

                                                        return (
                                                            <div
                                                                key={item.sourceId}
                                                                className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5"
                                                            >
                                                                {news.images?.[0] && (
                                                                    <div className="relative w-full h-48">
                                                                        <img
                                                                            src={news.images[0]}
                                                                            alt=""
                                                                            className="w-full h-full object-cover"
                                                                        />
                                                                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                                                                    </div>
                                                                )}
                                                                <div className={news.images?.[0] ? "absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black/80 to-transparent" : "p-6"}>
                                                                    <h4 className="text-xl md:text-2xl font-bold text-white mb-2 leading-tight">
                                                                        {news.title}
                                                                    </h4>
                                                                    {news.subtitle && (
                                                                        <p className="text-white/80 line-clamp-3 leading-relaxed">
                                                                            {news.subtitle}
                                                                        </p>
                                                                    )}
                                                                    {/* 내용이 있고 이미지가 없으면 내용을 좀 더 보여줌 */}
                                                                    {!news.images?.[0] && news.content && (
                                                                        <p className="text-white/60 text-sm mt-3 line-clamp-4 leading-relaxed">
                                                                            {news.content}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {/* 뉴스가 없을 때 안내 */}
                                            {sequence.recent.length === 0 && (
                                                <button
                                                    onClick={() => { setIsViewMode(false); setShowNewsPicker(true); }}
                                                    className="w-full py-4 text-center text-white/40 text-sm border border-dashed border-white/20 rounded-xl hover:bg-white/5 hover:border-white/30 transition-all"
                                                >
                                                    + 이 관점을 보여주는 뉴스 연결하기
                                                </button>
                                            )}
                                        </section>

                                        {/* B 문장: 성경의 관점 */}
                                        <section className="space-y-4">
                                            <div className="bg-gradient-to-br from-emerald-500/10 to-teal-600/5 border border-emerald-500/20 rounded-2xl p-5">
                                                <p className="text-lg text-white leading-relaxed">
                                                    <span className="text-white/60">"그러나 성경에서 </span>
                                                    <span className="text-emerald-300 font-semibold">{localConcept.conceptName}</span>
                                                    <span className="text-white/60">는(은) </span>
                                                    {localConcept.conclusion ? (
                                                        <span className="text-white font-medium">{localConcept.conclusion}</span>
                                                    ) : (
                                                        <span className="text-white/40 italic">___라기보다 ___입니다</span>
                                                    )}
                                                    <span className="text-white/60">."</span>
                                                </p>
                                            </div>

                                            {/* 연결된 묵상 표시 */}
                                            {sequence.scriptureSupport.length > 0 && (
                                                <div className="space-y-3">
                                                    {sequence.scriptureSupport.map((item) => {
                                                        const reflection = reflectionItems.get(item.sourceId);
                                                        if (!reflection) return null;

                                                        const displayContent = reflection.content || (reflection as any).text || '';

                                                        return (
                                                            <div
                                                                key={item.sourceId}
                                                                className="bg-gradient-to-br from-amber-500/10 to-yellow-600/5 border border-amber-500/20 rounded-2xl p-5"
                                                            >
                                                                {reflection.bibleRef && (
                                                                    <div className="flex items-center gap-2 mb-3">
                                                                        <Book className="w-4 h-4 text-amber-400" />
                                                                        <span className="text-amber-300 font-semibold text-sm">
                                                                            {reflection.bibleRef}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                {reflection.verse && (
                                                                    <p className="text-white/80 text-base italic mb-3 border-l-2 border-amber-500/30 pl-3">
                                                                        "{reflection.verse}"
                                                                    </p>
                                                                )}
                                                                {/* 이미지 표시 */}
                                                                {(reflection.imageUrl || reflection.parentImage) && (
                                                                    <div className="mt-3 mb-3 h-48 rounded-xl overflow-hidden relative">
                                                                        <img
                                                                            src={reflection.imageUrl || reflection.parentImage}
                                                                            alt=""
                                                                            className="w-full h-full object-cover"
                                                                        />
                                                                    </div>
                                                                )}
                                                                <p className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap">
                                                                    {displayContent}
                                                                </p>
                                                                {reflection.parentTitle && (
                                                                    <p className="text-white/40 text-xs mt-3 flex items-center gap-1">
                                                                        <span>From</span>
                                                                        <span className="text-amber-500/50">{reflection.parentTitle}</span>
                                                                    </p>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {/* 묵상이 없을 때 안내 */}
                                            {sequence.scriptureSupport.length === 0 && (
                                                <button
                                                    onClick={() => { setIsViewMode(false); setShowReflectionPicker(true); }}
                                                    className="w-full py-4 text-center text-white/40 text-sm border border-dashed border-white/20 rounded-xl hover:bg-white/5 hover:border-white/30 transition-all"
                                                >
                                                    + 이 결론을 뒷받침하는 묵상 연결하기
                                                </button>
                                            )}
                                        </section>

                                        {/* 편집 모드로 전환 안내 */}
                                        <div className="text-center py-4">
                                            <button
                                                onClick={() => setIsViewMode(false)}
                                                className="inline-flex items-center gap-2 px-4 py-2 text-sm text-white/50 hover:text-white/70 transition-colors"
                                            >
                                                <Edit3 className="w-4 h-4" />
                                                편집 모드로 전환
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    /* ========== 편집 모드: 기존 4 Sections ========== */
                                    <div className="p-4 md:p-6 space-y-6">

                                        {/* ========== Section 1: RECENT (현실) ========== */}
                                        <section className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 text-blue-400">
                                                    <Eye className="w-4 h-4" />
                                                    <h3 className="text-sm font-semibold uppercase tracking-wider">
                                                        RECENT — 내 눈에 들어온 장면
                                                    </h3>
                                                </div>
                                                <button
                                                    onClick={() => setShowNewsPicker(true)}
                                                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-500/20 text-blue-300 rounded-full hover:bg-blue-500/30 transition-colors"
                                                >
                                                    <Plus className="w-3 h-3" />
                                                    뉴스 연결
                                                </button>
                                            </div>

                                            {sequence.recent.length === 0 ? (
                                                <div
                                                    className="relative overflow-hidden rounded-2xl cursor-pointer transition-all group/empty hover:scale-[1.01]"
                                                    onClick={() => setShowNewsPicker(true)}
                                                >
                                                    {/* Gradient Background */}
                                                    <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 via-cyan-500/5 to-purple-600/10 opacity-50 group-hover/empty:opacity-100 transition-opacity" />
                                                    <div className="absolute inset-0 border border-dashed border-blue-400/30 group-hover/empty:border-blue-400/50 rounded-2xl transition-colors" />

                                                    {/* Animated dots background */}
                                                    <div className="absolute inset-0 opacity-20">
                                                        <div className="absolute top-4 left-4 w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                                                        <div className="absolute top-8 right-8 w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse delay-100" />
                                                        <div className="absolute bottom-6 left-12 w-1 h-1 rounded-full bg-purple-400 animate-pulse delay-200" />
                                                    </div>

                                                    {/* Content */}
                                                    <div className="relative py-12 px-6 text-center">
                                                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center group-hover/empty:scale-110 transition-transform">
                                                            <Plus className="w-8 h-8 text-blue-400" />
                                                        </div>
                                                        <h4 className="text-white/80 font-medium mb-1">뉴스를 연결하세요</h4>
                                                        <p className="text-sm text-white/40">최근 뉴스에서 마음에 와닿은 기사를 선택합니다</p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    {sequence.recent.map((item) => {
                                                        const news = newsItems.get(item.sourceId);
                                                        if (!news) return null;

                                                        return (
                                                            <div
                                                                key={item.sourceId}
                                                                className="relative overflow-hidden rounded-2xl border border-white/10 group hover:border-blue-400/30 transition-all"
                                                            >
                                                                {/* Full-width Image or Gradient Placeholder */}
                                                                <div className="relative w-full h-40">
                                                                    {news.images?.[0] ? (
                                                                        <>
                                                                            <img
                                                                                src={news.images[0]}
                                                                                alt=""
                                                                                className="w-full h-full object-cover"
                                                                            />
                                                                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                                                                        </>
                                                                    ) : (
                                                                        <div className="w-full h-full bg-gradient-to-br from-blue-600/30 via-cyan-500/20 to-purple-600/30" />
                                                                    )}

                                                                    {/* Action Buttons - Fixed position */}
                                                                    <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                        <button
                                                                            onClick={() => handleToggleItemPin('recent', item.sourceId)}
                                                                            className="p-2 rounded-full bg-black/60 backdrop-blur-sm hover:bg-black/80 transition-colors"
                                                                        >
                                                                            {item.pinned ? (
                                                                                <Pin className="w-3.5 h-3.5 text-yellow-400" />
                                                                            ) : (
                                                                                <PinOff className="w-3.5 h-3.5 text-white/70" />
                                                                            )}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleRemoveNewsLink(item.sourceId)}
                                                                            className="p-2 rounded-full bg-red-500/40 backdrop-blur-sm hover:bg-red-500/60 transition-colors"
                                                                        >
                                                                            <Trash2 className="w-3.5 h-3.5 text-white" />
                                                                        </button>
                                                                    </div>

                                                                    {/* Pinned Badge */}
                                                                    {item.pinned && (
                                                                        <div className="absolute top-3 left-3 px-2 py-1 rounded-full bg-yellow-500/20 backdrop-blur-sm text-yellow-300 text-xs font-medium flex items-center gap-1">
                                                                            <Pin className="w-3 h-3" /> 고정됨
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* Content - Overlaid on gradient */}
                                                                <div className="absolute bottom-0 left-0 right-0 p-4">
                                                                    <h4 className="text-base font-semibold text-white mb-1 line-clamp-2 drop-shadow-lg">
                                                                        {news.title}
                                                                    </h4>
                                                                    {news.subtitle && (
                                                                        <p className="text-sm text-white/70 line-clamp-1 drop-shadow">
                                                                            {news.subtitle}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </section>

                                        {/* ========== Section 2: RESPONSE (반응/오해) ========== */}
                                        <section className="space-y-3">
                                            <div className="flex items-center gap-2 text-purple-400">
                                                <MessageCircle className="w-4 h-4" />
                                                <h3 className="text-sm font-semibold uppercase tracking-wider">
                                                    RESPONSE — 내 안에서 일어난 반응
                                                </h3>
                                            </div>

                                            {/* Response Chips */}
                                            <div className="flex flex-wrap gap-2">
                                                {sequence.responses.map((resp) => (
                                                    <div
                                                        key={resp.id}
                                                        className={`group relative px-3 py-1.5 rounded-full text-sm transition-all ${resp.pinned
                                                            ? 'bg-purple-500/30 text-purple-200 border border-purple-500/50'
                                                            : 'bg-white/10 text-white/70 border border-white/10'
                                                            }`}
                                                    >
                                                        <span>{resp.text}</span>

                                                        {/* Actions on hover */}
                                                        <div className="absolute -top-1 -right-1 hidden group-hover:flex gap-1">
                                                            <button
                                                                onClick={() => handleToggleResponsePin(resp.id)}
                                                                className="p-1 rounded-full bg-purple-500/50 hover:bg-purple-500/70"
                                                            >
                                                                {resp.pinned ? (
                                                                    <PinOff className="w-3 h-3 text-white" />
                                                                ) : (
                                                                    <Pin className="w-3 h-3 text-white" />
                                                                )}
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteResponse(resp.id)}
                                                                className="p-1 rounded-full bg-red-500/50 hover:bg-red-500/70"
                                                            >
                                                                <X className="w-3 h-3 text-white" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}

                                                {/* Add Response Button */}
                                                {isAddingResponse ? (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            value={newResponse}
                                                            onChange={(e) => setNewResponse(e.target.value)}
                                                            onKeyDown={(e) => e.key === 'Enter' && handleAddResponse()}
                                                            placeholder="반응 입력..."
                                                            className="px-3 py-1.5 rounded-full text-sm bg-white/10 text-white border border-white/20 focus:border-purple-400 focus:outline-none w-40"
                                                            autoFocus
                                                        />
                                                        <button
                                                            onClick={handleAddResponse}
                                                            className="p-1.5 rounded-full bg-purple-500/50 hover:bg-purple-500/70"
                                                        >
                                                            <Plus className="w-4 h-4 text-white" />
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setIsAddingResponse(false);
                                                                setNewResponse('');
                                                            }}
                                                            className="p-1.5 rounded-full bg-white/10 hover:bg-white/20"
                                                        >
                                                            <X className="w-4 h-4 text-white/50" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => setIsAddingResponse(true)}
                                                        className="px-3 py-1.5 rounded-full text-sm bg-white/5 text-white/50 border border-dashed border-white/20 hover:bg-white/10 hover:text-white/70 transition-colors flex items-center gap-1"
                                                    >
                                                        <Plus className="w-3 h-3" /> 반응 추가
                                                    </button>
                                                )}
                                            </div>

                                            {/* A Statement - 바로 입력 가능, 전체 저장 시 저장됨 */}
                                            <div className="mt-4 p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-xl border border-purple-500/20">
                                                <span className="text-xs text-purple-300/70 font-medium block mb-2">A 문장 (세상의 관점)</span>
                                                <textarea
                                                    value={sequence.aStatement || ''}
                                                    onChange={(e) => {
                                                        const newValue = e.target.value;
                                                        setLocalConcept(prev => ({
                                                            ...prev,
                                                            sequence: {
                                                                ...getSequence(),
                                                                aStatement: newValue
                                                            }
                                                        }));
                                                    }}
                                                    placeholder="우리는 보통 ___를 ___라고 생각합니다."
                                                    className="w-full p-3 rounded-lg bg-white/10 text-white text-sm border border-purple-500/30 focus:border-purple-400 focus:outline-none resize-none"
                                                    rows={2}
                                                />
                                            </div>
                                        </section>

                                        {/* ========== Section 3: CONCLUSION (결론) ========== */}
                                        <section className="space-y-3">
                                            <div className="flex items-center gap-2 text-green-400">
                                                <Lightbulb className="w-4 h-4" />
                                                <h3 className="text-sm font-semibold uppercase tracking-wider">
                                                    CONCLUSION — 내가 붙잡게 된 결론
                                                </h3>
                                            </div>

                                            {/* B Statement - 바로 입력 가능, 전체 저장 시 저장됨 */}
                                            <div className="p-4 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-xl border border-green-500/20">
                                                <span className="text-xs text-green-300/70 font-medium block mb-2">B 문장 (성경의 관점)</span>
                                                <textarea
                                                    value={localConcept.conclusion || ''}
                                                    onChange={(e) => {
                                                        const newValue = e.target.value;
                                                        setLocalConcept(prev => ({
                                                            ...prev,
                                                            conclusion: newValue
                                                        }));
                                                    }}
                                                    placeholder="그러나 성경에서 ___는 ___라기보다 ___입니다."
                                                    className="w-full p-3 rounded-lg bg-white/10 text-white text-sm border border-green-500/30 focus:border-green-400 focus:outline-none resize-none"
                                                    rows={3}
                                                />
                                            </div>
                                        </section>

                                        {/* ========== Section 4: SCRIPTURE SUPPORT (말씀 근거) ========== */}
                                        <section className="space-y-3 pb-8">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 text-amber-400">
                                                    <Book className="w-4 h-4" />
                                                    <h3 className="text-sm font-semibold uppercase tracking-wider">
                                                        SCRIPTURE SUPPORT — 결론을 떠받치는 말씀
                                                    </h3>
                                                </div>
                                                <button
                                                    onClick={() => setShowReflectionPicker(true)}
                                                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-amber-500/20 text-amber-300 rounded-full hover:bg-amber-500/30 transition-colors"
                                                >
                                                    <Plus className="w-3 h-3" />
                                                    묵상 연결
                                                </button>
                                            </div>

                                            {sequence.scriptureSupport.length === 0 ? (
                                                <div
                                                    className="relative overflow-hidden rounded-2xl cursor-pointer transition-all group/empty hover:scale-[1.01]"
                                                    onClick={() => setShowReflectionPicker(true)}
                                                >
                                                    {/* Gradient Background */}
                                                    <div className="absolute inset-0 bg-gradient-to-br from-amber-600/10 via-orange-500/5 to-yellow-600/10 opacity-50 group-hover/empty:opacity-100 transition-opacity" />
                                                    <div className="absolute inset-0 border border-dashed border-amber-400/30 group-hover/empty:border-amber-400/50 rounded-2xl transition-colors" />

                                                    {/* Animated dots background */}
                                                    <div className="absolute inset-0 opacity-20">
                                                        <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                                        <div className="absolute top-8 left-8 w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse delay-100" />
                                                        <div className="absolute bottom-6 right-12 w-1 h-1 rounded-full bg-yellow-400 animate-pulse delay-200" />
                                                    </div>

                                                    {/* Content */}
                                                    <div className="relative py-12 px-6 text-center">
                                                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center group-hover/empty:scale-110 transition-transform">
                                                            <Book className="w-8 h-8 text-amber-400" />
                                                        </div>
                                                        <h4 className="text-white/80 font-medium mb-1">묵상을 연결하세요</h4>
                                                        <p className="text-sm text-white/40">나의 묵상 기록에서 결론을 뒷받침하는 말씀을 선택합니다</p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    {sequence.scriptureSupport.map((item) => {
                                                        const reflection = reflectionItems.get(item.sourceId);
                                                        if (!reflection) return null;

                                                        return (
                                                            <div
                                                                key={item.sourceId}
                                                                className="bg-white/5 rounded-xl p-4 border border-white/10 relative group"
                                                            >
                                                                {/* Action Buttons */}
                                                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <button
                                                                        onClick={() => handleToggleItemPin('scripture', item.sourceId)}
                                                                        className="p-1.5 rounded-full bg-black/50 hover:bg-black/70"
                                                                    >
                                                                        {item.pinned ? (
                                                                            <Pin className="w-3 h-3 text-yellow-400" />
                                                                        ) : (
                                                                            <PinOff className="w-3 h-3 text-white/50" />
                                                                        )}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleRemoveReflectionLink(item.sourceId)}
                                                                        className="p-1.5 rounded-full bg-red-500/30 hover:bg-red-500/50"
                                                                    >
                                                                        <Trash2 className="w-3 h-3 text-red-300" />
                                                                    </button>
                                                                </div>

                                                                {/* Bible Reference */}
                                                                {reflection.bibleRef && (
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-medium">
                                                                            {reflection.bibleRef}
                                                                        </span>
                                                                        {item.pinned && (
                                                                            <span className="text-xs text-yellow-400/70 flex items-center gap-1">
                                                                                <Pin className="w-3 h-3" /> 고정됨
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                )}

                                                                {/* Verse Quote */}
                                                                {reflection.verse && (
                                                                    <blockquote className="text-sm text-white/70 italic border-l-2 border-amber-500/50 pl-3 mb-2">
                                                                        "{reflection.verse}"
                                                                    </blockquote>
                                                                )}

                                                                {/* Reflection Content */}
                                                                {/* 이미지 표시 */}
                                                                {(reflection.imageUrl || reflection.parentImage) && (
                                                                    <div className="mt-2 mb-2 h-32 rounded-lg overflow-hidden relative">
                                                                        <img
                                                                            src={reflection.imageUrl || reflection.parentImage}
                                                                            alt=""
                                                                            className="w-full h-full object-cover"
                                                                        />
                                                                    </div>
                                                                )}
                                                                <p className="text-sm text-white/80 line-clamp-3 leading-relaxed whitespace-pre-wrap">
                                                                    {reflection.content}
                                                                </p>

                                                                {/* Parent Title */}
                                                                {reflection.parentTitle && (
                                                                    <p className="text-xs text-white/40 mt-2">
                                                                        출처: {reflection.parentTitle}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </section>

                                        {/* ========== 저장 & 읽기 모드 전환 버튼 ========== */}
                                        <div className="pt-4 pb-8 flex flex-col gap-3 border-t border-white/10">
                                            <button
                                                onClick={async () => {
                                                    // 유효성 검사
                                                    if (!localConcept.conceptName.trim()) {
                                                        alert('개념 이름을 입력해주세요');
                                                        return;
                                                    }
                                                    if (!localConcept.question.trim()) {
                                                        alert('질문을 입력해주세요');
                                                        return;
                                                    }

                                                    // 새 카드 생성 모드
                                                    if (isNewMode && onCreateNew && localConcept.id.startsWith('temp_')) {
                                                        const savedConcept = await onCreateNew(localConcept);
                                                        if (savedConcept) {
                                                            setLocalConcept(savedConcept);
                                                            setIsViewMode(true);
                                                        }
                                                    } else {
                                                        // 기존 카드 저장
                                                        saveToFirestore(localConcept);
                                                        setIsViewMode(true);
                                                    }
                                                }}
                                                className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                                            >
                                                <Check className="w-5 h-5" />
                                                {isNewMode && localConcept.id.startsWith('temp_') ? '새 카드 저장' : '저장 완료'}
                                            </button>
                                            <button
                                                onClick={() => setIsViewMode(true)}
                                                className="w-full py-2.5 text-white/50 hover:text-white/70 transition-colors flex items-center justify-center gap-2"
                                            >
                                                <Eye className="w-4 h-4" />
                                                읽기 모드로 보기
                                            </button>
                                        </div>

                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                </>
            )}

            {/* ========== News Picker Modal ========== */}
            {showNewsPicker && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[5000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setShowNewsPicker(false)}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-gradient-to-br from-[#1a1a2e] to-[#16213e] rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden border border-white/10 shadow-2xl"
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-white/10">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Eye className="w-5 h-5 text-blue-400" />
                                    뉴스 연결하기
                                </h3>
                                <button
                                    onClick={() => setShowNewsPicker(false)}
                                    className="p-1.5 rounded-full bg-white/10 hover:bg-white/20"
                                >
                                    <X className="w-4 h-4 text-white" />
                                </button>
                            </div>
                            {/* Search */}
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                                <input
                                    type="text"
                                    value={newsSearchQuery}
                                    onChange={(e) => setNewsSearchQuery(e.target.value)}
                                    placeholder="뉴스 검색..."
                                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-blue-500/50"
                                />
                            </div>
                        </div>

                        {/* News List */}
                        <div className="p-4 overflow-y-auto max-h-[60vh] space-y-2">
                            {allNews
                                .filter(news =>
                                    !sequence.recent.some(r => r.sourceId === news.id) &&
                                    (newsSearchQuery === '' ||
                                        news.title.toLowerCase().includes(newsSearchQuery.toLowerCase()) ||
                                        (news.subtitle?.toLowerCase().includes(newsSearchQuery.toLowerCase())))
                                )
                                .map(news => (
                                    <div
                                        key={news.id}
                                        onClick={() => handleAddNewsLink(news.id)}
                                        className="p-3 bg-white/5 rounded-xl border border-white/10 hover:border-blue-500/30 hover:bg-blue-500/5 cursor-pointer transition-all flex gap-3"
                                    >
                                        {news.images?.[0] && (
                                            <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                                                <img src={news.images[0]} alt="" className="w-full h-full object-cover" />
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-medium text-white line-clamp-2">{news.title}</h4>
                                            {news.subtitle && (
                                                <p className="text-xs text-white/50 line-clamp-1 mt-1">{news.subtitle}</p>
                                            )}
                                        </div>
                                        <Plus className="w-5 h-5 text-blue-400 flex-shrink-0" />
                                    </div>
                                ))
                            }
                            {allNews.filter(news => !sequence.recent.some(r => r.sourceId === news.id)).length === 0 && (
                                <div className="text-center py-8 text-white/40">
                                    연결할 수 있는 뉴스가 없습니다
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}

            {/* ========== Reflection Picker Modal ========== */}
            {showReflectionPicker && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[5000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setShowReflectionPicker(false)}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-gradient-to-br from-[#1a1a2e] to-[#16213e] rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden border border-white/10 shadow-2xl"
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-white/10">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Book className="w-5 h-5 text-amber-400" />
                                    묵상 연결하기
                                </h3>
                                <button
                                    onClick={() => setShowReflectionPicker(false)}
                                    className="p-1.5 rounded-full bg-white/10 hover:bg-white/20"
                                >
                                    <X className="w-4 h-4 text-white" />
                                </button>
                            </div>
                            {/* Search */}
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                                <input
                                    type="text"
                                    value={reflectionSearchQuery}
                                    onChange={(e) => setReflectionSearchQuery(e.target.value)}
                                    placeholder="묵상 검색..."
                                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-amber-500/50"
                                />
                            </div>
                        </div>

                        {/* Reflection List */}
                        <div className="p-4 overflow-y-auto max-h-[60vh] space-y-2">
                            {allReflections.length === 0 ? (
                                <div className="text-center py-12">
                                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                                        <Book className="w-8 h-8 text-amber-400/50" />
                                    </div>
                                    <p className="text-white/60 font-medium mb-1">묵상 기록이 없습니다</p>
                                    <p className="text-sm text-white/40">먼저 '나의 묵상'에서 묵상을 작성해주세요</p>
                                </div>
                            ) : (
                                <>
                                    {allReflections
                                        .filter(reflection =>
                                            !sequence.scriptureSupport.some(s => s.sourceId === reflection.id) &&
                                            (reflectionSearchQuery === '' ||
                                                (reflection.content || '').toLowerCase().includes(reflectionSearchQuery.toLowerCase()) ||
                                                (reflection.bibleRef?.toLowerCase().includes(reflectionSearchQuery.toLowerCase())) ||
                                                (reflection.parentTitle?.toLowerCase().includes(reflectionSearchQuery.toLowerCase())))
                                        )
                                        .map(reflection => {
                                            const displayContent = reflection.content || reflection.text || '';

                                            return (
                                                <div
                                                    key={reflection.id}
                                                    onClick={() => handleAddReflectionLink(reflection.id)}
                                                    className="p-4 bg-white/5 rounded-xl border border-white/10 hover:border-amber-500/40 hover:bg-amber-500/10 cursor-pointer transition-all group"
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        {/* Image Thumbnail */}
                                                        {(reflection.imageUrl || reflection.parentImage) && (
                                                            <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-black/20">
                                                                <img src={reflection.imageUrl || reflection.parentImage} alt="" className="w-full h-full object-cover" />
                                                            </div>
                                                        )}
                                                        <div className="flex-1 min-w-0">
                                                            {/* Header: Bible ref + Parent title */}
                                                            <div className="flex items-center gap-2 mb-2">
                                                                {reflection.bibleRef && (
                                                                    <span className="inline-block px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-semibold">
                                                                        📖 {reflection.bibleRef}
                                                                    </span>
                                                                )}
                                                                {reflection.parentTitle && (
                                                                    <span className="text-xs text-white/40">
                                                                        {reflection.parentTitle}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {/* Content */}
                                                            <p className="text-sm text-white/80 line-clamp-2 leading-relaxed">
                                                                {displayContent}
                                                            </p>
                                                        </div>
                                                        <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-500/30 transition-colors self-center">
                                                            <Plus className="w-5 h-5 text-amber-400" />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    }
                                    {allReflections.filter(r => !sequence.scriptureSupport.some(s => s.sourceId === r.id)).length === 0 && (
                                        <div className="text-center py-8 text-white/40">
                                            이미 모든 묵상이 연결되어 있습니다
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default InsightDrawer;
