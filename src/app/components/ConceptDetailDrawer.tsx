import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useAnimation } from 'motion/react';
import { X, ChevronDown, ChevronRight, Minimize2, ExternalLink, ArrowRight, Share2, FileText, Newspaper } from 'lucide-react';
import { ConceptCard, SequenceItem } from '../types/questionBridge';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

// ----------------------------------------------------------------------
// Types & Interfaces
// ----------------------------------------------------------------------

interface ConceptDetailDrawerProps {
    concept: ConceptCard;
    isOpen: boolean;
    onClose: () => void;
    connectedConcepts: ConceptCard[]; // Connectable concepts passed from parent
    onNavigate: (concept: ConceptCard) => void; // Smooth transition handler
    onEdit: () => void; // Switch to edit mode
}

interface LoadedReference {
    id: string;
    type: 'news' | 'reflection';
    title: string;
    content: string;
    image?: string;
    url?: string;
}

// ----------------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------------

// 1. Reference Accordion Item
const ReferenceAccordion = ({ title, items, icon: Icon }: { title: string, items: LoadedReference[], icon: any }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    if (items.length === 0) return null;

    return (
        <div className="mb-4 border border-white/10 rounded-xl overflow-hidden bg-white/5 backdrop-blur-sm transition-all duration-300">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-white/10 text-indigo-300">
                        <Icon size={18} />
                    </div>
                    <span className="font-medium text-white/90">{title} ({items.length})</span>
                </div>
                <ChevronDown
                    size={20}
                    className={`text-white/50 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                />
            </button>
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                    >
                        <div className="border-t border-white/10">
                            {items.map((item, idx) => (
                                <div key={item.id} className="p-4 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors group">
                                    <div className="flex gap-4">
                                        {item.image && (
                                            <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-black/20">
                                                <img src={item.image} alt="" className="w-full h-full object-cover" />
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-semibold text-white/90 mb-1 leading-tight group-hover:text-indigo-300 transition-colors">
                                                {item.title}
                                            </h4>
                                            <p className="text-xs text-white/50 line-clamp-2 mb-2">
                                                {item.content}
                                            </p>
                                            {item.url && (
                                                <a
                                                    href={item.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 hover:underline"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    원본 보기 <ExternalLink size={10} />
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ----------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------

export const ConceptDetailDrawer: React.FC<ConceptDetailDrawerProps> = ({
    concept,
    isOpen,
    onClose,
    connectedConcepts,
    onNavigate,
    onEdit
}) => {
    // ----------------------------------
    // Local State
    // ----------------------------------
    const [references, setReferences] = useState<{ news: LoadedReference[], reflections: LoadedReference[] }>({ news: [], reflections: [] });
    const [loadingRefs, setLoadingRefs] = useState(false);

    // ----------------------------------
    // Effects
    // ----------------------------------

    // Load referenced data when concept changes
    useEffect(() => {
        const loadReferences = async () => {
            if (!concept.sequence) return;
            setLoadingRefs(true); // Reset references visual state if needed, but maybe kept subtle

            const news: LoadedReference[] = [];
            const reflections: LoadedReference[] = [];

            // Load News
            if (concept.sequence.recent) {
                for (const item of concept.sequence.recent) {
                    try {
                        const snap = await getDoc(doc(db, 'updates', item.sourceId));
                        if (snap.exists()) {
                            const data = snap.data();
                            news.push({
                                id: snap.id,
                                type: 'news',
                                title: data.title,
                                content: typeof data.content === 'string' ? data.content : '내용 없음',
                                image: data.image || data.additionalImages?.[0],
                                url: data.link // assuming link exists or constructs from ID
                            });
                        }
                    } catch (e) { console.error(e); }
                }
            }

            // Load Reflections
            if (concept.sequence.scriptureSupport) {
                for (const item of concept.sequence.scriptureSupport) {
                    try {
                        // Optimistically use loaded data if passed, but here we fetch fresh
                        // We need to know path or search. For now assume we have path or try global search?
                        // InsightDrawer had complex loading logic. Let's simplify: 
                        // If sourcePath exists use it, otherwise skip or try collectionGroup query (too heavy here?)
                        // We will rely on sourcePath being present from valid data
                        if (item.sourcePath) {
                            const snap = await getDoc(doc(db, item.sourcePath));
                            if (snap.exists()) {
                                const data = snap.data();
                                reflections.push({
                                    id: snap.id,
                                    type: 'reflection',
                                    title: data.parentTitle || '무제 묵상',
                                    content: data.text || data.content,
                                    image: data.imageUrl || data.parentImage
                                });
                            }
                        }
                    } catch (e) { console.error(e); }
                }
            }

            setReferences({ news, reflections });
            setLoadingRefs(false);
        };

        if (isOpen) loadReferences();
    }, [concept.id, isOpen]); // Keyed by ID to reload on navigate

    // ----------------------------------
    // Render
    // ----------------------------------

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop - Dims the main dashboard but keeps context */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[60]"
                    />

                    {/* Sliding Drawer Panel */}
                    <motion.div
                        layoutId={`drawer-${concept.id}`} // Helper for smooth transition if needed
                        initial={{ x: '100%', opacity: 0.5 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: '100%', opacity: 0 }}
                        transition={{ type: "spring", damping: 30, stiffness: 300 }}
                        className="fixed top-0 right-0 w-full md:w-[65vw] max-w-[800px] h-full bg-[#0a0a0a] border-l border-white/10 shadow-2xl z-[70] flex flex-col overflow-hidden"
                    >
                        {/* 1. Header Actions */}
                        <div className="flex items-center justify-between p-6 border-b border-white/5 relative z-10 bg-[#0a0a0a]/80 backdrop-blur-md">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-indigo-400 tracking-wider">CONCEPT CARD</span>
                                <span className="text-xs text-white/30">•</span>
                                <span className="text-xs text-white/50 uppercase">{concept.conceptName}</span>
                            </div>
                            <div className="flex items-center gap-4">
                                <button onClick={onEdit} className="text-xs text-white/40 hover:text-white transition-colors uppercase tracking-wider">
                                    Edit
                                </button>
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-full hover:bg-white/10 text-white/70 transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* 2. Scrollable Content */}
                        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-10 scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20">

                            {/* Hero Section: Question & Conclusion */}
                            <div className="mb-12">
                                <motion.h2
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.1 }}
                                    className="text-2xl md:text-4xl font-light text-white leading-tight mb-8"
                                >
                                    <span className="text-indigo-400">Q.</span> {concept.question}
                                </motion.h2>

                                {concept.conclusion && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.2 }}
                                        className="pl-6 border-l-2 border-indigo-500/50"
                                    >
                                        <h3 className="text-sm font-bold text-indigo-400 mb-2 uppercase tracking-wide">Insight</h3>
                                        <p className="text-lg md:text-xl text-white/90 font-medium leading-relaxed">
                                            {concept.conclusion}
                                        </p>
                                    </motion.div>
                                )}
                            </div>

                            {/* Reference Data (Progressive Disclosure) */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.3 }}
                                className="space-y-2"
                            >
                                <h3 className="text-xs font-mono text-white/30 mb-4 uppercase tracking-widest">References & Support</h3>

                                <ReferenceAccordion
                                    title="Linked News"
                                    items={references.news}
                                    icon={Newspaper}
                                />

                                <ReferenceAccordion
                                    title="Scripture & Reflections"
                                    items={references.reflections}
                                    icon={FileText}
                                />

                                {(!references.news.length && !references.reflections.length) && (
                                    <div className="p-4 border border-dashed border-white/10 rounded-xl text-center text-white/20 text-sm">
                                        No linked references yet.
                                    </div>
                                )}
                            </motion.div>

                            {/* Spacer */}
                            <div className="h-20"></div>
                        </div>

                        {/* 3. Footer: Connected Navigation */}
                        <div className="border-t border-white/10 bg-[#0f0f0f] p-6 shrink-0 relative z-20">
                            <h3 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                <Share2 size={12} /> Connected Concepts ({connectedConcepts.length})
                            </h3>

                            {connectedConcepts.length > 0 ? (
                                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x">
                                    {connectedConcepts.map((conn) => (
                                        <motion.button
                                            key={conn.id}
                                            onClick={() => onNavigate(conn)}
                                            whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.08)' }}
                                            whileTap={{ scale: 0.98 }}
                                            className="min-w-[200px] w-[200px] p-4 bg-white/5 border border-white/5 rounded-xl text-left transition-colors snap-start group"
                                        >
                                            <div className="flex items-center justify-between mb-2 opacity-50 group-hover:opacity-100 transition-opacity">
                                                <span className="text-[10px] text-indigo-300 font-mono">LINKED</span>
                                                <ArrowRight size={12} className="text-white transform group-hover:translate-x-1 transition-transform" />
                                            </div>
                                            <h4 className="text-sm font-semibold text-white/90 mb-1 line-clamp-1">{conn.conceptName}</h4>
                                            <p className="text-xs text-white/40 line-clamp-2 leading-relaxed">
                                                {conn.question}
                                            </p>
                                        </motion.button>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-white/20 italic">No connected concepts found.</p>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
