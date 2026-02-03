import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Lightbulb, Link2, Edit2, Trash2, ChevronRight } from 'lucide-react';
import { collection, query, onSnapshot, deleteDoc, doc, updateDoc, addDoc, orderBy, serverTimestamp, limit } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from '../firebase';
import {
    ConceptCard,
    QUESTION_PROMPTS,
    QUESTION_MAX_LENGTH,
    validateQuestion,
    RelatedItem,
    findSimilarQuestions
} from '../types/questionBridge';
import { QuestionBridgeView } from './QuestionBridgeView';
import { InsightDrawer } from './ui/InsightDrawer';

interface ConceptCardsProps {
    onViewRelated?: (question: string, sourceId: string, sourceType: 'concept') => void;
    maxItems?: number;
}

export const ConceptCards: React.FC<ConceptCardsProps> = ({ onViewRelated, maxItems }) => {
    const [concepts, setConcepts] = useState<ConceptCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<User | null>(null);

    // Create/Edit Modal (이전 방식 - 점진적 제거 예정)
    const [isCreateMode, setIsCreateMode] = useState(false);
    const [editingConcept, setEditingConcept] = useState<ConceptCard | null>(null);

    // Form State
    const [conceptName, setConceptName] = useState('');
    const [conceptPhrase, setConceptPhrase] = useState('');
    const [question, setQuestion] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Question Bridge View
    const [viewingQuestion, setViewingQuestion] = useState<string | null>(null);
    const [relatedItems, setRelatedItems] = useState<RelatedItem[]>([]);

    // InsightDrawer (Sequence Card) 상태
    const [selectedConceptForDrawer, setSelectedConceptForDrawer] = useState<ConceptCard | null>(null);

    // 새 카드 생성 모드: InsightDrawer에서 새 카드 생성 시 사용
    const [isNewCardMode, setIsNewCardMode] = useState(false);

    // 편집 모드: 기존 카드를 편집 모드로 열기
    const [isEditMode, setIsEditMode] = useState(false);

    // Auth listener
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, user => {
            setCurrentUser(user);
        });
        return () => unsubscribe();
    }, []);

    // Fetch concepts
    useEffect(() => {
        let q;
        if (maxItems) {
            q = query(collection(db, 'concepts'), orderBy('createdAt', 'desc'), limit(maxItems));
        } else {
            q = query(collection(db, 'concepts'), orderBy('createdAt', 'desc'));
        }

        const unsubscribe = onSnapshot(q, snapshot => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                type: 'concept' as const
            } as ConceptCard));
            setConcepts(items);
            setLoading(false);
        }, err => {
            console.error('Concepts fetch error:', err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Check URL query params for deep linking
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const cardId = params.get('cardId');
        if (cardId && concepts.length > 0 && !selectedConceptForDrawer) {
            const found = concepts.find(c => c.id === cardId);
            if (found) {
                setSelectedConceptForDrawer(found);
            }
        }
    }, [concepts]);

    // Sync selected concept with real-time updates (Fix for "Link not showing" issue)
    useEffect(() => {
        if (selectedConceptForDrawer) {
            const updated = concepts.find(c => c.id === selectedConceptForDrawer.id);
            // Only update if the object reference changed (Firestore snapshot returns new objects)
            // Checks for actual data change are handled by React, but we should ensure we have the latest version.
            // Note: This might overwrite unsaved local edits if they are not pushed to parent, 
            // but InsightDrawer manages its own localConcept state and only syncs on ID change or View Mode.
            // However, to see the "Link" immediately, we need to update the prop.
            if (updated && updated !== selectedConceptForDrawer) {
                setSelectedConceptForDrawer(updated);
            }
        }
    }, [concepts]);

    // Reset form
    const resetForm = () => {
        setConceptName('');
        setConceptPhrase('');
        setQuestion('');
        setError('');
        setIsCreateMode(false);
        setEditingConcept(null);
    };

    // Open edit mode - InsightDrawer를 편집 모드로 열기
    const openEdit = (concept: ConceptCard) => {
        setSelectedConceptForDrawer(concept);
        setIsNewCardMode(false);
        setIsEditMode(true);  // 편집 모드로 열기
    };

    // Save concept
    const handleSave = async () => {
        if (!currentUser) {
            setError('로그인이 필요합니다');
            return;
        }

        // Validation
        if (!conceptName.trim()) {
            setError('개념 이름을 입력해주세요');
            return;
        }

        const questionValidation = validateQuestion(question);
        if (!questionValidation.valid) {
            setError(questionValidation.error || '질문을 입력해주세요');
            return;
        }

        setSaving(true);
        setError('');

        try {
            const data = {
                conceptName: conceptName.trim(),
                conceptPhrase: conceptPhrase.trim(),
                question: question.trim(),
                type: 'concept' as const,
                userId: currentUser.uid,
                userName: currentUser.displayName || '익명',
                updatedAt: serverTimestamp()
            };

            if (editingConcept) {
                await updateDoc(doc(db, 'concepts', editingConcept.id), data);
            } else {
                await addDoc(collection(db, 'concepts'), {
                    ...data,
                    createdAt: serverTimestamp()
                });
            }

            resetForm();
        } catch (err) {
            console.error('Save concept error:', err);
            setError('저장 실패');
        } finally {
            setSaving(false);
        }
    };

    // Delete concept
    const handleDelete = async (id: string) => {
        console.log('Attempting to delete concept:', id);
        if (!confirm('정말로 이 개념 카드를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;

        try {
            await deleteDoc(doc(db, 'concepts', id));
            console.log('Successfully deleted concept:', id);
        } catch (err: any) {
            console.error('Delete error:', err);
            alert(`삭제 실패: ${err.message}`);
        }
    };

    // View related questions
    const handleViewRelated = (concept: ConceptCard) => {
        setViewingQuestion(concept.question);
        // 다른 컨텐츠에서 비슷한 질문 찾기 (나중에 구현)
        if (onViewRelated) {
            onViewRelated(concept.question, concept.id, 'concept');
        }
    };

    // Concept 업데이트 (InsightDrawer에서 저장 시)
    const handleConceptUpdate = (updatedConcept: ConceptCard) => {
        setConcepts(prev =>
            prev.map(c => c.id === updatedConcept.id ? updatedConcept : c)
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh] text-white/50">
                <div className="text-lg">로딩 중...</div>
            </div>
        );
    }

    return (
        <div className="w-full h-full overflow-y-auto bg-[#050505]">
            <div className="w-full max-w-[1600px] mx-auto px-4 md:px-10 py-20 md:py-32 min-h-screen">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="mb-12"
                >
                    <h1 className="font-['Anton'] text-[clamp(2.5rem,6vw,5rem)] leading-[0.9] text-white overflow-hidden">
                        CONCEPT CARDS
                    </h1>
                    <p className="font-['Inter'] text-sm md:text-base text-white/50 mt-4 tracking-wide">
                        사고가 이동하는 지점을 기록합니다 ({concepts.length})
                    </p>
                    <p className="font-['Inter'] text-xs text-white/30 mt-2">
                        정의 ❌ · 결론 ❌ · 사고가 이동하는 지점만 ⭕
                    </p>
                </motion.div>

                {/* Loading */}
                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-64 bg-white/5 rounded-2xl animate-pulse"></div>
                        ))}
                    </div>
                ) : concepts.length === 0 ? (
                    <div className="text-center py-20 border border-dashed border-white/10 rounded-3xl">
                        <Lightbulb className="w-12 h-12 mx-auto mb-4 text-yellow-500/50" />
                        <p className="text-white/30 text-lg mb-2">아직 개념 카드가 없습니다</p>
                        <p className="text-white/20 text-sm">첫 번째 개념을 기록해보세요</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <AnimatePresence>
                            {concepts.map((concept, index) => (
                                <motion.div
                                    key={concept.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    transition={{ duration: 0.3, delay: index * 0.05 }}
                                    onClick={() => setSelectedConceptForDrawer(concept)}
                                    className="group relative overflow-hidden bg-gradient-to-br from-[#1a1a2e] via-[#1e1e3a] to-[#16213e] border border-white/10 rounded-3xl p-6 hover:border-indigo-500/40 hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-500 cursor-pointer"
                                >
                                    {/* Animated gradient background */}
                                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/0 via-purple-600/0 to-pink-600/0 group-hover:from-indigo-600/5 group-hover:via-purple-600/5 group-hover:to-pink-600/5 transition-all duration-500" />

                                    {/* Glow effect */}
                                    <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                                    {/* Type Badge */}
                                    <div className="absolute top-4 right-4 z-10">
                                        <span className="px-3 py-1.5 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-indigo-300 text-[10px] uppercase tracking-widest rounded-full border border-indigo-500/20 backdrop-blur-sm flex items-center gap-1.5">
                                            <Lightbulb size={10} className="text-yellow-400" />
                                            CONCEPT
                                        </span>
                                    </div>

                                    {/* Content */}
                                    <div className="relative z-10 pr-16">
                                        <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-indigo-100 transition-colors">
                                            {concept.conceptName}
                                        </h3>

                                        {concept.conceptPhrase && (
                                            <p className="text-white/60 text-sm leading-relaxed mb-4 italic border-l-2 border-indigo-500/30 pl-3">
                                                "{concept.conceptPhrase}"
                                            </p>
                                        )}

                                        {/* Question Section */}
                                        {/* Question Section */}
                                        <div className="mt-6 pt-4 border-t border-white/10">
                                            <div className="flex items-start gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center flex-shrink-0">
                                                    <span className="text-base">❓</span>
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">
                                                        이 개념이 붙잡고 있는 질문
                                                    </p>
                                                    <p className="text-white/80 text-sm font-medium leading-relaxed">
                                                        {concept.question}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* A-B Content (Merged & Simply displayed) */}
                                        {/* aStatement는 루트 레벨 또는 sequence 내부에 있을 수 있음 */}
                                        {(() => {
                                            const aText = (concept as any).aStatement || (concept as any).sequence?.aStatement || concept.bridge?.aStatement;
                                            const bText = (concept as any).conclusion || concept.bridge?.bStatement;

                                            if (!aText && !bText) return null;

                                            return (
                                                <div className="mt-6 p-4 bg-white/5 rounded-2xl border border-white/5 space-y-3">
                                                    {/* A 문장 */}
                                                    {aText && (
                                                        <p className="text-white/60 text-sm leading-relaxed">
                                                            "우리는 보통 <span className="text-white/80 font-medium">{concept.conceptName}</span>를(을) <span className="text-white/90 underline decoration-white/30 decoration-1 underline-offset-4">{aText}</span>라고 생각합니다.
                                                        </p>
                                                    )}

                                                    {/* B 문장 */}
                                                    {bText && (
                                                        <p className="text-white/60 text-sm leading-relaxed">
                                                            그러나 성경에서 <span className="text-white/80 font-medium">{concept.conceptName}</span>는(은) <span className="text-emerald-400 font-bold underline decoration-emerald-500/30 decoration-1 underline-offset-4">{bText}</span>."
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })()}

                                        {/* View Related Button (Moved to bottom) */}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleViewRelated(concept); }}
                                            className="mt-6 w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/5 text-xs text-indigo-400/80 hover:text-indigo-300 hover:bg-indigo-500/10 transition-all border border-white/5 hover:border-indigo-500/20 group/btn"
                                        >
                                            <Link2 size={12} />
                                            <span>같은 질문을 품은 기록 보기</span>
                                            <ChevronRight size={14} className="group-hover/btn:translate-x-1 transition-transform" />
                                        </button>
                                    </div>

                                    {/* Actions */}
                                    {currentUser && (
                                        <div className="absolute bottom-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-30">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    console.log('Edit clicked for:', concept.id);
                                                    openEdit(concept);
                                                }}
                                                className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                                            >
                                                <Edit2 size={14} className="text-white/50" />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    console.log('Delete clicked for:', concept.id);
                                                    handleDelete(concept.id);
                                                }}
                                                className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"
                                            >
                                                <Trash2 size={14} className="text-red-400/50" />
                                            </button>
                                        </div>
                                    )}
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}

                {/* Floating Create Button - 로그인한 사용자에게만 표시 */}
                {currentUser && (
                    <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => {
                            // 새 카드 생성: 빈 ConceptCard 생성 후 InsightDrawer 열기
                            const newConcept: ConceptCard = {
                                id: `temp_${Date.now()}`, // 임시 ID
                                conceptName: '',
                                conceptPhrase: '',
                                question: '',
                                type: 'concept',
                                userId: currentUser.uid,
                                userName: currentUser.displayName || '익명',
                                sequence: {
                                    recent: [],
                                    responses: [],
                                    aStatement: '',
                                    scriptureSupport: [],
                                    aiReactionSuggestions: [],
                                    aiConclusionSuggestions: [],
                                    aiScriptureSuggestions: []
                                }
                            };
                            setSelectedConceptForDrawer(newConcept);
                            setIsNewCardMode(true);
                        }}
                        className="fixed bottom-8 right-8 z-[2000] bg-gradient-to-r from-indigo-500 to-purple-500 text-white p-4 rounded-full shadow-2xl hover:shadow-indigo-500/30 transition-all flex items-center justify-center"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 260, damping: 20 }}
                    >
                        <Plus size={24} strokeWidth={3} />
                    </motion.button>
                )}
            </div>

            {/* Create/Edit Modal */}
            <AnimatePresence>
                {isCreateMode && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={resetForm}
                        className="fixed inset-0 z-[3000] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            className="bg-gradient-to-br from-[#1a1a2e] to-[#16213e] rounded-3xl w-full max-w-xl max-h-[90vh] overflow-y-auto border border-white/10 shadow-2xl"
                        >
                            <div className="p-6 md:p-8">
                                {/* Header - 개념 이름 입력 */}
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <Lightbulb className="text-yellow-400 w-8 h-8" />
                                        <input
                                            type="text"
                                            value={conceptName}
                                            onChange={e => setConceptName(e.target.value)}
                                            placeholder="개념 이름"
                                            className="text-2xl font-bold text-white bg-transparent border-none outline-none placeholder-white/30 w-full"
                                        />
                                    </div>
                                    <button
                                        onClick={resetForm}
                                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
                                    >
                                        <X className="text-white/50" />
                                    </button>
                                </div>

                                {/* Question - 질문 입력 */}
                                <div className="mb-6 relative">
                                    <input
                                        type="text"
                                        value={question}
                                        onChange={e => setQuestion(e.target.value.slice(0, QUESTION_MAX_LENGTH))}
                                        placeholder="이 개념이 붙잡고 있는 질문은?"
                                        className="text-sm text-white/50 bg-transparent border-none outline-none placeholder-white/30 w-full"
                                    />
                                    {question && (
                                        <span className="text-[10px] text-white/30">{question.length}/{QUESTION_MAX_LENGTH}</span>
                                    )}
                                </div>

                                {error && (
                                    <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 text-sm">
                                        {error}
                                    </div>
                                )}

                                <div className="space-y-6">
                                    {/* ========== Section 1: A 문장 (세상의 관점) ========== */}
                                    <section className="relative">
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-orange-500 to-orange-600 rounded-full" />
                                        <div className="pl-5">
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className="px-2 py-1 bg-orange-500/20 text-orange-300 text-xs font-bold rounded-full">A</span>
                                                <span className="text-[10px] uppercase tracking-wider text-orange-300/70">세상의 관점</span>
                                            </div>
                                            <div className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border border-orange-500/20 rounded-2xl p-4">
                                                <p className="text-white/60 text-sm mb-2">"우리는 보통</p>
                                                <div className="flex items-center gap-2 mb-2">
                                                    <input
                                                        type="text"
                                                        value={conceptName}
                                                        readOnly
                                                        className="text-orange-300 font-semibold bg-orange-500/10 px-2 py-1 rounded border border-orange-500/20 text-sm"
                                                        placeholder="___"
                                                    />
                                                    <span className="text-white/60 text-sm">를(을)</span>
                                                </div>
                                                <textarea
                                                    value={conceptPhrase}
                                                    onChange={e => setConceptPhrase(e.target.value)}
                                                    placeholder="___라고 생각합니다. (세상이 말하는 정의)"
                                                    rows={2}
                                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-orange-500/40 resize-none"
                                                />
                                                <p className="text-white/40 text-sm mt-1">...라고 생각합니다."</p>
                                            </div>
                                        </div>
                                    </section>

                                    {/* ========== Section 2: 뉴스 연결 영역 ========== */}
                                    <section className="relative">
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-cyan-500 rounded-full" />
                                        <div className="pl-5">
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className="text-blue-400 text-xs">📰</span>
                                                <span className="text-[10px] uppercase tracking-wider text-blue-300/70">이 관점이 보이는 뉴스</span>
                                            </div>
                                            <div
                                                className="relative overflow-hidden rounded-2xl cursor-pointer transition-all group/news hover:scale-[1.01] border border-dashed border-blue-400/30 hover:border-blue-400/50 bg-gradient-to-br from-blue-600/5 to-cyan-500/5"
                                            >
                                                <div className="py-8 px-6 text-center">
                                                    <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-blue-500/20 flex items-center justify-center">
                                                        <Plus className="w-6 h-6 text-blue-400" />
                                                    </div>
                                                    <p className="text-white/50 text-sm">저장 후 InsightDrawer에서 뉴스를 연결하세요</p>
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    {/* ========== Section 3: B 문장 (성경의 관점) ========== */}
                                    <section className="relative">
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-full" />
                                        <div className="pl-5">
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className="px-2 py-1 bg-emerald-500/20 text-emerald-300 text-xs font-bold rounded-full">B</span>
                                                <span className="text-[10px] uppercase tracking-wider text-emerald-300/70">성경의 관점</span>
                                            </div>
                                            <div className="bg-gradient-to-br from-emerald-500/10 to-teal-600/5 border border-emerald-500/20 rounded-2xl p-4">
                                                <p className="text-white/60 text-sm mb-2">"그러나 성경에서</p>
                                                <div className="flex items-center gap-2 mb-2">
                                                    <input
                                                        type="text"
                                                        value={conceptName}
                                                        readOnly
                                                        className="text-emerald-300 font-semibold bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 text-sm"
                                                        placeholder="___"
                                                    />
                                                    <span className="text-white/60 text-sm">는(은)</span>
                                                </div>
                                                <p className="text-white/40 text-sm italic mb-2">___라기보다 ___입니다."</p>
                                                <p className="text-white/30 text-xs mt-2">※ 저장 후 InsightDrawer에서 결론을 작성하세요</p>
                                            </div>
                                        </div>
                                    </section>

                                    {/* ========== Section 4: 묵상 연결 영역 ========== */}
                                    <section className="relative">
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-500 to-yellow-500 rounded-full" />
                                        <div className="pl-5">
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className="text-amber-400 text-xs">📖</span>
                                                <span className="text-[10px] uppercase tracking-wider text-amber-300/70">이 결론을 뒷받침하는 묵상</span>
                                            </div>
                                            <div
                                                className="relative overflow-hidden rounded-2xl cursor-pointer transition-all group/meditation hover:scale-[1.01] border border-dashed border-amber-400/30 hover:border-amber-400/50 bg-gradient-to-br from-amber-600/5 to-yellow-500/5"
                                            >
                                                <div className="py-8 px-6 text-center">
                                                    <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-amber-500/20 flex items-center justify-center">
                                                        <Plus className="w-6 h-6 text-amber-400" />
                                                    </div>
                                                    <p className="text-white/50 text-sm">저장 후 InsightDrawer에서 묵상을 연결하세요</p>
                                                </div>
                                            </div>
                                        </div>
                                    </section>
                                </div>

                                {/* Actions */}
                                <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-white/10">
                                    <button
                                        onClick={resetForm}
                                        className="px-5 py-2.5 rounded-xl text-white/70 hover:bg-white/10 transition-colors"
                                    >
                                        취소
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={saving || !conceptName.trim() || !question.trim()}
                                        className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        {saving && (
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        )}
                                        {editingConcept ? '수정 완료' : '저장하기'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Question Bridge View Modal */}
            {viewingQuestion && (
                <QuestionBridgeView
                    question={viewingQuestion}
                    onClose={() => setViewingQuestion(null)}
                />
            )}

            {/* InsightDrawer (Sequence Card) */}
            {selectedConceptForDrawer && (
                <InsightDrawer
                    currentUser={currentUser}
                    concept={selectedConceptForDrawer}
                    isOpen={!!selectedConceptForDrawer}
                    onClose={() => {
                        setSelectedConceptForDrawer(null);
                        setIsNewCardMode(false);
                        setIsEditMode(false);
                    }}
                    onUpdate={(updated) => {
                        handleConceptUpdate(updated);
                        setSelectedConceptForDrawer(updated);
                    }}
                    isNewMode={isNewCardMode}
                    isEditMode={isEditMode}
                    onCreateNew={async (newConcept) => {
                        // 새 카드를 Firestore에 저장
                        try {
                            // Undefined 제거를 위한 살균 함수 (LinkToConceptModal과 동일 로직)
                            const sanitizeData = (data: any): any => {
                                if (data === undefined) return null; // undefined를 null로 변환하거나 제거
                                if (Array.isArray(data)) {
                                    return data.map(item => sanitizeData(item));
                                }
                                if (data !== null && typeof data === 'object' && !(data instanceof Date)) {
                                    // Check for Firestore specific types (Timestamp etc) - crude check
                                    if (data.seconds !== undefined && data.nanoseconds !== undefined) return data;

                                    return Object.entries(data).reduce((acc, [key, value]) => {
                                        if (value !== undefined) {
                                            acc[key] = sanitizeData(value);
                                        }
                                        return acc;
                                    }, {} as any);
                                }
                                return data;
                            };

                            // 임시 ID 제외하고 저장
                            const { id: tempId, ...conceptData } = newConcept;
                            const sanitizedData = sanitizeData(conceptData);

                            console.log('[ConceptCards] creating doc with:', sanitizedData);

                            const docRef = await addDoc(collection(db, 'concepts'), {
                                ...sanitizedData,
                                createdAt: serverTimestamp(),
                                updatedAt: serverTimestamp()
                            });
                            // 저장된 ID로 업데이트
                            const savedConcept = { ...newConcept, id: docRef.id };
                            setSelectedConceptForDrawer(savedConcept);
                            setIsNewCardMode(false);
                            setIsEditMode(false);
                            return savedConcept;
                        } catch (err) {
                            console.error('Create concept error:', err);
                            return null;
                        }
                    }}
                />
            )}
        </div>
    );
};

export default ConceptCards;
