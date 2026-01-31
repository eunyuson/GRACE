import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Lightbulb, Link2, Edit2, Trash2 } from 'lucide-react';
import { collection, query, onSnapshot, deleteDoc, doc, updateDoc, addDoc, orderBy, serverTimestamp } from 'firebase/firestore';
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

interface ConceptCardsProps {
    onViewRelated?: (question: string, sourceId: string, sourceType: 'concept') => void;
}

export const ConceptCards: React.FC<ConceptCardsProps> = ({ onViewRelated }) => {
    const [concepts, setConcepts] = useState<ConceptCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<User | null>(null);

    // Create/Edit Modal
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

    // Auth listener
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, user => {
            setCurrentUser(user);
        });
        return () => unsubscribe();
    }, []);

    // Fetch concepts
    useEffect(() => {
        const q = query(collection(db, 'concepts'), orderBy('createdAt', 'desc'));

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

    // Reset form
    const resetForm = () => {
        setConceptName('');
        setConceptPhrase('');
        setQuestion('');
        setError('');
        setIsCreateMode(false);
        setEditingConcept(null);
    };

    // Open edit mode
    const openEdit = (concept: ConceptCard) => {
        setConceptName(concept.conceptName);
        setConceptPhrase(concept.conceptPhrase || '');
        setQuestion(concept.question);
        setEditingConcept(concept);
        setIsCreateMode(true);
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
        if (!confirm('이 개념 카드를 삭제하시겠습니까?')) return;

        try {
            await deleteDoc(doc(db, 'concepts', id));
        } catch (err) {
            console.error('Delete error:', err);
            alert('삭제 실패');
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

    if (!currentUser) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-white/50">
                <div className="text-4xl mb-4">🔒</div>
                <p>로그인이 필요한 서비스입니다.</p>
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
                                    className="group relative bg-gradient-to-br from-[#1a1a2e] to-[#16213e] border border-white/10 rounded-3xl p-6 hover:border-indigo-500/30 transition-all duration-300"
                                >
                                    {/* Type Badge */}
                                    <div className="absolute top-4 right-4">
                                        <span className="px-2 py-1 bg-indigo-500/20 text-indigo-300 text-[10px] uppercase tracking-widest rounded-full">
                                            CONCEPT
                                        </span>
                                    </div>

                                    {/* Content */}
                                    <div className="pr-16">
                                        <h3 className="text-2xl font-bold text-white mb-3">
                                            {concept.conceptName}
                                        </h3>

                                        {concept.conceptPhrase && (
                                            <p className="text-white/60 text-sm leading-relaxed mb-4 italic">
                                                "{concept.conceptPhrase}"
                                            </p>
                                        )}

                                        {/* Question Section */}
                                        <div className="mt-6 pt-4 border-t border-white/10">
                                            <div className="flex items-start gap-2">
                                                <span className="text-lg">❓</span>
                                                <div>
                                                    <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">
                                                        이 개념이 붙잡고 있는 질문
                                                    </p>
                                                    <p className="text-white/80 text-sm font-medium">
                                                        {concept.question}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* View Related Button */}
                                            <button
                                                onClick={() => handleViewRelated(concept)}
                                                className="mt-4 flex items-center gap-2 text-xs text-indigo-400/70 hover:text-indigo-300 transition-colors group/btn"
                                            >
                                                <Link2 size={12} />
                                                <span>같은 질문을 품은 기록 보기</span>
                                                <span className="group-hover/btn:translate-x-1 transition-transform">→</span>
                                            </button>
                                        </div>

                                        {/* A-B Evidence Panel */}
                                        {((concept.bridge?.aEvidence?.length ?? 0) > 0 || (concept.bridge?.bEvidence?.length ?? 0) > 0 || concept.bridge?.aStatement || concept.bridge?.bStatement) && (
                                            <div className="mt-6 pt-4 border-t border-white/10 space-y-4">
                                                {/* -A Panel: 세상에서 이렇게 말함 */}
                                                {(concept.bridge?.aStatement || (concept.bridge?.aEvidence?.length ?? 0) > 0) && (
                                                    <div className="p-3 bg-orange-500/5 border border-orange-500/20 rounded-xl">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <span className="text-orange-400 font-bold text-xs">-A</span>
                                                            <span className="text-[10px] text-orange-300/70 uppercase tracking-wider">세상에서 이렇게 말함</span>
                                                        </div>
                                                        {concept.bridge?.aStatement && (
                                                            <p className="text-white/60 text-xs italic mb-2 line-clamp-2">
                                                                "{concept.bridge.aStatement}"
                                                            </p>
                                                        )}
                                                        {concept.bridge?.aEvidence && concept.bridge.aEvidence.length > 0 && (
                                                            <div className="flex gap-2 overflow-x-auto pb-1">
                                                                {concept.bridge.aEvidence.slice(0, 3).map(ev => (
                                                                    <div
                                                                        key={ev.id}
                                                                        className="flex-shrink-0 px-2 py-1 bg-orange-500/10 rounded-lg border border-orange-500/20 max-w-[120px]"
                                                                    >
                                                                        <div className="flex items-center gap-1 mb-0.5">
                                                                            {ev.pinned && <span className="text-[8px]">📌</span>}
                                                                            <span className="text-[8px] text-orange-300/60 uppercase">
                                                                                {ev.sourceType === 'news' ? '뉴스' : '묵상'}
                                                                            </span>
                                                                        </div>
                                                                        <p className="text-[10px] text-white/50 line-clamp-2">{ev.excerpt}</p>
                                                                    </div>
                                                                ))}
                                                                {concept.bridge.aEvidence.length > 3 && (
                                                                    <div className="flex-shrink-0 px-2 py-1 flex items-center text-[10px] text-orange-300/50">
                                                                        +{concept.bridge.aEvidence.length - 3}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* ~B Panel: 성경에서 이렇게 부름 */}
                                                {(concept.bridge?.bStatement || (concept.bridge?.bEvidence?.length ?? 0) > 0) && (
                                                    <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <span className="text-blue-400 font-bold text-xs">~B</span>
                                                            <span className="text-[10px] text-blue-300/70 uppercase tracking-wider">성경에서 이렇게 부름</span>
                                                        </div>
                                                        {concept.bridge?.bStatement && (
                                                            <p className="text-white/60 text-xs italic mb-2 line-clamp-2">
                                                                "{concept.bridge.bStatement}"
                                                            </p>
                                                        )}
                                                        {concept.bridge?.bEvidence && concept.bridge.bEvidence.length > 0 && (
                                                            <div className="flex gap-2 overflow-x-auto pb-1">
                                                                {concept.bridge.bEvidence.slice(0, 3).map(ev => (
                                                                    <div
                                                                        key={ev.id}
                                                                        className="flex-shrink-0 px-2 py-1 bg-blue-500/10 rounded-lg border border-blue-500/20 max-w-[120px]"
                                                                    >
                                                                        <div className="flex items-center gap-1 mb-0.5">
                                                                            {ev.pinned && <span className="text-[8px]">📌</span>}
                                                                            <span className="text-[8px] text-blue-300/60 uppercase">
                                                                                {ev.sourceType === 'news' ? '뉴스' : '묵상'}
                                                                            </span>
                                                                        </div>
                                                                        <p className="text-[10px] text-white/50 line-clamp-2">{ev.excerpt}</p>
                                                                    </div>
                                                                ))}
                                                                {concept.bridge.bEvidence.length > 3 && (
                                                                    <div className="flex-shrink-0 px-2 py-1 flex items-center text-[10px] text-blue-300/50">
                                                                        +{concept.bridge.bEvidence.length - 3}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    {currentUser?.uid === concept.userId && (
                                        <div className="absolute bottom-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => openEdit(concept)}
                                                className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                                            >
                                                <Edit2 size={14} className="text-white/50" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(concept.id)}
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

                {/* Floating Create Button */}
                <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setIsCreateMode(true)}
                    className="fixed bottom-8 right-8 z-[2000] bg-gradient-to-r from-indigo-500 to-purple-500 text-white p-4 rounded-full shadow-2xl hover:shadow-indigo-500/30 transition-all flex items-center justify-center"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                >
                    <Plus size={24} strokeWidth={3} />
                </motion.button>
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
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                                        <Lightbulb className="text-yellow-400" />
                                        {editingConcept ? '개념 카드 수정' : '새 개념 카드'}
                                    </h2>
                                    <button
                                        onClick={resetForm}
                                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
                                    >
                                        <X className="text-white/50" />
                                    </button>
                                </div>

                                {error && (
                                    <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 text-sm">
                                        {error}
                                    </div>
                                )}

                                <div className="space-y-5">
                                    {/* Concept Name - 필수 */}
                                    <div>
                                        <label className="block text-white/70 text-sm mb-2">
                                            개념 이름 <span className="text-red-400">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={conceptName}
                                            onChange={e => setConceptName(e.target.value)}
                                            placeholder="예: 주도권"
                                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50"
                                        />
                                    </div>

                                    {/* Question - 필수 */}
                                    <div>
                                        <label className="block text-white/70 text-sm mb-2">
                                            {QUESTION_PROMPTS.concept.title} <span className="text-red-400">*</span>
                                        </label>
                                        <p className="text-white/30 text-xs mb-2">
                                            {QUESTION_PROMPTS.concept.hint}
                                        </p>
                                        <div className="relative">
                                            <textarea
                                                value={question}
                                                onChange={e => setQuestion(e.target.value.slice(0, QUESTION_MAX_LENGTH))}
                                                placeholder={QUESTION_PROMPTS.concept.placeholder}
                                                rows={2}
                                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 resize-none"
                                            />
                                            <span className={`absolute bottom-2 right-3 text-xs ${question.length >= QUESTION_MAX_LENGTH ? 'text-red-400' : 'text-white/30'}`}>
                                                {question.length}/{QUESTION_MAX_LENGTH}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Concept Phrase - 선택 */}
                                    <div>
                                        <label className="block text-white/50 text-sm mb-2">
                                            한 문장 정의 (선택)
                                        </label>
                                        <textarea
                                            value={conceptPhrase}
                                            onChange={e => setConceptPhrase(e.target.value)}
                                            placeholder="예: 주도권은 붙잡는 힘이 아니라, 누구를 따르고 있는지를 드러낸다"
                                            rows={2}
                                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-white/20 resize-none"
                                        />
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex justify-end gap-3 mt-8">
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
        </div>
    );
};

export default ConceptCards;
