import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ExternalLink, Youtube, Image as ImageIcon, Plus, HelpCircle } from 'lucide-react';
import { collectionGroup, query, where, onSnapshot, orderBy, deleteDoc, doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { LinkToConceptModal } from './ui/LinkToConceptModal';

interface Memo {
    id: string;
    text: string;
    tags?: string[];
    question?: string; // Question Bridge: 이 묵상이 붙잡고 있는 질문 (최대 120자)
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
    const [editQuestion, setEditQuestion] = useState(''); // Question Bridge
    const [viewingMemo, setViewingMemo] = useState<Memo | null>(null);
    const [showLinkModal, setShowLinkModal] = useState(false);

    // New Memo State
    const [isCreating, setIsCreating] = useState(false);
    const [newMemoText, setNewMemoText] = useState('');
    const [newMemoYoutube, setNewMemoYoutube] = useState('');
    const [newMemoImage, setNewMemoImage] = useState('');
    const [newMemoQuestion, setNewMemoQuestion] = useState(''); // Question Bridge

    // Create memo handler
    const handleCreateMemo = async () => {
        if (!newMemoText.trim() || !currentUser) return;

        try {
            const regex = /#{1,3}[\w가-힣]+/g;
            const matches = newMemoText.match(regex);
            // Store tags WITH the hash prefixes to preserve depth (#, ##, ###)
            const tags = matches ? matches : [];

            await addDoc(collection(db, 'users', currentUser.uid, 'memos'), {
                text: newMemoText,
                tags: tags,
                question: newMemoQuestion.trim(), // Question Bridge
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
            setNewMemoQuestion('');
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
                // Extract hashtags from edited text (support #, ##, ###)
                const regex = /#{1,3}[\w가-힣]+/g;
                const matches = editText.match(regex);
                const tags = matches ? matches : [];

                await updateDoc(doc(db, pathParts[0], pathParts[1], pathParts[2], pathParts[3]), {
                    text: editText,
                    tags: tags,
                    question: editQuestion.trim(), // Question Bridge
                    youtubeUrl: editYoutubeUrl,
                    imageUrl: editImageUrl,
                    updatedAt: new Date()
                });
                setEditingMemo(null);
                setEditText('');
                setEditYoutubeUrl('');
                setEditImageUrl('');
                setEditQuestion('');
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
        });
        return () => unsubscribe();
    }, []);

    // Fetch Memos
    // State for dual-source fetching
    const [groupMemos, setGroupMemos] = useState<Memo[]>([]);
    const [personalMemos, setPersonalMemos] = useState<Memo[]>([]);

    // Merge memos when sources change
    useEffect(() => {
        const all = [...personalMemos, ...groupMemos];
        // Dedup by ID
        const unique = all.filter((memo, index, self) =>
            index === self.findIndex((m) => (
                m.id === memo.id
            ))
        );
        // Sort by createdAt desc
        unique.sort((a, b) => {
            const timeA = a.createdAt?.seconds || 0;
            const timeB = b.createdAt?.seconds || 0;
            return timeB - timeA;
        });

        // Apply path filtering
        const filtered = unique.filter((memo) =>
            memo._path && (memo._path.startsWith('gallery/') || memo._path.startsWith('users/') || memo._path.includes('/users/'))
        );

        setMemos(filtered);

        // Update tag counts based on MERGED data
        const tagCounts: Record<string, number> = {};
        filtered.forEach(memo => {
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
    }, [groupMemos, personalMemos]);

    // Fetch Memos
    useEffect(() => {
        setLoading(true);
        setError(null);

        // 1. Primary Source: Collection Group (Gets everything everywhere)
        // 로그인 여부와 관계없이 전체 묵상을 가져옵니다.
        // Needs proper index for ordering by createdAt
        const qGroup = query(
            collectionGroup(db, 'memos'),
            orderBy('createdAt', 'desc')
        );

        const unsubGroup = onSnapshot(qGroup, (snapshot) => {
            const fetched = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                _path: doc.ref.path
            } as Memo));
            setGroupMemos(fetched);
            setLoading(false);
        }, (err: any) => {
            console.error("[MyReflections] Group Query Error:", err);
            if (err.code === 'failed-precondition') {
                const message = err.message || '';
                const linkMatch = message.match(/https:\/\/console\.firebase\.google\.com[^\s]*/);
                const link = linkMatch ? linkMatch[0] : undefined;
                setError({
                    message: '전체 묵상을 불러오기 위한 시스템 설정(인덱스)이 필요합니다.',
                    link
                });
            }
            setLoading(false);
        });

        // 2. Secondary Source: Direct User Collection (Only if logged in)
        let unsubPersonal = () => { };
        if (currentUser) {
            const qPersonal = query(
                collection(db, 'users', currentUser.uid, 'memos'),
                orderBy('createdAt', 'desc')
            );

            unsubPersonal = onSnapshot(qPersonal, (snapshot) => {
                const fetched = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    _path: doc.ref.path
                } as Memo));
                setPersonalMemos(fetched);
            }, (err) => {
                console.error("[MyReflections] Personal Query Error:", err);
            });
        } else {
            setPersonalMemos([]);
        }

        return () => {
            unsubGroup();
            unsubPersonal();
        };
    }, [currentUser]);

    // Handle tag toggle
    const toggleTag = (tag: string) => {
        setSelectedTags(prev =>
            prev.includes(tag)
                ? prev.filter(t => t !== tag)
                : [...prev, tag]
        );
    };

    // Filter memos with hierarchical tag logic
    const filteredMemos = memos.filter(memo => {
        if (selectedTags.length === 0) return true;
        if (!memo.tags || !Array.isArray(memo.tags)) return false;

        // Group selected tags by hierarchy level
        const level1Selected = selectedTags.filter(t => t.startsWith('#') && !t.startsWith('##'));
        const level2Selected = selectedTags.filter(t => t.startsWith('##') && !t.startsWith('###'));
        const level3Selected = selectedTags.filter(t => t.startsWith('###'));

        // Logic: OR within level, AND between levels

        // 1. Level 1 check (Single hash)
        const passLevel1 = level1Selected.length === 0 ||
            level1Selected.some(t => memo.tags?.includes(t));

        // 2. Level 2 check (Double hash)
        const passLevel2 = level2Selected.length === 0 ||
            level2Selected.some(t => memo.tags?.includes(t));

        // 3. Level 3 check (Triple hash)
        const passLevel3 = level3Selected.length === 0 ||
            level3Selected.some(t => memo.tags?.includes(t));

        return passLevel1 && passLevel2 && passLevel3;
    });

    // Dynamic tag visibility logic
    const { visibleL1Tags, visibleL2Tags, visibleL3Tags } = useMemo(() => {
        const level1Selected = selectedTags.filter(t => t.startsWith('#') && !t.startsWith('##'));
        const level2Selected = selectedTags.filter(t => t.startsWith('##') && !t.startsWith('###'));

        // Memos matching L1 selection (OR within level)
        const matchingL1 = memos.filter(m =>
            level1Selected.length === 0 || level1Selected.some(t => m.tags?.includes(t))
        );

        // Memos matching L1 AND L2 selection
        const matchingL12 = matchingL1.filter(m =>
            level2Selected.length === 0 || level2Selected.some(t => m.tags?.includes(t))
        );

        // Extract co-occurring tags
        const l1CoTags = new Set<string>();
        matchingL1.forEach(m => m.tags?.forEach(t => l1CoTags.add(t)));

        const l12CoTags = new Set<string>();
        matchingL12.forEach(m => m.tags?.forEach(t => l12CoTags.add(t)));

        return {
            visibleL1Tags: availableTags.filter(t => t.tag.startsWith('#') && !t.tag.startsWith('##')),
            visibleL2Tags: availableTags.filter(t =>
                t.tag.startsWith('##') && !t.tag.startsWith('###') &&
                (level1Selected.length === 0 || l1CoTags.has(t.tag))
            ),
            visibleL3Tags: availableTags.filter(t =>
                t.tag.startsWith('###') &&
                (level2Selected.length === 0
                    ? (level1Selected.length === 0 || l1CoTags.has(t.tag))
                    : l12CoTags.has(t.tag)
                )
            )
        };
    }, [memos, availableTags, selectedTags]);

    return (
        <div className="w-full h-full overflow-y-auto bg-[#050505]">
            <div className="w-full max-w-[1600px] mx-auto px-4 md:px-10 py-4 md:py-8 min-h-screen">
                {/* Sticky Header Container */}
                {/* Sticky Header Container */}
                <div className="sticky top-0 z-50 bg-[#050505]/95 backdrop-blur-md -mx-4 md:-mx-10 px-4 md:px-10 pt-8 pb-4 transition-all duration-300 border-b border-white/5 mb-8">
                    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 md:gap-12">
                        {/* Title Section */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6 }}
                            className="flex-shrink-0"
                        >
                            <h1 className="font-['Anton'] text-[clamp(2.5rem,6vw,5rem)] leading-[0.9] text-white overflow-hidden whitespace-nowrap">
                            </h1>
                            <div className="flex items-center gap-3 mt-2">
                                <p className="font-['Inter'] text-sm text-white/50 tracking-wide">
                                    {currentUser ? `나의 묵상 기록 (${filteredMemos.length})` : `전체 묵상 기록 (${filteredMemos.length})`}
                                </p>
                                {/* 선택된 태그 초기화 버튼 (모바일용 및 빠른 접근) */}
                                {selectedTags.length > 0 && (
                                    <button
                                        onClick={() => setSelectedTags([])}
                                        className="px-2 py-1 text-[10px] rounded-full bg-white/10 text-white/70 hover:bg-white/20 transition-all flex items-center gap-1"
                                    >
                                        ✕ 초기화
                                    </button>
                                )}
                            </div>
                        </motion.div>

                        {/* Tag Filters Section - Right Side */}
                        {availableTags.length > 0 && (
                            <motion.div
                                className="flex-1 w-full lg:w-auto"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.3 }}
                            >
                                <div className="flex flex-col gap-2 items-start lg:items-end">
                                    {/* Helper to render a row of tags */}
                                    {[
                                        { prefix: '#', label: 'Topics', tags: visibleL1Tags },
                                        { prefix: '##', label: 'Categories', tags: visibleL2Tags },
                                        { prefix: '###', label: 'Deep Dive', tags: visibleL3Tags }
                                    ].map((group, idx) => (
                                        group.tags.length > 0 && (
                                            <div key={idx} className="flex flex-wrap gap-1.5 items-center justify-start lg:justify-end w-full">
                                                {/* <span className="text-[10px] text-white/20 mr-1 uppercase tracking-wider">{group.label}</span> */}
                                                {group.tags.slice(0, 15).map(({ tag, count }) => {
                                                    const isSelected = selectedTags.includes(tag);
                                                    const displayTag = tag.replace(/^#{1,3}/, '');

                                                    // Customized colors per level for better visual hierarchy
                                                    let colorClass = "";
                                                    if (idx === 0) { // Level 1 (#) - Blue
                                                        colorClass = isSelected
                                                            ? 'bg-blue-500 text-white shadow-blue-500/20'
                                                            : 'bg-white/5 text-blue-300/60 border border-blue-500/10 hover:border-blue-500/30 hover:bg-blue-500/10';
                                                    } else if (idx === 1) { // Level 2 (##) - Purple
                                                        colorClass = isSelected
                                                            ? 'bg-purple-500 text-white shadow-purple-500/20'
                                                            : 'bg-white/5 text-purple-300/60 border border-purple-500/10 hover:border-purple-500/30 hover:bg-purple-500/10';
                                                    } else { // Level 3 (###) - Pink
                                                        colorClass = isSelected
                                                            ? 'bg-pink-500 text-white shadow-pink-500/20'
                                                            : 'bg-white/5 text-pink-300/60 border border-pink-500/10 hover:border-pink-500/30 hover:bg-pink-500/10';
                                                    }

                                                    return (
                                                        <button
                                                            key={tag}
                                                            onClick={() => toggleTag(tag)}
                                                            className={`px-2 py-0.5 text-[10px] md:text-[11px] rounded transition-all flex items-center gap-1 ${colorClass}`}
                                                        >
                                                            <span>{group.prefix}</span>
                                                            {displayTag}
                                                            <span className="opacity-40 text-[9px]">({count})</span>
                                                        </button>
                                                    );
                                                })}
                                                {group.tags.length > 15 && (
                                                    <span className="text-[9px] text-white/20">+{group.tags.length - 15}</span>
                                                )}
                                            </div>
                                        )
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </div>
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

                                        {/* Content - Display Mode Only */}
                                        <div className="flex-1 mb-6">
                                            <p className="text-white/80 whitespace-pre-wrap leading-relaxed text-sm md:text-base line-clamp-[8]">
                                                {memo.text}
                                            </p>
                                            {memo.imageUrl && (
                                                <div className="mt-3 h-32 w-full rounded-lg overflow-hidden relative">
                                                    <img src={memo.imageUrl} alt="" className="w-full h-full object-cover" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Question Bridge */}
                                        {memo.question && (
                                            <div className="mt-4 bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-2">
                                                <div className="flex items-start gap-2">
                                                    <HelpCircle size={14} className="text-purple-400 mt-0.5 flex-shrink-0" />
                                                    <p className="text-sm text-purple-200/80 line-clamp-2">{memo.question}</p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Tags */}
                                        {memo.tags && memo.tags.length > 0 && (
                                            <div className="flex flex-wrap gap-2 mt-auto pt-4 border-t border-white/5">
                                                {memo.tags.map(tag => (
                                                    <span
                                                        key={tag}
                                                        className={`text-xs cursor-pointer ${tag.startsWith('###') ? 'text-pink-400' :
                                                            tag.startsWith('##') ? 'text-purple-400' :
                                                                'text-blue-400 hover:text-blue-300'
                                                            }`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleTag(tag);
                                                        }}
                                                    >
                                                        #{tag.replace(/^#{1,3}/, '')}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {/* Admin Actions - Only for owner */}
                                        {currentUser && currentUser.uid === memo.userId && (
                                            <div className="flex gap-2 mt-4 pt-4 border-t border-white/5" onClick={e => e.stopPropagation()}>
                                                <button
                                                    onClick={() => {
                                                        setEditingMemo(memo.id);
                                                        setEditText(memo.text);
                                                        setEditYoutubeUrl(memo.youtubeUrl || '');
                                                        setEditImageUrl(memo.imageUrl || '');
                                                        setEditQuestion(memo.question || '');
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
                            className="bg-[#1a1a1a] rounded-2xl w-full max-w-6xl max-h-[95vh] overflow-y-auto custom-scrollbar border border-white/10 shadow-2xl relative"
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
                                            <div className="flex flex-col gap-1 items-start">
                                                {/* Level 1 (# or No Hash) */}
                                                {(viewingMemo.tags?.filter(t => !t.startsWith('##')) || []).length > 0 && (
                                                    <div className="flex gap-2">
                                                        {(viewingMemo.tags?.filter(t => !t.startsWith('##')) || []).map(tag => (
                                                            <span key={tag} className="text-blue-400 text-sm opacity-90">{tag.replace(/^#/, '')}</span>
                                                        ))}
                                                    </div>
                                                )}
                                                {/* Level 2 (##) */}
                                                {(viewingMemo.tags?.filter(t => t.startsWith('##') && !t.startsWith('###')) || []).length > 0 && (
                                                    <div className="flex gap-2">
                                                        {(viewingMemo.tags?.filter(t => t.startsWith('##') && !t.startsWith('###')) || []).map(tag => (
                                                            <span key={tag} className="text-purple-400 text-sm opacity-80">{tag.replace(/^##/, '')}</span>
                                                        ))}
                                                    </div>
                                                )}
                                                {/* Level 3 (###) */}
                                                {(viewingMemo.tags?.filter(t => t.startsWith('###')) || []).length > 0 && (
                                                    <div className="flex gap-2">
                                                        {(viewingMemo.tags?.filter(t => t.startsWith('###')) || []).map(tag => (
                                                            <span key={tag} className="text-pink-400 text-sm opacity-70">{tag.replace(/^###/, '')}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 self-start md:self-center">
                                        {/* Edit Button in View Modal - Only for owner */}
                                        {currentUser && currentUser.uid === viewingMemo.userId && (
                                            <button
                                                onClick={() => {
                                                    setEditingMemo(viewingMemo.id);
                                                    setEditText(viewingMemo.text);
                                                    setEditYoutubeUrl(viewingMemo.youtubeUrl || '');
                                                    setEditImageUrl(viewingMemo.imageUrl || '');
                                                    setEditQuestion(viewingMemo.question || '');
                                                    setViewingMemo(null); // Switch to Edit Modal
                                                }}
                                                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-white/70 hover:text-white flex items-center gap-2 transition-colors"
                                            >
                                                ✏️ 수정
                                            </button>
                                        )}
                                        {viewingMemo.parentId && onSelectCallback && (
                                            <button
                                                onClick={() => {
                                                    if (viewingMemo.parentId) {
                                                        onSelectCallback(viewingMemo.parentId);
                                                        setViewingMemo(null);
                                                    }
                                                }}
                                                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-white/70 hover:text-white flex items-center gap-2 transition-colors"
                                            >
                                                <span>원문 보기</span>
                                                <ExternalLink size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="space-y-8">
                                    {/* Question Bridge */}
                                    {viewingMemo.question && (
                                        <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl px-5 py-4">
                                            <div className="flex items-start gap-3">
                                                <HelpCircle size={20} className="text-purple-400 mt-0.5 flex-shrink-0" />
                                                <div>
                                                    <p className="text-xs text-purple-400 mb-1">이 묵상이 붙잡고 있는 질문</p>
                                                    <p className="text-lg text-purple-100">{viewingMemo.question}</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

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

                                    {/* 개념 카드에 연결 */}
                                    <div className="mt-6 pt-4 border-t border-white/10">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setShowLinkModal(true);
                                            }}
                                            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-purple-500/20 to-indigo-500/20 border border-purple-500/30 text-purple-300 hover:from-purple-500/30 hover:to-indigo-500/30 transition-all"
                                        >
                                            🔗 개념 카드에 연결하기
                                        </button>
                                    </div>
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
                            className="bg-[#1a1a1a] rounded-2xl w-full max-w-6xl max-h-[95vh] overflow-y-auto custom-scrollbar border border-white/10 shadow-2xl relative"
                        >
                            <div className="p-6 md:p-8">
                                <h2 className="text-2xl font-bold text-white mb-6">새로운 묵상 기록</h2>

                                <textarea
                                    value={newMemoText}
                                    onChange={(e) => setNewMemoText(e.target.value)}
                                    className="w-full min-h-[60vh] bg-black/50 border border-white/20 rounded-xl p-6 text-white/90 text-lg leading-relaxed focus:outline-none focus:border-white/50 mb-4 resize-y"
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
                                    {/* Question Bridge 입력 */}
                                    <div className="flex items-start gap-3 bg-gradient-to-r from-purple-500/10 to-pink-500/10 px-4 py-3 rounded-xl border border-purple-500/20">
                                        <HelpCircle size={20} className="text-purple-400 mt-0.5" />
                                        <div className="flex-1">
                                            <label className="text-xs text-purple-300 mb-1 block">이 묵상이 붙잡고 있는 질문</label>
                                            <input
                                                type="text"
                                                value={newMemoQuestion}
                                                onChange={(e) => setNewMemoQuestion(e.target.value.slice(0, 120))}
                                                placeholder="예: 하나님은 왜 고난을 허락하시는가?"
                                                className="w-full bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
                                                maxLength={120}
                                            />
                                            <div className="text-[10px] text-white/30 mt-1 text-right">{newMemoQuestion.length}/120</div>
                                        </div>
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

            {/* Edit Modal (New) */}
            <AnimatePresence>
                {editingMemo && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setEditingMemo(null)}
                        className="fixed inset-0 z-[3000] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-[#1a1a1a] rounded-2xl w-full max-w-6xl max-h-[95vh] overflow-y-auto custom-scrollbar border border-white/10 shadow-2xl relative"
                        >
                            <div className="p-6 md:p-8">
                                <h2 className="text-2xl font-bold text-white mb-6">묵상 수정하기</h2>

                                <textarea
                                    value={editText}
                                    onChange={(e) => setEditText(e.target.value)}
                                    className="w-full min-h-[60vh] bg-black/50 border border-white/20 rounded-xl p-6 text-white/90 text-lg leading-relaxed focus:outline-none focus:border-yellow-500/50 mb-4 resize-y"
                                    placeholder="묵상 내용..."
                                    autoFocus
                                />

                                <div className="space-y-3 mb-6">
                                    <div className="flex items-center gap-3 bg-black/30 px-4 py-3 rounded-xl border border-white/10">
                                        <Youtube size={20} className="text-red-500" />
                                        <input
                                            type="text"
                                            value={editYoutubeUrl}
                                            onChange={(e) => setEditYoutubeUrl(e.target.value)}
                                            placeholder="YouTube URL (Optional)"
                                            className="flex-1 bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
                                        />
                                    </div>
                                    <div className="flex items-center gap-3 bg-black/30 px-4 py-3 rounded-xl border border-white/10">
                                        <ImageIcon size={20} className="text-blue-400" />
                                        <input
                                            type="text"
                                            value={editImageUrl}
                                            onChange={(e) => setEditImageUrl(e.target.value)}
                                            placeholder="Image URL (Optional)"
                                            className="flex-1 bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
                                        />
                                    </div>
                                    {/* Question Bridge 입력 */}
                                    <div className="flex items-start gap-3 bg-gradient-to-r from-purple-500/10 to-pink-500/10 px-4 py-3 rounded-xl border border-purple-500/20">
                                        <HelpCircle size={20} className="text-purple-400 mt-0.5" />
                                        <div className="flex-1">
                                            <label className="text-xs text-purple-300 mb-1 block">이 묵상이 붙잡고 있는 질문</label>
                                            <input
                                                type="text"
                                                value={editQuestion}
                                                onChange={(e) => setEditQuestion(e.target.value.slice(0, 120))}
                                                placeholder="예: 하나님은 왜 고난을 허락하시는가?"
                                                className="w-full bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
                                                maxLength={120}
                                            />
                                            <div className="text-[10px] text-white/30 mt-1 text-right">{editQuestion.length}/120</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3">
                                    <button
                                        onClick={() => setEditingMemo(null)}
                                        className="px-5 py-2.5 rounded-lg text-white/70 hover:bg-white/10 transition-colors"
                                    >
                                        취소
                                    </button>
                                    <button
                                        onClick={() => {
                                            const memoToEdit = memos.find(m => m.id === editingMemo);
                                            if (memoToEdit) handleEditMemo(memoToEdit);
                                        }}
                                        disabled={!editText.trim()}
                                        className="px-6 py-2.5 bg-yellow-500 text-black font-bold rounded-lg hover:bg-yellow-400 transition-colors disabled:opacity-50"
                                    >
                                        수정 완료
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Floating Action Button for New Memo */}
            {currentUser ? (
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
            ) : (
                <div className="fixed bottom-8 right-8 z-[2000] group">
                    <motion.button
                        className="bg-white/10 text-white/50 p-4 rounded-full shadow-2xl backdrop-blur-md cursor-not-allowed"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                    >
                        <Plus size={24} strokeWidth={3} />
                    </motion.button>
                    <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-black/80 px-3 py-1.5 rounded-lg text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        로그인이 필요합니다
                    </div>
                </div>
            )}

            {/* Link to Concept Modal */}
            {
                showLinkModal && viewingMemo && (
                    <LinkToConceptModal
                        sourceId={viewingMemo!.id}
                        sourceType="reflection"
                        sourcePath={viewingMemo!._path}
                        sourceTitle={viewingMemo!.parentTitle}
                        sourceExcerpt={viewingMemo!.text?.slice(0, 150)}
                        onClose={() => setShowLinkModal(false)}
                        onSuccess={() => setShowLinkModal(false)}
                    />
                )
            }
        </div >
    );
};
