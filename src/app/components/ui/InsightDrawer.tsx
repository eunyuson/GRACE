'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Pin, PinOff, Plus, Edit3, ChevronRight, Book, MessageCircle, Lightbulb, Eye, EyeOff } from 'lucide-react';
import { collection, doc, getDoc, getDocs, updateDoc, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { ConceptCard, SequenceItem, ResponseSnippet, SequenceData } from '../../types/questionBridge';

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
    const [isEditingConclusion, setIsEditingConclusion] = useState(false);
    const [isEditingAStatement, setIsEditingAStatement] = useState(false);
    const [newResponse, setNewResponse] = useState('');
    const [isAddingResponse, setIsAddingResponse] = useState(false);
    const [loading, setLoading] = useState(true);

    // 시퀀스 초기화
    const getSequence = (): SequenceData => {
        return localConcept.sequence || {
            recent: [],
            responses: [],
            aStatement: '',
            scriptureSupport: []
        };
    };

    // 연결된 뉴스/묵상 데이터 로드
    useEffect(() => {
        const loadLinkedItems = async () => {
            setLoading(true);
            const sequence = getSequence();

            // 뉴스 로드
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

            // 묵상 로드
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

        if (isOpen) {
            loadLinkedItems();
        }
    }, [isOpen, localConcept.id]);

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
                                        <div className="flex items-center gap-2 text-blue-400">
                                            <Eye className="w-4 h-4" />
                                            <h3 className="text-sm font-semibold uppercase tracking-wider">
                                                RECENT — 내 눈에 들어온 장면
                                            </h3>
                                        </div>

                                        {sequence.recent.length === 0 ? (
                                            <div className="text-center py-8 text-white/40 text-sm border border-dashed border-white/20 rounded-xl">
                                                아직 연결된 뉴스가 없습니다.<br />
                                                <span className="text-xs">뉴스에서 "개념 연결"을 눌러 추가하세요</span>
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
                                                            {/* Pin Toggle */}
                                                            <button
                                                                onClick={() => handleToggleItemPin('recent', item.sourceId)}
                                                                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            >
                                                                {item.pinned ? (
                                                                    <Pin className="w-3 h-3 text-yellow-400" />
                                                                ) : (
                                                                    <PinOff className="w-3 h-3 text-white/50" />
                                                                )}
                                                            </button>

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
                                        <div className="flex items-center gap-2 text-amber-400">
                                            <Book className="w-4 h-4" />
                                            <h3 className="text-sm font-semibold uppercase tracking-wider">
                                                SCRIPTURE SUPPORT — 결론을 떠받치는 말씀
                                            </h3>
                                        </div>

                                        {sequence.scriptureSupport.length === 0 ? (
                                            <div className="text-center py-8 text-white/40 text-sm border border-dashed border-white/20 rounded-xl">
                                                아직 연결된 묵상이 없습니다.<br />
                                                <span className="text-xs">묵상에서 "개념 연결"을 눌러 추가하세요</span>
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
                                                            {/* Pin Toggle */}
                                                            <button
                                                                onClick={() => handleToggleItemPin('scripture', item.sourceId)}
                                                                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            >
                                                                {item.pinned ? (
                                                                    <Pin className="w-3 h-3 text-yellow-400" />
                                                                ) : (
                                                                    <PinOff className="w-3 h-3 text-white/50" />
                                                                )}
                                                            </button>

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
        </AnimatePresence>
    );
};

export default InsightDrawer;
