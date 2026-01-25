import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ExternalLink, Youtube, Image as ImageIcon, Plus } from 'lucide-react';
import { collectionGroup, query, where, onSnapshot, orderBy, deleteDoc, doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
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
    youtubeUrl?: string;
    imageUrl?: string;
    // Denormalized parent data
    parentId?: string;
    parentTitle?: string;
    parentImage?: string;
    parentDate?: string;
    _path?: string;
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
    const [editingMemo, setEditingMemo] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const [editYoutubeUrl, setEditYoutubeUrl] = useState('');
    const [editImageUrl, setEditImageUrl] = useState('');
    const [viewingMemo, setViewingMemo] = useState<Memo | null>(null);

    // New Memo State
    const [isCreating, setIsCreating] = useState(false);
    const [newMemoText, setNewMemoText] = useState('');
    const [newMemoYoutube, setNewMemoYoutube] = useState('');
    const [newMemoImage, setNewMemoImage] = useState('');

    // Create memo handler
    const handleCreateMemo = async () => {
        if (!newMemoText.trim() || !currentUser) return;

        try {
            const regex = /#[\w가-힣]+/g;
            const matches = newMemoText.match(regex);
            const tags = matches ? matches.map(tag => tag.slice(1)) : [];

            await addDoc(collection(db, 'users', currentUser.uid, 'memos'), {
                text: newMemoText,
                tags: tags,
                userId: currentUser.uid,
                userName: currentUser.displayName || 'Anonymous',
                userPhoto: currentUser.photoURL || null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                youtubeUrl: newMemoYoutube,
                imageUrl: newMemoImage,
                parentTitle: '나의 묵상', // Default title for standalone
            });

            setIsCreating(false);
            setNewMemoText('');
            setNewMemoYoutube('');
            setNewMemoImage('');
        } catch (e) {
            console.error('Creation failed:', e);
            alert('작성에 실패했습니다.');
        }
    };

    // Helper to extract Youtube ID
    const getYoutubeEmbedUrl = (url?: string) => {
        if (!url) return null;
        const match = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
        return match ? `https://www.youtube.com/embed/${match[1]}` : null;
    };

    const [error, setError] = useState<{ message: string; link?: string } | null>(null);

    // Delete memo handler
    const handleDeleteMemo = async (memo: Memo) => {
        if (!memo._path) return;
        if (!confirm('이 묵상을 삭제하시겠습니까?')) return;

        try {
            // Parse path like "gallery/docId/memos/memoId"
            const pathParts = memo._path.split('/');
            if (pathParts.length === 4) {
                await deleteDoc(doc(db, pathParts[0], pathParts[1], pathParts[2], pathParts[3]));
            }
        } catch (e) {
            console.error('Delete failed:', e);
            alert('삭제에 실패했습니다.');
        }
    };

    // Edit memo handler
    const handleEditMemo = async (memo: Memo) => {
        if (!memo._path || !editText.trim()) return;

        try {
            const pathParts = memo._path.split('/');
            if (pathParts.length === 4) {
                // Extract hashtags from edited text
                const regex = /#[\w가-힣]+/g;
                const matches = editText.match(regex);
                const tags = matches ? matches.map(tag => tag.slice(1)) : [];

                await updateDoc(doc(db, pathParts[0], pathParts[1], pathParts[2], pathParts[3]), {
                    text: editText,
                    tags: tags,
                    youtubeUrl: editYoutubeUrl,
                    imageUrl: editImageUrl,
                    updatedAt: new Date()
                });
                setEditingMemo(null);
                setEditText('');
                setEditYoutubeUrl('');
                setEditImageUrl('');
            }
        } catch (e) {
            console.error('Edit failed:', e);
            alert('수정에 실패했습니다.');
        }
    };

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
            console.log('[MyReflections] Query returned:', snapshot.size, 'documents');
            console.log('[MyReflections] Current user UID:', currentUser.uid);

            const allMemos = snapshot.docs.map((doc) => {
                const data = doc.data();
                console.log('[MyReflections] Memo:', doc.ref.path, 'userId:', data.userId);
                return {
                    id: doc.id,
                    ...data,
                    _path: doc.ref.path
                } as Memo;
            });

            const fetchedMemos = allMemos.filter((memo) => memo._path && (memo._path.startsWith('gallery/') || memo._path.includes('/users/')));
            console.log('[MyReflections] After filtering:', fetchedMemos.length, 'memos');

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
        }, (err: any) => {
            console.error("[MyReflections] Error fetching memos:", err);
            console.error("[MyReflections] Error code:", err.code);
            console.error("[MyReflections] Error message:", err.message);
            console.error("[MyReflections] Current user at error time:", currentUser?.uid);
            setLoading(false);

            if (err.code === 'failed-precondition') {
                // Try to extract link from error message
                // Message format: "The query requires an index. You can create it here: https://console.firebase.google.com/..."
                const message = err.message || '';
                const linkMatch = message.match(/https:\/\/console\.firebase\.google\.com[^\s]*/);
                const link = linkMatch ? linkMatch[0] : undefined;

                setError({
                    message: '시스템 설정(인덱스)이 필요합니다. 아래 버튼을 눌러 설정을 완료해주세요.',
                    link
                });
            } else if (err.code === 'permission-denied') {
                setError({ message: '권한이 없습니다. 다시 로그인해 주세요.' });
            } else {
                setError({ message: `메모를 불러오는 중 오류가 발생했습니다. (${err.code || 'unknown'})` });
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
        <div className="w-full h-full overflow-y-auto bg-[#050505]">
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

                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsCreating(true)}
                        className="bg-white text-black px-6 py-3 rounded-full font-bold shadow-lg flex items-center gap-2 hover:bg-gray-100 transition-colors"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                    >
                        <Plus size={20} />
                        <span>새 묵상 쓰기</span>
                    </motion.button>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mb-8 p-6 border border-yellow-500/50 bg-yellow-500/10 rounded-xl text-yellow-100 flex flex-col items-start gap-3">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">⚠️</span>
                            <p className="font-bold">{error.message}</p>
                        </div>
                        <a
                            href={error.link || "https://console.firebase.google.com/project/ass246429/firestore/indexes"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-yellow-500 text-black px-4 py-2 rounded-lg font-bold hover:bg-yellow-400 transition-colors text-sm flex items-center gap-2"
                        >
                            <span>👉 설정 페이지로 이동</span>
                        </a>
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
                                    onClick={() => {
                                        if (editingMemo !== memo.id) {
                                            setViewingMemo(memo);
                                        }
                                    }}
                                    className="bg-[#111] border border-white/10 rounded-3xl p-6 hover:border-white/30 transition-colors group relative overflow-hidden cursor-pointer"
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
                                                    href="#"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        if (onSelectCallback && memo.parentId) {
                                                            onSelectCallback(memo.parentId);
                                                        }
                                                    }}
                                                    className="text-[10px] uppercase tracking-wider text-yellow-500/80 hover:text-yellow-400 border border-yellow-500/30 px-2 py-1 rounded hover:bg-yellow-500/10 transition-all truncate max-w-[150px] flex items-center gap-1"
                                                >
                                                    {memo.parentTitle || 'View Original'} <ExternalLink size={10} />
                                                </a>
                                            )}
                                        </div>

                                        {/* Content - Edit Mode or Display Mode */}
                                        <div className="flex-1 mb-6" onClick={e => editingMemo === memo.id && e.stopPropagation()}>
                                            {editingMemo === memo.id ? (
                                                <div className="space-y-3">
                                                    <textarea
                                                        value={editText}
                                                        onChange={(e) => setEditText(e.target.value)}
                                                        className="w-full h-32 bg-black/50 border border-white/20 rounded-lg p-3 text-white/90 text-sm focus:outline-none focus:border-yellow-500/50"
                                                        placeholder="묵상 내용..."
                                                    />
                                                    <div className="space-y-2">
                                                        <div className="flex items-center gap-2 bg-black/30 px-3 py-2 rounded-lg border border-white/10">
                                                            <Youtube size={16} className="text-red-500" />
                                                            <input
                                                                type="text"
                                                                value={editYoutubeUrl}
                                                                onChange={(e) => setEditYoutubeUrl(e.target.value)}
                                                                placeholder="YouTube URL (Optional)"
                                                                className="flex-1 bg-transparent text-xs text-white placeholder-white/20 focus:outline-none"
                                                            />
                                                        </div>
                                                        <div className="flex items-center gap-2 bg-black/30 px-3 py-2 rounded-lg border border-white/10">
                                                            <ImageIcon size={16} className="text-blue-400" />
                                                            <input
                                                                type="text"
                                                                value={editImageUrl}
                                                                onChange={(e) => setEditImageUrl(e.target.value)}
                                                                placeholder="Image URL (Optional)"
                                                                className="flex-1 bg-transparent text-xs text-white placeholder-white/20 focus:outline-none"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleEditMemo(memo)}
                                                            className="px-3 py-1.5 bg-yellow-500 text-black text-xs font-bold rounded hover:bg-yellow-400"
                                                        >
                                                            저장
                                                        </button>
                                                        <button
                                                            onClick={() => { setEditingMemo(null); setEditText(''); }}
                                                            className="px-3 py-1.5 bg-white/10 text-white/70 text-xs rounded hover:bg-white/20"
                                                        >
                                                            취소
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <p className="text-white/80 whitespace-pre-wrap leading-relaxed text-sm md:text-base line-clamp-[8]">
                                                        {memo.text}
                                                    </p>
                                                    {memo.imageUrl && (
                                                        <div className="mt-3 h-32 w-full rounded-lg overflow-hidden relative">
                                                            <img src={memo.imageUrl} alt="" className="w-full h-full object-cover" />
                                                        </div>
                                                    )}
                                                </>
                                            )}
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

                                        {/* Admin Actions */}
                                        {currentUser && editingMemo !== memo.id && (
                                            <div className="flex gap-2 mt-4 pt-4 border-t border-white/5" onClick={e => e.stopPropagation()}>
                                                <button
                                                    onClick={() => {
                                                        setEditingMemo(memo.id);
                                                        setEditText(memo.text);
                                                        setEditYoutubeUrl(memo.youtubeUrl || '');
                                                        setEditImageUrl(memo.imageUrl || '');
                                                    }}
                                                    className="flex-1 py-1.5 text-xs text-white/50 hover:text-white hover:bg-white/5 rounded transition-colors"
                                                >
                                                    ✏️ 수정
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteMemo(memo)}
                                                    className="flex-1 py-1.5 text-xs text-red-400/50 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                                >
                                                    🗑️ 삭제
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            {/* View Modal */}
            <AnimatePresence>
                {viewingMemo && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setViewingMemo(null)}
                        className="fixed inset-0 z-[3000] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-[#1a1a1a] rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto custom-scrollbar border border-white/10 shadow-2xl relative"
                        >
                            <button
                                onClick={() => setViewingMemo(null)}
                                className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 rounded-full text-white/50 hover:text-white transition-colors z-10"
                            >
                                <X size={20} />
                            </button>

                            <div className="p-6 md:p-10">
                                {/* Header */}
                                <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
                                    <div>
                                        <div className="text-sm text-white/40 mb-1">
                                            {viewingMemo.createdAt?.seconds ? new Date(viewingMemo.createdAt.seconds * 1000).toLocaleDateString() : 'Draft'}
                                        </div>
                                        <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">{viewingMemo.parentTitle}</h2>
                                        <div className="flex gap-2">
                                            {viewingMemo.tags?.map(tag => (
                                                <span key={tag} className="text-blue-400 text-sm">#{tag}</span>
                                            ))}
                                        </div>
                                    </div>
                                    {viewingMemo.parentId && onSelectCallback && (
                                        <button
                                            onClick={() => {
                                                if (viewingMemo.parentId) {
                                                    onSelectCallback(viewingMemo.parentId);
                                                    setViewingMemo(null);
                                                }
                                            }}
                                            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-white/70 hover:text-white flex items-center gap-2 transition-colors self-start md:self-center"
                                        >
                                            <span>원문 보기</span>
                                            <ExternalLink size={14} />
                                        </button>
                                    )}
                                </div>

                                {/* Content */}
                                <div className="space-y-8">
                                    {/* Text */}
                                    <div className="prose prose-invert max-w-none">
                                        <p className="text-white/90 text-lg leading-relaxed whitespace-pre-wrap">
                                            {viewingMemo.text}
                                        </p>
                                    </div>

                                    {/* Media */}
                                    {(viewingMemo.youtubeUrl || viewingMemo.imageUrl) && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-white/5">
                                            {viewingMemo.youtubeUrl && getYoutubeEmbedUrl(viewingMemo.youtubeUrl) && (
                                                <div className="w-full aspect-video rounded-xl overflow-hidden bg-black shadow-lg">
                                                    <iframe
                                                        width="100%"
                                                        height="100%"
                                                        src={getYoutubeEmbedUrl(viewingMemo.youtubeUrl)!}
                                                        title="YouTube video player"
                                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                        allowFullScreen
                                                        className="border-0"
                                                    ></iframe>
                                                </div>
                                            )}
                                            {viewingMemo.imageUrl && (
                                                <div className="rounded-xl overflow-hidden bg-black/20 shadow-lg">
                                                    <img src={viewingMemo.imageUrl} alt="" className="w-full h-auto object-cover" />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Create Modal */}
            <AnimatePresence>
                {isCreating && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsCreating(false)}
                        className="fixed inset-0 z-[3000] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-[#1a1a1a] rounded-2xl w-full max-w-2xl overflow-hidden border border-white/10 shadow-2xl relative"
                        >
                            <div className="p-6 md:p-8">
                                <h2 className="text-2xl font-bold text-white mb-6">새로운 묵상 기록</h2>

                                <textarea
                                    value={newMemoText}
                                    onChange={(e) => setNewMemoText(e.target.value)}
                                    className="w-full h-48 bg-black/50 border border-white/20 rounded-xl p-4 text-white/90 text-base focus:outline-none focus:border-white/50 mb-4 resize-none"
                                    placeholder="오늘의 묵상을 기록해보세요... (해시태그 #은혜 #감사 활용 가능)"
                                    autoFocus
                                />

                                <div className="space-y-3 mb-6">
                                    <div className="flex items-center gap-3 bg-black/30 px-4 py-3 rounded-xl border border-white/10">
                                        <Youtube size={20} className="text-red-500" />
                                        <input
                                            type="text"
                                            value={newMemoYoutube}
                                            onChange={(e) => setNewMemoYoutube(e.target.value)}
                                            placeholder="YouTube URL (찬양, 설교 등)"
                                            className="flex-1 bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
                                        />
                                    </div>
                                    <div className="flex items-center gap-3 bg-black/30 px-4 py-3 rounded-xl border border-white/10">
                                        <ImageIcon size={20} className="text-blue-400" />
                                        <input
                                            type="text"
                                            value={newMemoImage}
                                            onChange={(e) => setNewMemoImage(e.target.value)}
                                            placeholder="이미지 URL"
                                            className="flex-1 bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3">
                                    <button
                                        onClick={() => setIsCreating(false)}
                                        className="px-5 py-2.5 rounded-lg text-white/70 hover:bg-white/10 transition-colors"
                                    >
                                        취소
                                    </button>
                                    <button
                                        onClick={handleCreateMemo}
                                        disabled={!newMemoText.trim()}
                                        className="px-6 py-2.5 bg-white text-black font-bold rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        저장하기
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            {/* Floating Action Button for New Memo */}
            <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsCreating(true)}
                className="fixed bottom-8 right-8 z-[2000] bg-white text-black p-4 rounded-full shadow-2xl hover:bg-gray-100 transition-all shadow-white/10 flex items-center justify-center"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 20 }}
            >
                <Plus size={24} strokeWidth={3} />
            </motion.button>
        </div>
    );
};
