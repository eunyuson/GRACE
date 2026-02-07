
import { onAuthStateChanged, User } from 'firebase/auth';
import { addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { ConceptCard, RelatedItem, QUESTION_MAX_LENGTH } from '../types/questionBridge';
import { InsightDrawer } from './ui/InsightDrawer';
import { ConceptDetailDrawer } from './ConceptDetailDrawer';
import { QuestionBridgeView } from './QuestionBridgeView';
import { ChevronRight, Lightbulb, Plus } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'motion/react';


// --------------------------------------------
// Types & Interfaces
// --------------------------------------------

interface Connection {
    id: string;
    start: string;
    end: string;
    score: number;
}

interface Point {
    x: number;
    y: number;
}

// 3D Tilt & Spotlight Card Component
const TiltCard = ({
    children,
    onClick,
    index,
    id,
    onHover,
    isDimmed,
    isHighlighted
}: {
    children: React.ReactNode,
    onClick: () => void,
    index: number,
    id?: string,
    onHover?: (isHovering: boolean) => void,
    isDimmed?: boolean,
    isHighlighted?: boolean
}) => {
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
        onHover?.(false);
    }

    const rotateX = useTransform(mouseY, [-200, 200], [5, -5]);
    const rotateY = useTransform(mouseX, [-200, 200], [-5, 5]);

    return (
        <motion.div
            id={id}
            initial={{ opacity: 0, y: 50 }}
            animate={{
                opacity: isDimmed ? 0.3 : 1,
                y: 0,
                scale: isHighlighted ? 1.05 : 1
            }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.5, delay: index * 0.05 }}
            style={{
                perspective: 1000,
            }}
            className="mb-6 break-inside-avoid relative z-10" // Masonry layout support
            onClick={onClick}
            onMouseEnter={() => onHover?.(true)}
            onMouseLeave={onMouseLeave}
        >
            <motion.div
                style={{
                    rotateX,
                    rotateY,
                    transformStyle: "preserve-3d",
                }}
                onMouseMove={onMouseMove}
                className={`group relative overflow-hidden bg-gradient-to-br from-[#1a1a2e] via-[#1e1e3a] to-[#16213e] border rounded-3xl p-6 transition-all duration-300 cursor-pointer ${isHighlighted
                    ? 'border-indigo-400 shadow-[0_0_30px_rgba(99,102,241,0.3)]'
                    : 'border-white/10 hover:border-indigo-500/40 hover:shadow-2xl hover:shadow-indigo-500/20'
                    }`}
            >
                {/* Spotlight Gradient */}
                <motion.div
                    className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{
                        background: useTransform(
                            [mouseX, mouseY],
                            ([xVal, yVal]) => `radial-gradient(600px circle at ${Number(xVal) + 200}px ${Number(yVal) + 200}px, rgba(99, 102, 241, 0.15), transparent 40%)`
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

    // Question Bridge View
    const [viewingQuestion, setViewingQuestion] = useState<string | null>(null);

    // InsightDrawer (Sequence Card) 상태
    const [selectedConceptForDrawer, setSelectedConceptForDrawer] = useState<ConceptCard | null>(null);

    // 새 카드 생성 모드: InsightDrawer에서 새 카드 생성 시 사용
    const [isNewCardMode, setIsNewCardMode] = useState(false);

    // 편집 모드: 기존 카드를 편집 모드로 열기
    const [isEditMode, setIsEditMode] = useState(false);

    // Graph Visualization State
    const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
    const [cardPositions, setCardPositions] = useState<Record<string, Point>>({});
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [connections, setConnections] = useState<Connection[]>([]);

    // Calculate connections between concepts based on question similarity
    useEffect(() => {
        if (concepts.length < 2) return;

        const newConnections: Connection[] = [];

        for (let i = 0; i < concepts.length; i++) {
            for (let j = i + 1; j < concepts.length; j++) {
                const c1 = concepts[i];
                const c2 = concepts[j];

                // Use the imported similarity function directly
                // Logic mostly duplicated here to avoid complex imports if needed, 
                // but utilizing the logic from types/questionBridge works best if available.
                // Assuming simple Jaccard check for performance here or use imported function

                // Simple implementation to avoid import issues for now (or improve robustness)
                const q1 = c1.question?.toLowerCase().trim() || "";
                const q2 = c2.question?.toLowerCase().trim() || "";

                if (!q1 || !q2) continue;

                // Simple keyword overlap
                const keywords1 = new Set(q1.split(/\s+/).filter(w => w.length > 1));
                const keywords2 = new Set(q2.split(/\s+/).filter(w => w.length > 1));
                const intersection = new Set([...keywords1].filter(x => keywords2.has(x)));
                const union = new Set([...keywords1, ...keywords2]);
                const score = union.size > 0 ? intersection.size / union.size : 0;

                // Threshold for connection (loose to show more lines for "effect")
                if (score > 0.1) {
                    newConnections.push({
                        id: `${c1.id}-${c2.id}`,
                        start: c1.id,
                        end: c2.id,
                        score
                    });
                }
            }
        }
        setConnections(newConnections);
    }, [concepts]);

    // Update positions
    const updatePositions = React.useCallback(() => {
        if (!containerRef.current) return;

        const positions: Record<string, Point> = {};
        const containerRect = containerRef.current.getBoundingClientRect();

        concepts.forEach(concept => {
            const el = document.getElementById(`concept-card-${concept.id}`);
            if (el) {
                const rect = el.getBoundingClientRect();
                // Store center position relative to container
                positions[concept.id] = {
                    x: rect.left - containerRect.left + rect.width / 2,
                    y: rect.top - containerRect.top + rect.height / 2
                };
            }
        });

        setCardPositions(positions);
    }, [concepts]);

    // Listen for resize/scroll to update positions
    useEffect(() => {
        // Initial update with delay to allow layout
        setTimeout(updatePositions, 500);

        window.addEventListener('resize', updatePositions);
        // We only need resize, because scroll moves the SVG *with* the content (it's absolute in relative container)

        return () => window.removeEventListener('resize', updatePositions);
    }, [updatePositions]);

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
            // Trigger position update after data load
            setTimeout(updatePositions, 500);
        }, err => {
            console.error('Concepts fetch error:', err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [maxItems, updatePositions]);

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

    // Drawers connected concepts (for DetailDrawer navigation)
    const drawerConnectedConcepts = React.useMemo(() => {
        if (!selectedConceptForDrawer) return [];
        const relatedIds = new Set<string>();
        connections.forEach(conn => {
            if (conn.start === selectedConceptForDrawer.id) relatedIds.add(conn.end);
            if (conn.end === selectedConceptForDrawer.id) relatedIds.add(conn.start);
        });
        return concepts.filter(c => relatedIds.has(c.id));
    }, [selectedConceptForDrawer, connections, concepts]);

    // Graph Visualization State
    const connectedCardIds = React.useMemo(() => {
        if (!hoveredCardId) return new Set<string>();
        const ids = new Set<string>();
        connections.forEach(conn => {
            if (conn.start === hoveredCardId) ids.add(conn.end);
            if (conn.end === hoveredCardId) ids.add(conn.start);
        });
        return ids;
    }, [hoveredCardId, connections]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh] text-white/50">
                <div className="text-lg">로딩 중...</div>
            </div>
        );
    }

    return (
        <div className="w-full h-full overflow-y-auto bg-[#050505] relative">
            <div
                ref={containerRef}
                className="w-full max-w-[1600px] mx-auto px-4 md:px-10 py-20 md:py-32 min-h-screen relative"
            >
                {/* Connection Lines Layer */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible">
                    <defs>
                        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.5" />
                            <stop offset="100%" stopColor="#a855f7" stopOpacity="0.5" />
                        </linearGradient>
                    </defs>
                    {connections.map(conn => {
                        const start = cardPositions[conn.start];
                        const end = cardPositions[conn.end];
                        if (!start || !end) return null;

                        const isConnectedToHover = hoveredCardId === conn.start || hoveredCardId === conn.end;
                        // Show all lines faintly, highlight connected ones
                        const opacity = isConnectedToHover ? 0.6 : 0.03;
                        const width = isConnectedToHover ? 2 : 1;

                        return (
                            <motion.line
                                key={conn.id}
                                x1={start.x}
                                y1={start.y}
                                x2={end.x}
                                y2={end.y}
                                stroke={isConnectedToHover ? "url(#lineGradient)" : "white"}
                                strokeWidth={width}
                                initial={false}
                                animate={{
                                    opacity,
                                    strokeWidth: width
                                }}
                                transition={{ duration: 0.3 }}
                            />
                        );
                    })}
                </svg>

                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="mb-12 relative z-10"
                >
                    <h1 className="font-['Anton'] text-[clamp(2.5rem,6vw,5rem)] leading-[0.9] text-white overflow-hidden">
                        CONCEPT CARDS
                    </h1>
                    <div className="flex items-center gap-4 mt-4">
                        <p className="font-['Inter'] text-sm md:text-base text-white/50 tracking-wide">
                            사고가 이동하는 지점을 기록합니다 ({concepts.length})
                        </p>
                        {connections.length > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
                                {connections.length} Connections
                            </span>
                        )}
                    </div>
                </motion.div>

                {/* Loading */}
                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-64 bg-white/5 rounded-2xl animate-pulse"></div>
                        ))}
                    </div>
                ) : concepts.length === 0 ? (
                    <div className="text-center py-20 border border-dashed border-white/10 rounded-3xl relative z-10">
                        <Lightbulb className="w-12 h-12 mx-auto mb-4 text-yellow-500/50" />
                        <p className="text-white/30 text-lg mb-2">아직 개념 카드가 없습니다</p>
                        <p className="text-white/20 text-sm">첫 번째 개념을 기록해보세요</p>
                    </div>
                ) : (
                    // Masonry Layout using Columns
                    <div className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6 relative z-10">
                        <AnimatePresence>
                            {concepts.map((concept, index) => {
                                const isHovered = hoveredCardId === concept.id;
                                const isConnected = connectedCardIds.has(concept.id);
                                const isDimmed = hoveredCardId !== null && !isHovered && !isConnected;
                                const isHighlighted = isHovered || isConnected;

                                return (
                                    <TiltCard
                                        key={concept.id}
                                        id={`concept-card-${concept.id}`}
                                        index={index}
                                        onClick={() => {
                                            setSelectedConceptForDrawer(concept);
                                            setIsEditMode(false); // Open in view mode
                                            setIsNewCardMode(false);
                                        }}
                                        onHover={(isHovering) => setHoveredCardId(isHovering ? concept.id : null)}
                                        isDimmed={isDimmed}
                                        isHighlighted={isHighlighted}
                                    >
                                        {/* Type Badge */}
                                        <div className="absolute top-4 right-4 z-10">
                                            <span
                                                className={`px-3 py-1.5 text-[10px] uppercase tracking-widest rounded-full border backdrop-blur-sm flex items-center gap-1.5 shadow-lg transition-all duration-300 ${isHighlighted
                                                    ? 'bg-indigo-500/30 text-white border-indigo-500/50 shadow-indigo-500/20'
                                                    : 'bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-indigo-300 border-indigo-500/20 shadow-indigo-500/5'
                                                    }`}
                                            >
                                                <Lightbulb size={10} className={isHighlighted ? "text-white" : "text-yellow-400"} />
                                                CONCEPT
                                            </span>
                                        </div>

                                        {/* Content */}
                                        <div className="relative z-10 pr-4">
                                            <h3 className={`text-3xl font-bold mb-4 transition-colors tracking-tight ${isHighlighted ? "text-white scale-[1.02] origin-left" : "text-white group-hover:text-indigo-100"
                                                }`}>
                                                {concept.conceptName}
                                            </h3>

                                            {concept.conceptPhrase && (
                                                <p className="text-white/60 text-sm leading-relaxed mb-6 italic border-l-2 border-indigo-500/30 pl-4 py-1">
                                                    "{concept.conceptPhrase.slice(0, 100)}{concept.conceptPhrase.length > 100 ? '...' : ''}"
                                                </p>
                                            )}

                                            {/* Question Section - Compact */}
                                            <div className={`mt-3 pt-3 border-t transition-colors ${isHighlighted ? "border-indigo-500/30" : "border-white/5"}`}>
                                                <p className="text-[10px] uppercase tracking-widest text-white/30 mb-1 font-medium flex items-center gap-1.5">
                                                    <span className="text-indigo-400">Q.</span> 질문
                                                </p>
                                                <p className={`text-xs leading-relaxed transition-colors ${isHighlighted ? "text-white/70" : "text-white/50"}`}>
                                                    {concept.question}
                                                </p>
                                            </div>

                                            {/* A-B Content - Main Highlight */}
                                            {(() => {
                                                const aText = (concept as any).aStatement || (concept as any).sequence?.aStatement || concept.bridge?.aStatement;
                                                const bText = (concept as any).conclusion || concept.bridge?.bStatement;

                                                if (!aText && !bText) return null;

                                                return (
                                                    <div className={`mt-4 rounded-xl border overflow-hidden transition-colors ${isHighlighted
                                                        ? "bg-indigo-900/30 border-indigo-500/30"
                                                        : "bg-black/30 border-white/5"
                                                        }`}>
                                                        <p className="text-sm leading-relaxed p-4">
                                                            {aText && (
                                                                <span className="text-white/50 block mb-2">
                                                                    "우리는 보통 <span className="text-white/80">{concept.conceptName}</span>을(를) <span className="text-white/80">{aText}</span>라고 생각합니다.
                                                                </span>
                                                            )}

                                                            {aText && bText && <span className="text-indigo-400 font-bold mr-2">그러나</span>}

                                                            {bText && (
                                                                <span className={`font-medium ${isHighlighted ? "text-white" : "text-emerald-300/90"}`}>
                                                                    성경은 <span className="text-indigo-200">{concept.conceptName}</span>은(는) {aText && <span className="opacity-60 line-through decoration-white/30 mr-1">{aText}가 아니라</span>} <span className="font-bold border-b border-white/20 pb-0.5">{bText}</span>라고 말합니다."
                                                                </span>
                                                            )}
                                                        </p>
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
                                );
                            })}
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
            {/* 1. View Mode: ConceptDetailDrawer */}
            {selectedConceptForDrawer && !isEditMode && !isNewCardMode && (
                <ConceptDetailDrawer
                    concept={selectedConceptForDrawer}
                    isOpen={true}
                    onClose={() => setSelectedConceptForDrawer(null)}
                    connectedConcepts={drawerConnectedConcepts}
                    onNavigate={(nextConcept) => setSelectedConceptForDrawer(nextConcept)}
                    onEdit={() => setIsEditMode(true)}
                />
            )}

            {/* 2. Edit/New Mode: InsightDrawer */}
            {selectedConceptForDrawer && (isEditMode || isNewCardMode) && (
                <InsightDrawer
                    concept={selectedConceptForDrawer}
                    isOpen={true}
                    onClose={() => {
                        if (isNewCardMode) {
                            setSelectedConceptForDrawer(null);
                        } else {
                            setIsEditMode(false); // Return to view mode
                        }
                    }}
                    onUpdate={(updated) => {
                        handleConceptUpdate(updated);
                        setSelectedConceptForDrawer(updated);
                    }}
                    isNewMode={isNewCardMode}
                    isEditMode={true}
                    currentUser={currentUser}
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
