
import { onAuthStateChanged, User } from 'firebase/auth';
import { addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { ConceptCard, RelatedItem, QUESTION_MAX_LENGTH } from '../types/questionBridge';
import { InsightDrawer } from './ui/InsightDrawer';
import { QuestionBridgeView } from './QuestionBridgeView';
import { ChevronRight, Lightbulb, Plus } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'motion/react';


// 3D Tilt & Spotlight Card Component
const TiltCard = ({ children, onClick, index }: { children: React.ReactNode, onClick: () => void, index: number }) => {
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const mouseX = useSpring(x, { stiffness: 500, damping: 100 });
    const mouseY = useSpring(y, { stiffness: 500, damping: 100 });

    function onMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
        const { left, top, width, height } = currentTarget.getBoundingClientRect();
        x.set(clientX - left - width / 2);
        y.set(clientY - top - height / 2);
    }

    function onMouseLeave() {
        x.set(0);
        y.set(0);
    }

    const rotateX = useTransform(mouseY, [-200, 200], [5, -5]);
    const rotateY = useTransform(mouseX, [-200, 200], [-5, 5]);
    const spotlightX = useTransform(mouseX, [-200, 200], [0, 100]);
    const spotlightY = useTransform(mouseY, [-200, 200], [0, 100]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.5, delay: index * 0.05 }}
            style={{
                perspective: 1000,
            }}
            className="mb-6 break-inside-avoid" // Masonry layout support
            onClick={onClick}
        >
            <motion.div
                style={{
                    rotateX,
                    rotateY,
                    transformStyle: "preserve-3d",
                }}
                onMouseMove={onMouseMove}
                onMouseLeave={onMouseLeave}
                className="group relative overflow-hidden bg-gradient-to-br from-[#1a1a2e] via-[#1e1e3a] to-[#16213e] border border-white/10 rounded-3xl p-6 hover:border-indigo-500/40 hover:shadow-2xl hover:shadow-indigo-500/20 transition-all duration-300 cursor-pointer"
            >
                {/* Spotlight Gradient */}
                <motion.div
                    className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{
                        background: useTransform(
                            [mouseX, mouseY],
                            ([xVal, yVal]) => `radial-gradient(600px circle at ${xVal + 200}px ${yVal + 200}px, rgba(99, 102, 241, 0.15), transparent 40%)`
                        ),
                    }}
                />

                {/* Original Content Wrapper with preserve-3d */}
                <div style={{ transform: "translateZ(20px)" }}>
                    {children}
                </div>
            </motion.div>
        </motion.div>
    );
};

export interface ConceptCardsProps {
    onViewRelated?: (question: string, id: string, type: 'concept') => void;
    maxItems?: number;
}

export const ConceptCards: React.FC<ConceptCardsProps> = ({ onViewRelated, maxItems }) => {
    const [concepts, setConcepts] = useState<ConceptCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<User | null>(null);

    // Create/Edit Modal (Legacy - Removed unused state)

    // Form State (Legacy - Removed unused state)

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
            if (updated && updated !== selectedConceptForDrawer) {
                setSelectedConceptForDrawer(updated);
            }
        }
    }, [concepts]);

    // Old functions (resetForm, handleSave, handleDelete) removed as they were dead code relying on legacy modal.

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
                    // Masonry Layout using Columns
                    <div className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6">
                        <AnimatePresence>
                            {concepts.map((concept, index) => (
                                <TiltCard
                                    key={concept.id}
                                    index={index}
                                    onClick={() => setSelectedConceptForDrawer(concept)}
                                >
                                    {/* Type Badge */}
                                    <div className="absolute top-4 right-4 z-10">
                                        <span className="px-3 py-1.5 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-indigo-300 text-[10px] uppercase tracking-widest rounded-full border border-indigo-500/20 backdrop-blur-sm flex items-center gap-1.5 shadow-lg shadow-indigo-500/5">
                                            <Lightbulb size={10} className="text-yellow-400" />
                                            CONCEPT
                                        </span>
                                    </div>

                                    {/* Content */}
                                    <div className="relative z-10 pr-4">
                                        <h3 className="text-3xl font-bold text-white mb-4 group-hover:text-indigo-100 transition-colors tracking-tight">
                                            {concept.conceptName}
                                        </h3>

                                        {concept.conceptPhrase && (
                                            <p className="text-white/60 text-sm leading-relaxed mb-6 italic border-l-2 border-indigo-500/30 pl-4 py-1">
                                                "{concept.conceptPhrase.slice(0, 100)}{concept.conceptPhrase.length > 100 ? '...' : ''}"
                                            </p>
                                        )}

                                        {/* Question Section */}
                                        <div className="mt-4 pt-4 border-t border-white/5">
                                            <div className="flex items-start gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center flex-shrink-0 shadow-inner border border-white/5">
                                                    <span className="text-base transform -rotate-6 block">❓</span>
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1.5 font-medium">
                                                        질문
                                                    </p>
                                                    <p className="text-white/80 text-sm font-medium leading-relaxed">
                                                        {concept.question}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* A-B Content Preview */}
                                        {(() => {
                                            const aText = (concept as any).aStatement || (concept as any).sequence?.aStatement || concept.bridge?.aStatement;
                                            const bText = (concept as any).conclusion || concept.bridge?.bStatement;

                                            if (!aText && !bText) return null;

                                            return (
                                                <div className="mt-5 p-4 bg-black/20 rounded-xl border border-white/5 space-y-2 backdrop-blur-sm">
                                                    {bText ? (
                                                        <div className="flex items-start gap-2">
                                                            <span className="text-emerald-400 text-xs mt-0.5">➔</span>
                                                            <p className="text-emerald-300/90 text-xs leading-relaxed font-medium line-clamp-2">
                                                                {bText}
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-start gap-2">
                                                            <span className="text-white/30 text-xs mt-0.5">Start</span>
                                                            <p className="text-white/50 text-xs leading-relaxed line-clamp-2">
                                                                {aText}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}

                                        {/* View Related Button */}
                                        <div className="mt-6 flex items-center justify-between opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 delay-100">
                                            <span className="text-[10px] text-white/30 font-medium tracking-wider">CLICK TO EXPLORE</span>
                                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                                                <ChevronRight size={14} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Glow bg for aesthetics */}
                                    <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 blur-3xl rounded-full pointer-events-none" />
                                </TiltCard>
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

            {/* Create/Edit Modal Removed */}

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
                    currentUser={currentUser}
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
