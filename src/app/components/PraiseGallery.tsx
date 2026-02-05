import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Music, Grid, List, Edit3, Save, Youtube, Plus, Trash2, ExternalLink, ChevronLeft, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import { collection, query, onSnapshot, where, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

interface Hymn {
    id: string;
    number: number;
    title: string;
    imageUrl: string;
    imageUrls?: string[];
    pptUrl?: string;
    lyrics?: string;
    youtubeLinks?: { url: string; title: string }[];
    code?: string;
    category?: string;
}

interface PraiseGalleryProps {
    isAdmin?: boolean;
}

export const PraiseGallery: React.FC<PraiseGalleryProps> = ({ isAdmin = false }) => {
    const [hymns, setHymns] = useState<Hymn[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedHymn, setSelectedHymn] = useState<Hymn | null>(null);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    const MAX_QUERY_LENGTH = 3;
    const [activeImageIndex, setActiveImageIndex] = useState(0);
    const [isMerging, setIsMerging] = useState(false);

    // Editing states
    const [isEditing, setIsEditing] = useState(false);
    const [editLyrics, setEditLyrics] = useState('');
    const [editYoutubeLinks, setEditYoutubeLinks] = useState<{ url: string; title: string }[]>([]);
    const [editImageUrls, setEditImageUrls] = useState<string[]>([]);
    const [newImageUrl, setNewImageUrl] = useState('');
    const [newYoutubeUrl, setNewYoutubeUrl] = useState('');
    const [newYoutubeTitle, setNewYoutubeTitle] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setActiveImageIndex(0);
    }, [selectedHymn?.id]);

    // Start editing mode
    const startEditing = () => {
        if (selectedHymn) {
            setEditLyrics(selectedHymn.lyrics || '');
            setEditYoutubeLinks(selectedHymn.youtubeLinks || []);
            setEditImageUrls(getImagesForHymn(selectedHymn));
            setNewImageUrl('');
            setNewYoutubeUrl('');
            setNewYoutubeTitle('');
            setIsEditing(true);
        }
    };

    // Save changes
    const saveChanges = async () => {
        if (!selectedHymn) return;

        setSaving(true);
        try {
            const cleanedImageUrls = editImageUrls.map(u => u.trim()).filter(Boolean);
            const primaryImageUrl = cleanedImageUrls[0] || selectedHymn.imageUrl || '';
            const hymnRef = doc(db, 'gallery', selectedHymn.id);
            await updateDoc(hymnRef, {
                lyrics: editLyrics,
                youtubeLinks: editYoutubeLinks,
                imageUrls: cleanedImageUrls,
                imageUrl: primaryImageUrl
            });

            // Update local state
            setSelectedHymn({
                ...selectedHymn,
                lyrics: editLyrics,
                youtubeLinks: editYoutubeLinks,
                imageUrls: cleanedImageUrls,
                imageUrl: primaryImageUrl
            });
            setIsEditing(false);
        } catch (error) {
            console.error('Error saving hymn:', error);
            alert('저장 중 오류가 발생했습니다.');
        } finally {
            setSaving(false);
        }
    };

    // Add YouTube link
    const addYoutubeLink = () => {
        if (!newYoutubeUrl.trim()) return;

        // Extract video ID and create embed-friendly URL
        let videoId = '';
        const urlMatch = newYoutubeUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/);
        if (urlMatch) {
            videoId = urlMatch[1];
        }

        const title = newYoutubeTitle.trim() || `영상 ${editYoutubeLinks.length + 1}`;

        setEditYoutubeLinks([...editYoutubeLinks, {
            url: videoId ? `https://www.youtube.com/embed/${videoId}` : newYoutubeUrl,
            title
        }]);
        setNewYoutubeUrl('');
        setNewYoutubeTitle('');
    };

    // Remove YouTube link
    const removeYoutubeLink = (index: number) => {
        setEditYoutubeLinks(editYoutubeLinks.filter((_, i) => i !== index));
    };

    // Cancel editing
    const cancelEditing = () => {
        setIsEditing(false);
        setEditLyrics('');
        setEditYoutubeLinks([]);
        setEditImageUrls([]);
        setNewImageUrl('');
        setNewYoutubeUrl('');
        setNewYoutubeTitle('');
    };

    const moveImage = (from: number, to: number) => {
        setEditImageUrls(prev => {
            if (to < 0 || to >= prev.length) return prev;
            const next = [...prev];
            const [item] = next.splice(from, 1);
            next.splice(to, 0, item);
            return next;
        });
    };

    useEffect(() => {
        // Fetch hymns from 'gallery' collection where type == 'hymn'
        // This relies on 'gallery' being public readable.
        // We do NOT use orderBy here to avoid index requirements for safe initial loading
        const q = query(collection(db, 'gallery'), where('type', '==', 'praise'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Hymn));

            // Client-side sort
            items.sort((a, b) => (a.number || 0) - (b.number || 0));

            setHymns(items);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching hymns:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const getImagesForHymn = (hymn: Hymn): string[] => {
        if (hymn.imageUrls && Array.isArray(hymn.imageUrls) && hymn.imageUrls.length > 0) {
            return hymn.imageUrls.filter(Boolean);
        }
        return hymn.imageUrl ? [hymn.imageUrl] : [];
    };

    const mergeWithNext = async () => {
        if (!selectedHymn) return;
        if (isMerging) return;

        const nextNumber = selectedHymn.number + 1;
        const nextItem = hymns.find(h => h.number === nextNumber);
        if (!nextItem) {
            alert('다음 곡이 없습니다.');
            return;
        }

        const ok = window.confirm(`찬양곡 ${selectedHymn.number}과 ${nextNumber}을 합칠까요?
합치면 ${nextNumber}부터 이후 번호가 자동으로 당겨집니다.`);
        if (!ok) return;

        setIsMerging(true);
        try {
            const currentImages = getImagesForHymn(selectedHymn);
            const nextImages = getImagesForHymn(nextItem);
            const mergedImages = [...currentImages, ...nextImages].filter(Boolean);
            if (mergedImages.length === 0) {
                alert('합칠 이미지가 없습니다.');
                return;
            }

            const currentRef = doc(db, 'gallery', selectedHymn.id);
            const nextRef = doc(db, 'gallery', nextItem.id);

            await updateDoc(currentRef, {
                imageUrls: mergedImages,
                imageUrl: mergedImages[0]
            });

            await deleteDoc(nextRef);

            const toShift = hymns.filter(h => h.number > nextNumber);
            let batch = writeBatch(db);
            let count = 0;
            for (const item of toShift) {
                batch.update(doc(db, 'gallery', item.id), { number: item.number - 1 });
                count += 1;
                if (count >= 450) {
                    await batch.commit();
                    batch = writeBatch(db);
                    count = 0;
                }
            }
            if (count > 0) {
                await batch.commit();
            }

            setSelectedHymn(prev => prev ? { ...prev, imageUrls: mergedImages, imageUrl: mergedImages[0] } : prev);
            setActiveImageIndex(0);
            alert('합치기가 완료되었습니다.');
        } catch (error) {
            console.error('Merge failed:', error);
            alert('합치기 중 오류가 발생했습니다.');
        } finally {
            setIsMerging(false);
        }
    };

    const orderedHymns = useMemo(() => {
        return [...hymns].sort((a, b) => (a.number || 0) - (b.number || 0));
    }, [hymns]);

    const currentIndex = selectedHymn
        ? orderedHymns.findIndex(h => h.id === selectedHymn.id)
        : -1;
    const prevHymn = currentIndex > 0 ? orderedHymns[currentIndex - 1] : null;
    const nextHymn = currentIndex >= 0 && currentIndex < orderedHymns.length - 1
        ? orderedHymns[currentIndex + 1]
        : null;

    const navigateToHymn = (target: Hymn | null) => {
        if (!target) return;
        if (isEditing) {
            const ok = window.confirm('편집 중입니다. 이동하면 저장되지 않은 내용이 사라질 수 있습니다. 이동할까요?');
            if (!ok) return;
        }
        cancelEditing();
        setSelectedHymn(target);
    };

    // Filtering: number prefix + title contains
    const filteredHymns = useMemo(() => {
        if (!searchQuery) return hymns;
        const q = searchQuery.toLowerCase().trim();
        const isNumeric = /^\d+$/.test(q);

        return hymns.filter(h => {
            if (isNumeric && h.number.toString().startsWith(q)) return true;
            return h.title.toLowerCase().includes(q);
        });
    }, [hymns, searchQuery]);

    const selectedImages = selectedHymn ? getImagesForHymn(selectedHymn) : [];
    const activeImage = selectedImages[activeImageIndex] || selectedImages[0] || '';

    return (
        <div className="w-full h-full overflow-hidden flex flex-col pt-32 px-4 md:px-10 pb-10">
            {/* Header & Search */}
            <div className="flex flex-col gap-4 mb-6">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4">
                    <div className="flex items-end gap-6">
                        <div>
                            <h1 className="text-4xl md:text-5xl font-['Anton'] text-white mb-1">PRAISE</h1>
                            <p className="text-white/40 font-['Inter'] tracking-wider text-xs">찬양 악보 모음</p>
                        </div>

                        {/* Number Display */}
                        <div className="flex items-center gap-3">
                            <div className="bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 rounded-2xl px-6 py-3 min-w-[120px] text-center backdrop-blur-sm">
                                <span className="text-3xl md:text-4xl font-bold text-white font-mono tracking-wider">
                                    {searchQuery || '___'}
                                </span>
                                <span className="text-emerald-400 text-lg ml-1">곡</span>
                            </div>
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('') }
                                    className="p-2 bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 rounded-xl text-white/50 hover:text-red-400 transition-all"
                                >
                                    <X size={20} />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Number Keypad */}
                        <div className="grid grid-cols-5 gap-1.5 bg-white/5 p-2 rounded-2xl border border-white/10 backdrop-blur-sm">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((num) => (
                                <button
                                    key={num}
                                    onClick={() => {
                                        if (searchQuery.length < MAX_QUERY_LENGTH) {
                                            setSearchQuery(prev => prev + num.toString());
                                        }
                                    }}
                                    className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-gradient-to-br from-white/10 to-white/5 hover:from-emerald-500/30 hover:to-teal-500/20 border border-white/10 hover:border-emerald-500/40 text-white font-bold text-lg transition-all hover:scale-105 active:scale-95 shadow-lg"
                                >
                                    {num}
                                </button>
                            ))}
                        </div>

                        {/* View Mode Toggle */}
                        <div className="flex flex-col bg-white/5 rounded-xl p-1 border border-white/10">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-emerald-500/20 text-emerald-400' : 'text-white/40 hover:text-white/70'}`}
                            >
                                <Grid size={18} />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-emerald-500/20 text-emerald-400' : 'text-white/40 hover:text-white/70'}`}
                            >
                                <List size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Matching Results Info */}
            {searchQuery && (
                <div className="mb-4 flex items-center gap-2 text-sm flex-wrap">
                    <span className="text-white/40">검색 결과:</span>
                    <span className="text-emerald-400 font-bold">{filteredHymns.length}개</span>
                    {searchQuery && (
                        <span className="text-white/50">
                            {searchQuery.length === 1 && `${searchQuery}곡, ${searchQuery}0~${searchQuery}9곡, ${searchQuery}00~${searchQuery}99곡`}
                            {searchQuery.length === 2 && `${searchQuery}곡, ${searchQuery}0~${searchQuery}9곡`}
                            {searchQuery.length === 3 && `${searchQuery}곡`}
                        </span>
                    )}
                </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar -mr-4 pr-4">
                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    </div>
                ) : filteredHymns.length === 0 ? (
                    <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl">
                        <p className="text-white/30">
                            {hymns.length === 0 ? '아직 등록된 찬양곡이 없습니다.' : '검색 결과가 없습니다.'}
                        </p>
                        {hymns.length === 0 && (
                            <p className="text-white/20 text-sm mt-2">관리자에게 데이터 입력을 요청하세요.</p>
                        )}
                    </div>
                ) : (
                    <>
                        {viewMode === 'grid' ? (
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                                {filteredHymns.map((hymn) => (
                                    <motion.div
                                        key={hymn.id}
                                        layoutId={`praise-${hymn.id}`}
                                        onClick={() => setSelectedHymn(hymn)}
                                        className="group cursor-pointer bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:border-white/30 transition-all hover:-translate-y-1"
                                    >
                                        <div className="aspect-[3/4] bg-black/40 relative">
                                            {(hymn.imageUrl || (hymn.imageUrls && hymn.imageUrls[0])) ? (
                                                <img
                                                    src={(hymn.imageUrl || (hymn.imageUrls && hymn.imageUrls[0]) || "")}
                                                    alt={hymn.title}
                                                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                                    loading="lazy"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-white/10">
                                                    <Music size={32} />
                                                </div>
                                            )}
                                            <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-xs font-bold text-white border border-white/10">
                                                {hymn.number}곡
                                            </div>
                                        </div>
                                        <div className="p-3">
                                            <h3 className="text-white/90 text-sm font-medium truncate">{hymn.title}</h3>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {filteredHymns.map((hymn) => (
                                    <motion.div
                                        key={hymn.id}
                                        onClick={() => setSelectedHymn(hymn)}
                                        className="flex items-center gap-4 p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 cursor-pointer transition-colors"
                                    >
                                        <div className="w-12 h-12 bg-black/40 rounded-lg flex items-center justify-center flex-shrink-0 text-white font-bold border border-white/5">
                                            {hymn.number}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-white font-medium">{hymn.title}</h3>
                                            {hymn.lyrics && (
                                                <p className="text-white/40 text-xs truncate">{hymn.lyrics.slice(0, 50)}...</p>
                                            )}
                                        </div>
                                        {hymn.imageUrl && <div className="text-xs text-white/30 px-2 py-1 border border-white/10 rounded bg-black/20">악보</div>}
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Detail Modal */}
            <AnimatePresence>
                {selectedHymn && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[3000] bg-black/95 backdrop-blur-md flex items-center justify-center p-2 md:p-4"
                        onClick={() => { setSelectedHymn(null); cancelEditing(); }}
                    >
                        <motion.div
                            layoutId={`praise-${selectedHymn.id}`}
                            className="w-full h-full max-w-6xl bg-[#111] rounded-2xl overflow-hidden flex flex-col md:flex-row border border-white/10 shadow-2xl relative"
                            onClick={e => e.stopPropagation()}
                        >
                            <button
                                onClick={() => { setSelectedHymn(null); cancelEditing(); }}
                                className="absolute top-2 right-2 md:top-4 md:right-4 z-20 p-2 bg-black/50 rounded-full text-white/70 hover:text-white hover:bg-black/80 transition-all border border-white/10"
                            >
                                <X size={20} />
                            </button>

                            {prevHymn && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); navigateToHymn(prevHymn); }}
                                    className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-20 p-3 md:p-4 bg-black/20 hover:bg-black/50 rounded-full text-white/60 hover:text-white border border-white/10 backdrop-blur-sm transition-all"
                                    aria-label="이전 찬양곡"
                                >
                                    <ChevronLeft size={22} />
                                </button>
                            )}
                            {nextHymn && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); navigateToHymn(nextHymn); }}
                                    className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-20 p-3 md:p-4 bg-black/20 hover:bg-black/50 rounded-full text-white/60 hover:text-white border border-white/10 backdrop-blur-sm transition-all"
                                    aria-label="다음 찬양곡"
                                >
                                    <ChevronRight size={22} />
                                </button>
                            )}

                            {/* Admin Merge Button */}
                            {isAdmin && !isEditing && (
                                <button
                                    onClick={mergeWithNext}
                                    disabled={isMerging}
                                    className="absolute top-2 right-20 md:top-4 md:right-24 z-20 px-2 py-1.5 bg-amber-500/20 rounded-full text-amber-300 hover:bg-amber-500/40 transition-all border border-amber-500/30 text-[10px] md:text-xs disabled:opacity-60"
                                >
                                    {isMerging ? '합치는 중...' : '다음과 합치기'}
                                </button>
                            )}

                            {/* Admin Edit Button */}
                            {isAdmin && !isEditing && (
                                <button
                                    onClick={startEditing}
                                    className="absolute top-2 right-12 md:top-4 md:right-16 z-20 p-2 bg-indigo-500/20 rounded-full text-indigo-300 hover:bg-indigo-500/40 transition-all border border-indigo-500/30 flex items-center gap-2"
                                >
                                    <Edit3 size={18} />
                                </button>
                            )}

                            {/* Mobile: Vertical layout with full-height image */}
                            {/* Desktop: Horizontal layout */}

                            {/* Image Section - fills available height on mobile */}
                            <div className="flex-1 md:flex-[1.2] bg-black flex items-center justify-center p-2 md:p-8 overflow-hidden relative group min-h-0">
                                {activeImage ? (
                                    <img
                                        src={activeImage}
                                        alt={selectedHymn.title}
                                        className="w-auto h-full max-w-full object-contain shadow-2xl"
                                    />
                                ) : (
                                    <div className="text-white/20 flex flex-col items-center gap-4">
                                        <Music size={64} />
                                        <p>악보 이미지가 없습니다</p>
                                    </div>
                                )}
                                {selectedImages.length > 1 && (
                                    <div className="absolute bottom-4 left-4 flex items-center gap-2 text-xs text-white/70">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveImageIndex(prev => (prev - 1 + selectedImages.length) % selectedImages.length);
                                            }}
                                            className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/10"
                                        >
                                            이전
                                        </button>
                                        <span className="px-2 py-1 rounded bg-black/50 border border-white/10">
                                            {activeImageIndex + 1} / {selectedImages.length}
                                        </span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveImageIndex(prev => (prev + 1) % selectedImages.length);
                                            }}
                                            className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/10"
                                        >
                                            다음
                                        </button>
                                    </div>
                                )}

                                <a
                                    href={activeImage}
                                    download
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="absolute bottom-4 right-4 md:bottom-6 md:right-6 bg-white text-black px-3 py-1.5 md:px-4 md:py-2 rounded-full font-bold shadow-lg opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex items-center gap-2 text-sm"
                                >
                                    <Download size={14} /> 원본
                                </a>

                                {/* Mobile: Hymn info overlay at bottom */}
                                <div className="absolute bottom-0 left-0 right-0 md:hidden bg-gradient-to-t from-black/90 via-black/70 to-transparent p-4 pt-8">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="px-2 py-0.5 bg-indigo-500/30 text-indigo-300 rounded text-xs font-bold">
                                            {selectedHymn.number}곡
                                        </span>
                                        {selectedHymn.code && (
                                            <span className="px-2 py-0.5 bg-emerald-500/30 text-emerald-300 rounded text-xs">
                                                {selectedHymn.code}
                                            </span>
                                        )}
                                        {selectedHymn.category && (
                                            <span className="px-2 py-0.5 bg-white/10 text-white/60 rounded text-xs">
                                                #{selectedHymn.category}
                                            </span>
                                        )}
                                    </div>
                                    <h2 className="text-lg font-bold text-white">{selectedHymn.title}</h2>
                                </div>
                            </div>

                            {/* Right: Info Panel - Hidden on mobile by default, shown on desktop */}
                            <div className="hidden md:flex w-full md:w-[400px] bg-[#1a1a1a] p-6 border-l border-white/10 flex-col overflow-y-auto">
                                {/* Header */}
                                <div className="mb-6">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded text-xs font-bold border border-indigo-500/20">
                                            {selectedHymn.number}곡
                                        </span>
                                        {selectedHymn.code && (
                                            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded text-xs border border-emerald-500/20">
                                                {selectedHymn.code}
                                            </span>
                                        )}
                                        {selectedHymn.category && (
                                            <span className="px-3 py-1 bg-white/10 text-white/60 rounded text-xs border border-white/10">
                                                #{selectedHymn.category}
                                            </span>
                                        )}
                                    </div>
                                    <h2 className="text-2xl font-bold text-white leading-tight">{selectedHymn.title}</h2>
                                </div>

                                {/* Editing Mode */}
                                {isEditing ? (
                                    <div className="flex-1 flex flex-col gap-6 overflow-y-auto">
                                        {/* Lyrics Editor */}
                                        <div>
                                            <h3 className="text-xs uppercase tracking-wider text-white/40 mb-3 font-bold flex items-center gap-2">
                                                <Edit3 size={14} /> 가사 편집
                                            </h3>
                                            <textarea
                                                value={editLyrics}
                                                onChange={(e) => setEditLyrics(e.target.value)}
                                                className="w-full h-48 bg-black/40 border border-white/10 rounded-xl p-4 text-white/90 text-sm resize-none focus:outline-none focus:border-indigo-500/50 placeholder-white/30"
                                                placeholder="가사를 입력하세요..."
                                            />
                                        </div>

                                        {/* Image URLs Editor */}
                                        <div>
                                            <h3 className="text-xs uppercase tracking-wider text-white/40 mb-3 font-bold flex items-center gap-2">
                                                <Music size={14} /> 악보 이미지
                                            </h3>
                                            <div className="space-y-2">
                                                {editImageUrls.length === 0 && (
                                                    <div className="text-white/30 text-sm">등록된 이미지가 없습니다.</div>
                                                )}
                                                {editImageUrls.map((url, index) => (
                                                    <div key={`${url}-${index}`} className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg p-2">
                                                        <input
                                                            type="text"
                                                            value={url}
                                                            onChange={(e) => {
                                                                const value = e.target.value;
                                                                setEditImageUrls(prev => prev.map((u, i) => (i === index ? value : u)));
                                                            }}
                                                            className="flex-1 bg-black/20 border border-white/10 rounded px-2 py-1 text-white/90 text-xs focus:outline-none focus:border-indigo-500/50"
                                                            placeholder="이미지 URL"
                                                        />
                                                        <button
                                                            onClick={() => moveImage(index, index - 1)}
                                                            disabled={index === 0}
                                                            className="p-1 text-white/50 hover:text-white disabled:opacity-30"
                                                            title="위로"
                                                        >
                                                            <ArrowUp size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => moveImage(index, index + 1)}
                                                            disabled={index === editImageUrls.length - 1}
                                                            className="p-1 text-white/50 hover:text-white disabled:opacity-30"
                                                            title="아래로"
                                                        >
                                                            <ArrowDown size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => setEditImageUrls(prev => prev.filter((_, i) => i !== index))}
                                                            className="p-1 text-red-400 hover:bg-red-500/20 rounded"
                                                            title="삭제"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="mt-3 flex gap-2">
                                                <input
                                                    type="text"
                                                    value={newImageUrl}
                                                    onChange={(e) => setNewImageUrl(e.target.value)}
                                                    placeholder="이미지 URL 추가..."
                                                    className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white/90 text-sm focus:outline-none focus:border-indigo-500/50 placeholder-white/30"
                                                />
                                                <button
                                                    onClick={() => {
                                                        const next = newImageUrl.trim();
                                                        if (!next) return;
                                                        setEditImageUrls(prev => [...prev, next]);
                                                        setNewImageUrl('');
                                                    }}
                                                    disabled={!newImageUrl.trim()}
                                                    className="px-3 py-2 bg-emerald-500/20 text-emerald-300 rounded-lg hover:bg-emerald-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    추가
                                                </button>
                                            </div>
                                            <p className="text-[10px] text-white/30 mt-2">첫 번째 이미지가 대표 이미지로 사용됩니다.</p>
                                        </div>

                                        {/* YouTube Links Editor */}
                                        <div>
                                            <h3 className="text-xs uppercase tracking-wider text-white/40 mb-3 font-bold flex items-center gap-2">
                                                <Youtube size={14} /> 유튜브 영상
                                            </h3>

                                            {/* Existing Links */}
                                            <div className="space-y-2 mb-4">
                                                {editYoutubeLinks.map((link, index) => (
                                                    <div key={index} className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg p-2">
                                                        <Youtube size={16} className="text-red-400 flex-shrink-0" />
                                                        <span className="flex-1 text-white/80 text-sm truncate">{link.title}</span>
                                                        <button
                                                            onClick={() => removeYoutubeLink(index)}
                                                            className="p-1 text-red-400 hover:bg-red-500/20 rounded"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Add New Link */}
                                            <div className="space-y-2">
                                                <input
                                                    type="text"
                                                    value={newYoutubeUrl}
                                                    onChange={(e) => setNewYoutubeUrl(e.target.value)}
                                                    placeholder="YouTube URL 붙여넣기..."
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white/90 text-sm focus:outline-none focus:border-indigo-500/50 placeholder-white/30"
                                                />
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={newYoutubeTitle}
                                                        onChange={(e) => setNewYoutubeTitle(e.target.value)}
                                                        placeholder="영상 제목 (선택)"
                                                        className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white/90 text-sm focus:outline-none focus:border-indigo-500/50 placeholder-white/30"
                                                    />
                                                    <button
                                                        onClick={addYoutubeLink}
                                                        disabled={!newYoutubeUrl.trim()}
                                                        className="px-3 py-2 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                                    >
                                                        <Plus size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex gap-3 mt-auto pt-4 border-t border-white/10">
                                            <button
                                                onClick={cancelEditing}
                                                className="flex-1 py-3 bg-white/5 text-white/60 rounded-xl hover:bg-white/10 transition-colors"
                                            >
                                                취소
                                            </button>
                                            <button
                                                onClick={saveChanges}
                                                disabled={saving}
                                                className="flex-1 py-3 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                            >
                                                {saving ? (
                                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                ) : (
                                                    <>
                                                        <Save size={18} />
                                                        저장
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    /* View Mode */
                                    <div className="flex-1 flex flex-col gap-6 overflow-y-auto">
                                        {/* YouTube Videos */}
                                        {selectedHymn.youtubeLinks && selectedHymn.youtubeLinks.length > 0 && (
                                            <div>
                                                <h3 className="text-xs uppercase tracking-wider text-white/40 mb-3 font-bold flex items-center gap-2">
                                                    <Youtube size={14} className="text-red-400" /> 영상
                                                </h3>
                                                <div className="space-y-3">
                                                    {selectedHymn.youtubeLinks.map((link, index) => (
                                                        <div key={index} className="rounded-xl overflow-hidden border border-white/10">
                                                            <iframe
                                                                src={link.url}
                                                                title={link.title}
                                                                className="w-full aspect-video"
                                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                                allowFullScreen
                                                            />
                                                            <div className="bg-black/40 px-3 py-2 flex items-center justify-between">
                                                                <span className="text-white/70 text-sm truncate">{link.title}</span>
                                                                <a
                                                                    href={link.url.replace('/embed/', '/watch?v=')}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-white/40 hover:text-white/80 transition-colors"
                                                                >
                                                                    <ExternalLink size={14} />
                                                                </a>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Lyrics */}
                                        {selectedHymn.lyrics ? (
                                            <div className="flex-1">
                                                <h3 className="text-xs uppercase tracking-wider text-white/40 mb-3 font-bold">가사</h3>
                                                <p className="text-white/80 whitespace-pre-wrap leading-relaxed text-sm font-light">
                                                    {selectedHymn.lyrics}
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="flex-1 flex items-center justify-center text-white/30 text-sm">
                                                가사가 아직 등록되지 않았습니다.
                                                {isAdmin && (
                                                    <button
                                                        onClick={startEditing}
                                                        className="ml-2 text-indigo-400 hover:text-indigo-300 underline"
                                                    >
                                                        추가하기
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
