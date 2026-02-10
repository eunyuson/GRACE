import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Music, Grid, List, Edit3, Save, Youtube, Plus, Trash2, ExternalLink, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Hash, Search, LayoutGrid } from 'lucide-react';
import { collection, query, onSnapshot, where, doc, updateDoc, deleteDoc, writeBatch, addDoc, serverTimestamp } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { db, storage } from '../firebase';

// Add named versions support
export interface HymnVersion {
    id: string; // unique ID for version
    name: string; // e.g. "G Key", "Drum Score"
    imageUrls: string[];
}

interface Hymn {
    id: string;
    number: number;
    title: string;
    imageUrl: string;
    imageUrls?: string[];
    versions?: HymnVersion[];
    pptUrl?: string;
    lyrics?: string;
    youtubeLinks?: { url: string; title: string }[];
    code?: string;
    category?: string;
    viewCount?: number;
    usageCount?: number;
}

interface PraiseGalleryProps {
    isAdmin?: boolean;
    currentTab?: 'hymn' | 'praise';
    onTabChange?: (tab: 'hymn' | 'praise') => void;
}

export const PraiseGallery: React.FC<PraiseGalleryProps> = ({ isAdmin = false, currentTab, onTabChange }) => {
    const [hymns, setHymns] = useState<Hymn[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedHymn, setSelectedHymn] = useState<Hymn | null>(null);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    const MAX_QUERY_LENGTH = 3;
    const [isMerging, setIsMerging] = useState(false);

    // Category/Tag filter
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
    const [showBottomSheet, setShowBottomSheet] = useState(false);

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
    const [editImageUrls, setEditImageUrls] = useState<string[]>([]);
    // Version editing state
    const [editVersions, setEditVersions] = useState<HymnVersion[]>([]);
    const [currentVersionId, setCurrentVersionId] = useState<string>('default'); // 'default' or version ID
    const [newVersionName, setNewVersionName] = useState('');

    // View mode version selection
    const [viewVersionId, setViewVersionId] = useState<string>('default');

    const [newImageUrl, setNewImageUrl] = useState('');
    const [newYoutubeUrl, setNewYoutubeUrl] = useState('');
    const [newYoutubeTitle, setNewYoutubeTitle] = useState('');
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const [editNumber, setEditNumber] = useState<number | ''>('');
    const [saving, setSaving] = useState(false);
    const [isAddingNew, setIsAddingNew] = useState(false);

    // Start editing mode
    const startEditing = () => {
        try {
            if (selectedHymn) {
                // Safely handle potential missing properties
                setEditNumber(selectedHymn.number ?? '');
                setEditLyrics(selectedHymn.lyrics || '');
                setEditTitle(selectedHymn.title || '');
                setEditCode(selectedHymn.code || '');
                setEditCategory(selectedHymn.category || '');
                setEditYoutubeLinks(Array.isArray(selectedHymn.youtubeLinks) ? selectedHymn.youtubeLinks : []);

                // Initialize versions
                setEditVersions(selectedHymn.versions || []);
                setCurrentVersionId('default'); // Always start with default
                setEditImageUrls(getImagesForHymn(selectedHymn)); // Load default images first

                setNewImageUrl('');
                setNewYoutubeUrl('');
                setNewYoutubeTitle('');

                setIsEditing(true);
                setIsAddingNew(false);
            }
        } catch (error: any) {
            console.error('Failed to start editing:', error);
            alert(`편집 모드 진입 중 오류가 발생했습니다: ${error.message}`);
        }
    };

    const handleAddSong = () => {
        const nextNumber = hymns.length > 0 ? Math.max(...hymns.map(h => h.number)) + 1 : 1;
        setEditNumber(nextNumber);
        setEditLyrics('');
        setEditTitle('');
        setEditCode('');
        setEditCategory('');
        setEditYoutubeLinks([]);
        setEditImageUrls([]);
        setEditVersions([]);
        setCurrentVersionId('default');
        setNewImageUrl('');
        setNewYoutubeUrl('');
        setNewYoutubeTitle('');
        setIsAddingNew(true);
        setIsEditing(true);
        setSelectedHymn({
            id: 'temp',
            number: nextNumber,
            title: '',
            imageUrl: '',
            imageUrls: []
        });
    };

    // Version Management
    // Temporary storage for default images while editing other versions
    const [defaultImageUrls, setDefaultImageUrls] = useState<string[]>([]);

    // Sync default images when selectedHymn changes
    useEffect(() => {
        if (selectedHymn) {
            setDefaultImageUrls(getImagesForHymn(selectedHymn));
        } else {
            setDefaultImageUrls([]);
        }
    }, [selectedHymn]);

    const changeVersion = (targetId: string) => {
        // 1. Save current work
        if (currentVersionId === 'default') {
            setDefaultImageUrls([...editImageUrls]);
        } else {
            setEditVersions(prev => prev.map(v =>
                v.id === currentVersionId ? { ...v, imageUrls: [...editImageUrls] } : v
            ));
        }

        // 2. Load target work
        if (targetId === 'default') {
            // Need to carefully handle switching back to default
            // If we just saved to defaultImageUrls above (because we were on default), we use editImageUrls?
            // No, if we call changeVersion('default'), implies targetId != currentVersionId unless redundant call.

            if (currentVersionId === 'default') {
                // No change needed
            } else {
                // Switching FROM a version TO default
                // The `defaultImageUrls` state holds the latest default images
                setEditImageUrls(defaultImageUrls);
            }
        } else {
            const target = editVersions.find(v => v.id === targetId);
            setEditImageUrls(target ? target.imageUrls : []);
        }

        setCurrentVersionId(targetId);
    };

    const handleVersionChange = (versionId: string) => {
        changeVersion(versionId);
    };

    const addVersion = () => {
        const name = newVersionName.trim();
        if (!name) return;

        const newVer: HymnVersion = {
            id: Date.now().toString(),
            name,
            imageUrls: []
        };
        setEditVersions(prev => [...prev, newVer]);
        setNewVersionName('');

        // Optionally switch to it immediately
        // changeVersion(newVer.id); 
        // But we need to save current first.

        // Let's just add it for now.
    };

    const removeVersion = (id: string) => {
        setEditVersions(prev => prev.filter(v => v.id !== id));
        if (currentVersionId === id) {
            changeVersion('default');
        }
    };
    // Save changes
    const saveChanges = async () => {
        if (!selectedHymn && !isAddingNew) return;
        setSaving(true);

        try {
            const batch = writeBatch(db);

            // Ensure current view's images are saved to state before processing
            let finalDefaultImages = defaultImageUrls;
            let finalVersions = editVersions;

            if (currentVersionId === 'default') {
                finalDefaultImages = editImageUrls.map(u => u.trim()).filter(Boolean);
            } else {
                finalVersions = editVersions.map(v =>
                    v.id === currentVersionId ? { ...v, imageUrls: editImageUrls } : v
                );
            }

            const primaryImageUrl = finalDefaultImages[0] || '';
            const timestamp = serverTimestamp();

            // Prepare data for the item being saved
            const currentItemData = {
                title: editTitle,
                lyrics: editLyrics,
                code: editCode,
                category: editCategory,
                youtubeLinks: editYoutubeLinks,
                imageUrls: finalDefaultImages,
                imageUrl: primaryImageUrl,
                versions: finalVersions,
                type: 'praise',
                updatedAt: timestamp
            };

            let targetId = '';

            if (isAddingNew) {
                // Generate ID for new item
                const newRef = doc(collection(db, 'gallery'));
                targetId = newRef.id;
            } else {
                targetId = selectedHymn?.id || '';
            }

            if (!targetId) throw new Error('Target ID not found');

            // Construct full list for sorting
            // We use 'hymns' which contains existing praise songs
            let listForSorting: any[] = [];

            if (isAddingNew) {
                listForSorting = [
                    ...hymns,
                    {
                        id: targetId,
                        ...currentItemData,
                        number: 0, // placeholder
                        createdAt: timestamp
                    }
                ];
            } else {
                listForSorting = hymns.map(h =>
                    h.id === targetId
                        ? { ...h, ...currentItemData }
                        : h
                );
            }

            // Sort by title (Korean)
            listForSorting.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ko-KR'));

            // Assign numbers sequentially and queue batch updates
            listForSorting.forEach((item, index) => {
                const newNumber = index + 1;
                item.number = newNumber; // Update local object for state
                const ref = doc(db, 'gallery', item.id);

                if (item.id === targetId) {
                    if (isAddingNew) {
                        // Create new document
                        batch.set(ref, {
                            ...currentItemData,
                            number: newNumber,
                            createdAt: timestamp,
                            viewCount: 0,
                            usageCount: 0
                        });
                    } else {
                        // Update existing document
                        batch.update(ref, {
                            ...currentItemData,
                            number: newNumber
                        });
                    }
                } else {
                    // Update other documents only if number changed
                    if (item.number !== newNumber) {
                        batch.update(ref, { number: newNumber });
                    }
                }
            });

            await batch.commit();

            alert(isAddingNew ? '새 곡이 추가되었습니다.' : '저장되었습니다.');
            setIsEditing(false);

            if (isAddingNew) {
                setSelectedHymn(null);
                setIsAddingNew(false);
            } else {
                // Update local selected hymn state to reflect changes immediately
                const updatedHymn = listForSorting.find(h => h.id === targetId);
                if (updatedHymn) {
                    setSelectedHymn(updatedHymn);
                }
            }

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
        // Supports: standard watch, short URL, embed URL, and Shorts
        const urlMatch = newYoutubeUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([^&\n?#]+)/);
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
        if (isAddingNew) {
            setSelectedHymn(null);
            setIsAddingNew(false);
        }

        setEditNumber('');
        setEditLyrics('');
        setEditYoutubeLinks([]);
        setEditImageUrls([]);
        setEditVersions([]);
        setCurrentVersionId('default');

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

    const handleDeleteSong = async () => {
        if (!selectedHymn || !isAdmin) return;

        if (!confirm(`'${selectedHymn.title}' 곡을 정말 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
            return;
        }

        try {
            const deletedNumber = selectedHymn.number;
            const batch = writeBatch(db);

            // 1. 선택된 곡 삭제
            batch.delete(doc(db, 'gallery', selectedHymn.id));

            // 2. 삭제된 번호보다 큰 번호를 가진 모든 곡들의 번호를 1씩 감소
            const songsToUpdate = hymns.filter(h => h.number > deletedNumber);
            songsToUpdate.forEach(song => {
                const songRef = doc(db, 'gallery', song.id);
                batch.update(songRef, { number: song.number - 1 });
            });

            await batch.commit();

            alert('삭제되었습니다.');
            setSelectedHymn(null);
            setIsEditing(false);
        } catch (error: any) {
            console.error('Error deleting song:', error);
            alert(`삭제 중 오류가 발생했습니다: ${error.message}`);
        }
    };

    const handleMoveHymn = async (hymn: Hymn, direction: 'up' | 'down') => {
        if (!isAdmin) return;
        const targetNumber = direction === 'up' ? hymn.number - 1 : hymn.number + 1;
        if (targetNumber < 1) return;

        const targetHymn = hymns.find(h => h.number === targetNumber);

        try {
            const batch = writeBatch(db);
            const currentRef = doc(db, 'gallery', hymn.id);

            if (targetHymn) {
                const targetRef = doc(db, 'gallery', targetHymn.id);
                batch.update(currentRef, { number: targetNumber });
                batch.update(targetRef, { number: hymn.number });
            } else {
                batch.update(currentRef, { number: targetNumber });
            }
            await batch.commit();
        } catch (error: any) {
            console.error('Failed to move hymn:', error);
            alert(`순서 변경 실패: ${error.message}`);
        }
    };

    const handleImageUpload = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        if (!selectedHymn) return;

        setUploading(true);
        setUploadError('');
        try {
            const uploadedUrls: string[] = [];
            for (const file of Array.from(files)) {
                const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                const path = `praise/${selectedHymn.number}/${Date.now()}-${safeName}`;
                const fileRef = storageRef(storage, path);
                await uploadBytes(fileRef, file);
                const url = await getDownloadURL(fileRef);
                uploadedUrls.push(url);
            }
            if (uploadedUrls.length > 0) {
                setEditImageUrls(prev => [...prev, ...uploadedUrls]);
            }
        } catch (error: any) {
            console.error('Image upload failed:', error);
            setUploadError(`업로드에 실패했습니다: ${error.message || '알 수 없는 오류'}`);
        } finally {
            setUploading(false);
        }
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
            alert('합치기가 완료되었습니다.');
        } catch (error: any) {
            console.error('Merge failed:', error);
            alert(`합치기 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`);
        } finally {
            setIsMerging(false);
        }
    };

    // Sorting
    const [sortBy, setSortBy] = useState<'number' | 'alpha' | 'views' | 'usage'>('number');

    const handleHymnClick = async (hymn: Hymn) => {
        setSelectedHymn(hymn);

        // Increment view count
        try {
            const hymnRef = doc(db, 'gallery', hymn.id);
            await updateDoc(hymnRef, {
                viewCount: (hymn.viewCount || 0) + 1
            });
        } catch (err) {
            console.error('Failed to increment view count:', err);
        }
    };

    const navigateToHymn = (target: Hymn | null) => {
        if (!target) return;
        if (isEditing) {
            const ok = window.confirm('편집 중입니다. 이동하면 저장되지 않은 내용이 사라질 수 있습니다. 이동할까요?');
            if (!ok) return;
        }
        cancelEditing();
        handleHymnClick(target);
    };

    // Filtering & Sorting
    const filteredHymns = useMemo(() => {
        let results = [...hymns]; // Clone for sorting

        // Filter
        if (selectedCategories.length > 0) {
            results = results.filter(h => {
                if (!h.category) return false;
                const tags = h.category.split(',').map(t => t.replace(/#/g, '').trim());
                return selectedCategories.some(cat => tags.includes(cat));
            });
        }
        if (selectedCodes.length > 0) results = results.filter(h => h.code && selectedCodes.includes(h.code));

        if (searchQuery) {
            const q = searchQuery.toLowerCase().trim();
            const isNumeric = /^\d+$/.test(q);
            results = results.filter(h => {
                if (isNumeric && h.number.toString().startsWith(q)) return true;
                return h.title.toLowerCase().includes(q);
            });
        }

        // Sort
        return results.sort((a, b) => {
            switch (sortBy) {
                case 'alpha':
                    return (a.title || '').localeCompare((b.title || ''), 'ko-KR');
                case 'views':
                    return (b.viewCount || 0) - (a.viewCount || 0);
                case 'usage':
                    return (b.usageCount || 0) - (a.usageCount || 0);
                case 'number':
                default:
                    return (a.number || 0) - (b.number || 0);
            }
        });
    }, [hymns, searchQuery, selectedCategories, selectedCodes, sortBy]);

    // Navigation (Prev/Next) based on filtered list
    const currentIndex = selectedHymn
        ? filteredHymns.findIndex(h => h.id === selectedHymn.id)
        : -1;
    const prevHymn = currentIndex > 0 ? filteredHymns[currentIndex - 1] : null;
    const nextHymn = currentIndex >= 0 && currentIndex < filteredHymns.length - 1
        ? filteredHymns[currentIndex + 1]
        : null;

    const selectedImages = selectedHymn ? getImagesForHymn(selectedHymn) : [];
    const primaryImage = selectedImages[0] || '';

    // Get images based on selected view version
    const getViewImages = () => {
        if (!selectedHymn) return [];
        if (viewVersionId === 'default') {
            return getImagesForHymn(selectedHymn);
        }
        const version = selectedHymn.versions?.find(v => v.id === viewVersionId);
        return version?.imageUrls || [];
    };
    const viewImages = getViewImages();

    // Reset viewVersionId when selectedHymn changes
    useEffect(() => {
        setViewVersionId('default');
    }, [selectedHymn?.id]);

    return (
        <div className="w-full h-full overflow-hidden flex flex-col pt-40 md:pt-60 px-4 md:px-10 pb-10 relative">
            {/* Filters & Toggle (Right Top) */}
            <div className="flex flex-col gap-4 mb-2 md:absolute md:top-0 md:right-10 md:w-auto md:mb-0 z-20 pointer-events-auto items-end">
                <div className="flex items-center gap-4">
                    {/* Filters */}
                    {/* Filters - Horizontal Scroll */}
                    <div className="flex flex-col gap-2 items-end mr-4 max-w-[calc(100vw-40px)] md:max-w-none overflow-hidden">
                        {/* Code Filter (Horizontal Scroll) */}
                        <div className="flex w-full md:w-auto overflow-x-auto sensual-scrollbar gap-1.5 px-1 pb-2 mb-1 mask-gradient-right">
                            <button
                                onClick={() => setSelectedCodes([])}
                                className={`flex-shrink-0 px-2.5 py-1 text-[10px] rounded-full transition-all border whitespace-nowrap ${selectedCodes.length === 0 ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/50' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}
                            >
                                All Key
                            </button>
                            {codes.map(code => (
                                <button
                                    key={code}
                                    onClick={() => setSelectedCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])}
                                    className={`flex-shrink-0 px-2.5 py-1 text-[10px] rounded-full transition-all border whitespace-nowrap ${selectedCodes.includes(code) ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/50' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}
                                >
                                    {code}
                                </button>
                            ))}
                        </div>

                        {/* Category Filter - Horizontal Scroll with Sticky Button */}
                        <div className="relative flex w-full md:w-auto max-w-[800px] items-center">
                            <div className="flex w-full overflow-x-auto sensual-scrollbar gap-1.5 px-1 pr-12 mask-gradient-right pb-2 mb-1">
                                <button
                                    onClick={() => setSelectedCategories([])}
                                    className={`flex-shrink-0 px-2.5 py-1 text-[10px] rounded-full transition-all border whitespace-nowrap ${selectedCategories.length === 0 ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/50' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}
                                >
                                    All Tags
                                </button>
                                {categories.map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])}
                                        className={`flex-shrink-0 px-2.5 py-1 text-[10px] rounded-full transition-all border whitespace-nowrap ${selectedCategories.includes(cat) ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/50' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}
                                    >
                                        #{cat}
                                    </button>
                                ))}
                            </div>

                            {/* Sticky View All Button */}
                            <button
                                onClick={() => setShowBottomSheet(true)}
                                className="absolute right-0 top-0 bottom-1 w-10 flex items-center justify-center bg-gradient-to-l from-[#121212] via-[#121212] to-transparent z-10"
                                title="전체 보기"
                            >
                                <div className="w-6 h-6 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 hover:text-white transition-colors shadow-lg">
                                    <LayoutGrid size={12} />
                                </div>
                            </button>
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
            <div className="relative mb-2 md:mb-0 md:absolute md:top-36 md:left-10 z-20 pointer-events-auto w-full md:w-auto flex flex-row items-center gap-2 md:gap-4 overflow-x-auto no-scrollbar pr-4 md:pr-0">
                {/* Tab Buttons */}
                {onTabChange && (
                    <div className="flex gap-1 p-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 shadow-lg flex-shrink-0">
                        <button
                            onClick={() => onTabChange('hymn')}
                            className={`px-3 py-1.5 text-[10px] tracking-[0.05em] uppercase rounded-full transition-all whitespace-nowrap ${currentTab === 'hymn'
                                ? 'bg-gradient-to-r from-green-500/30 to-teal-500/30 text-white font-bold'
                                : 'text-white/50 hover:text-white/80'
                                }`}
                        >
                            찬송가
                        </button>
                        <button
                            onClick={() => onTabChange('praise')}
                            className={`px-3 py-1.5 text-[10px] tracking-[0.05em] uppercase rounded-full transition-all whitespace-nowrap ${currentTab === 'praise'
                                ? 'bg-gradient-to-r from-emerald-500/30 to-green-500/30 text-white font-bold'
                                : 'text-white/50 hover:text-white/80'
                                }`}
                        >
                            찬양곡
                        </button>
                    </div>
                )}

                <div className="relative group flex-1 md:flex-none w-full md:w-[300px] min-w-[200px]">
                    <div className="absolute inset-y-0 left-3 md:left-4 flex items-center pointer-events-none">
                        <Search className="text-emerald-400 opacity-50" size={18} />
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="번호, 제목, 주제 검색..."
                        className="bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 rounded-2xl pl-10 pr-10 py-2 md:py-3 w-full text-lg md:text-2xl font-bold text-white placeholder-white/20 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition-all backdrop-blur-sm"
                        maxLength={20}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => { setSearchQuery(''); setSelectedCategories([]); setSelectedCodes([]); }}
                            className="absolute inset-y-0 right-3 flex items-center text-white/30 hover:text-red-400 transition-colors"
                        >
                            <X size={18} />
                        </button>
                    )}
                </div>

                {isAdmin && (
                    <button
                        onClick={handleAddSong}
                        className="flex items-center gap-2 px-3 py-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl hover:bg-emerald-500/30 transition-all font-bold text-xs flex-shrink-0 whitespace-nowrap"
                    >
                        <Plus size={16} /> 새 곡
                    </button>
                )}
            </div>



            {/* Matching Results Info */}
            {
                (searchQuery || selectedCategories.length > 0 || selectedCodes.length > 0) && (
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
                                        onClick={() => handleHymnClick(hymn)}
                                        className="group cursor-pointer bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:border-white/30 transition-all hover:-translate-y-1"
                                    >
                                        <div className="relative aspect-[3/4] overflow-hidden bg-gradient-to-br from-gray-900 to-black">
                                            {/* Placeholder (Always rendered behind) */}
                                            <div className="absolute inset-0 flex items-center justify-center text-white/10 z-0">
                                                <Music size={48} />
                                            </div>

                                            {/* Image (Rendered on top) */}
                                            {((hymn.imageUrl || (hymn.imageUrls && hymn.imageUrls[0]))) && (
                                                <img
                                                    src={(hymn.imageUrl || (hymn.imageUrls && hymn.imageUrls[0]) || "")}
                                                    alt={hymn.title}
                                                    className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity z-10"
                                                    loading="lazy"
                                                    onError={(e) => {
                                                        e.currentTarget.style.display = 'none';
                                                    }}
                                                />
                                            )}

                                            {/* Overlay Content */}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity z-20" />

                                            {/* Top Left Number */}
                                            <div className="absolute top-2 left-2 z-30 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-xs font-bold text-white border border-white/10">
                                                {hymn.number}곡
                                            </div>

                                            {/* YouTube Play Button */}
                                            {hymn.youtubeLinks && hymn.youtubeLinks.length > 0 && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        // Open first YouTube link
                                                        const link = hymn.youtubeLinks![0];
                                                        window.open(link.url.replace('/embed/', '/watch?v='), '_blank');
                                                    }}
                                                    className="absolute top-2 right-2 z-30 p-2 bg-red-600/90 hover:bg-red-500 rounded-full text-white transition-all shadow-lg hover:scale-110"
                                                    title={hymn.youtubeLinks[0].title || '유튜브에서 듣기'}
                                                >
                                                    <Youtube size={16} />
                                                </button>
                                            )}
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
                                        onClick={() => handleHymnClick(hymn)}
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

                                        {/* YouTube Button in List View */}
                                        {hymn.youtubeLinks && hymn.youtubeLinks.length > 0 && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const link = hymn.youtubeLinks![0];
                                                    window.open(link.url.replace('/embed/', '/watch?v='), '_blank');
                                                }}
                                                className="p-2 bg-red-600/80 hover:bg-red-500 rounded-lg text-white transition-all"
                                                title={hymn.youtubeLinks[0].title || '유튜브에서 듣기'}
                                            >
                                                <Youtube size={16} />
                                            </button>
                                        )}

                                        {isAdmin && (
                                            <div className="flex flex-col gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => handleMoveHymn(hymn, 'up')}
                                                    className="p-1 text-white/40 hover:text-white hover:bg-white/10 rounded transition-colors"
                                                    title="위로 (순서 변경)"
                                                >
                                                    <ArrowUp size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleMoveHymn(hymn, 'down')}
                                                    className="p-1 text-white/40 hover:text-white hover:bg-white/10 rounded transition-colors"
                                                    title="아래로 (순서 변경)"
                                                >
                                                    <ArrowDown size={14} />
                                                </button>
                                            </div>
                                        )}
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </>
                )
                }
            </div >

            {/* Detail Modal */}
            <AnimatePresence>
                {
                    selectedHymn && (
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



                                {/* Admin Edit Button */}
                                {isAdmin && !isEditing && (
                                    <button
                                        onClick={startEditing}
                                        className="absolute top-2 right-12 md:top-4 md:right-16 z-50 p-2 bg-indigo-500/20 rounded-full text-indigo-300 hover:bg-indigo-500/40 transition-all border border-indigo-500/30 flex items-center gap-2"
                                    >
                                        <Edit3 size={18} />
                                    </button>
                                )}

                                {/* Mobile: Vertical layout with full-height image */}
                                {/* Desktop: Horizontal layout */}

                                {/* Image Section - fits to screen */}
                                <div className="flex-1 md:flex-[1.2] bg-black flex flex-col items-center justify-start p-2 md:p-4 overflow-y-auto relative group min-h-0">
                                    {/* Version Tabs - only show if versions exist */}
                                    {selectedHymn.versions && selectedHymn.versions.length > 0 && !isEditing && (
                                        <div className="w-full flex gap-2 mb-4 overflow-x-auto pb-2 flex-shrink-0 sticky top-0 z-10 bg-black/80 backdrop-blur-sm py-2">
                                            <button
                                                onClick={() => setViewVersionId('default')}
                                                className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${viewVersionId === 'default'
                                                    ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-500/50'
                                                    : 'bg-white/10 text-white/60 border border-white/10 hover:bg-white/20'
                                                    }`}
                                            >
                                                기본
                                            </button>
                                            {selectedHymn.versions.map(v => (
                                                <button
                                                    key={v.id}
                                                    onClick={() => setViewVersionId(v.id)}
                                                    className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${viewVersionId === v.id
                                                        ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
                                                        : 'bg-white/10 text-white/60 border border-white/10 hover:bg-white/20'
                                                        }`}
                                                >
                                                    {v.name}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {viewImages.length > 0 ? (
                                        <div className="w-full flex flex-col items-center gap-4">
                                            {viewImages.map((url, index) => (
                                                <div key={`${url}-${index}`} className="relative max-w-full flex items-center justify-center rounded-lg overflow-hidden">
                                                    {/* Placeholder */}
                                                    <div className="absolute inset-0 flex items-center justify-center text-white/10 z-0">
                                                        <Music size={64} />
                                                    </div>

                                                    <img
                                                        src={url}
                                                        alt={selectedHymn.title}
                                                        className="relative z-10 max-w-full object-contain"
                                                        loading="lazy"
                                                        onError={(e) => {
                                                            e.currentTarget.style.display = 'none';
                                                        }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-white/20 flex flex-col items-center gap-4 py-10">
                                            <Music size={64} />
                                            <p>악보 이미지가 없습니다</p>
                                        </div>
                                    )}

                                    {primaryImage && (
                                        <a
                                            href={primaryImage}
                                            download
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="absolute bottom-4 right-4 md:bottom-6 md:right-6 bg-white text-black px-3 py-1.5 md:px-4 md:py-2 rounded-full font-bold shadow-lg opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex items-center gap-2 text-sm"
                                        >
                                            <Download size={14} /> 원본
                                        </a>
                                    )}

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
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 mb-2">
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
                                            {/* Info Editor */}
                                            {/* Title Editor */}
                                            <div className="mb-4 grid grid-cols-4 gap-4">
                                                <div className="col-span-1">
                                                    <h3 className="text-xs uppercase tracking-wider text-white/40 mb-3 font-bold flex items-center gap-2">
                                                        <Hash size={14} /> 번호
                                                    </h3>
                                                    <input
                                                        type="number"
                                                        value={editNumber}
                                                        onChange={(e) => setEditNumber(e.target.value ? Number(e.target.value) : '')}
                                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-lg font-bold focus:outline-none focus:border-indigo-500/50 transition-all"
                                                    />
                                                </div>
                                                <div className="col-span-3">
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

                                            {/* Version Management */}
                                            <div>
                                                <h3 className="text-xs uppercase tracking-wider text-white/40 mb-3 font-bold flex items-center gap-2">
                                                    <List size={14} /> 버전 관리
                                                </h3>
                                                <div className="bg-white/5 border border-white/10 rounded-lg p-3 mb-4">
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <select
                                                            value={currentVersionId}
                                                            onChange={(e) => handleVersionChange(e.target.value)}
                                                            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white/90 text-sm focus:outline-none focus:border-indigo-500/50"
                                                        >
                                                            <option value="default">기본 (Default)</option>
                                                            {editVersions.map(v => (
                                                                <option key={v.id} value={v.id}>{v.name}</option>
                                                            ))}
                                                        </select>
                                                        {currentVersionId !== 'default' && (
                                                            <button
                                                                onClick={() => {
                                                                    if (confirm('이 버전을 삭제하시겠습니까?')) {
                                                                        removeVersion(currentVersionId);
                                                                    }
                                                                }}
                                                                className="p-2 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 transition-colors"
                                                                title="버전 삭제"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        )}
                                                    </div>

                                                    <div className="flex gap-2">
                                                        <input
                                                            type="text"
                                                            value={newVersionName}
                                                            onChange={(e) => setNewVersionName(e.target.value)}
                                                            placeholder="새 버전 이름 (예: G Key, 드럼악보)"
                                                            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white/90 text-sm focus:outline-none focus:border-indigo-500/50 placeholder-white/30"
                                                        />
                                                        <button
                                                            onClick={addVersion}
                                                            disabled={!newVersionName.trim()}
                                                            className="px-3 py-2 bg-indigo-500/20 text-indigo-300 rounded-lg hover:bg-indigo-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 text-sm font-bold"
                                                        >
                                                            <Plus size={14} /> 추가
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Image URLs Editor */}
                                            <div>
                                                <h3 className="text-xs uppercase tracking-wider text-white/40 mb-3 font-bold flex items-center gap-2">
                                                    <Music size={14} />
                                                    {currentVersionId === 'default' ? '기본 악보 이미지' : `'${editVersions.find(v => v.id === currentVersionId)?.name}' 악보 이미지`}
                                                </h3>

                                                {/* Option 1: File Upload (Firebase) */}
                                                <div className="flex flex-wrap items-center gap-2 mb-3">
                                                    <label className="px-3 py-2 bg-indigo-500/20 text-indigo-300 rounded-lg border border-indigo-500/30 hover:bg-indigo-500/30 cursor-pointer text-xs font-bold transition-all">
                                                        {uploading ? '업로드 중...' : '파일 직접 업로드'}
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            multiple
                                                            className="hidden"
                                                            onChange={(e) => handleImageUpload(e.target.files)}
                                                            disabled={uploading}
                                                        />
                                                    </label>
                                                    {uploadError && (
                                                        <span className="text-xs text-red-400">{uploadError}</span>
                                                    )}
                                                </div>



                                                <div className="space-y-2">
                                                    {editImageUrls.length === 0 && (
                                                        <div className="text-white/30 text-sm">등록된 이미지가 없습니다.</div>
                                                    )}
                                                    {editImageUrls.map((url, index) => (
                                                        <div key={`${url}-${index}`} className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg p-2">
                                                            <div className="w-8 h-8 rounded overflow-hidden bg-black/20 flex-shrink-0">
                                                                <img src={url} alt="" className="w-full h-full object-cover" />
                                                            </div>
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
                                                        onPaste={(e) => {
                                                            // Auto-convert on paste
                                                            const text = e.clipboardData.getData('text');
                                                            // Google Drive Regex
                                                            const driveRegex = /(?:drive\.google\.com\/(?:file\/d\/|open\?id=)|Docs\.google\.com\/file\/d\/)([-0-9a-zA-Z_]+)/;
                                                            const match = text.match(driveRegex);
                                                            if (match && match[1]) {
                                                                e.preventDefault();
                                                                // Use specific Google hosting domain that works for img tags
                                                                const directLink = `https://lh3.googleusercontent.com/d/${match[1]}`;
                                                                setNewImageUrl(directLink);
                                                            }
                                                        }}
                                                        placeholder="이미지 URL 또는 구글 드라이브 링크 붙여넣기..."
                                                        className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white/90 text-sm focus:outline-none focus:border-indigo-500/50 placeholder-white/30"
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            let next = newImageUrl.trim();
                                                            if (!next) return;

                                                            // Manual check in case paste didn't catch it or user typed it
                                                            const driveRegex = /(?:drive\.google\.com\/(?:file\/d\/|open\?id=)|Docs\.google\.com\/file\/d\/)([-0-9a-zA-Z_]+)/;
                                                            const match = next.match(driveRegex);
                                                            if (match && match[1]) {
                                                                next = `https://lh3.googleusercontent.com/d/${match[1]}`;
                                                            } else if (next.includes('drive.google.com') && !next.includes('lh3.googleusercontent.com')) {
                                                                // Fallback for other formats
                                                                // Try to find ID by length or pattern if regex failed
                                                                // But regex covers most sharing links.
                                                            }

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
                                                {!isAddingNew && (
                                                    <button
                                                        onClick={handleDeleteSong}
                                                        className="px-4 py-3 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500/30 transition-colors border border-red-500/30 flex items-center justify-center shrink-0"
                                                        title="이 곡 삭제"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                )}
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
                    )
                }
            </AnimatePresence >

            {/* Bottom Sheet for Filters */}
            <AnimatePresence>
                {showBottomSheet && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowBottomSheet(false)}
                            className="fixed inset-0 bg-black/60 z-[3100] backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="fixed left-0 right-0 bottom-0 bg-[#1a1a1a] rounded-t-3xl z-[3200] flex flex-col max-h-[85vh] shadow-2xl border-t border-white/10"
                        >
                            <div className="p-4 border-b border-white/10 flex items-center justify-between flex-shrink-0">
                                <h3 className="text-lg font-bold text-white">필터 설정</h3>
                                <button
                                    onClick={() => setShowBottomSheet(false)}
                                    className="p-2 bg-white/5 rounded-full text-white/70 hover:text-white transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                                {/* Key Filter */}
                                <div className="space-y-3">
                                    <h4 className="text-sm font-bold text-white/50 uppercase tracking-wider flex items-center gap-2">
                                        <Music size={14} /> Key (코드)
                                    </h4>
                                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                                        <button
                                            onClick={() => setSelectedCodes([])}
                                            className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${selectedCodes.length === 0
                                                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20'
                                                : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
                                                }`}
                                        >
                                            All Key
                                        </button>
                                        {codes.map(code => (
                                            <button
                                                key={code}
                                                onClick={() => setSelectedCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])}
                                                className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${selectedCodes.includes(code)
                                                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20'
                                                    : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
                                                    }`}
                                            >
                                                {code}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Category Filter */}
                                <div className="space-y-3">
                                    <h4 className="text-sm font-bold text-white/50 uppercase tracking-wider flex items-center gap-2">
                                        <Hash size={14} /> 주제 (태그)
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => setSelectedCategories([])}
                                            className={`px-4 py-2 rounded-full text-sm transition-all border ${selectedCategories.length === 0
                                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                                                : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10 hover:text-white'
                                                }`}
                                        >
                                            All Tags
                                        </button>
                                        {categories.map(cat => (
                                            <button
                                                key={cat}
                                                onClick={() => setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])}
                                                className={`px-4 py-2 rounded-full text-sm transition-all border ${selectedCategories.includes(cat)
                                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                                                    : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10 hover:text-white'
                                                    }`}
                                            >
                                                #{cat}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Footer / Apply Button */}
                            <div className="p-4 border-t border-white/10 bg-[#1a1a1a] pb-8 md:pb-4 flex-shrink-0">
                                <button
                                    onClick={() => setShowBottomSheet(false)}
                                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-colors shadow-lg shadow-emerald-900/20"
                                >
                                    {selectedCodes.length + selectedCategories.length > 0
                                        ? `${selectedCodes.length + selectedCategories.length}개 필터 적용하기`
                                        : '닫기'}
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>        </div >
    );
};
