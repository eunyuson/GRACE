import React, { useEffect, useMemo, useState, useRef } from 'react';
import { motion } from 'motion/react';
import { onAuthStateChanged, signInAnonymously, User } from 'firebase/auth';
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { getAllCategories, getHymnByNumber } from '../data';
import { Plus, Trash2, ArrowUp, ArrowDown, Save, Printer, X } from 'lucide-react';

interface LibraryItem {
    id: string;
    type: 'hymn' | 'praise';
    number: number;
    title: string;
    imageUrl: string;
    imageUrls?: string[];
    tags?: string[];
    category?: string;
}

interface SetlistItem {
    id: string;
    sourceId: string;
    type: 'hymn' | 'praise';
    number: number;
    title: string;
    imageUrl: string;
    imageUrls?: string[];
}

interface SetlistDoc {
    id: string;
    title: string;
    items: SetlistItem[];
    updatedAt?: any;
    createdAt?: any;
}

const MAX_QUERY_LENGTH = 3;

export const SetlistPlanner: React.FC = () => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [authError, setAuthError] = useState('');
    const [anonTried, setAnonTried] = useState(false);

    const [libraryTab, setLibraryTab] = useState<'hymn' | 'praise'>('hymn');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTag, setSelectedTag] = useState('');

    const [hymnItems, setHymnItems] = useState<LibraryItem[]>([]);
    const [praiseItems, setPraiseItems] = useState<LibraryItem[]>([]);

    const [setlistTitle, setSetlistTitle] = useState('');
    const [setlistItems, setSetlistItems] = useState<SetlistItem[]>([]);
    const [savedSetlists, setSavedSetlists] = useState<SetlistDoc[]>([]);
    const [activeSetlistId, setActiveSetlistId] = useState<string>('');
    const [saving, setSaving] = useState(false);
    const setlistContainerRef = useRef<HTMLDivElement>(null);

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
                imageUrls: images
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
                    category: info?.category || ''
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
        const q = query(collection(db, 'setlists'), where('ownerId', '==', currentUser.uid));
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

    const libraryItems = libraryTab === 'hymn' ? hymnItems : praiseItems;

    const availableTags = useMemo(() => {
        if (libraryTab === 'hymn') {
            return getAllCategories();
        }
        const tagSet = new Set<string>();
        praiseItems.forEach(item => {
            (item.tags || []).forEach(tag => tagSet.add(tag.replace(/^#+/, '')));
        });
        return Array.from(tagSet).sort();
    }, [libraryTab, praiseItems]);

    const filteredLibrary = useMemo(() => {
        let results = libraryItems;

        if (selectedTag) {
            if (libraryTab === 'hymn') {
                results = results.filter(item => item.category === selectedTag);
            } else {
                results = results.filter(item => (item.tags || []).some(t => t.replace(/^#+/, '') === selectedTag));
            }
        }

        if (!searchQuery) return results;

        const q = searchQuery.toLowerCase().trim();
        const isNumeric = /^\d+$/.test(q);

        return results.filter(item => {
            if (isNumeric && item.number.toString().startsWith(q)) return true;
            if (item.title?.toLowerCase().includes(q)) return true;
            if (item.category?.toLowerCase().includes(q)) return true;
            return false;
        });
    }, [libraryItems, searchQuery, selectedTag, libraryTab]);

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
            imageUrls: images
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
            if (activeSetlistId) {
                await updateDoc(doc(db, 'setlists', activeSetlistId), {
                    title,
                    items: setlistItems,
                    updatedAt: serverTimestamp()
                });
            } else {
                const docRef = await addDoc(collection(db, 'setlists'), {
                    ownerId: currentUser.uid,
                    title,
                    items: setlistItems,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
                setActiveSetlistId(docRef.id);
            }
        } catch (err) {
            console.error('Setlist save failed:', err);
            alert('저장에 실패했습니다.');
        } finally {
            setSaving(false);
        }
    };

    const handleSelectSetlist = (id: string) => {
        setActiveSetlistId(id);
        if (!id) {
            setSetlistTitle('');
            setSetlistItems([]);
            return;
        }
        const target = savedSetlists.find(s => s.id === id);
        if (target) {
            setSetlistTitle(target.title || '');
            setSetlistItems(target.items || []);
        }
    };

    const handleNewSetlist = () => {
        setActiveSetlistId('');
        setSetlistTitle('');
        setSetlistItems([]);
    };

    return (
        <div className="w-full h-full overflow-hidden flex flex-col pt-32 px-4 md:px-10 pb-10">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8 print-hide">
                <div>
                    <h1 className="text-4xl md:text-5xl font-['Anton'] text-white mb-2">SETLIST</h1>
                    <p className="text-white/40 text-xs tracking-[0.3em] uppercase font-['Inter']">찬양 콘티 플래너</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-white/40">
                    {authError ? authError : currentUser ? `UID: ${currentUser.uid.slice(0, 8)}...` : '로그인 확인 중...'}
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 h-full">
                {/* Library */}
                <div className="flex-1 min-h-0 print-hide">
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                        <button
                            onClick={() => { setLibraryTab('hymn'); setSelectedTag(''); }}
                            className={`px-3 py-1.5 text-[10px] tracking-[0.15em] uppercase rounded-full transition-all ${libraryTab === 'hymn'
                                ? 'bg-gradient-to-r from-green-500/30 to-teal-500/30 text-white'
                                : 'text-white/50 hover:text-white/80'}`}
                        >
                            🎵 찬송가
                        </button>
                        <button
                            onClick={() => { setLibraryTab('praise'); setSelectedTag(''); }}
                            className={`px-3 py-1.5 text-[10px] tracking-[0.15em] uppercase rounded-full transition-all ${libraryTab === 'praise'
                                ? 'bg-gradient-to-r from-emerald-500/30 to-green-500/30 text-white'
                                : 'text-white/50 hover:text-white/80'}`}
                        >
                            🎶 찬양곡
                        </button>
                        <div className="ml-auto flex items-center gap-2">
                            {selectedLibraryIds.size > 0 && (
                                <button
                                    onClick={addSelectedToSetlist}
                                    className="px-3 py-1.5 bg-indigo-500 text-white text-xs font-bold rounded-lg hover:bg-indigo-600 transition-colors shadow-lg animate-pulse"
                                >
                                    {selectedLibraryIds.size}곡 추가하기
                                </button>
                            )}
                            <input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="제목 또는 번호 검색..."
                                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/80 focus:outline-none focus:border-emerald-500/40"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="p-2 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-4 mb-6">
                        <div className="flex items-center gap-3">
                            <div className="bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 rounded-2xl px-5 py-3 min-w-[120px] text-center backdrop-blur-sm">
                                <span className="text-3xl font-bold text-white font-mono tracking-wider">
                                    {searchQuery || '___'}
                                </span>
                                <span className="text-emerald-400 text-lg ml-1">{libraryTab === 'hymn' ? '장' : '곡'}</span>
                            </div>
                            <div className="grid grid-cols-5 gap-1.5 bg-white/5 p-2 rounded-2xl border border-white/10 backdrop-blur-sm">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((num) => (
                                    <button
                                        key={num}
                                        onClick={() => {
                                            if (searchQuery.length < MAX_QUERY_LENGTH) {
                                                setSearchQuery(prev => prev + num.toString());
                                            }
                                        }}
                                        className="w-10 h-10 rounded-xl bg-gradient-to-br from-white/10 to-white/5 hover:from-emerald-500/30 hover:to-teal-500/20 border border-white/10 hover:border-emerald-500/40 text-white font-bold text-lg transition-all"
                                    >
                                        {num}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
                            <button
                                onClick={() => setSelectedTag('')}
                                className={`px-3 py-1 text-xs rounded-full transition-all ${!selectedTag
                                    ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
                                    : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'}`}
                            >
                                전체
                            </button>
                            {availableTags.slice(0, 10).map(tag => (
                                <button
                                    key={tag}
                                    onClick={() => setSelectedTag(tag === selectedTag ? '' : tag)}
                                    className={`px-3 py-1 text-xs rounded-full transition-all ${selectedTag === tag
                                        ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
                                        : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'}`}
                                >
                                    #{tag}
                                </button>
                            ))}
                        </div>
                    </div>

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
                                        <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                                            {libraryTab === 'hymn' ? '찬송가' : '찬양곡'} {item.number}
                                        </div>
                                        <div className="text-sm font-semibold truncate">{item.title}</div>
                                        {item.category && (
                                            <div className="text-[10px] text-emerald-700 mt-1">#{item.category}</div>
                                        )}
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); addToSetlist(item); }}
                                        className="absolute top-2 right-2 p-2 rounded-full bg-black/60 text-white/80 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black hover:text-white"
                                        title="바로 추가"
                                    >
                                        <Plus size={14} />
                                    </button>
                                </motion.div>
                            );
                        })}
                        {filteredLibrary.length === 0 && (
                            <div className="col-span-full text-center text-white/40 text-sm py-12">검색 결과가 없습니다.</div>
                        )}
                    </div>
                </div>

                {/* Setlist */}
                <div className="w-full lg:w-[420px] flex-shrink-0 flex flex-col gap-4">
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-3 print-hide">
                        <div className="flex items-center gap-2">
                            <input
                                value={setlistTitle}
                                onChange={(e) => setSetlistTitle(e.target.value)}
                                placeholder="콘티 제목"
                                className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 focus:outline-none focus:border-emerald-500/40"
                            />
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-3 py-2 bg-emerald-500/20 text-emerald-300 rounded-lg border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
                            >
                                <Save size={16} />
                            </button>
                            <button
                                onClick={() => window.print()}
                                className="px-3 py-2 bg-white/10 text-white/80 rounded-lg border border-white/10 hover:bg-white/20 transition-colors"
                            >
                                <Printer size={16} />
                            </button>
                        </div>
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
                                        <div className="text-white text-sm truncate">{item.title}</div>
                                        <div className="text-white/40 text-[10px]">
                                            {item.type === 'hymn' ? '찬송가' : '찬양곡'}
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
                        <div className="text-lg font-bold mb-4">{setlistTitle || '콘티'}</div>
                        {setlistItems.length === 0 && (
                            <div className="text-sm text-black/50">콘티에 곡을 추가해 주세요.</div>
                        )}
                        {setlistItems.map((item, idx) => (
                            <div key={item.id} className="print-page mb-6">
                                <div className="text-sm font-semibold mb-2">{idx + 1}. {item.title} ({item.type === 'hymn' ? '찬송가' : '찬양곡'} {item.number})</div>
                                <div className="flex flex-col gap-4">
                                    {(item.imageUrls && item.imageUrls.length > 0 ? item.imageUrls : item.imageUrl ? [item.imageUrl] : []).map((url, index) => (
                                        <img
                                            key={`${item.id}-${index}`}
                                            src={url}
                                            alt={item.title}
                                            className="w-full h-auto object-contain"
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
