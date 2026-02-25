import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Search, Trash2, Edit3, Save, X, ChevronDown, StickyNote, BookOpen, Newspaper, Tag } from 'lucide-react';
import { db, auth } from '../firebase';
import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import {
    collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
    orderBy, serverTimestamp, where, Timestamp
} from 'firebase/firestore';

// ─── Types ───────────────────────────────────────────────────
interface Note {
    id: string;
    title: string;
    text: string;
    category: string;        // 묵상 | 뉴스 | 일반 | custom
    tags: string[];
    userId: string;
    userName: string;
    userPhoto?: string;
    createdAt?: any;
    updatedAt?: any;
    pinned?: boolean;
}

const CATEGORIES = [
    { key: 'all', label: '전체', icon: '📋', color: 'from-gray-500/30 to-gray-600/30' },
    { key: '묵상', label: '묵상', icon: '🙏', color: 'from-yellow-500/30 to-orange-500/30' },
    { key: '뉴스', label: '최근 뉴스', icon: '📰', color: 'from-blue-500/30 to-cyan-500/30' },
    { key: '일반', label: '일반 메모', icon: '📝', color: 'from-purple-500/30 to-pink-500/30' },
];

// ─── Component ───────────────────────────────────────────────
export const Notepad: React.FC = () => {
    // Auth
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState(true);

    // Notes
    const [notes, setNotes] = useState<Note[]>([]);

    // UI state
    const [selectedNote, setSelectedNote] = useState<Note | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Editor state
    const [editTitle, setEditTitle] = useState('');
    const [editText, setEditText] = useState('');
    const [editCategory, setEditCategory] = useState('일반');
    const [showCategoryPicker, setShowCategoryPicker] = useState(false);

    // Filter / search
    const [activeCategory, setActiveCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);

    // Mobile
    const [isMobile, setIsMobile] = useState(false);
    const [showList, setShowList] = useState(true); // on mobile, toggle list vs editor

    // ─── Auth ────────────────────────────────────────────────
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            setAuthLoading(false);
        });
        return () => unsub();
    }, []);

    // ─── Responsive ───────────────────────────────────────────
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // ─── Subscribe to notes ───────────────────────────────────
    useEffect(() => {
        if (!currentUser) { setNotes([]); return; }

        const q = query(
            collection(db, 'userNotes'),
            where('userId', '==', currentUser.uid),
            orderBy('updatedAt', 'desc')
        );

        const unsub = onSnapshot(q, (snap) => {
            const fetched: Note[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as Note));
            setNotes(fetched);
        }, err => {
            console.error('Notes subscription error:', err);
        });

        return () => unsub();
    }, [currentUser]);

    // ─── Filtered notes ───────────────────────────────────────
    const filteredNotes = useMemo(() => {
        let result = notes;
        if (activeCategory !== 'all') {
            result = result.filter(n => n.category === activeCategory);
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(n =>
                n.title.toLowerCase().includes(q) ||
                n.text.toLowerCase().includes(q) ||
                n.tags.some(t => t.toLowerCase().includes(q))
            );
        }
        // Pinned first
        return result.sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return 0;
        });
    }, [notes, activeCategory, searchQuery]);

    // ─── Extract hashtags ──────────────────────────────────────
    const extractHashtags = (text: string): string[] => {
        const regex = /#[\w가-힣]+/g;
        const matches = text.match(regex);
        return matches ? matches.map(tag => tag.slice(1)) : [];
    };

    // ─── Handlers ─────────────────────────────────────────────
    const handleCreateNew = useCallback(() => {
        setSelectedNote(null);
        setEditTitle('');
        setEditText('');
        setEditCategory('일반');
        setIsCreating(true);
        setIsEditing(true);
        if (isMobile) setShowList(false);
    }, [isMobile]);

    const handleSelectNote = useCallback((note: Note) => {
        setSelectedNote(note);
        setEditTitle(note.title);
        setEditText(note.text);
        setEditCategory(note.category);
        setIsCreating(false);
        setIsEditing(false);
        if (isMobile) setShowList(false);
    }, [isMobile]);

    const handleStartEdit = useCallback(() => {
        if (!selectedNote) return;
        setEditTitle(selectedNote.title);
        setEditText(selectedNote.text);
        setEditCategory(selectedNote.category);
        setIsEditing(true);
    }, [selectedNote]);

    const handleSave = useCallback(async () => {
        if (!currentUser || editText.trim() === '') return;
        setIsSaving(true);

        const tags = extractHashtags(editText);
        const title = editTitle.trim() || editText.trim().slice(0, 30) + (editText.trim().length > 30 ? '...' : '');

        try {
            if (isCreating) {
                // CREATE
                const docRef = await addDoc(collection(db, 'userNotes'), {
                    title,
                    text: editText,
                    category: editCategory,
                    tags,
                    userId: currentUser.uid,
                    userName: currentUser.displayName || '익명',
                    userPhoto: currentUser.photoURL || '',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    pinned: false
                });
                // Select the new note once it arrives via subscription
                setIsCreating(false);
            } else if (selectedNote) {
                // UPDATE
                await updateDoc(doc(db, 'userNotes', selectedNote.id), {
                    title,
                    text: editText,
                    category: editCategory,
                    tags,
                    updatedAt: serverTimestamp()
                });
            }
            setIsEditing(false);
        } catch (e) {
            console.error('Save error:', e);
            alert('저장에 실패했습니다.');
        } finally {
            setIsSaving(false);
        }
    }, [currentUser, editTitle, editText, editCategory, isCreating, selectedNote]);

    const handleDelete = useCallback(async (note: Note) => {
        if (!confirm('이 메모를 삭제하시겠습니까?\n삭제된 메모는 복구할 수 없습니다.')) return;
        try {
            await deleteDoc(doc(db, 'userNotes', note.id));
            if (selectedNote?.id === note.id) {
                setSelectedNote(null);
                setIsEditing(false);
                if (isMobile) setShowList(true);
            }
        } catch (e) {
            console.error('Delete error:', e);
            alert('삭제에 실패했습니다.');
        }
    }, [selectedNote, isMobile]);

    const handleTogglePin = useCallback(async (note: Note) => {
        try {
            await updateDoc(doc(db, 'userNotes', note.id), {
                pinned: !note.pinned
            });
        } catch (e) {
            console.error('Pin error:', e);
        }
    }, []);

    const handleCancel = useCallback(() => {
        if (isCreating) {
            setIsCreating(false);
            setIsEditing(false);
            setSelectedNote(null);
            if (isMobile) setShowList(true);
        } else {
            setIsEditing(false);
            if (selectedNote) {
                setEditTitle(selectedNote.title);
                setEditText(selectedNote.text);
                setEditCategory(selectedNote.category);
            }
        }
    }, [isCreating, selectedNote, isMobile]);

    const handleLogin = async () => {
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
        } catch (error: any) {
            console.error('Login error:', error);
            alert('로그인 오류: ' + error.message);
        }
    };

    const formatDate = (timestamp: any) => {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('ko-KR', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    const getCategoryInfo = (key: string) => CATEGORIES.find(c => c.key === key) || CATEGORIES[3];

    // ─── Login prompt ──────────────────────────────────────────
    if (authLoading) {
        return (
            <div className="flex items-center justify-center h-screen bg-[#050505]">
                <div className="w-10 h-10 border-4 border-white/10 border-t-yellow-400 rounded-full animate-spin" />
            </div>
        );
    }

    if (!currentUser) {
        return (
            <div className="flex items-center justify-center h-screen bg-[#050505]">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center space-y-6 p-10"
                >
                    <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center border border-white/10">
                        <StickyNote size={36} className="text-yellow-400" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white mb-2">나의 메모장</h2>
                        <p className="text-white/40 text-sm">묵상, 뉴스, 아이디어를 자유롭게 기록하세요</p>
                    </div>
                    <button
                        onClick={handleLogin}
                        className="px-8 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white font-semibold rounded-xl transition-all shadow-lg shadow-yellow-500/20"
                    >
                        Google 로그인
                    </button>
                </motion.div>
            </div>
        );
    }

    // ─── Main Render ───────────────────────────────────────────
    return (
        <div className="h-screen bg-[#050505] text-white flex flex-col pt-[100px] md:pt-[120px]">
            {/* Header */}
            <div className="shrink-0 px-4 md:px-8 pb-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-yellow-500/30 to-orange-500/30 flex items-center justify-center border border-white/10">
                            <StickyNote size={18} className="text-yellow-400" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold tracking-tight">나의 메모장</h1>
                            <p className="text-[10px] text-white/30 tracking-wider">{notes.length}개의 메모</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowSearch(!showSearch)}
                            className={`p-2 rounded-lg transition-colors ${showSearch ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                        >
                            <Search size={18} />
                        </button>
                        <button
                            onClick={handleCreateNew}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-yellow-500/10"
                        >
                            <Plus size={16} />
                            <span className="hidden md:inline">새 메모</span>
                        </button>
                    </div>
                </div>

                {/* Search bar */}
                <AnimatePresence>
                    {showSearch && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="relative mb-3">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                                <input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="메모 검색..."
                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-yellow-500/50 transition-colors"
                                    autoFocus
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Category tabs */}
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat.key}
                            onClick={() => setActiveCategory(cat.key)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-all ${activeCategory === cat.key
                                    ? `bg-gradient-to-r ${cat.color} text-white border border-white/20`
                                    : 'text-white/40 hover:text-white/70 border border-transparent hover:bg-white/5'
                                }`}
                        >
                            <span>{cat.icon}</span>
                            <span>{cat.label}</span>
                            {cat.key !== 'all' && (
                                <span className="text-[10px] text-white/30 ml-0.5">
                                    {notes.filter(n => n.category === cat.key).length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* ▸ Notes List (Left panel) */}
                {(!isMobile || showList) && (
                    <div className={`${isMobile ? 'w-full' : 'w-[340px] border-r border-white/5'} flex flex-col overflow-hidden`}>
                        <div className="flex-1 overflow-y-auto px-3 md:px-4 py-2 space-y-2 custom-scrollbar">
                            {filteredNotes.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center py-20">
                                    <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                                        <StickyNote size={28} className="text-white/10" />
                                    </div>
                                    <p className="text-white/20 text-sm mb-1">
                                        {searchQuery ? '검색 결과가 없습니다' : '메모가 없습니다'}
                                    </p>
                                    <p className="text-white/10 text-xs">
                                        {searchQuery ? '다른 검색어를 시도해보세요' : '새 메모를 작성해보세요'}
                                    </p>
                                </div>
                            ) : (
                                filteredNotes.map(note => {
                                    const catInfo = getCategoryInfo(note.category);
                                    const isActive = selectedNote?.id === note.id;

                                    return (
                                        <motion.div
                                            key={note.id}
                                            layout
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            onClick={() => handleSelectNote(note)}
                                            className={`group relative p-3.5 rounded-xl cursor-pointer transition-all duration-200 ${isActive
                                                    ? 'bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 shadow-lg shadow-yellow-500/5'
                                                    : 'bg-white/[0.02] hover:bg-white/5 border border-transparent'
                                                }`}
                                        >
                                            {/* Pin indicator */}
                                            {note.pinned && (
                                                <div className="absolute top-2 right-2 text-yellow-400 text-[10px]">📌</div>
                                            )}

                                            {/* Category badge */}
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r ${catInfo.color} border border-white/10`}>
                                                    <span>{catInfo.icon}</span>
                                                    <span className="text-white/70">{catInfo.label}</span>
                                                </span>
                                                {note.tags.length > 0 && (
                                                    <div className="flex gap-1 overflow-hidden">
                                                        {note.tags.slice(0, 2).map(tag => (
                                                            <span key={tag} className="text-[9px] text-white/20 bg-white/5 px-1.5 py-0.5 rounded">
                                                                #{tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Title */}
                                            <h3 className={`text-sm font-medium truncate mb-1 ${isActive ? 'text-white' : 'text-white/80'}`}>
                                                {note.title || '제목 없음'}
                                            </h3>

                                            {/* Preview */}
                                            <p className="text-xs text-white/30 line-clamp-2 leading-relaxed">
                                                {note.text}
                                            </p>

                                            {/* Date */}
                                            <p className="text-[10px] text-white/15 mt-2">
                                                {formatDate(note.updatedAt || note.createdAt)}
                                            </p>

                                            {/* Hover actions */}
                                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleTogglePin(note); }}
                                                    className="p-1 rounded bg-black/40 hover:bg-black/60 text-white/50 hover:text-yellow-400 transition-colors"
                                                    title={note.pinned ? '고정 해제' : '고정'}
                                                >
                                                    <span className="text-[10px]">{note.pinned ? '📌' : '📍'}</span>
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(note); }}
                                                    className="p-1 rounded bg-black/40 hover:bg-black/60 text-white/50 hover:text-red-400 transition-colors"
                                                    title="삭제"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </motion.div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}

                {/* ▸ Editor / Reader (Right panel) */}
                {(!isMobile || !showList) && (
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {(selectedNote || isCreating) ? (
                            <>
                                {/* Editor Toolbar */}
                                <div className="shrink-0 flex items-center justify-between px-4 md:px-6 py-3 border-b border-white/5 bg-[#0a0a0a]">
                                    <div className="flex items-center gap-3">
                                        {isMobile && (
                                            <button
                                                onClick={() => { setShowList(true); setIsCreating(false); setIsEditing(false); }}
                                                className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/5"
                                            >
                                                <ChevronDown size={18} className="rotate-90" />
                                            </button>
                                        )}

                                        {/* Category picker */}
                                        <div className="relative">
                                            <button
                                                onClick={() => isEditing && setShowCategoryPicker(!showCategoryPicker)}
                                                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-colors ${isEditing
                                                        ? `bg-gradient-to-r ${getCategoryInfo(editCategory).color} border border-white/20 cursor-pointer`
                                                        : `bg-gradient-to-r ${getCategoryInfo(selectedNote?.category || editCategory).color} border border-white/10 cursor-default`
                                                    }`}
                                            >
                                                <span>{getCategoryInfo(isEditing ? editCategory : (selectedNote?.category || editCategory)).icon}</span>
                                                <span className="text-white/80">{getCategoryInfo(isEditing ? editCategory : (selectedNote?.category || editCategory)).label}</span>
                                                {isEditing && <ChevronDown size={12} className="text-white/40" />}
                                            </button>

                                            {showCategoryPicker && (
                                                <div className="absolute top-full left-0 mt-1 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl shadow-black/60 overflow-hidden z-50 w-40">
                                                    {CATEGORIES.filter(c => c.key !== 'all').map(cat => (
                                                        <button
                                                            key={cat.key}
                                                            onClick={() => { setEditCategory(cat.key); setShowCategoryPicker(false); }}
                                                            className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs transition-colors hover:bg-white/5 ${editCategory === cat.key ? 'text-white bg-white/10' : 'text-white/60'}`}
                                                        >
                                                            <span>{cat.icon}</span>
                                                            <span>{cat.label}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {!isEditing && selectedNote && (
                                            <span className="text-[10px] text-white/20">
                                                {formatDate(selectedNote.updatedAt || selectedNote.createdAt)}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {isEditing ? (
                                            <>
                                                <span className="text-[10px] text-white/20 mr-2">{editText.length}자</span>
                                                <button
                                                    onClick={handleCancel}
                                                    className="px-3 py-1.5 text-xs text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                                                >
                                                    취소
                                                </button>
                                                <button
                                                    onClick={handleSave}
                                                    disabled={isSaving || editText.trim() === ''}
                                                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    <Save size={12} />
                                                    {isSaving ? '저장 중...' : '저장'}
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={handleStartEdit}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white/60 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                                                >
                                                    <Edit3 size={12} />
                                                    편집
                                                </button>
                                                <button
                                                    onClick={() => selectedNote && handleDelete(selectedNote)}
                                                    className="p-1.5 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Editor Area */}
                                <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
                                    <div className="max-w-3xl mx-auto">
                                        {isEditing ? (
                                            <div className="space-y-4">
                                                {/* Title input */}
                                                <input
                                                    value={editTitle}
                                                    onChange={(e) => setEditTitle(e.target.value)}
                                                    placeholder="제목을 입력하세요..."
                                                    className="w-full bg-transparent text-2xl md:text-3xl font-bold text-white placeholder:text-white/15 focus:outline-none border-none"
                                                />

                                                {/* Text editor */}
                                                <textarea
                                                    value={editText}
                                                    onChange={(e) => setEditText(e.target.value)}
                                                    placeholder="여기에 자유롭게 기록하세요...&#10;&#10;#태그를 사용할 수 있습니다"
                                                    className="w-full min-h-[50vh] bg-transparent text-white/90 placeholder:text-white/15 text-base leading-8 resize-none focus:outline-none focus:ring-0 selection:bg-yellow-500/30 font-[inherit]"
                                                    spellCheck={false}
                                                    autoFocus={isCreating}
                                                />
                                            </div>
                                        ) : selectedNote ? (
                                            <div>
                                                {/* View mode */}
                                                <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">{selectedNote.title}</h2>

                                                {/* Tags */}
                                                {selectedNote.tags.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5 mb-6">
                                                        {selectedNote.tags.map(tag => (
                                                            <span key={tag} className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-white/5 text-white/40 border border-white/5">
                                                                <Tag size={10} />
                                                                {tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Content */}
                                                <div className="text-white/80 text-base leading-8 whitespace-pre-wrap selection:bg-yellow-500/30">
                                                    {selectedNote.text}
                                                </div>

                                                {/* Meta */}
                                                <div className="mt-10 pt-4 border-t border-white/5 text-[11px] text-white/15 space-y-1">
                                                    <p>작성: {formatDate(selectedNote.createdAt)}</p>
                                                    {selectedNote.updatedAt && selectedNote.createdAt &&
                                                        selectedNote.updatedAt.seconds !== selectedNote.createdAt.seconds && (
                                                            <p>수정: {formatDate(selectedNote.updatedAt)}</p>
                                                        )
                                                    }
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </>
                        ) : (
                            /* Empty state */
                            <div className="flex-1 flex items-center justify-center">
                                <div className="text-center space-y-4">
                                    <div className="w-20 h-20 mx-auto rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-center">
                                        <BookOpen size={32} className="text-white/10" />
                                    </div>
                                    <div>
                                        <p className="text-white/20 text-sm mb-1">메모를 선택하거나</p>
                                        <p className="text-white/20 text-sm">새 메모를 작성하세요</p>
                                    </div>
                                    <button
                                        onClick={handleCreateNew}
                                        className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 hover:from-yellow-500/30 hover:to-orange-500/30 text-yellow-400 font-medium rounded-xl text-sm transition-all border border-yellow-500/20"
                                    >
                                        <Plus size={16} />
                                        새 메모 작성
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Notepad;
