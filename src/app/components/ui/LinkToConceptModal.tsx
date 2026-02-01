import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Pin, Link2 } from 'lucide-react';
import { collection, query, onSnapshot, orderBy, doc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { ConceptCard, EvidenceItem, BridgeData } from '../../types/questionBridge';

interface LinkToConceptModalProps {
    sourceType: 'news' | 'reflection';
    sourceId: string;
    sourcePath?: string; // Add sourcePath
    sourceTitle?: string;
    sourceExcerpt?: string;
    onClose: () => void;
    onSuccess?: () => void;
}

export const LinkToConceptModal: React.FC<LinkToConceptModalProps> = ({
    sourceId,
    sourceType,
    sourcePath,
    sourceTitle,
    sourceExcerpt,
    onClose,
    onSuccess
}) => {
    const [concepts, setConcepts] = useState<ConceptCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Form state
    const [selectedConcept, setSelectedConcept] = useState<ConceptCard | null>(null);
    const [slot, setSlot] = useState<'A' | 'B'>(sourceType === 'reflection' ? 'B' : 'A');
    const [why, setWhy] = useState('');
    const [pinned, setPinned] = useState(true);
    const [excerpt, setExcerpt] = useState(sourceExcerpt || '');

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
        });
        return () => unsubscribe();
    }, []);

    // Filter concepts by search
    const filteredConcepts = concepts.filter(c =>
        c.conceptName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.question?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Handle save
    const handleSave = async () => {
        if (!selectedConcept || !excerpt.trim()) return;

        setSaving(true);
        try {
            const evidenceItem: EvidenceItem = {
                id: `${sourceType}_${sourceId}_${Date.now()}`,
                sourceId,
                sourceType,
                title: sourceTitle,
                excerpt: excerpt.trim(),
                why: why.trim() || undefined,
                pinned,
                createdBy: 'manual',
                addedAt: serverTimestamp()
            };

            // Get current bridge data or create new (Legacy support)
            const currentBridge: BridgeData = selectedConcept.bridge || {
                aEvidence: [],
                bEvidence: []
            };

            // Add to appropriate array (Legacy)
            if (slot === 'A') {
                currentBridge.aEvidence = [...currentBridge.aEvidence, evidenceItem];
            } else {
                currentBridge.bEvidence = [...currentBridge.bEvidence, evidenceItem];
            }

            // NEW: Sequence system 업데이트
            const currentSequence = selectedConcept.sequence || {
                recent: [],
                responses: [],
                scriptureSupport: []
            };

            // SequenceItem 생성
            const sequenceItem = {
                sourceType,
                sourceId,
                sourcePath, // Save sourcePath
                pinned,
                confidence: 1.0, // 수동 연결 = 100% 신뢰도
                addedAt: serverTimestamp()
            };

            // sourceType에 따라 적절한 배열에 추가
            if (sourceType === 'news') {
                // 중복 방지
                if (!currentSequence.recent.find(r => r.sourceId === sourceId)) {
                    currentSequence.recent = [...currentSequence.recent, sequenceItem];
                }
            } else if (sourceType === 'reflection') {
                // 중복 방지
                if (!currentSequence.scriptureSupport.find(s => s.sourceId === sourceId)) {
                    currentSequence.scriptureSupport = [...currentSequence.scriptureSupport, sequenceItem];
                }
            }

            // Update Firestore (both legacy bridge and new sequence)
            await updateDoc(doc(db, 'concepts', selectedConcept.id), {
                bridge: currentBridge,
                sequence: currentSequence,
                updatedAt: serverTimestamp()
            });

            onSuccess?.();
            onClose();
        } catch (err) {
            console.error('Link to concept error:', err);
            alert('연결 실패');
        } finally {
            setSaving(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[4000] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                className="bg-gradient-to-br from-[#1a1a2e] to-[#16213e] rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-white/10 shadow-2xl"
            >
                <div className="p-6">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-white flex items-center gap-3">
                            <Link2 className="text-indigo-400" size={20} />
                            개념 카드에 연결
                        </h2>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/10 rounded-full transition-colors"
                        >
                            <X className="text-white/50" size={18} />
                        </button>
                    </div>

                    {/* Source Preview */}
                    <div className="mb-6 p-4 bg-white/5 rounded-xl border border-white/10">
                        <div className="flex items-center gap-2 mb-2">
                            <span className={`px-2 py-0.5 text-[10px] rounded-full uppercase tracking-wider ${sourceType === 'news'
                                ? 'bg-orange-500/20 text-orange-300'
                                : 'bg-purple-500/20 text-purple-300'
                                }`}>
                                {sourceType === 'news' ? '뉴스' : '묵상'}
                            </span>
                        </div>
                        {sourceTitle && (
                            <p className="text-white/80 text-sm font-medium mb-1 line-clamp-1">{sourceTitle}</p>
                        )}
                        <textarea
                            value={excerpt}
                            onChange={e => setExcerpt(e.target.value)}
                            placeholder="연결할 발췌 내용을 입력하세요..."
                            rows={2}
                            className="w-full bg-transparent text-white/60 text-xs resize-none focus:outline-none placeholder-white/30"
                        />
                    </div>

                    {/* Concept Search */}
                    <div className="mb-4">
                        <label className="block text-white/70 text-sm mb-2">개념 카드 선택</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="개념 이름 검색..."
                                className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50"
                            />
                        </div>
                    </div>

                    {/* Concept List */}
                    <div className="mb-6 max-h-40 overflow-y-auto space-y-2">
                        {loading ? (
                            <div className="text-center py-4 text-white/30">로딩 중...</div>
                        ) : filteredConcepts.length === 0 ? (
                            <div className="text-center py-4 text-white/30">
                                {searchQuery ? '검색 결과 없음' : '개념 카드가 없습니다'}
                            </div>
                        ) : (
                            filteredConcepts.map(concept => (
                                <button
                                    key={concept.id}
                                    onClick={() => setSelectedConcept(concept)}
                                    className={`w-full text-left p-3 rounded-xl border transition-all ${selectedConcept?.id === concept.id
                                        ? 'bg-indigo-500/20 border-indigo-500/50'
                                        : 'bg-white/5 border-white/10 hover:border-white/20'
                                        }`}
                                >
                                    <p className="text-white font-medium text-sm">{concept.conceptName}</p>
                                    <p className="text-white/40 text-xs line-clamp-1">{concept.question}</p>
                                </button>
                            ))
                        )}
                    </div>

                    {/* Slot Selection */}
                    <div className="mb-4">
                        <label className="block text-white/70 text-sm mb-2">연결 위치</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setSlot('A')}
                                className={`p-4 rounded-xl border-2 transition-all text-left ${slot === 'A'
                                    ? 'border-orange-500 bg-orange-500/10'
                                    : 'border-white/10 bg-white/5 hover:border-white/20'
                                    }`}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-orange-400 font-bold">-A</span>
                                    <span className="text-xs text-orange-300/70">세상/오해</span>
                                </div>
                                <p className="text-[10px] text-white/40">
                                    우리는 보통 이렇게 생각함
                                </p>
                            </button>
                            <button
                                onClick={() => setSlot('B')}
                                className={`p-4 rounded-xl border-2 transition-all text-left ${slot === 'B'
                                    ? 'border-blue-500 bg-blue-500/10'
                                    : 'border-white/10 bg-white/5 hover:border-white/20'
                                    }`}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-blue-400 font-bold">~B</span>
                                    <span className="text-xs text-blue-300/70">성경/재해석</span>
                                </div>
                                <p className="text-[10px] text-white/40">
                                    성경에서 이렇게 부름
                                </p>
                            </button>
                        </div>
                    </div>

                    {/* Why Field */}
                    <div className="mb-4">
                        <label className="block text-white/50 text-sm mb-2">이유 (선택)</label>
                        <input
                            type="text"
                            value={why}
                            onChange={e => setWhy(e.target.value)}
                            placeholder="왜 이 증거가 여기에 속하나요?"
                            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-white/20"
                        />
                    </div>

                    {/* Pin Toggle */}
                    <div className="mb-6">
                        <button
                            onClick={() => setPinned(!pinned)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${pinned
                                ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                                : 'bg-white/5 text-white/50 border border-white/10'
                                }`}
                        >
                            <Pin size={14} className={pinned ? 'fill-current' : ''} />
                            <span className="text-sm">핀으로 고정</span>
                        </button>
                        <p className="text-[10px] text-white/30 mt-1 ml-1">
                            핀 고정된 증거는 개념 카드에 우선 표시됩니다
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-5 py-2.5 rounded-xl text-white/70 hover:bg-white/10 transition-colors"
                        >
                            취소
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || !selectedConcept || !excerpt.trim()}
                            className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {saving && (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            )}
                            연결하기
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default LinkToConceptModal;
