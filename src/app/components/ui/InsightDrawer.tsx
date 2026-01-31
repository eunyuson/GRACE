'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Pin, PinOff, Plus, Edit3, ChevronRight, Book, MessageCircle, Lightbulb, Eye, EyeOff, Sparkles, Check, XCircle, Loader2, Search, Trash2 } from 'lucide-react';
import { collection, doc, getDoc, getDocs, updateDoc, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
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
    bibleRef?: string;
    verse?: string;
    createdAt: any;
}

interface InsightDrawerProps {
    concept: ConceptCard;
    isOpen: boolean;
    onClose: () => void;
    onUpdate: (updatedConcept: ConceptCard) => void;
}

export const InsightDrawer: React.FC<InsightDrawerProps> = ({
    concept,
    isOpen,
    onClose,
    onUpdate
}) => {
    // 로컬 상태
    const [localConcept, setLocalConcept] = useState<ConceptCard>(concept);
    const [newsItems, setNewsItems] = useState<Map<string, NewsItem>>(new Map());
    const [reflectionItems, setReflectionItems] = useState<Map<string, ReflectionItem>>(new Map());
    const [allReflections, setAllReflections] = useState<ReflectionItem[]>([]);
    const [allNews, setAllNews] = useState<NewsItem[]>([]);
    const [isEditingConclusion, setIsEditingConclusion] = useState(false);
    const [isEditingAStatement, setIsEditingAStatement] = useState(false);
    const [newResponse, setNewResponse] = useState('');
    const [isAddingResponse, setIsAddingResponse] = useState(false);
    const [loading, setLoading] = useState(true);

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
                        const docRef = doc(db, 'memos', item.sourceId);
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

        // 전체 묵상 목록 로드
        const loadAllReflections = async () => {
            try {
                const q = query(collection(db, 'memos'), orderBy('createdAt', 'desc'), limit(50));
                const snapshot = await getDocs(q);
                const items = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                } as ReflectionItem));
                setAllReflections(items);
            } catch (e) {
                console.error('Error loading all reflections:', e);
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

        const newItem: SequenceItem = {
            sourceType: 'reflection',
            sourceId: reflectionId,
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
        const reflectionItem = allReflections.find(r => r.id === reflectionId);
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

    // 결론(B문장) 저장
    const handleSaveConclusion = (newConclusion: string) => {
        const updated = { ...localConcept, conclusion: newConclusion };
        setLocalConcept(updated);
        saveToFirestore(updated);
        setIsEditingConclusion(false);
    };

    // A문장 저장
    const handleSaveAStatement = (newAStatement: string) => {
        const sequence = getSequence();
        const updated = {
            ...localConcept,
            sequence: { ...sequence, aStatement: newAStatement }
        };
        setLocalConcept(updated);
        saveToFirestore(updated);
        setIsEditingAStatement(false);
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

                    {/* Drawer Panel */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed right-0 top-0 bottom-0 z-[4001] w-full md:w-[500px] lg:w-[600px] bg-gradient-to-b from-[#1a1a2e] to-[#16213e] shadow-2xl overflow-hidden flex flex-col"
                    >
                        {/* Header - 고정 */}
                        <div className="flex-shrink-0 p-4 md:p-6 border-b border-white/10">
                            <div className="flex justify-between items-start">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Lightbulb className="w-5 h-5 text-yellow-400" />
                                        <h2 className="text-xl md:text-2xl font-bold text-white">
                                            {localConcept.conceptName}
                                        </h2>
                                    </div>
                                    <p className="text-sm text-white/60">
                                        {localConcept.question}
                                    </p>
                                    <p className="text-xs text-white/40 mt-1 italic">
                                        정의/결론이 아니라 흐름
                                    </p>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                                >
                                    <X className="w-5 h-5 text-white" />
                                </button>
                            </div>
                        </div>

                        {/* Scrollable Content - 4 Sections */}
                        <div className="flex-1 overflow-y-auto">
                            {loading ? (
                                <div className="flex items-center justify-center h-32 text-white/50">
                                    로딩 중...
                                </div>
                            ) : (
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
                                                className="text-center py-8 text-white/40 text-sm border border-dashed border-blue-500/30 rounded-xl cursor-pointer hover:bg-blue-500/5 transition-colors"
                                                onClick={() => setShowNewsPicker(true)}
                                            >
                                                <Plus className="w-6 h-6 mx-auto mb-2 text-blue-400/50" />
                                                클릭해서 뉴스를 연결하세요
                                            </div>
                                        ) : (
                                            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                                                {sequence.recent.map((item) => {
                                                    const news = newsItems.get(item.sourceId);
                                                    if (!news) return null;

                                                    return (
                                                        <div
                                                            key={item.sourceId}
                                                            className="flex-shrink-0 w-64 bg-white/5 rounded-xl p-4 border border-white/10 relative group"
                                                        >
                                                            {/* Action Buttons */}
                                                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button
                                                                    onClick={() => handleToggleItemPin('recent', item.sourceId)}
                                                                    className="p-1.5 rounded-full bg-black/50 hover:bg-black/70"
                                                                >
                                                                    {item.pinned ? (
                                                                        <Pin className="w-3 h-3 text-yellow-400" />
                                                                    ) : (
                                                                        <PinOff className="w-3 h-3 text-white/50" />
                                                                    )}
                                                                </button>
                                                                <button
                                                                    onClick={() => handleRemoveNewsLink(item.sourceId)}
                                                                    className="p-1.5 rounded-full bg-red-500/30 hover:bg-red-500/50"
                                                                >
                                                                    <Trash2 className="w-3 h-3 text-red-300" />
                                                                </button>
                                                            </div>

                                                            {/* Image Preview */}
                                                            {news.images?.[0] && (
                                                                <div className="w-full h-24 rounded-lg overflow-hidden mb-3">
                                                                    <img
                                                                        src={news.images[0]}
                                                                        alt=""
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                </div>
                                                            )}

                                                            <h4 className="text-sm font-medium text-white line-clamp-2 mb-1">
                                                                {news.title}
                                                            </h4>
                                                            {news.subtitle && (
                                                                <p className="text-xs text-white/50 line-clamp-2">
                                                                    {news.subtitle}
                                                                </p>
                                                            )}

                                                            {item.pinned && (
                                                                <div className="mt-2 text-xs text-yellow-400/70 flex items-center gap-1">
                                                                    <Pin className="w-3 h-3" /> 고정됨
                                                                </div>
                                                            )}
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

                                        {/* A Statement */}
                                        <div className="mt-4 p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-xl border border-purple-500/20">
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="text-xs text-purple-300/70 font-medium">A 문장 (세상의 관점)</span>
                                                <button
                                                    onClick={() => setIsEditingAStatement(!isEditingAStatement)}
                                                    className="p-1 rounded hover:bg-white/10"
                                                >
                                                    <Edit3 className="w-3 h-3 text-white/50" />
                                                </button>
                                            </div>

                                            {isEditingAStatement ? (
                                                <div className="space-y-2">
                                                    <textarea
                                                        defaultValue={sequence.aStatement || ''}
                                                        placeholder="우리는 보통 ___를 ___라고 생각합니다."
                                                        className="w-full p-2 rounded-lg bg-white/10 text-white text-sm border border-purple-500/30 focus:border-purple-400 focus:outline-none resize-none"
                                                        rows={2}
                                                        id="aStatementInput"
                                                    />
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => {
                                                                const input = document.getElementById('aStatementInput') as HTMLTextAreaElement;
                                                                handleSaveAStatement(input.value);
                                                            }}
                                                            className="px-3 py-1 rounded-lg bg-purple-500/50 text-white text-xs hover:bg-purple-500/70"
                                                        >
                                                            저장
                                                        </button>
                                                        <button
                                                            onClick={() => setIsEditingAStatement(false)}
                                                            className="px-3 py-1 rounded-lg bg-white/10 text-white/70 text-xs hover:bg-white/20"
                                                        >
                                                            취소
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-sm text-white/80 italic">
                                                    {sequence.aStatement || (
                                                        <span className="text-white/40">
                                                            "우리는 보통 ___를 ___라고 생각합니다."
                                                        </span>
                                                    )}
                                                </p>
                                            )}
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

                                        <div className="p-4 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-xl border border-green-500/20">
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="text-xs text-green-300/70 font-medium">B 문장 (성경의 관점)</span>
                                                <button
                                                    onClick={() => setIsEditingConclusion(!isEditingConclusion)}
                                                    className="p-1 rounded hover:bg-white/10"
                                                >
                                                    <Edit3 className="w-3 h-3 text-white/50" />
                                                </button>
                                            </div>

                                            {isEditingConclusion ? (
                                                <div className="space-y-2">
                                                    <textarea
                                                        defaultValue={localConcept.conclusion || ''}
                                                        placeholder="그러나 성경에서 ___는 ___라기보다 ___입니다."
                                                        className="w-full p-2 rounded-lg bg-white/10 text-white text-sm border border-green-500/30 focus:border-green-400 focus:outline-none resize-none"
                                                        rows={3}
                                                        id="conclusionInput"
                                                    />
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => {
                                                                const input = document.getElementById('conclusionInput') as HTMLTextAreaElement;
                                                                handleSaveConclusion(input.value);
                                                            }}
                                                            className="px-3 py-1 rounded-lg bg-green-500/50 text-white text-xs hover:bg-green-500/70"
                                                        >
                                                            저장
                                                        </button>
                                                        <button
                                                            onClick={() => setIsEditingConclusion(false)}
                                                            className="px-3 py-1 rounded-lg bg-white/10 text-white/70 text-xs hover:bg-white/20"
                                                        >
                                                            취소
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-base text-white font-medium leading-relaxed">
                                                    {localConcept.conclusion || (
                                                        <span className="text-white/40 italic">
                                                            "그러나 성경에서 ___는 ___라기보다 ___입니다."
                                                        </span>
                                                    )}
                                                </p>
                                            )}
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
                                                className="text-center py-8 text-white/40 text-sm border border-dashed border-amber-500/30 rounded-xl cursor-pointer hover:bg-amber-500/5 transition-colors"
                                                onClick={() => setShowReflectionPicker(true)}
                                            >
                                                <Plus className="w-6 h-6 mx-auto mb-2 text-amber-400/50" />
                                                클릭해서 묵상을 연결하세요
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
                                                            <p className="text-sm text-white/80 line-clamp-3">
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

                                </div>
                            )}
                        </div>
                    </motion.div>
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
                            {allReflections
                                .filter(reflection =>
                                    !sequence.scriptureSupport.some(s => s.sourceId === reflection.id) &&
                                    (reflectionSearchQuery === '' ||
                                        reflection.content.toLowerCase().includes(reflectionSearchQuery.toLowerCase()) ||
                                        (reflection.bibleRef?.toLowerCase().includes(reflectionSearchQuery.toLowerCase())) ||
                                        (reflection.parentTitle?.toLowerCase().includes(reflectionSearchQuery.toLowerCase())))
                                )
                                .map(reflection => (
                                    <div
                                        key={reflection.id}
                                        onClick={() => handleAddReflectionLink(reflection.id)}
                                        className="p-3 bg-white/5 rounded-xl border border-white/10 hover:border-amber-500/30 hover:bg-amber-500/5 cursor-pointer transition-all"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                {reflection.bibleRef && (
                                                    <span className="inline-block px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-medium mb-1">
                                                        {reflection.bibleRef}
                                                    </span>
                                                )}
                                                <p className="text-sm text-white/80 line-clamp-2">{reflection.content}</p>
                                                {reflection.parentTitle && (
                                                    <p className="text-xs text-white/40 mt-1">출처: {reflection.parentTitle}</p>
                                                )}
                                            </div>
                                            <Plus className="w-5 h-5 text-amber-400 flex-shrink-0" />
                                        </div>
                                    </div>
                                ))
                            }
                            {allReflections.filter(r => !sequence.scriptureSupport.some(s => s.sourceId === r.id)).length === 0 && (
                                <div className="text-center py-8 text-white/40">
                                    연결할 수 있는 묵상이 없습니다
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default InsightDrawer;
