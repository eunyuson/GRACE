import React, { useEffect, useMemo, useState, useRef } from 'react';
import { motion } from 'motion/react';
import { onAuthStateChanged, signInAnonymously, User } from 'firebase/auth';
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where, deleteDoc, increment, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { getAllCategories, getHymnByNumber } from '../data';
import { Plus, Trash2, ArrowUp, ArrowDown, Save, Printer, X, Cloud, Search, Hash, Music, Image as ImageIcon, Edit, Menu, Youtube } from 'lucide-react';

// Re-use the interface or define locally
interface LibraryItemVersion {
    id: string;
    name: string;
    imageUrls: string[];
}

interface LibraryItem {
    id: string;
    type: 'hymn' | 'praise';
    number: number;
    title: string;
    imageUrl: string;
    imageUrls?: string[];
    versions?: LibraryItemVersion[];
    tags?: string[];
    category?: string;
    code?: string;
    youtubeLinks?: { url: string; title: string }[];
}

interface SetlistItem {
    id: string;
    sourceId: string;
    type: 'hymn' | 'praise';
    number: number;
    title: string;
    imageUrl: string;
    imageUrls?: string[];
    versions?: LibraryItemVersion[];
    selectedVersionId?: string; // 'default' or version ID
    code?: string;
    fullPage?: boolean;
    youtubeLinks?: { url: string; title: string }[];
}

interface SetlistDoc {
    id: string;
    title: string;
    items: SetlistItem[];
    updatedAt?: any;
    createdAt?: any;
    memo?: string;
}

const MAX_QUERY_LENGTH = 20;

export const SetlistPlanner: React.FC = () => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [authError, setAuthError] = useState('');
    const [anonTried, setAnonTried] = useState(false);

    const [libraryTab, setLibraryTab] = useState<'hymn' | 'praise' | 'all'>('hymn');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
    const [showCategoryPicker, setShowCategoryPicker] = useState(false);

    const [hymnItems, setHymnItems] = useState<LibraryItem[]>([]);
    const [praiseItems, setPraiseItems] = useState<LibraryItem[]>([]);

    const [setlistTitle, setSetlistTitle] = useState('');
    const [setlistMemo, setSetlistMemo] = useState('');
    const [setlistItems, setSetlistItems] = useState<SetlistItem[]>([]);
    const [savedSetlists, setSavedSetlists] = useState<SetlistDoc[]>([]);
    const [activeSetlistId, setActiveSetlistId] = useState<string>('');
    const [saving, setSaving] = useState(false);
    const setlistContainerRef = useRef<HTMLDivElement>(null);

    // Edit Item State
    const [editingItem, setEditingItem] = useState<LibraryItem | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editCode, setEditCode] = useState('');
    const [editCategory, setEditCategory] = useState('');

    // Auto-scroll to bottom of setlist when items are added
    useEffect(() => {
        if (setlistContainerRef.current) {
            setlistContainerRef.current.scrollTop = setlistContainerRef.current.scrollHeight;
        }
    }, [setlistItems.length]);

    // Multi-selection state
    const [selectedLibraryIds, setSelectedLibraryIds] = useState<Set<string>>(new Set());

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedLibraryIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedLibraryIds(newSet);
    };

    const addSelectedToSetlist = () => {
        const selectedItems = libraryItems.filter(item => selectedLibraryIds.has(item.id));
        const newItems: SetlistItem[] = selectedItems.map(item => {
            const images = item.imageUrls && item.imageUrls.length > 0
                ? item.imageUrls
                : (item.imageUrl ? [item.imageUrl] : []);
            return {
                id: `${item.type}-${item.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                sourceId: item.id,
                type: item.type,
                number: item.number,
                title: item.title,
                imageUrl: item.imageUrl || images[0] || '',
                imageUrls: images,
                versions: item.versions,
                selectedVersionId: 'default',
                code: item.code
            };
        });

        setSetlistItems(prev => [...prev, ...newItems]);
        setSelectedLibraryIds(new Set()); // Clear selection after adding
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                setCurrentUser(user);
                setAuthError('');
                return;
            }
            if (!anonTried) {
                setAnonTried(true);
                signInAnonymously(auth).catch((err) => {
                    console.error('Anonymous sign-in failed:', err);
                    setAuthError('로그인이 필요합니다.');
                });
            }
        });
        return () => unsubscribe();
    }, [anonTried]);

    useEffect(() => {
        const qHymn = query(collection(db, 'gallery'), where('type', '==', 'hymn'));
        const qPraise = query(collection(db, 'gallery'), where('type', '==', 'praise'));

        const unsubHymn = onSnapshot(qHymn, (snapshot) => {
            const items = snapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...(docSnap.data() as any),
                type: 'hymn'
            })) as LibraryItem[];

            items.sort((a, b) => (a.number || 0) - (b.number || 0));

            const enriched = items.map(item => {
                const info = getHymnByNumber(item.number);
                return {
                    ...item,
                    category: info?.category || '',
                    code: info?.code || ''
                };
            });

            setHymnItems(enriched);
        });

        const unsubPraise = onSnapshot(qPraise, (snapshot) => {
            const items = snapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...(docSnap.data() as any),
                type: 'praise'
            })) as LibraryItem[];

            items.sort((a, b) => (a.number || 0) - (b.number || 0));
            setPraiseItems(items);
        });

        return () => {
            unsubHymn();
            unsubPraise();
        };
    }, []);

    useEffect(() => {
        if (!currentUser) return;
        const q = query(
            collection(db, 'gallery'),
            where('type', '==', 'setlist'),
            where('ownerId', '==', currentUser.uid)
        );
        const unsub = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...(docSnap.data() as any)
            })) as SetlistDoc[];

            items.sort((a, b) => {
                const timeA = a.updatedAt?.seconds || 0;
                const timeB = b.updatedAt?.seconds || 0;
                return timeB - timeA;
            });

            setSavedSetlists(items);
        });
        return () => unsub();
    }, [currentUser]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                return;
            }

            if (/^\d$/.test(event.key)) {
                event.preventDefault();
                setSearchQuery(prev => (prev.length < MAX_QUERY_LENGTH ? prev + event.key : event.key));
                return;
            }

            if (event.key === 'Backspace') {
                event.preventDefault();
                setSearchQuery(prev => prev.slice(0, -1));
                return;
            }

            if (event.key === 'Escape') {
                setSearchQuery('');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const libraryItems = useMemo(() => {
        if (libraryTab === 'hymn') return hymnItems;
        if (libraryTab === 'praise') return praiseItems;
        return [...hymnItems, ...praiseItems].sort((a, b) => {
            if (a.type !== b.type) return a.type === 'hymn' ? -1 : 1;
            return (a.number || 0) - (b.number || 0);
        });
    }, [libraryTab, hymnItems, praiseItems]);

    const categories = useMemo(() => {
        const unique = new Set<string>();
        libraryItems.forEach(item => {
            if (item.category) {
                item.category.split(',').forEach(t => unique.add(t.replace(/#/g, '').trim()));
            }
            if (item.tags) {
                item.tags.forEach(t => unique.add(t.replace(/^#+/, '').trim()));
            }
        });
        return Array.from(unique).filter(Boolean).sort();
    }, [libraryItems]);

    const codes = useMemo(() => Array.from(new Set(libraryItems.map(i => i.code).filter((c): c is string => !!c))).sort(), [libraryItems]);

    const filteredLibrary = useMemo(() => {
        let results = libraryItems;

        if (selectedTags.length > 0) {
            results = results.filter(item => {
                const tags: string[] = [];
                if (item.category) item.category.split(',').forEach(t => tags.push(t.replace(/#/g, '').trim()));
                if (item.tags) item.tags.forEach(t => tags.push(t.replace(/^#+/, '').trim()));
                return selectedTags.some(st => tags.includes(st));
            });
        }

        if (selectedCodes.length > 0) {
            results = results.filter(item => item.code && selectedCodes.includes(item.code));
        }

        if (!searchQuery) return results;

        const q = searchQuery.toLowerCase().trim();
        const isNumeric = /^\d+$/.test(q);

        return results.filter(item => {
            if (isNumeric && item.number.toString().startsWith(q)) return true;
            if (item.title?.toLowerCase().includes(q)) return true;
            if (item.category?.toLowerCase().includes(q)) return true;
            if (item.code?.toLowerCase() === q) return true;
            return false;
        });
    }, [libraryItems, searchQuery, selectedTags, selectedCodes]);

    // Play YouTube playlist for setlist items
    const playYoutubePlaylist = () => {
        const videoIds: string[] = [];

        setlistItems.forEach(item => {
            if (item.youtubeLinks && item.youtubeLinks.length > 0) {
                // Extract video ID from first YouTube link
                const url = item.youtubeLinks[0].url;
                const match = url.match(/(?:embed\/|watch\?v=)([^&\n?#]+)/);
                if (match && match[1]) {
                    videoIds.push(match[1]);
                }
            }
        });

        if (videoIds.length === 0) {
            alert('콘티에 유튜브 링크가 있는 곡이 없습니다.');
            return;
        }

        // Create YouTube playlist URL
        const playlistUrl = `https://www.youtube.com/watch_videos?video_ids=${videoIds.join(',')}`;
        window.open(playlistUrl, '_blank');
    };

    const addToSetlist = (item: LibraryItem) => {
        const images = item.imageUrls && item.imageUrls.length > 0
            ? item.imageUrls
            : (item.imageUrl ? [item.imageUrl] : []);

        const newItem: SetlistItem = {
            id: `${item.type}-${item.id}-${Date.now()}`,
            sourceId: item.id,
            type: item.type,
            number: item.number,
            title: item.title,
            imageUrl: item.imageUrl || images[0] || '',
            imageUrls: images,
            code: item.code,
            versions: item.versions,
            selectedVersionId: 'default',
            youtubeLinks: item.youtubeLinks
        };

        setSetlistItems(prev => [...prev, newItem]);
    };

    const moveSetlistItem = (index: number, direction: -1 | 1) => {
        setSetlistItems(prev => {
            const nextIndex = index + direction;
            if (nextIndex < 0 || nextIndex >= prev.length) return prev;
            const next = [...prev];
            const [item] = next.splice(index, 1);
            next.splice(nextIndex, 0, item);
            return next;
        });
    };

    const removeSetlistItem = (index: number) => {
        setSetlistItems(prev => prev.filter((_, i) => i !== index));
    };

    const toggleFullPage = (index: number) => {
        setSetlistItems(prev => {
            const next = [...prev];
            next[index] = { ...next[index], fullPage: !next[index].fullPage };
            return next;
        });
    };

    const handleSave = async () => {
        if (!currentUser) {
            alert('로그인이 필요합니다.');
            return;
        }

        const title = setlistTitle.trim() || `콘티 ${new Date().toLocaleDateString('ko-KR')}`;
        if (!setlistTitle.trim()) {
            setSetlistTitle(title);
        }

        setSaving(true);
        try {
            // Sanitize items: remove undefined values and ensure imageUrls is a clean array
            const sanitizedItems = setlistItems.map(item => ({
                sourceId: item.sourceId || '',
                type: item.type || 'praise',
                number: item.number || 0,
                title: item.title || '',
                imageUrl: item.imageUrl || '',
                imageUrls: (item.imageUrls || []).filter(Boolean),
                code: item.code || '',
                fullPage: item.fullPage || false,
                youtubeLinks: item.youtubeLinks || [],
                versions: item.versions || [],
                selectedVersionId: item.selectedVersionId || 'default'
            }));

            if (activeSetlistId) {
                await updateDoc(doc(db, 'gallery', activeSetlistId), {
                    title,
                    items: sanitizedItems,
                    memo: setlistMemo.trim(),
                    updatedAt: serverTimestamp()
                });
            } else {
                const docRef = await addDoc(collection(db, 'gallery'), {
                    type: 'setlist',
                    ownerId: currentUser.uid,
                    title,
                    items: sanitizedItems,
                    memo: setlistMemo.trim(),
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
                setActiveSetlistId(docRef.id);
            }

            // Increment usageCount for items
            try {
                const batch = writeBatch(db);
                const uniqueIds = new Set(sanitizedItems.map(i => i.sourceId).filter(Boolean));

                uniqueIds.forEach(id => {
                    const ref = doc(db, 'gallery', id);
                    batch.update(ref, {
                        usageCount: increment(1)
                    });
                });

                // Fire and forget (or await if critical)
                await batch.commit();
            } catch (usageErr) {
                console.error('Failed to update usage counts:', usageErr);
                // Non-critical error
            }

            alert('저장되었습니다.');
        } catch (err: any) {
            console.error('Setlist save failed:', err);
            alert(`저장에 실패했습니다: ${err.message || '알 수 없는 오류'}`);
        } finally {
            setSaving(false);
        }
    };

    const handleSelectSetlist = (id: string) => {
        setActiveSetlistId(id);
        if (!id) {
            setSetlistTitle('');
            setSetlistMemo('');
            setSetlistItems([]);
            return;
        }
        const target = savedSetlists.find(s => s.id === id);
        if (target) {
            setSetlistTitle(target.title || '');
            setSetlistMemo(target.memo || '');
            setSetlistItems(target.items || []);
        }
    };

    const handleDeleteSetlist = async () => {
        if (!activeSetlistId) return;
        if (!window.confirm('이 콘티를 정말 삭제하시겠습니까?')) return;

        setSaving(true);
        try {
            await deleteDoc(doc(db, 'gallery', activeSetlistId));
            handleNewSetlist();
            alert('삭제되었습니다.');
        } catch (err: any) {
            console.error('Setlist delete failed:', err);
            alert(`삭제에 실패했습니다: ${err.message || '알 수 없는 오류'}`);
        } finally {
            setSaving(false);
        }
    };

    const handleNewSetlist = () => {
        setActiveSetlistId('');
        setSetlistTitle('');
        setSetlistMemo('');
        setSetlistItems([]);
    };

    const handleEditClick = (item: LibraryItem) => {
        setEditingItem(item);
        setEditTitle(item.title);
        setEditCode(item.code || '');
        setEditCategory(item.category || item.tags?.join(', ') || '');
    };

    const handleSaveLibraryItem = async () => {
        if (!editingItem) return;

        setSaving(true);
        try {
            const ref = doc(db, 'gallery', editingItem.id);
            await updateDoc(ref, {
                title: editTitle,
                code: editCode,
                category: editCategory,
                updatedAt: serverTimestamp()
            });

            // If item type is 'praise', we might want to update 'tags' array too if that's how it's stored
            // But 'category' string seems to be the main one used in display
            // Let's assume 'category' field is sufficient based on PraiseGallery.tsx pattern

            alert('수정되었습니다.');
            setEditingItem(null);
        } catch (error) {
            console.error('Error updating item:', error);
            alert('수정 중 오류가 발생했습니다.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="w-full h-full overflow-hidden print:overflow-visible flex flex-col pt-40 md:pt-60 px-4 md:px-10 pb-10 print:p-0 print:h-auto relative">
            {/* Filters & Toggle (Right Top) */}
            <div className="flex flex-col gap-4 mb-2 md:absolute md:top-0 md:right-10 md:w-auto md:mb-0 z-20 pointer-events-auto items-end print-hide">
                <div className="flex items-center gap-4">
                    {/* Filters */}
                    <div className="flex flex-col gap-2 items-end mr-4">
                        {/* Code Filter (Multi-select) */}
                        <div className="flex flex-wrap gap-1.5 items-center justify-end max-w-none">
                            <button
                                onClick={() => setSelectedCodes([])}
                                className={`px-2.5 py-1 text-[10px] rounded-full transition-all border ${selectedCodes.length === 0 ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/50' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}
                            >
                                All Key
                            </button>
                            {codes.map(code => (
                                <button
                                    key={code}
                                    onClick={() => setSelectedCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])}
                                    className={`px-2.5 py-1 text-[10px] rounded-full transition-all border ${selectedCodes.includes(code) ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/50' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}
                                >
                                    {code}
                                </button>
                            ))}
                        </div>
                        {/* Category Filter - Widened (Multi-select) */}
                        <div className="flex flex-wrap gap-1.5 items-center justify-end max-w-[800px]">
                            <button
                                onClick={() => setSelectedTags([])}
                                className={`px-2.5 py-1 text-[10px] rounded-full transition-all border ${selectedTags.length === 0 ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/50' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}
                            >
                                All
                            </button>
                            {categories.slice(0, showCategoryPicker ? categories.length : 15).map(tag => (
                                <button
                                    key={tag}
                                    onClick={() => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                                    className={`px-2.5 py-1 text-[10px] rounded-full transition-all border ${selectedTags.includes(tag) ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/50' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}
                                >
                                    #{tag}
                                </button>
                            ))}
                            {categories.length > 15 && (
                                <button
                                    onClick={() => setShowCategoryPicker(!showCategoryPicker)}
                                    className="px-2.5 py-1 text-[10px] rounded-full bg-white/5 text-white/50 border border-white/10 hover:bg-white/10"
                                >
                                    {showCategoryPicker ? '접기' : `+${categories.length - 15}`}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Search Bar & Tabs (Left Above Toggle) */}
            <div className="relative mb-2 md:mb-0 md:absolute md:top-36 md:left-10 z-20 pointer-events-auto w-full md:w-auto flex flex-row items-center gap-2 md:gap-4 overflow-x-auto no-scrollbar pr-4 md:pr-0 print-hide">
                {/* Library Tab Selector */}
                <div className="flex gap-1 p-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 shadow-lg flex-shrink-0">
                    <button
                        onClick={() => { setLibraryTab('hymn'); setSelectedTags([]); }}
                        className={`px-3 py-1.5 text-[10px] tracking-[0.05em] uppercase rounded-full transition-all whitespace-nowrap ${libraryTab === 'hymn'
                            ? 'bg-gradient-to-r from-green-500/30 to-teal-500/30 text-white font-bold'
                            : 'text-white/50 hover:text-white/80'}`}
                    >
                        찬송가
                    </button>
                    <button
                        onClick={() => { setLibraryTab('praise'); setSelectedTags([]); }}
                        className={`px-3 py-1.5 text-[10px] tracking-[0.05em] uppercase rounded-full transition-all whitespace-nowrap ${libraryTab === 'praise'
                            ? 'bg-gradient-to-r from-emerald-500/30 to-green-500/30 text-white font-bold'
                            : 'text-white/50 hover:text-white/80'}`}
                    >
                        찬양곡
                    </button>
                    <button
                        onClick={() => { setLibraryTab('all'); setSelectedTags([]); }}
                        className={`px-3 py-1.5 text-[10px] tracking-[0.05em] uppercase rounded-full transition-all whitespace-nowrap ${libraryTab === 'all'
                            ? 'bg-gradient-to-r from-indigo-500/30 to-purple-500/30 text-white font-bold'
                            : 'text-white/50 hover:text-white/80'}`}
                    >
                        전체
                    </button>
                </div>

                {/* Add Selected Button (Mobile/Desktop) */}
                {selectedLibraryIds.size > 0 && (
                    <button
                        onClick={addSelectedToSetlist}
                        className="px-3 py-2 bg-indigo-500 text-white text-xs font-bold rounded-xl hover:bg-indigo-600 transition-colors shadow-lg animate-pulse whitespace-nowrap flex-shrink-0"
                    >
                        {selectedLibraryIds.size}곡 추가
                    </button>
                )}

                {/* Search Bar */}
                <div className="relative group flex-1 md:flex-none w-full md:w-[260px] min-w-[180px]">
                    <div className="absolute inset-y-0 left-3 md:left-4 flex items-center pointer-events-none">
                        <Search className="text-emerald-400 opacity-50" size={18} />
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="번호, 제목, 주제..."
                        className="bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 rounded-2xl pl-10 pr-10 py-2 md:py-3 w-full text-lg md:text-xl font-bold text-white placeholder-white/20 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition-all backdrop-blur-sm"
                        maxLength={20}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => { setSearchQuery(''); setSelectedTags([]); setSelectedCodes([]); }}
                            className="absolute inset-y-0 right-3 flex items-center text-white/30 hover:text-red-400 transition-colors"
                        >
                            <X size={18} />
                        </button>
                    )}
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 h-full">
                {/* Library */}
                <div className="flex-1 min-h-0 print-hide">

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto pr-2 max-h-[60vh]">
                        {filteredLibrary.map(item => {
                            const thumb = item.imageUrls && item.imageUrls.length > 0 ? item.imageUrls[0] : item.imageUrl;
                            const isSelected = selectedLibraryIds.has(item.id);
                            return (
                                <motion.div
                                    key={item.id}
                                    layoutId={`lib-${item.id}`}
                                    onClick={() => toggleSelection(item.id)}
                                    className={`group relative bg-white rounded-xl overflow-hidden border shadow-md cursor-pointer transition-all ${isSelected
                                        ? 'border-indigo-500 ring-2 ring-indigo-500/50 transform scale-[0.98]'
                                        : 'border-white/10 hover:border-indigo-500/30'
                                        }`}
                                    whileHover={{ y: -4 }}
                                >
                                    <div className="aspect-[3/4] bg-zinc-100 relative">
                                        {thumb ? (
                                            <img src={thumb} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-zinc-300 text-xs">No Image</div>
                                        )}
                                        {/* Selection Overlay */}
                                        <div className={`absolute inset-0 bg-indigo-500/20 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-10'}`} />

                                        {/* Checkbox Indicator */}
                                        <div className={`absolute top-2 left-2 w-5 h-5 rounded-full border border-black/20 flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-500' : 'bg-white/80'}`}>
                                            {isSelected && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
                                        </div>
                                    </div>
                                    <div className="p-2 text-zinc-900">
                                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 flex items-center justify-between">
                                            <span>
                                                {item.type === 'hymn' ? '찬송가' : '찬양곡'} {item.number}
                                            </span>
                                            {item.code && <span className="text-emerald-600 font-bold">{item.code}</span>}
                                        </div>
                                        <div className="text-sm font-semibold truncate">{item.title}</div>
                                        {item.category && item.category.split(',').map(tag => (
                                            <span key={tag} className="text-[10px] text-emerald-700 mt-1 mr-1 inline-block">#{tag.replace(/#/g, '').trim()}</span>
                                        ))}
                                    </div>
                                    <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleEditClick(item); }}
                                            className="p-2 rounded-full bg-black/60 text-white/80 hover:bg-black hover:text-white"
                                            title="수정"
                                        >
                                            <Edit size={14} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); addToSetlist(item); }}
                                            className="p-2 rounded-full bg-black/60 text-white/80 hover:bg-black hover:text-white"
                                            title="바로 추가"
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                </motion.div>
                            );
                        })}
                        {filteredLibrary.length === 0 && (
                            <div className="col-span-full text-center text-white/40 text-sm py-12">검색 결과가 없습니다.</div>
                        )}
                    </div>
                </div>

                {/* Setlist */}
                <div className="w-full lg:w-[420px] print:w-full flex-shrink-0 flex flex-col gap-4">
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-3 print-hide">
                        <div className="flex flex-col gap-2">
                            <input
                                value={setlistTitle}
                                onChange={(e) => setSetlistTitle(e.target.value)}
                                placeholder="콘티 제목"
                                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 focus:outline-none focus:border-emerald-500/40"
                            />
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="flex-1 min-w-[80px] px-3 py-2 bg-emerald-500/20 text-emerald-300 rounded-lg border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors flex items-center justify-center gap-1.5"
                                    title="서버에 저장"
                                >
                                    <Cloud size={16} />
                                    <span className="text-xs font-bold">저장</span>
                                </button>
                                <button
                                    onClick={() => window.print()}
                                    className="flex-1 min-w-[80px] px-3 py-2 bg-white/10 text-white/80 rounded-lg border border-white/10 hover:bg-white/20 transition-colors flex items-center justify-center gap-1.5"
                                    title="인쇄"
                                >
                                    <Printer size={16} />
                                    <span className="text-xs font-bold">인쇄</span>
                                </button>
                                <button
                                    onClick={playYoutubePlaylist}
                                    className="flex-1 min-w-[100px] px-3 py-2 bg-red-500/20 text-red-300 rounded-lg border border-red-500/30 hover:bg-red-500/30 transition-colors flex items-center justify-center gap-1.5"
                                    title="유튜브 연속 재생"
                                >
                                    <Youtube size={16} />
                                    <span className="text-xs font-bold">연속재생</span>
                                </button>
                            </div>
                        </div>

                        <textarea
                            value={setlistMemo}
                            onChange={(e) => setSetlistMemo(e.target.value)}
                            placeholder="콘티 메모 (인도/반주 특이사항 등)"
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 focus:outline-none focus:border-emerald-500/40 resize-none h-20 placeholder-white/30"
                        />

                        <div className="flex items-center gap-2">
                            <select
                                value={activeSetlistId}
                                onChange={(e) => handleSelectSetlist(e.target.value)}
                                className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/70 focus:outline-none"
                            >
                                <option value="">새 콘티</option>
                                {savedSetlists.map(list => (
                                    <option key={list.id} value={list.id}>{list.title}</option>
                                ))}
                            </select>
                            <button
                                onClick={handleNewSetlist}
                                className="px-3 py-2 text-xs bg-white/10 text-white/60 rounded-lg border border-white/10 hover:bg-white/20"
                            >
                                초기화
                            </button>
                            {activeSetlistId && (
                                <button
                                    onClick={handleDeleteSetlist}
                                    disabled={saving}
                                    className="px-3 py-2 text-xs bg-red-500/10 text-red-400 rounded-lg border border-red-500/20 hover:bg-red-500/20 transition-colors"
                                >
                                    삭제
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex-1 overflow-hidden flex flex-col print-hide">
                        <div className="text-xs uppercase tracking-[0.3em] text-white/40 mb-3">Setlist ({setlistItems.length})</div>
                        <div
                            ref={setlistContainerRef}
                            className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar"
                        >
                            {setlistItems.map((item, index) => (
                                <div key={item.id} className="flex items-center gap-3 bg-black/30 border border-white/10 rounded-xl p-2">
                                    <div className="w-10 h-10 rounded-lg bg-black/60 text-white flex items-center justify-center text-sm font-bold">
                                        {item.number}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-baseline gap-2">
                                            <div className="text-white text-sm truncate">{item.title}</div>
                                            {item.code && <span className="text-emerald-400 text-[10px] font-bold">{item.code}</span>}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <div className="text-white/40 text-[10px]">
                                                {item.type === 'hymn' ? '찬송가' : '찬양곡'}
                                            </div>

                                            {/* Version Selector */}
                                            {item.versions && item.versions.length > 0 && (
                                                <select
                                                    value={item.selectedVersionId || 'default'}
                                                    onChange={(e) => {
                                                        const newVersionId = e.target.value;
                                                        // We need to update this item in the list
                                                        // But wait, `moveSetlistItem` modifies state, we need a generic update function or use setSetlistItems directly
                                                        setSetlistItems(prev => {
                                                            const newItems = [...prev];
                                                            const targetIndex = newItems.findIndex(i => i.id === item.id);
                                                            if (targetIndex === -1) return prev;

                                                            const currentItem = newItems[targetIndex];

                                                            // Find source item to get default data if switching back to default
                                                            const sourceItem = [...hymnItems, ...praiseItems].find(i => i.id === currentItem.sourceId);

                                                            let newImages = [];
                                                            let newSelectedVersionId = 'default';

                                                            if (newVersionId === 'default') {
                                                                newImages = sourceItem?.imageUrls || (sourceItem?.imageUrl ? [sourceItem.imageUrl] : []);
                                                                newSelectedVersionId = 'default';
                                                            } else {
                                                                const version = currentItem.versions?.find(v => v.id === newVersionId);
                                                                newImages = version?.imageUrls || [];
                                                                newSelectedVersionId = newVersionId;
                                                            }

                                                            newItems[targetIndex] = {
                                                                ...currentItem,
                                                                selectedVersionId: newSelectedVersionId,
                                                                imageUrls: newImages,
                                                                imageUrl: newImages[0] || ''
                                                            };

                                                            return newItems;
                                                        });
                                                    }}
                                                    className="bg-white/10 text-white/70 text-[10px] rounded border border-white/10 px-1 py-0.5 focus:outline-none focus:border-indigo-500/50 cursor-pointer hover:bg-white/20 transition-colors"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <option value="default" className="text-black">기본</option>
                                                    {item.versions.map(v => (
                                                        <option key={v.id} value={v.id} className="text-black">{v.name}</option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => moveSetlistItem(index, -1)}
                                            disabled={index === 0}
                                            className="p-1 text-white/60 hover:text-white disabled:opacity-30"
                                        >
                                            <ArrowUp size={14} />
                                        </button>
                                        <button
                                            onClick={() => moveSetlistItem(index, 1)}
                                            disabled={index === setlistItems.length - 1}
                                            className="p-1 text-white/60 hover:text-white disabled:opacity-30"
                                        >
                                            <ArrowDown size={14} />
                                        </button>
                                        <button
                                            onClick={() => toggleFullPage(index)}
                                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all flex items-center gap-1 ${item.fullPage
                                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-[0_0_10px_rgba(52,211,153,0.1)]'
                                                : 'bg-white/5 text-white/30 border-white/10 hover:border-white/30 hover:text-white/60'}`}
                                            title={item.fullPage ? "기본 보기로 변경" : "한 페이지에 하나씩 크게 보기"}
                                        >
                                            <ImageIcon size={12} />
                                            <span>1P</span>
                                        </button>
                                        <button
                                            onClick={() => removeSetlistItem(index)}
                                            className="p-1 text-red-400 hover:text-red-300"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {setlistItems.length === 0 && (
                                <div className="text-center text-white/30 text-sm py-8">콘티가 비어있습니다.</div>
                            )}
                        </div>
                    </div>

                    <div className="print-area bg-white text-black rounded-2xl p-4">
                        <div className="text-lg font-bold mb-4 print-header">{setlistTitle || '콘티'}</div>
                        {setlistMemo && (
                            <div className="mb-6 bg-gray-50 p-3 rounded-lg border border-gray-200 text-sm whitespace-pre-wrap leading-relaxed print-memo">
                                {setlistMemo}
                            </div>
                        )}
                        {setlistItems.length === 0 && (
                            <div className="text-sm text-black/50 print-hide">콘티에 곡을 추가해 주세요.</div>
                        )}
                        {setlistItems.map((item, idx) => {
                            const images = (item.imageUrls && item.imageUrls.length > 0 ? item.imageUrls : item.imageUrl ? [item.imageUrl] : []);

                            // If fullPage is true, we render EACH image as a separate full-page div
                            if (item.fullPage) {
                                return images.map((url, imgIdx) => (
                                    <div key={`${item.id}-${imgIdx}`} className="print-page full-page span-2">
                                        <div className="absolute top-4 left-4 text-[10px] font-bold text-black/20 print-only">
                                            {idx + 1}-{imgIdx + 1}. {item.title}
                                        </div>
                                        <img
                                            src={url}
                                            alt={item.title}
                                            className="w-full h-full object-contain"
                                        />
                                    </div>
                                ));
                            }

                            // Otherwise, normal behavior: stack them or grid them
                            const isFullWidth = images.length > 1;
                            const useGrid2 = images.length > 1;

                            return (
                                <div key={item.id} className={`print-page mb-6 ${isFullWidth ? 'span-2' : ''}`}>
                                    <div className="text-sm font-semibold mb-2 print-hide">
                                        {idx + 1}. {item.title}
                                        {item.code && <span className="ml-2 text-emerald-600">[{item.code}]</span>}
                                        <span className="ml-2 text-black/40 text-xs">({item.type === 'hymn' ? '찬송가' : '찬양곡'} {item.number})</span>
                                    </div>
                                    <div className={`flex flex-col gap-4 w-full ${useGrid2 ? 'print-images-grid-2' : ''}`}>
                                        {images.map((url, index) => (
                                            <img
                                                key={`${item.id}-${index}`}
                                                src={url}
                                                alt={item.title}
                                                className="w-full h-auto object-contain"
                                            />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
            {/* Edit Modal */}
            {
                editingItem && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setEditingItem(null)}>
                        <div className="bg-[#1a1a1a] border border-white/20 rounded-2xl w-full max-w-sm p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-bold text-white">곡 정보 수정</h3>
                                <button
                                    onClick={() => setEditingItem(null)}
                                    className="text-white/50 hover:text-white"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs text-white/50 mb-1">제목</label>
                                    <input
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs text-white/50 mb-1">KEY (코드)</label>
                                    <input
                                        value={editCode}
                                        onChange={(e) => setEditCode(e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                                        placeholder="예: G, A, Cm"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs text-white/50 mb-1">카테고리 (태그)</label>
                                    <input
                                        value={editCategory}
                                        onChange={(e) => setEditCategory(e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                                        placeholder="쉼표로 구분 (예: 감사, 은혜)"
                                    />
                                </div>

                                <div className="flex gap-2 mt-6">
                                    <button
                                        onClick={() => setEditingItem(null)}
                                        className="flex-1 py-2.5 rounded-xl bg-white/5 text-white/70 hover:bg-white/10 font-bold text-sm"
                                    >
                                        취소
                                    </button>
                                    <button
                                        onClick={handleSaveLibraryItem}
                                        disabled={saving}
                                        className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 font-bold text-sm disabled:opacity-50"
                                    >
                                        {saving ? '저장 중...' : '저장'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};
