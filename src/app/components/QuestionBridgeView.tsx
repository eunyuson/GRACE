import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Link2, FileText, Lightbulb, BookOpen, ExternalLink } from 'lucide-react';
import { collection, query, onSnapshot, collectionGroup, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import {
    RelatedItem,
    ContentType,
    calculateQuestionSimilarity,
    findSimilarQuestions
} from '../types/questionBridge';

interface QuestionBridgeViewProps {
    question: string;
    onClose: () => void;
    excludeId?: string;
    excludeType?: ContentType;
}

// 타입별 아이콘
const TypeIcon = ({ type }: { type: ContentType }) => {
    switch (type) {
        case 'news':
            return <FileText size={16} className="text-blue-400" />;
        case 'concept':
            return <Lightbulb size={16} className="text-yellow-400" />;
        case 'reflection':
            return <BookOpen size={16} className="text-green-400" />;
    }
};

// 타입별 라벨
const TypeLabel = ({ type }: { type: ContentType }) => {
    const labels = {
        news: { text: 'NEWS', color: 'bg-blue-500/20 text-blue-300' },
        concept: { text: 'CONCEPT', color: 'bg-yellow-500/20 text-yellow-300' },
        reflection: { text: 'REFLECTION', color: 'bg-green-500/20 text-green-300' }
    };
    const label = labels[type];

    return (
        <span className={`px-2 py-0.5 text-[10px] uppercase tracking-widest rounded-full ${label.color}`}>
            {label.text}
        </span>
    );
};

export const QuestionBridgeView: React.FC<QuestionBridgeViewProps> = ({
    question,
    onClose,
    excludeId,
    excludeType
}) => {
    const [loading, setLoading] = useState(true);
    const [relatedItems, setRelatedItems] = useState<{
        news: RelatedItem[];
        concept: RelatedItem[];
        reflection: RelatedItem[];
    }>({
        news: [],
        concept: [],
        reflection: []
    });

    // 모든 콘텐츠에서 비슷한 질문 찾기
    useEffect(() => {
        const fetchRelated = async () => {
            setLoading(true);

            try {
                const allItems: RelatedItem[] = [];

                // 1. 뉴스 (updates 컬렉션)에서 question 필드가 있는 것들
                const updatesSnapshot = await getDocs(collection(db, 'updates'));
                updatesSnapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.question && doc.id !== excludeId) {
                        allItems.push({
                            id: doc.id,
                            type: 'news',
                            title: data.title || '제목 없음',
                            question: data.question,
                            preview: data.subtitle || data.desc?.substring(0, 50),
                            createdAt: data.createdAt
                        });
                    }
                });

                // 2. 개념 카드
                const conceptsSnapshot = await getDocs(collection(db, 'concepts'));
                conceptsSnapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.question && doc.id !== excludeId) {
                        allItems.push({
                            id: doc.id,
                            type: 'concept',
                            title: data.conceptName || '개념 없음',
                            question: data.question,
                            preview: data.conceptPhrase?.substring(0, 50),
                            createdAt: data.createdAt
                        });
                    }
                });

                // 3. 묵상 (memos - collection group)
                // 묵상은 gallery/{id}/memos 또는 users/{uid}/memos에 있음
                // collection group query 필요
                try {
                    const memosSnapshot = await getDocs(collectionGroup(db, 'memos'));
                    memosSnapshot.forEach(doc => {
                        const data = doc.data();
                        if (data.question && doc.id !== excludeId) {
                            allItems.push({
                                id: doc.id,
                                type: 'reflection',
                                title: data.parentTitle || '묵상',
                                question: data.question,
                                preview: data.text?.substring(0, 50),
                                createdAt: data.createdAt
                            });
                        }
                    });
                } catch (e) {
                    console.warn('Memos collection group query failed:', e);
                }

                // 유사도 계산 및 분류
                const similarItems = findSimilarQuestions(question, allItems, 0.2);

                const grouped = {
                    news: [] as RelatedItem[],
                    concept: [] as RelatedItem[],
                    reflection: [] as RelatedItem[]
                };

                similarItems.forEach(({ item, score }) => {
                    // 자기 자신 제외
                    if (item.id === excludeId && item.type === excludeType) return;
                    grouped[item.type].push(item);
                });

                setRelatedItems(grouped);
            } catch (error) {
                console.error('Fetch related items error:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchRelated();
    }, [question, excludeId, excludeType]);

    const totalCount = relatedItems.news.length + relatedItems.concept.length + relatedItems.reflection.length;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[4000] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4"
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                onClick={e => e.stopPropagation()}
                className="bg-gradient-to-br from-[#0f0f1a] to-[#1a1a2e] border border-white/10 rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl"
            >
                {/* Header */}
                <div className="p-6 border-b border-white/10">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center">
                                <Link2 size={20} className="text-white" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">같은 질문을 품은 기록들</h2>
                                <p className="text-white/40 text-xs mt-0.5">{totalCount}개의 연결된 기록</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/10 rounded-full transition-colors"
                        >
                            <X size={20} className="text-white/50" />
                        </button>
                    </div>

                    {/* Question Display */}
                    <div className="mt-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                        <p className="text-white/40 text-[10px] uppercase tracking-widest mb-2">질문</p>
                        <p className="text-white text-lg font-medium leading-relaxed">
                            Q. {question}
                        </p>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[calc(85vh-200px)] custom-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4" />
                            <p className="text-white/40 text-sm">연결된 기록을 찾는 중...</p>
                        </div>
                    ) : totalCount === 0 ? (
                        <div className="text-center py-12">
                            <div className="w-16 h-16 mx-auto mb-4 bg-white/5 rounded-2xl flex items-center justify-center">
                                <Link2 size={24} className="text-white/20" />
                            </div>
                            <p className="text-white/40 text-sm mb-2">아직 비슷한 질문을 품은 기록이 없습니다</p>
                            <p className="text-white/20 text-xs">더 많은 콘텐츠에 질문을 추가해보세요</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* News Section */}
                            {relatedItems.news.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <FileText size={14} className="text-blue-400" />
                                        <h3 className="text-white/60 text-sm font-medium">NEWS</h3>
                                        <span className="text-white/30 text-xs">({relatedItems.news.length})</span>
                                    </div>
                                    <div className="space-y-2">
                                        {relatedItems.news.map(item => (
                                            <div
                                                key={item.id}
                                                className="p-4 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 hover:border-blue-500/30 transition-all cursor-pointer group"
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <p className="text-white font-medium group-hover:text-blue-300 transition-colors">
                                                            {item.title}
                                                        </p>
                                                        {item.preview && (
                                                            <p className="text-white/40 text-sm mt-1 line-clamp-1">{item.preview}</p>
                                                        )}
                                                    </div>
                                                    <ExternalLink size={14} className="text-white/20 group-hover:text-blue-400 transition-colors mt-1" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Concept Section */}
                            {relatedItems.concept.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <Lightbulb size={14} className="text-yellow-400" />
                                        <h3 className="text-white/60 text-sm font-medium">CONCEPT</h3>
                                        <span className="text-white/30 text-xs">({relatedItems.concept.length})</span>
                                    </div>
                                    <div className="space-y-2">
                                        {relatedItems.concept.map(item => (
                                            <div
                                                key={item.id}
                                                className="p-4 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 hover:border-yellow-500/30 transition-all cursor-pointer group"
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <p className="text-white font-medium group-hover:text-yellow-300 transition-colors">
                                                            {item.title}
                                                        </p>
                                                        {item.preview && (
                                                            <p className="text-white/40 text-sm mt-1 italic line-clamp-1">"{item.preview}"</p>
                                                        )}
                                                    </div>
                                                    <ExternalLink size={14} className="text-white/20 group-hover:text-yellow-400 transition-colors mt-1" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Reflection Section */}
                            {relatedItems.reflection.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <BookOpen size={14} className="text-green-400" />
                                        <h3 className="text-white/60 text-sm font-medium">REFLECTION</h3>
                                        <span className="text-white/30 text-xs">({relatedItems.reflection.length})</span>
                                    </div>
                                    <div className="space-y-2">
                                        {relatedItems.reflection.map(item => (
                                            <div
                                                key={item.id}
                                                className="p-4 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 hover:border-green-500/30 transition-all cursor-pointer group"
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <p className="text-white font-medium group-hover:text-green-300 transition-colors">
                                                            {item.title}
                                                        </p>
                                                        {item.preview && (
                                                            <p className="text-white/40 text-sm mt-1 line-clamp-1">{item.preview}...</p>
                                                        )}
                                                    </div>
                                                    <ExternalLink size={14} className="text-white/20 group-hover:text-green-400 transition-colors mt-1" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-white/5 bg-white/[0.02]">
                    <p className="text-center text-white/30 text-xs">
                        연결은 "매칭"이 아니라 "발견"입니다
                    </p>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default QuestionBridgeView;
