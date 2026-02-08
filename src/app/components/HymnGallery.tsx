import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Music, Grid, List, Edit3, Save, Youtube, Plus, Trash2, ExternalLink, Search, Hash, ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';
import { collection, query, onSnapshot, where, doc, updateDoc } from 'firebase/firestore';
import { db, storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { allHymnData, getAllCategories, getHymnByNumber, HymnInfo } from '../data';

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

interface HymnGalleryProps {
    isAdmin?: boolean;
    currentTab?: 'hymn' | 'praise';
    onTabChange?: (tab: 'hymn' | 'praise') => void;
}

export const HymnGallery: React.FC<HymnGalleryProps> = ({ isAdmin = false, currentTab, onTabChange }) => {
    const [hymns, setHymns] = useState<Hymn[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedHymn, setSelectedHymn] = useState<Hymn | null>(null);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    const MAX_QUERY_LENGTH = 20;

    // Category/Tag filter
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
    const [showCategoryPicker, setShowCategoryPicker] = useState(false);

    const codes = useMemo(() => Array.from(new Set(hymns.map(h => h.code).filter((c): c is string => !!c))).sort(), [hymns]);
    const categories = useMemo(() => {
        const uniqueTags = new Set<string>();
        hymns.forEach(h => {
            if (h.category) {
                h.category.split(',').forEach(tag => {
                    const clean = tag.replace(/#/g, '').trim();
                    if (clean) uniqueTags.add(clean);
                });
            }
        });
        return Array.from(uniqueTags).sort();
    }, [hymns]);

    // Editing states
    const [isEditing, setIsEditing] = useState(false);
    const [editLyrics, setEditLyrics] = useState('');
    const [editTitle, setEditTitle] = useState('');
    const [editCode, setEditCode] = useState('');
    const [editCategory, setEditCategory] = useState('');
    const [editYoutubeLinks, setEditYoutubeLinks] = useState<{ url: string; title: string }[]>([]);
    const [editImages, setEditImages] = useState<string[]>([]);
    const [newYoutubeUrl, setNewYoutubeUrl] = useState('');
    const [newYoutubeTitle, setNewYoutubeTitle] = useState('');
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);

    // Start editing mode
    const startEditing = () => {
        if (selectedHymn) {
            setEditLyrics(selectedHymn.lyrics || '');
            setEditTitle(selectedHymn.title || '');
            setEditCode(selectedHymn.code || '');
            setEditCategory(selectedHymn.category || '');
            setEditYoutubeLinks(selectedHymn.youtubeLinks || []);
            setEditImages(selectedHymn.imageUrls && selectedHymn.imageUrls.length > 0 ? selectedHymn.imageUrls : (selectedHymn.imageUrl ? [selectedHymn.imageUrl] : []));
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
            const hymnRef = doc(db, 'gallery', selectedHymn.id);
            await updateDoc(hymnRef, {
                title: editTitle,
                lyrics: editLyrics,
                code: editCode,
                category: editCategory,
                youtubeLinks: editYoutubeLinks,
                imageUrls: editImages,
                imageUrl: editImages[0] || ''
            });

            // Update local state
            setSelectedHymn({
                ...selectedHymn,
                title: editTitle,
                lyrics: editLyrics,
                code: editCode,
                category: editCategory,
                youtubeLinks: editYoutubeLinks,
                imageUrls: editImages,
                imageUrl: editImages[0] || ''
            });
            setIsEditing(false);
        } catch (error: any) {
            console.error('Error saving hymn:', error);
            alert(`저장 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`);
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
        setNewYoutubeUrl('');
        setNewYoutubeTitle('');
        setEditImages([]);
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0 || !selectedHymn) return;
        setUploading(true);
        try {
            const file = e.target.files[0];
            const storageRef = ref(storage, `hymns/${selectedHymn.number}/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            setEditImages(prev => [...prev, url]);
        } catch (error: any) {
            console.error('Upload failed:', error);
            alert(`이미지 업로드 실패: ${error.message || '알 수 없는 오류'}`);
        } finally {
            setUploading(false);
        }
    };

    const removeImage = (index: number) => {
        if (!confirm('이미지 목록에서 제외하시겠습니까? (저장 시 반영됩니다)')) return;
        setEditImages(prev => prev.filter((_, i) => i !== index));
    };

    useEffect(() => {
        // Fetch hymns from 'gallery' collection where type == 'hymn'
        // This relies on 'gallery' being public readable.
        // We do NOT use orderBy here to avoid index requirements for safe initial loading
        const q = query(collection(db, 'gallery'), where('type', '==', 'hymn'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Hymn));

            // Client-side sort
            items.sort((a, b) => (a.number || 0) - (b.number || 0));

            // Enrich with hymn data (code, category)
            const enrichedItems = items.map(item => {
                const hymnInfo = getHymnByNumber(item.number);
                return {
                    ...item,
                    code: hymnInfo?.code || '',
                    category: hymnInfo?.category || ''
                };
            });

            setHymns(enrichedItems);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching hymns:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                return;
            }
            if (isEditing || selectedHymn) return;

            if (/^\d$/.test(event.key)) {
                event.preventDefault();
                setSearchQuery(prev => (prev.length >= MAX_QUERY_LENGTH ? event.key : prev + event.key));
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
    }, [isEditing, selectedHymn]);

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

    const getImagesForHymn = (hymn: Hymn): string[] => {
        if (hymn.imageUrls && Array.isArray(hymn.imageUrls) && hymn.imageUrls.length > 0) {
            return hymn.imageUrls.filter(Boolean);
        }
        return hymn.imageUrl ? [hymn.imageUrl] : [];
    };


    // Enhanced filtering: number, title, code, category + tag filter
    const filteredHymns = useMemo(() => {
        let results = hymns;

        // Apply category/tag filter first (multi-select: match ANY selected tag)
        if (selectedCategories.length > 0) {
            results = results.filter(h => {
                if (!h.category) return false;
                const tags = h.category.split(',').map(t => t.replace(/#/g, '').trim());
                return selectedCategories.some(cat => tags.includes(cat));
            });
        }
        if (selectedCodes.length > 0) {
            results = results.filter(h => h.code && selectedCodes.includes(h.code));
        }

        // Then apply search query
        if (searchQuery) {
            const q = searchQuery.toLowerCase().trim();
            const numQuery = parseInt(q);
            const isNumeric = !isNaN(numQuery) && q === numQuery.toString();

            results = results.filter(h => {
                // Number prefix match (progressive)
                if (isNumeric && h.number.toString().startsWith(q)) return true;
                // Title match
                if (h.title.toLowerCase().includes(q)) return true;
                // Lyrics match
                if (h.lyrics?.toLowerCase().includes(q)) return true;
                // Code match
                if (h.code?.toLowerCase() === q) return true;
                return false;
            });
        }

        return results;
        return results;
    }, [hymns, searchQuery, selectedCategories, selectedCodes]);

    const selectedImages = selectedHymn ? getImagesForHymn(selectedHymn) : [];
    const primaryImage = selectedImages[0] || '';

    return (
        <div className="w-full h-full overflow-hidden print:overflow-visible flex flex-col pt-40 md:pt-60 px-4 md:px-10 pb-10 print:p-0 print:h-auto relative">
            {/* Filters & Toggle (Right Top) */}
            <div className="flex flex-col gap-4 mb-2 md:absolute md:top-0 md:right-10 md:w-auto md:mb-0 z-20 pointer-events-auto items-end">
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
                                onClick={() => setSelectedCategories([])}
                                className={`px-2.5 py-1 text-[10px] rounded-full transition-all border ${selectedCategories.length === 0 ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/50' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}
                            >
                                All
                            </button>
                            {categories.slice(0, showCategoryPicker ? categories.length : 15).map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])}
                                    className={`px-2.5 py-1 text-[10px] rounded-full transition-all border ${selectedCategories.includes(cat) ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/50' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}
                                >
                                    #{cat}
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

            {/* Search Bar & Tabs (Left Above Toggle) */}
            <div className="relative mb-6 md:mb-0 md:absolute md:top-32 md:left-10 z-20 pointer-events-auto w-full md:w-auto flex flex-col md:flex-row items-start md:items-center gap-4">
                <div className="relative group w-full md:w-[300px]">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                        <Search className="text-emerald-400 opacity-50" size={20} />
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="번호, 제목, 가사 검색..."
                        className="bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 rounded-2xl pl-12 pr-10 py-3 w-full text-xl md:text-2xl font-bold text-white placeholder-white/20 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition-all backdrop-blur-sm"
                        maxLength={20}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => { setSearchQuery(''); setSelectedCategories([]); }}
                            className="absolute inset-y-0 right-3 flex items-center text-white/30 hover:text-red-400 transition-colors"
                        >
                            <X size={20} />
                        </button>
                    )}
                </div>

                {/* Tab Buttons */}
                {onTabChange && (
                    <div className="flex gap-1 p-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 shadow-lg">
                        <button
                            onClick={() => onTabChange('hymn')}
                            className={`px-3 py-1.5 text-[9px] md:text-[10px] tracking-[0.15em] uppercase rounded-full transition-all ${currentTab === 'hymn'
                                ? 'bg-gradient-to-r from-green-500/30 to-teal-500/30 text-white'
                                : 'text-white/50 hover:text-white/80'
                                }`}
                        >
                            🎵 찬송가
                        </button>
                        <button
                            onClick={() => onTabChange('praise')}
                            className={`px-3 py-1.5 text-[9px] md:text-[10px] tracking-[0.15em] uppercase rounded-full transition-all ${currentTab === 'praise'
                                ? 'bg-gradient-to-r from-emerald-500/30 to-green-500/30 text-white'
                                : 'text-white/50 hover:text-white/80'
                                }`}
                        >
                            🎶 찬양곡
                        </button>
                    </div>
                )}
            </div>

            {/* Matching Results Info */}
            {
                (searchQuery || selectedCategories.length > 0) && (
                    <div className="mb-4 flex items-center gap-2 text-sm flex-wrap">
                        <span className="text-white/40">검색 결과:</span>
                        <span className="text-emerald-400 font-bold">{filteredHymns.length}개</span>
                        {selectedCategories.map(cat => (
                            <span key={cat} className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded text-xs">
                                #{cat}
                            </span>
                        ))}
                        {searchQuery && (
                            <span className="text-white/50 text-xs ml-2">
                                {/^\d+$/.test(searchQuery) ? (
                                    <span>(번호 검색: {searchQuery}...)</span>
                                ) : (
                                    <span>("{searchQuery}" 검색)</span>
                                )}
                            </span>
                        )}
                    </div>
                )
            }

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar -mr-4 pr-4">
                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    </div>
                ) : filteredHymns.length === 0 ? (
                    <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl">
                        <p className="text-white/30">
                            {hymns.length === 0 ? '아직 등록된 찬송가가 없습니다.' : '검색 결과가 없습니다.'}
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
                                        layoutId={`hymn-${hymn.id}`}
                                        onClick={() => setSelectedHymn(hymn)}
                                        className="group cursor-pointer bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:border-white/30 transition-all hover:-translate-y-1"
                                    >
                                        <div className="aspect-[3/4] bg-black/40 relative">
                                            {hymn.imageUrl ? (
                                                <img
                                                    src={hymn.imageUrl}
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
                                                {hymn.number}장
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
                        className="fixed inset-0 z-[3000] bg-black flex items-center justify-center"
                        onClick={() => { setSelectedHymn(null); cancelEditing(); }}
                    >
                        <motion.div
                            layoutId={`hymn-${selectedHymn.id}`}
                            className="w-full h-full bg-black overflow-hidden flex flex-col md:flex-row relative"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Close Button */}
                            <button
                                onClick={() => { setSelectedHymn(null); cancelEditing(); }}
                                className="absolute top-3 right-3 md:top-4 md:right-4 z-30 p-2 bg-black/70 rounded-full text-white/80 hover:text-white hover:bg-black transition-all border border-white/20"
                            >
                                <X size={22} />
                            </button>

                            {prevHymn && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); navigateToHymn(prevHymn); }}
                                    className="absolute left-1 md:left-4 top-1/2 -translate-y-1/2 z-30 p-2 md:p-4 bg-transparent md:bg-black/20 hover:bg-black/50 rounded-full text-white/15 md:text-white/60 hover:text-white border border-transparent md:border-white/10 backdrop-blur-sm transition-all"
                                    aria-label="이전 찬송가"
                                >
                                    <ChevronLeft size={20} className="md:w-[22px] md:h-[22px]" />
                                </button>
                            )}
                            {nextHymn && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); navigateToHymn(nextHymn); }}
                                    className="absolute right-1 md:right-4 top-1/2 -translate-y-1/2 z-30 p-2 md:p-4 bg-transparent md:bg-black/20 hover:bg-black/50 rounded-full text-white/15 md:text-white/60 hover:text-white border border-transparent md:border-white/10 backdrop-blur-sm transition-all"
                                    aria-label="다음 찬송가"
                                >
                                    <ChevronRight size={20} className="md:w-[22px] md:h-[22px]" />
                                </button>
                            )}

                            {/* Admin Edit Button */}
                            {isAdmin && !isEditing && (
                                <button
                                    onClick={startEditing}
                                    className="absolute top-3 right-14 md:top-4 md:right-16 z-30 p-2 bg-indigo-500/30 rounded-full text-indigo-300 hover:bg-indigo-500/50 transition-all border border-indigo-500/40"
                                >
                                    <Edit3 size={18} />
                                </button>
                            )}

                            {/* Image Section - Fit to screen on desktop */}
                            <div className="w-full h-full md:flex-[1.2] bg-black flex flex-col items-center justify-start pt-16 md:pt-0 md:justify-center pb-48 md:pb-0 overflow-auto relative">
                                {selectedImages.length > 0 ? (
                                    selectedImages.length === 1 ? (
                                        /* Single image - fit to viewport */
                                        <div className="w-full h-full flex items-center justify-center p-4">
                                            <img
                                                src={selectedImages[0]}
                                                alt={selectedHymn.title}
                                                className="max-w-full max-h-full object-contain"
                                            />
                                        </div>
                                    ) : (
                                        /* Multiple images - scrollable */
                                        <div className="w-full h-full flex flex-col items-center gap-4 py-4 overflow-y-auto">
                                            {selectedImages.map((url, index) => (
                                                <img
                                                    key={`${url}-${index}`}
                                                    src={url}
                                                    alt={selectedHymn.title}
                                                    className="w-full h-auto md:w-auto md:max-w-full object-contain"
                                                />
                                            ))}
                                        </div>
                                    )
                                ) : (
                                    <div className="text-white/20 flex flex-col items-center gap-4 py-10">
                                        <Music size={64} />
                                        <p>악보 이미지가 없습니다</p>
                                    </div>
                                )}

                                {/* Mobile: Hymn info overlay at top */}
                                <div className="absolute top-0 left-0 right-0 md:hidden bg-gradient-to-b from-black/80 via-black/50 to-transparent p-3 pt-3 pb-8">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="px-2 py-0.5 bg-indigo-500/40 text-indigo-200 rounded text-xs font-bold">
                                            {selectedHymn.number}장
                                        </span>
                                        {selectedHymn.code && (
                                            <span className="px-2 py-0.5 bg-emerald-500/40 text-emerald-200 rounded text-xs">
                                                {selectedHymn.code}
                                            </span>
                                        )}
                                    </div>
                                    <h2 className="text-base font-bold text-white truncate pr-20">{selectedHymn.title}</h2>
                                </div>

                                {/* Mobile: View original button */}
                                {primaryImage && (
                                    <a
                                        href={primaryImage}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="absolute bottom-4 right-4 md:bottom-6 md:right-6 bg-white/90 text-black px-3 py-1.5 rounded-full font-bold shadow-lg flex items-center gap-1.5 text-sm md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <Download size={14} /> 원본
                                    </a>
                                )}
                            </div>

                            {/* Mobile: Bottom Info Panel (Lyrics & YouTube) - Always visible */}
                            <div className="md:hidden absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/95 to-transparent max-h-[40%] overflow-y-auto">
                                <div className="p-4 pt-8 space-y-4">
                                    {/* YouTube Links - Mobile */}
                                    {selectedHymn.youtubeLinks && selectedHymn.youtubeLinks.length > 0 && (
                                        <div>
                                            <h3 className="text-xs uppercase tracking-wider text-white/40 mb-2 font-bold flex items-center gap-2">
                                                <Youtube size={12} className="text-red-400" /> 영상
                                            </h3>
                                            <div className="flex gap-2 overflow-x-auto pb-2">
                                                {selectedHymn.youtubeLinks.map((link, index) => (
                                                    <a
                                                        key={index}
                                                        href={link.url.replace('/embed/', '/watch?v=')}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex-shrink-0 flex items-center gap-2 bg-red-500/20 border border-red-500/30 rounded-full px-3 py-1.5 text-red-300 text-xs"
                                                        onClick={e => e.stopPropagation()}
                                                    >
                                                        <Youtube size={14} />
                                                        <span className="truncate max-w-[120px]">{link.title}</span>
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Lyrics - Mobile */}
                                    {selectedHymn.lyrics && (
                                        <div>
                                            <h3 className="text-xs uppercase tracking-wider text-white/40 mb-2 font-bold">가사</h3>
                                            <p className="text-white/70 whitespace-pre-wrap leading-relaxed text-xs">
                                                {selectedHymn.lyrics}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right: Info Panel - Desktop only */}
                            <div className="hidden md:flex w-[400px] bg-[#1a1a1a] p-6 border-l border-white/10 flex-col overflow-y-auto">
                                {/* Header */}
                                <div className="mb-6">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded text-xs font-bold border border-indigo-500/20">
                                            {selectedHymn.number}장
                                        </span>
                                        {selectedHymn.code && (
                                            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded text-xs border border-emerald-500/20">
                                                {selectedHymn.code}
                                            </span>
                                        )}
                                        {selectedHymn.category && selectedHymn.category.split(',').map(tag => (
                                            <span key={tag} className="px-3 py-1 bg-white/10 text-white/60 rounded text-xs border border-white/10">
                                                #{tag.replace(/#/g, '').trim()}
                                            </span>
                                        ))}
                                    </div>
                                    <h2 className="text-2xl font-bold text-white leading-tight">{selectedHymn.title}</h2>
                                </div>

                                {/* Editing Mode */}
                                {isEditing ? (
                                    <div className="flex-1 flex flex-col gap-6 overflow-y-auto">
                                        {/* Image Editor */}
                                        <div>
                                            <h3 className="text-xs uppercase tracking-wider text-white/40 mb-3 font-bold flex items-center gap-2">
                                                <ImageIcon size={14} /> 악보 이미지
                                            </h3>
                                            <div className="grid grid-cols-3 gap-2 mb-3">
                                                {editImages.map((url, index) => (
                                                    <div key={index} className="aspect-[3/4] relative group rounded-lg overflow-hidden border border-white/10">
                                                        <img src={url} alt="" className="w-full h-full object-cover" />
                                                        <button
                                                            onClick={() => removeImage(index)}
                                                            className="absolute top-1 right-1 p-1 bg-red-500/80 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[10px] text-white/80 p-1 text-center truncate">
                                                            {index + 1}
                                                        </div>
                                                    </div>
                                                ))}
                                                <label className="aspect-[3/4] flex flex-col items-center justify-center border border-dashed border-white/20 rounded-lg hover:bg-white/5 cursor-pointer transition-colors relative">
                                                    {uploading ? (
                                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    ) : (
                                                        <>
                                                            <Plus size={20} className="text-white/40 mb-1" />
                                                            <span className="text-[10px] text-white/40">추가</span>
                                                        </>
                                                    )}
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={handleImageUpload}
                                                        disabled={uploading}
                                                        className="hidden"
                                                    />
                                                </label>
                                            </div>
                                            <p className="text-[10px] text-white/30">* 첫 번째 이미지가 대표 이미지가 됩니다.</p>
                                        </div>

                                        {/* Info Editor */}
                                        {/* Title Editor */}
                                        <div className="mb-4">
                                            <h3 className="text-xs uppercase tracking-wider text-white/40 mb-3 font-bold flex items-center gap-2">
                                                <Edit3 size={14} /> 제목
                                            </h3>
                                            <input
                                                type="text"
                                                value={editTitle}
                                                onChange={(e) => setEditTitle(e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-lg font-bold focus:outline-none focus:border-indigo-500/50 transition-all placeholder-white/20"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <h3 className="text-xs uppercase tracking-wider text-white/40 mb-3 font-bold flex items-center gap-2">
                                                    <Music size={14} /> Key (코드)
                                                </h3>
                                                <input
                                                    type="text"
                                                    value={editCode}
                                                    onChange={(e) => setEditCode(e.target.value)}
                                                    placeholder="예: G"
                                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500/50 transition-all font-mono"
                                                />
                                            </div>
                                            <div>
                                                <h3 className="text-xs uppercase tracking-wider text-white/40 mb-3 font-bold flex items-center gap-2">
                                                    <Hash size={14} /> 주제 (분류)
                                                </h3>
                                                <input
                                                    type="text"
                                                    value={editCategory}
                                                    onChange={(e) => setEditCategory(e.target.value)}
                                                    placeholder="예: 경배와찬양"
                                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500/50 transition-all"
                                                />
                                            </div>
                                        </div>

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
        </div >
    );
};
