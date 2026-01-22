import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { collectionGroup, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

interface Memo {
    id: string;
    text: string;
    tags?: string[];
    userId: string;
    userName: string;
    userPhoto?: string;
    createdAt?: any;
    updatedAt?: any;
    // Denormalized parent data
    parentId?: string;
    parentTitle?: string;
    parentImage?: string;
    parentDate?: string;
}

interface MyReflectionsProps {
    onSelectCallback?: (parentId: string) => void;
}

export const MyReflections: React.FC<MyReflectionsProps> = ({ onSelectCallback }) => {
    const [memos, setMemos] = useState<Memo[]>([]);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [availableTags, setAvailableTags] = useState<{ tag: string; count: number }[]>([]);

    const [error, setError] = useState<string | null>(null);

    // Auth check
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            if (!user) {
                setLoading(false);
                setMemos([]);
            }
        });
        return () => unsubscribe();
    }, []);

    // Fetch Memos
    useEffect(() => {
        if (!currentUser) return;

        setLoading(true);
        setError(null);

        // Collection Group Query to get all memos by this user across all gallery items
        // IMPORTANT: This requires an index in Firestore console
        const q = query(
            collectionGroup(db, 'memos'),
            where('userId', '==', currentUser.uid),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedMemos = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Memo[];

            setMemos(fetchedMemos);
            setLoading(false);

            // Extract and count tags
            const tagCounts: Record<string, number> = {};
            fetchedMemos.forEach(memo => {
                if (memo.tags && Array.isArray(memo.tags)) {
                    memo.tags.forEach(tag => {
                        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                    });
                }
            });

            const sortedTags = Object.entries(tagCounts)
                .map(([tag, count]) => ({ tag, count }))
                .sort((a, b) => b.count - a.count);

            setAvailableTags(sortedTags);
        }, (err) => {
            console.error("Error fetching memos:", err);
            setLoading(false);
            if (err.code === 'failed-precondition') {
                setError('인덱스 생성 필요: 관리자 콘솔을 확인해주세요.');
            } else {
                setError('메모를 불러오는 중 오류가 발생했습니다.');
            }
        });

        return () => unsubscribe();
    }, [currentUser]);

    // Handle tag toggle
    const toggleTag = (tag: string) => {
        setSelectedTags(prev =>
            prev.includes(tag)
                ? prev.filter(t => t !== tag)
                : [...prev, tag]
        );
    };

    // Filter memos
    const filteredMemos = memos.filter(memo => {
        if (selectedTags.length === 0) return true;
        if (!memo.tags) return false;
        // Check if memo has ALL selected tags (AND logic)
        // or ANY selected tag (OR logic)? "Recent Updates" usually uses OR or AND.
        // Let's use OR for broader discovery, or AND for specific drill-down.
        // Common tag filtering often implies "contains any of these" effectively filtering down.
        // Let's stick to: Show items that have AT LEAST ONE of the selected tags.
        // Wait, typical multi-select filter means "Show items related to Tag A OR Tag B".
        return selectedTags.some(tag => memo.tags?.includes(tag));
    });

    if (!currentUser) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-white/50">
                <div className="text-4xl mb-4">🔒</div>
                <p>로그인이 필요한 서비스입니다.</p>
            </div>
        );
    }

    return (
        <div className="w-full max-w-[1600px] mx-auto px-4 md:px-10 py-20 md:py-32 min-h-screen">
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <h1 className="font-['Anton'] text-[clamp(3rem,8vw,6rem)] leading-[0.9] text-white overflow-hidden">
                        MY REFLECTIONS
                    </h1>
                    <p className="font-['Inter'] text-sm md:text-base text-white/50 mt-4 tracking-wide">
                        나의 묵상 기록과 은혜의 흔적들 ({filteredMemos.length})
                    </p>
                </motion.div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="mb-8 p-4 border border-red-500/50 bg-red-500/10 rounded-xl text-red-200 text-sm">
                    ⚠️ {error} <br />
                    (개발자 도구 콘솔에서 Firebase 인덱스 생성 링크를 확인해야 할 수 있습니다.)
                </div>
            )}

            {/* Tag Filters */}
            {availableTags.length > 0 && (
                <motion.div
                    className="flex flex-wrap gap-2 mb-12"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                >
                    {availableTags.map(({ tag, count }) => (
                        <button
                            key={tag}
                            onClick={() => toggleTag(tag)}
                            className={`px-4 py-1.5 rounded-full text-xs md:text-sm border transition-all duration-300 ${selectedTags.includes(tag)
                                ? 'bg-white text-black border-white'
                                : 'bg-transparent text-white/60 border-white/20 hover:border-white/50'
                                }`}
                        >
                            #{tag} <span className="opacity-50 ml-1 text-[10px]">{count}</span>
                        </button>
                    ))}
                    {selectedTags.length > 0 && (
                        <button
                            onClick={() => setSelectedTags([])}
                            className="px-4 py-1.5 rounded-full text-xs md:text-sm text-red-400 hover:text-red-300 transition-colors"
                        >
                            Clear Filters
                        </button>
                    )}
                </motion.div>
            )}

            {/* Memos Grid */}
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-64 bg-white/5 rounded-2xl animate-pulse"></div>
                    ))}
                </div>
            ) : filteredMemos.length === 0 ? (
                <div className="text-center py-20 border border-dashed border-white/10 rounded-3xl">
                    <p className="text-white/30 text-lg">기록된 묵상이 없습니다.</p>
                </div>
            ) : (
                <div className="masonry-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <AnimatePresence>
                        {filteredMemos.map((memo, index) => (
                            <motion.div
                                key={memo.id}
                                layout
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.3, delay: index * 0.05 }}
                                className="bg-[#111] border border-white/10 rounded-3xl p-6 hover:border-white/30 transition-colors group relative overflow-hidden"
                            >
                                {/* Background Image (Subtle) */}
                                {memo.parentImage && (
                                    <div className="absolute inset-0 z-0 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <img src={memo.parentImage} className="w-full h-full object-cover grayscale" alt="" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-[#111] via-[#111]/80 to-transparent"></div>
                                    </div>
                                )}

                                <div className="relative z-10 flex flex-col h-full">
                                    {/* Header: Date & Parent Link */}
                                    <div className="flex justify-between items-start mb-4">
                                        <span className="text-xs text-white/40 font-mono">
                                            {memo.createdAt?.seconds ? new Date(memo.createdAt.seconds * 1000).toLocaleDateString() : 'Draft'}
                                        </span>
                                        {memo.parentId && (
                                            <a
                                                href="#" // Handled by standard Link or callback usually, but item ID is needed
                                                // We rely on parent calling logic or proper routing
                                                // Assuming we can pass a handler to open detail view
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    if (onSelectCallback && memo.parentId) {
                                                        onSelectCallback(memo.parentId);
                                                    }
                                                }}
                                                className="text-[10px] uppercase tracking-wider text-yellow-500/80 hover:text-yellow-400 border border-yellow-500/30 px-2 py-1 rounded hover:bg-yellow-500/10 transition-all truncate max-w-[150px]"
                                            >
                                                {memo.parentTitle || 'View Original'} ↗
                                            </a>
                                        )}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 mb-6">
                                        <p className="text-white/80 whitespace-pre-wrap leading-relaxed text-sm md:text-base line-clamp-[10]">
                                            {memo.text}
                                        </p>
                                    </div>

                                    {/* Tags */}
                                    {memo.tags && memo.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-auto pt-4 border-t border-white/5">
                                            {memo.tags.map(tag => (
                                                <span
                                                    key={tag}
                                                    className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleTag(tag);
                                                    }}
                                                >
                                                    #{tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
};
