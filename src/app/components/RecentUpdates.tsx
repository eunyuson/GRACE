import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, deleteDoc, doc, updateDoc, addDoc, orderBy, serverTimestamp, getDoc, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, storage } from '../firebase';
import { LinkToConceptModal } from './ui/LinkToConceptModal';
import { Search, Hash, LayoutGrid, List } from 'lucide-react';

interface Memo {
    id: string;
    text: string;
    userId: string;
    userName: string;
    userPhoto?: string;
    createdAt?: any;
    updatedAt?: any;
    imageUrl?: string;
}

interface UpdateItem {
    id: string;
    title: string;
    subtitle: string;
    desc: string;
    image?: string;
    content: { id?: string; text: string; date?: string; keyword?: string }[];
    question?: string; // Question Bridge: 이 뉴스가 던지는 질문 (최대 120자)
    createdAt?: any;
    sheetRowId?: string;
    externalLinks?: { title: string; url: string }[];
    additionalImages?: string[];
    relatedIds?: string[];
    imageRotation?: number; // 이미지 회전 각도 (0, 90, 180, 270)
}

interface RecentUpdatesProps {
    isAdmin?: boolean;
}

export const RecentUpdates: React.FC<RecentUpdatesProps> = ({ isAdmin = false }) => {
    const [items, setItems] = useState<UpdateItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedItem, setSelectedItem] = useState<UpdateItem | null>(null);
    const [editingItem, setEditingItem] = useState<UpdateItem | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    // 태그 필터: 'include' = 포함, 'exclude' = 제외
    // 태그 필터: 'include' = 포함, 'exclude' = 제외
    const [tagFilters, setTagFilters] = useState<{ [tag: string]: 'include' | 'exclude' }>({});
    const [allTags, setAllTags] = useState<{ tag: string; count: number }[]>([]);
    const [activeCategory, setActiveCategory] = useState("전체");
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [tagCloudExpanded, setTagCloudExpanded] = useState(false);
    const [showSyncConfirm, setShowSyncConfirm] = useState(false);

    // Constants for Category Tabs
    const CATEGORIES = ['전체', '신앙', '삶', '사회', '기술'];
    const CATEGORY_KEYWORDS: Record<string, string[]> = {
        '신앙': ['기도', '말씀', '찬양', '예배', '은혜', '교회', '하나님', '예수님', '성령', '묵상', '설교', 'Q.T', '신학', '믿음', '사랑', '소망'],
        '삶': ['감사', '가정', '육아', '일상', '부부', '자녀', '결혼', '직장', '학교', '건강', '취미', '여행', '독서', '관계', '행복', '고민'],
        '사회': ['뉴스', '정치', '경제', '문화', '역사', '환경', '교육', '법', '인권', '평화', '사회', '이슈'],
        '기술': ['IT', 'AI', '개발', '과학', '테크', '앱', '웹', '디자인', '스타트업', '기술', '도구', '장비']
    };

    const getCategory = (tag: string) => {
        const cleanTag = tag.replace(/^#+/, '');
        for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
            if (keywords.some(k => cleanTag.includes(k))) return cat;
        }
        return '기타';
    };

    const filteredTagsByCategory = useMemo(() => {
        if (activeCategory === '전체') return allTags;
        return allTags.filter(t => getCategory(t.tag) === activeCategory);
    }, [allTags, activeCategory]);

    const suggestions = useMemo(() => {
        if (!searchQuery) return [];
        return allTags.filter(t => t.tag.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 5);
    }, [allTags, searchQuery]);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [showLinkModal, setShowLinkModal] = useState(false);

    // 갤러리 승격 상태
    const [promotingToGallery, setPromotingToGallery] = useState(false);

    // Selection state for bulk actions
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Toggle selection of a single item
    const toggleSelection = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    // Toggle select all
    const toggleSelectAll = () => {
        if (selectedIds.size === filteredItems.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredItems.map(item => item.id)));
        }
    };

    // Bulk Delete Handler
    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;

        if (!confirm(`${selectedIds.size}개 항목을 삭제하시겠습니까?`)) return;

        let successCount = 0;
        let failCount = 0;

        for (const id of selectedIds) {
            try {
                // Delete logic (same as single delete)
                const docRef = doc(db, 'updates', id);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.sheetRowId) {
                        try {
                            await addDoc(collection(db, 'deletedItems'), {
                                sheetRowId: data.sheetRowId,
                                title: data.title || '',
                                deletedAt: serverTimestamp()
                            });
                        } catch (e) {
                            console.warn('Failed to record deleted item', e);
                        }
                    }
                }
                await deleteDoc(docRef);
                successCount++;
            } catch (error) {
                console.error('Bulk delete error for', id, error);
                failCount++;
            }
        }

        alert(`삭제 완료: ${successCount}건${failCount > 0 ? `, 실패: ${failCount}건` : ''}`);
        setSelectedIds(new Set());
    };

    // ... (rest of the component)


    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [memos, setMemos] = useState<{ [itemId: string]: Memo[] }>({});
    const [newMemoText, setNewMemoText] = useState('');
    const [editingMemo, setEditingMemo] = useState<{ itemId: string; memoId: string; text: string; imageUrl?: string } | null>(null);
    const [showMemoInput, setShowMemoInput] = useState<string | null>(null);
    const [savingMemo, setSavingMemo] = useState(false);
    const [newMemoImage, setNewMemoImage] = useState('');
    const [uploadingMemoImage, setUploadingMemoImage] = useState(false);

    // Auth state listener
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        // 'updates' 컬렉션에서 동기화된 항목 읽기
        const q = query(collection(db, 'updates'));

        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                const updates = snapshot.docs
                    .map(doc => {
                        const data = doc.data();
                        return {
                            id: doc.id, // <-- CRITICAL: Include document ID
                            // 데이터 필드 타입 안전성 확보
                            title: typeof data.title === 'string' ? data.title : '',
                            subtitle: typeof data.subtitle === 'string' ? data.subtitle : '',
                            desc: typeof data.desc === 'string' ? data.desc : '',
                            image: typeof data.image === 'string' ? data.image : undefined,
                            // Content가 배열이 아닌 경우(예: 레거시 문자열 데이터) 빈 배열로 처리하여 크래시 방지
                            content: Array.isArray(data.content) ? data.content : [],
                            createdAt: data.createdAt,
                            // 누락된 필드 추가
                            question: data.question || '',
                            sheetRowId: data.sheetRowId,
                            externalLinks: Array.isArray(data.externalLinks) ? data.externalLinks : [],
                            additionalImages: Array.isArray(data.additionalImages) ? data.additionalImages : [],
                            relatedIds: Array.isArray(data.relatedIds) ? data.relatedIds : [],
                            imageRotation: typeof data.imageRotation === 'number' ? data.imageRotation : 0
                        } as UpdateItem;
                    });

                try {
                    updates.sort((a, b) => {
                        // content[0].date (실제 작성 날짜) 우선, 없으면 createdAt 사용
                        const getDate = (item: UpdateItem) => {
                            try {
                                const contentDate = item.content?.[0]?.date;
                                if (contentDate) return new Date(contentDate);

                                // Handle Firestore Timestamp or Date object or null safely
                                const ca = item.createdAt;
                                if (ca?.toDate) return ca.toDate();
                                if (ca instanceof Date) return ca;
                                if (ca && typeof ca.seconds === 'number') return new Date(ca.seconds * 1000);
                            } catch (e) {
                                // Date parsing error - fall through to return epoch
                            }
                            return new Date(0);
                        };
                        const dateA = getDate(a);
                        const dateB = getDate(b);
                        return dateB.getTime() - dateA.getTime(); // Newest first
                    });
                } catch (e) {
                    console.error('Sort error:', e);
                }
                setItems(updates);

                // 모든 태그 수집
                const tagCounts: { [key: string]: number } = {};
                updates.forEach(item => {
                    getTags(item).forEach(tag => {
                        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                    });
                });
                const sortedTags = Object.entries(tagCounts)
                    .map(([tag, count]) => ({ tag, count }))
                    .sort((a, b) => a.tag.localeCompare(b.tag, 'ko'));
                setAllTags(sortedTags);

                setLoading(false);

                // Subscribe to memos for each update item
                updates.forEach(item => {
                    const memosQuery = query(
                        collection(db, 'updates', item.id, 'memos'),
                        orderBy('createdAt', 'desc')
                    );
                    onSnapshot(memosQuery, (memoSnapshot) => {
                        const itemMemos = memoSnapshot.docs.map(d => ({
                            id: d.id,
                            ...d.data()
                        } as Memo));
                        setMemos(prev => ({ ...prev, [item.id]: itemMemos }));
                    });
                });
            },
            (error) => {
                console.error('Firestore error:', error);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, []);

    // Memo Image Upload
    const handleMemoImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean = false) => {
        const file = e.target.files?.[0];
        if (!file || !currentUser) return;

        setUploadingMemoImage(true);
        try {
            const storageRef = ref(storage, `memos/${currentUser.uid}/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);

            if (isEdit && editingMemo) {
                setEditingMemo(prev => prev ? { ...prev, imageUrl: downloadURL } : null);
            } else {
                setNewMemoImage(downloadURL);
            }
        } catch (error) {
            console.error('Memo image upload failed:', error);
            alert('이미지 업로드 실패');
        } finally {
            setUploadingMemoImage(false);
        }
    };

    // 메모 추가
    const handleAddMemo = async () => {
        if (!currentUser || !selectedItem) return;
        if (!newMemoText.trim() && !newMemoImage) return;
        setSavingMemo(true);

        try {
            await addDoc(collection(db, 'updates', selectedItem.id, 'memos'), {
                text: newMemoText.trim(),
                imageUrl: newMemoImage,
                userId: currentUser.uid,
                userName: currentUser.displayName || '익명',
                userPhoto: currentUser.photoURL || '',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                parentTitle: selectedItem.title,
                parentImage: selectedItem.image || ''
            });
            setNewMemoText('');
            setNewMemoImage('');
            setShowMemoInput(null);
        } catch (error) {
            console.error('Add memo error:', error);
            alert('메모 추가 실패');
        } finally {
            setSavingMemo(false);
        }
    };

    // 메모 수정
    const handleUpdateMemo = async () => {
        if (!editingMemo || (!editingMemo.text.trim() && !editingMemo.imageUrl)) return;
        setSavingMemo(true);

        try {
            await updateDoc(doc(db, 'updates', editingMemo.itemId, 'memos', editingMemo.memoId), {
                text: editingMemo.text.trim(),
                imageUrl: editingMemo.imageUrl || '',
                updatedAt: serverTimestamp()
            });
            setEditingMemo(null);
        } catch (error) {
            console.error('Update memo error:', error);
            alert('메모 수정 실패');
        } finally {
            setSavingMemo(false);
        }
    };

    // 메모 삭제
    const handleDeleteMemo = async (itemId: string, memoId: string) => {
        if (!confirm('이 메모를 삭제하시겠습니까?')) return;

        try {
            await deleteDoc(doc(db, 'updates', itemId, 'memos', memoId));
        } catch (error) {
            console.error('Delete memo error:', error);
            alert('메모 삭제 실패');
        }
    };

    // 메모 개수 가져오기
    const getMemoCount = (itemId: string): number => {
        return memos[itemId]?.length || 0;
    };

    // 태그 추출 (# 포함 유지)
    const getTags = (item: UpdateItem): string[] => {
        if (!item?.content || !Array.isArray(item.content)) return [];
        const tagSection = item.content.find(c => c && c.keyword === 'TAGS');
        if (tagSection?.text) {
            return tagSection.text
                .split(',')
                .map(t => t.trim()) // # 제거하지 않음
                .filter(Boolean);
        }
        return [];
    };

    // 삭제 함수 (sheetRowId를 deletedItems에 기록하여 재동기화 방지)
    const handleDelete = async (id: string) => {
        // 로그인 확인
        if (!currentUser) {
            alert('삭제하려면 로그인이 필요합니다.');
            return;
        }

        try {
            // 삭제 전에 해당 문서의 sheetRowId를 가져옴
            const docRef = doc(db, 'updates', id);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                // sheetRowId가 있으면 deletedItems 컬렉션에 기록
                if (data.sheetRowId) {
                    try {
                        await addDoc(collection(db, 'deletedItems'), {
                            sheetRowId: data.sheetRowId,
                            title: data.title || '',
                            deletedAt: serverTimestamp()
                        });
                        console.log('Recorded deleted item:', data.sheetRowId);
                    } catch (recordError) {
                        console.warn('Failed to record deleted item, continuing with delete:', recordError);
                    }
                }
            }

            // 문서 삭제
            await deleteDoc(docRef);
            setShowDeleteConfirm(null);
            setSelectedItem(null);
            setEditingItem(null);
        } catch (error: any) {
            console.error('Delete error:', error);
            if (error.code === 'permission-denied') {
                alert('삭제 권한이 없습니다. 관리자로 로그인해주세요.');
            } else {
                alert(`삭제 실패: ${error.message || error}`);
            }
        }
    };

    // 갤러리에 추가 (승격) 함수
    const promoteToGallery = async (item: UpdateItem) => {
        if (!currentUser) {
            alert('갤러리에 추가하려면 로그인이 필요합니다.');
            return;
        }

        if (!confirm(`"${item.title}"을(를) 메인 갤러리에 추가하시겠습니까?`)) return;

        setPromotingToGallery(true);

        try {
            // 다음 갤러리 인덱스 가져오기
            const gallerySnapshot = await getDocs(collection(db, 'gallery'));
            const existingIndices = gallerySnapshot.docs.map(d => {
                const idx = parseInt(d.data().index, 10);
                return isNaN(idx) ? 0 : idx;
            });
            const nextIndex = existingIndices.length > 0
                ? String(Math.max(...existingIndices) + 1).padStart(2, '0')
                : '01';

            // 갤러리 아이템 데이터 준비
            const galleryItem = {
                index: nextIndex,
                title: item.title,
                subtitle: item.subtitle || '',
                image: item.image || 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=1200&auto=format&fit=crop',
                type: 'image',
                descTitle: item.title,
                desc: item.subtitle || item.desc || '',
                content: item.content || [],
                // 승격 메타데이터
                promotedFrom: item.id,
                promotedAt: serverTimestamp()
            };

            await addDoc(collection(db, 'gallery'), galleryItem);
            alert(`✅ "${item.title}"이(가) 갤러리에 추가되었습니다!`);
            setSelectedItem(null);
        } catch (error) {
            console.error('Promote to gallery error:', error);
            alert('갤러리 추가 실패: ' + (error as Error).message);
        } finally {
            setPromotingToGallery(false);
        }
    };

    // 저장 함수
    const handleSave = async () => {
        if (!editingItem) return;
        setSaving(true);

        try {
            await updateDoc(doc(db, 'updates', editingItem.id), {
                title: editingItem.title,
                subtitle: editingItem.subtitle,
                desc: editingItem.desc,
                descTitle: editingItem.title,
                content: editingItem.content,
                image: editingItem.image || '',
                question: editingItem.question || '', // Question Bridge
                externalLinks: editingItem.externalLinks || [],
                additionalImages: editingItem.additionalImages || [],
                relatedIds: editingItem.relatedIds || [],
                imageRotation: editingItem.imageRotation || 0
            });

            // 저장 후 selectedItem도 업데이트 (즉시 반영)
            if (selectedItem && selectedItem.id === editingItem.id) {
                setSelectedItem(editingItem);
            }

            setEditingItem(null);
        } catch (error) {
            console.error('Save error:', error);
            alert('저장 실패');
        } finally {
            setSaving(false);
        }
    };

    // 편집 핸들러
    const handleEditChange = (field: string, value: any) => {
        if (!editingItem) return;
        setEditingItem({ ...editingItem, [field]: value });
    };

    // 본문 편집
    const handleContentChange = (value: string) => {
        if (!editingItem) return;
        const newContent = [...(editingItem.content || [])];
        const mainIndex = newContent.findIndex(c => c.keyword === 'CONTENT');
        if (mainIndex >= 0) {
            newContent[mainIndex] = { ...newContent[mainIndex], text: value };
        } else {
            newContent.unshift({ id: 'main', keyword: 'CONTENT', text: value });
        }
        setEditingItem({ ...editingItem, content: newContent });
    };

    // 태그 편집
    const handleTagsChange = (value: string) => {
        if (!editingItem) return;
        const newContent = [...(editingItem.content || [])];
        const tagIndex = newContent.findIndex(c => c.keyword === 'TAGS');
        if (tagIndex >= 0) {
            newContent[tagIndex] = { ...newContent[tagIndex], text: value };
        } else {
            newContent.push({ id: 'tags', keyword: 'TAGS', text: value });
        }
        setEditingItem({ ...editingItem, content: newContent });
    };

    // 본문 가져오기
    const getContent = (item: UpdateItem) => {
        if (!item?.content || !Array.isArray(item.content)) return item.desc || '';
        return item.content.find(c => c && c.keyword === 'CONTENT')?.text || item.desc || '';
    };

    // 태그 문자열 가져오기
    const getTagsString = (item: UpdateItem) => {
        if (!item?.content || !Array.isArray(item.content)) return '';
        return item.content.find(c => c && c.keyword === 'TAGS')?.text || '';
    };

    // 검색 + 태그 필터링 (포함/제외)
    const filteredItems = useMemo(() => {
        try {
            return items.filter(item => {
                if (!item) return false;
                const itemTags = getTags(item);

                // 포함 태그 필터: 모든 포함 태그가 있어야 함
                const includeTags = Object.entries(tagFilters)
                    .filter(([_, mode]) => mode === 'include')
                    .map(([tag]) => tag);
                if (includeTags.length > 0 && !includeTags.every(tag => itemTags.includes(tag))) {
                    return false;
                }

                // 제외 태그 필터: 제외 태그가 하나라도 있으면 제외
                const excludeTags = Object.entries(tagFilters)
                    .filter(([_, mode]) => mode === 'exclude')
                    .map(([tag]) => tag);
                if (excludeTags.some(tag => itemTags.includes(tag))) {
                    return false;
                }

                if (!searchQuery) return true;
                const q = searchQuery.toLowerCase();
                const contentText = getContent(item).toLowerCase();

                return (
                    (item.title && item.title.toLowerCase().includes(q)) ||
                    (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
                    (item.desc && item.desc.toLowerCase().includes(q)) ||
                    (contentText && contentText.includes(q))
                );
            });
        } catch (e) {
            console.error('Filtering error:', e);
            return items; // Fallback to all items on error
        }
    }, [items, tagFilters, searchQuery]);

    // 동적 태그 카운트: 필터된 아이템 기준으로 계산
    const dynamicTagCounts = useMemo(() => {
        const hasActiveFilter = Object.keys(tagFilters).length > 0 || searchQuery.trim() !== '';

        if (!hasActiveFilter) {
            // 필터가 없으면 전체 카운트 반환
            const counts: { [tag: string]: number } = {};
            allTags.forEach(({ tag, count }) => {
                counts[tag] = count;
            });
            return counts;
        }

        // 필터된 아이템 내에서 태그 카운트 계산
        const counts: { [tag: string]: number } = {};
        try {
            filteredItems.forEach(item => {
                if (!item) return;
                getTags(item).forEach(tag => {
                    counts[tag] = (counts[tag] || 0) + 1;
                });
            });
        } catch (e) {
            console.error('Tag counting error:', e);
        }
        return counts;
    }, [filteredItems, tagFilters, searchQuery, allTags]);

    // Google Drive Link Converter
    const convertGoogleDriveUrl = (url: string) => {
        if (!url) return '';
        try {
            if (url.includes('drive.google.com') && url.includes('/file/d/')) {
                const matches = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
                if (matches && matches[1]) {
                    return `https://drive.google.com/uc?export=view&id=${matches[1]}`;
                }
            }
        } catch (e) {
            console.warn('URL conversion failed', e);
        }
        return url;
    };

    // 이미지 회전 함수 (왼쪽으로 90도)
    const rotateImage = () => {
        if (!editingItem) return;
        const currentRotation = editingItem.imageRotation || 0;
        const newRotation = (currentRotation - 90 + 360) % 360;
        setEditingItem({
            ...editingItem,
            imageRotation: newRotation
        });
    };

    // Image Upload Handler
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !editingItem) return;

        setUploading(true);
        try {
            // Create a unique path: updates/{itemId}/{timestamp}_{filename}
            const storageRef = ref(storage, `updates/${editingItem.id}/${Date.now()}_${file.name}`);

            // Upload
            await uploadBytes(storageRef, file);

            // Get URL
            const downloadURL = await getDownloadURL(storageRef);

            // Update state
            handleEditChange('image', downloadURL);
        } catch (error) {
            console.error('Upload failed:', error);
            alert('이미지 업로드에 실패했습니다.');
        } finally {
            setUploading(false);
        }
    };

    // Additional Image Upload Handler
    const handleAdditionalImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !editingItem) return;

        setUploading(true);
        try {
            const storageRef = ref(storage, `updates/${editingItem.id}/additional_${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);

            const currentImages = (editingItem as any).additionalImages || [];
            handleEditChange('additionalImages', [...currentImages, downloadURL]);
        } catch (error) {
            console.error('Upload failed:', error);
            alert('추가 이미지 업로드에 실패했습니다.');
        } finally {
            setUploading(false);
        }
    };

    // 날짜 포맷 (시간 포함)
    const formatDate = (dateStr: string | undefined) => {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            return new Intl.DateTimeFormat('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            }).format(date);
        } catch {
            return dateStr;
        }
    };

    if (loading) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#0a0a0a] to-[#151515]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                    <span className="text-sm tracking-widest text-white/50 font-light">로딩 중...</span>
                </div>
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#0a0a0a] to-[#151515]">
                <div className="text-center px-6">
                    <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
                        <span className="text-4xl">📱</span>
                    </div>
                    <p className="text-white/70 text-lg mb-2 font-medium">아직 소식이 없습니다</p>
                    <p className="text-white/40 text-sm">iPhone 단축어로 메모를 추가해보세요</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-full overflow-auto bg-gradient-to-br from-[#0a0a0a] to-[#151515]">
            {/* Bulk Action Bar - Sticky Header */}
            {isAdmin && selectedIds.size > 0 && (
                <div className="absolute top-20 left-0 right-0 z-40 px-6 md:px-10 flex justify-center pointer-events-none">
                    <div className="bg-[#1a1a2e] border border-blue-500/30 shadow-2xl rounded-full px-6 py-3 flex items-center gap-6 pointer-events-auto animate-fade-in-up">
                        <span className="text-white font-medium">
                            {selectedIds.size}개 선택됨
                        </span>
                        <div className="h-4 w-[1px] bg-white/10"></div>
                        <button
                            onClick={() => setSelectedIds(new Set())}
                            className="text-white/60 hover:text-white text-sm"
                        >
                            선택 해제
                        </button>
                        <button
                            onClick={handleBulkDelete}
                            className="bg-red-500 hover:bg-red-600 text-white px-4 py-1.5 rounded-full text-sm font-medium transition flex items-center gap-2"
                        >
                            <span>🗑️</span> 삭제
                        </button>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
                    <div className="bg-[#1a1a2e] border border-red-500/30 rounded-2xl p-6 max-w-sm w-full">
                        <h3 className="text-white text-lg font-bold mb-2">삭제 확인</h3>
                        <p className="text-white/60 text-sm mb-6">이 항목을 삭제하시겠습니까?</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowDeleteConfirm(null)}
                                className="flex-1 py-2 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition"
                            >
                                취소
                            </button>
                            <button
                                onClick={() => handleDelete(showDeleteConfirm)}
                                className="flex-1 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition"
                            >
                                삭제
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Sync Confirmation Modal */}
            {showSyncConfirm && (
                <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
                    <div className="bg-[#1a1a2e] border border-green-500/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                        <h3 className="text-white text-lg font-bold mb-2">🔄 새로고침</h3>
                        <p className="text-white/60 text-sm mb-1">구글 시트에서 최신 데이터를 가져오시겠습니까?</p>
                        <p className="text-white/40 text-xs mb-6">(잠시 시간이 소요될 수 있습니다)</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowSyncConfirm(false)}
                                className="flex-1 py-2 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition"
                            >
                                취소
                            </button>
                            <button
                                onClick={async () => {
                                    setShowSyncConfirm(false);
                                    setLoading(true);
                                    try {
                                        const response = await fetch('/api/sync', { method: 'GET' });
                                        const contentType = response.headers.get('content-type');
                                        if (!contentType || !contentType.includes('application/json')) {
                                            throw new Error('로컬 환경에서는 동기화 기능을 사용할 수 없습니다.\n(배포된 사이트에서 실행하거나 vercel dev를 사용하세요)');
                                        }
                                        if (response.ok) {
                                            const result = await response.json();
                                            alert(`업데이트 완료! ${result.added}개의 새 항목을 가져왔습니다.`);
                                            window.location.reload();
                                        } else {
                                            const err = await response.json();
                                            throw new Error(err.error || 'Sync failed');
                                        }
                                    } catch (e: any) {
                                        console.error(e);
                                        alert(`동기화 실패: ${e.message || '잠시 후 다시 시도해주세요.'}`);
                                        setLoading(false);
                                    }
                                }}
                                className="flex-1 py-2 rounded-lg bg-green-500 text-white hover:bg-green-600 transition font-medium"
                            >
                                가져오기
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editingItem && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-4">
                    <div className="bg-gradient-to-br from-[#1a1a2e] to-[#16213e] border border-white/10 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-auto shadow-2xl">
                        <div className="sticky top-0 bg-gradient-to-b from-[#1a1a2e] to-transparent p-6 pb-4 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-white">✏️ 편집</h2>
                            <button
                                onClick={() => setEditingItem(null)}
                                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"
                            >
                                <span className="text-white/70 text-xl">×</span>
                            </button>
                        </div>

                        <div className="px-6 pb-6 space-y-4">
                            {/* 제목 */}
                            <div>
                                <label className="text-white/50 text-xs uppercase tracking-wider mb-1 block">제목</label>
                                <input
                                    type="text"
                                    value={editingItem.title}
                                    onChange={(e) => handleEditChange('title', e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                                />
                            </div>

                            {/* 부제목 */}
                            <div>
                                <label className="text-white/50 text-xs uppercase tracking-wider mb-1 block">요약</label>
                                <input
                                    type="text"
                                    value={editingItem.subtitle}
                                    onChange={(e) => handleEditChange('subtitle', e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                                />
                            </div>

                            {/* 본문 */}
                            <div>
                                <label className="text-white/50 text-xs uppercase tracking-wider mb-1 block">본문</label>
                                <textarea
                                    value={getContent(editingItem)}
                                    onChange={(e) => handleContentChange(e.target.value)}
                                    rows={8}
                                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 resize-none"
                                />
                            </div>

                            {/* 태그 */}
                            <div>
                                <label className="text-white/50 text-xs uppercase tracking-wider mb-1 block">
                                    태그 (쉼표로 구분)
                                </label>
                                <p className="text-xs text-white/30 mb-2">
                                    • 1단계: <span className="text-blue-300">#태그</span> (또는 태그)<br />
                                    • 2단계: <span className="text-purple-300">##태그</span><br />
                                    • 3단계: <span className="text-pink-300">###태그</span>
                                </p>
                                <input
                                    type="text"
                                    value={getTagsString(editingItem)}
                                    onChange={(e) => handleTagsChange(e.target.value)}
                                    placeholder="#태그1, ##태그2, ###태그3"
                                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                                />
                                {getTagsString(editingItem) && (
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {getTagsString(editingItem).split(',').map((t, i) => t.trim()).filter(Boolean).map((tag, i) => (
                                            <span
                                                key={i}
                                                className={`px-2 py-1 text-xs rounded-full ${tag.startsWith('###') ? 'bg-pink-500/20 text-pink-300' :
                                                    tag.startsWith('##') ? 'bg-purple-500/20 text-purple-300' :
                                                        'bg-blue-500/20 text-blue-300'
                                                    }`}
                                            >
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Question Bridge: 이 뉴스가 던지는 질문 */}
                            <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-2xl p-4">
                                <label className="text-indigo-300 text-xs uppercase tracking-wider mb-2 block flex items-center gap-2">
                                    <span>❓</span> 이 뉴스가 던지는 질문
                                </label>
                                <p className="text-xs text-white/40 mb-3">
                                    이 뉴스는 어떤 질문을 우리에게 던지고 있나요?<br />
                                    <span className="text-white/30">(의견이나 답을 쓰지 말고, 질문만 적어주세요)</span>
                                </p>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={editingItem.question || ''}
                                        onChange={(e) => handleEditChange('question', e.target.value.slice(0, 120))}
                                        placeholder="예: 주도권은 지금 누구의 손에 있는가?"
                                        className="w-full px-4 py-3 rounded-xl bg-black/30 border border-indigo-500/30 text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50"
                                        maxLength={120}
                                    />
                                    <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs ${(editingItem.question?.length || 0) >= 120 ? 'text-red-400' : 'text-white/30'}`}>
                                        {editingItem.question?.length || 0}/120
                                    </span>
                                </div>
                                {editingItem.question && (
                                    <p className="mt-2 text-indigo-200/60 text-sm">
                                        Q. {editingItem.question}
                                    </p>
                                )}
                            </div>

                            {/* 이미지 URL */}
                            <div>
                                <label className="text-white/50 text-xs uppercase tracking-wider mb-2 block">대표 이미지</label>

                                {editingItem.image && (
                                    <div className="mb-3 rounded-xl overflow-hidden border border-white/10 relative group">
                                        <img
                                            src={editingItem.image}
                                            alt="Preview"
                                            style={{
                                                transform: `rotate(${editingItem.imageRotation || 0}deg)`
                                            }}
                                            className="w-full max-h-48 object-contain bg-black/30 transition-transform"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                        />
                                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={rotateImage}
                                                className="bg-blue-500/80 hover:bg-blue-500 text-white w-8 h-8 rounded-full flex items-center justify-center shadow-lg"
                                                title="왼쪽으로 회전"
                                            >
                                                ↺
                                            </button>
                                            <button
                                                onClick={() => handleEditChange('image', '')}
                                                className="bg-red-500/80 hover:bg-red-500 text-white w-8 h-8 rounded-full flex items-center justify-center shadow-lg"
                                                title="이미지 제거"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-2 mb-3">
                                    <label className={`flex-1 cursor-pointer py-3 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 transition text-sm text-blue-300 font-medium flex items-center justify-center gap-2 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                        <span>{uploading ? '⏳' : '📤'}</span>
                                        {uploading ? '업로드 중...' : '내 컴퓨터에서 이미지 선택 (권장)'}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleImageUpload}
                                            className="hidden"
                                            disabled={uploading}
                                        />
                                    </label>
                                </div>

                                <div className="relative">
                                    <input
                                        type="text"
                                        value={editingItem.image || ''}
                                        onChange={(e) => handleEditChange('image', convertGoogleDriveUrl(e.target.value))}
                                        placeholder="또는 이미지 주소(URL) 직접 입력..."
                                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 text-sm"
                                    />
                                    <p className="text-white/30 text-[10px] mt-1 pl-1">
                                        * Google Drive 링크도 사용 가능합니다.
                                    </p>
                                </div>
                            </div>

                            {/* 추가 이미지 URLs */}
                            <div>
                                <label className="text-white/50 text-xs uppercase tracking-wider mb-2 block">
                                    추가 이미지
                                </label>

                                {/* Existing Additional Images */}
                                {(editingItem as any).additionalImages?.length > 0 && (
                                    <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                                        {(editingItem as any).additionalImages.map((url: string, i: number) => (
                                            <div key={i} className="relative group/add shrink-0">
                                                <img
                                                    src={url}
                                                    alt={`추가 ${i + 1}`}
                                                    className="w-16 h-16 object-cover rounded-lg border border-white/10"
                                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                />
                                                <button
                                                    onClick={() => {
                                                        const newImgs = (editingItem as any).additionalImages.filter((_: any, idx: number) => idx !== i);
                                                        handleEditChange('additionalImages', newImgs);
                                                    }}
                                                    className="absolute -top-1 -right-1 bg-red-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs opacity-0 group-hover/add:opacity-100 transition-opacity shadow-lg"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="flex gap-2 mb-3">
                                    <label className={`flex-1 cursor-pointer py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-sm text-white/70 flex items-center justify-center gap-2 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                        <span>{uploading ? '⏳' : '📷'}</span>
                                        {uploading ? '업로드 중...' : '추가 이미지 업로드'}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleAdditionalImageUpload}
                                            className="hidden"
                                            disabled={uploading}
                                        />
                                    </label>
                                </div>

                                <textarea
                                    value={(editingItem as any).additionalImages?.join('\n') || ''}
                                    onChange={(e) => handleEditChange('additionalImages', e.target.value.split('\n').filter(url => url.trim()))}
                                    placeholder="또는 URL 직접 입력 (한 줄에 하나씩)"
                                    rows={2}
                                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 resize-none text-sm"
                                />
                            </div>

                            {/* 외부 링크 */}
                            <div>
                                <label className="text-white/50 text-xs uppercase tracking-wider mb-2 block">
                                    관련 링크
                                </label>
                                <div className="space-y-2">
                                    {/* Existing Links List */}
                                    {(editingItem as any).externalLinks?.map((link: any, i: number) => (
                                        <div key={i} className="flex gap-2">
                                            <input
                                                type="text"
                                                value={link.title}
                                                onChange={(e) => {
                                                    const newLinks = [...((editingItem as any).externalLinks || [])];
                                                    newLinks[i] = { ...newLinks[i], title: e.target.value };
                                                    handleEditChange('externalLinks', newLinks);
                                                }}
                                                placeholder="제목 (예: 네이버 블로그)"
                                                className="flex-1 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 text-sm"
                                            />
                                            <input
                                                type="text"
                                                value={link.url}
                                                onChange={(e) => {
                                                    const newLinks = [...((editingItem as any).externalLinks || [])];
                                                    newLinks[i] = { ...newLinks[i], url: e.target.value };
                                                    handleEditChange('externalLinks', newLinks);
                                                }}
                                                placeholder="URL (예: https://...)"
                                                className="flex-[2] px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 text-sm"
                                            />
                                            <button
                                                onClick={() => {
                                                    const newLinks = ((editingItem as any).externalLinks || []).filter((_: any, index: number) => index !== i);
                                                    handleEditChange('externalLinks', newLinks);
                                                }}
                                                className="px-3 py-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}

                                    {/* Add New Link Button */}
                                    <button
                                        onClick={() => {
                                            const newLinks = [...((editingItem as any).externalLinks || []), { title: '', url: '' }];
                                            handleEditChange('externalLinks', newLinks);
                                        }}
                                        className="w-full py-2 rounded-xl border border-dashed border-white/20 text-white/50 hover:text-white hover:border-white/40 hover:bg-white/5 transition text-sm flex items-center justify-center gap-2"
                                    >
                                        <span>+</span> 링크 추가하기
                                    </button>
                                </div>
                            </div>

                            {/* 버튼 */}
                            <div>
                                <label className="text-white/50 text-xs uppercase tracking-wider mb-2 block">
                                    관련 글 연결 (함께 읽으면 좋은 글)
                                </label>
                                <div className="space-y-3">
                                    {/* Linked Articles List */}
                                    <div className="flex flex-wrap gap-2">
                                        {((editingItem as any).relatedIds || []).map((relId: string) => {
                                            const relItem = items.find(it => it.id === relId);
                                            if (!relItem) return null;
                                            return (
                                                <div key={relId} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs">
                                                    <span className="truncate max-w-[150px]">{relItem.title}</span>
                                                    <button
                                                        onClick={() => {
                                                            const newIds = ((editingItem as any).relatedIds || []).filter((id: string) => id !== relId);
                                                            handleEditChange('relatedIds', newIds);
                                                        }}
                                                        className="hover:text-white"
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Article Selector */}
                                    <div className="relative group">
                                        <select
                                            onChange={(e) => {
                                                if (!e.target.value) return;
                                                const newId = e.target.value;
                                                const currentIds = (editingItem as any).relatedIds || [];
                                                if (!currentIds.includes(newId)) {
                                                    handleEditChange('relatedIds', [...currentIds, newId]);
                                                }
                                                e.target.value = ''; // Reset select
                                            }}
                                            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 text-sm appearance-none cursor-pointer hover:bg-white/10 transition-colors"
                                        >
                                            <option value="" className="bg-[#1a1a2e] text-white/50">🔗 연결할 글 선택하기...</option>
                                            {items
                                                .filter(it => it.id !== editingItem.id && !((editingItem as any).relatedIds || []).includes(it.id))
                                                .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                                                .map(it => (
                                                    <option key={it.id} value={it.id} className="bg-[#1a1a2e] text-white">
                                                        {it.title} ({it.createdAt?.seconds ? new Date(it.createdAt.seconds * 1000).toLocaleDateString() : 'No date'})
                                                    </option>
                                                ))
                                            }
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none">
                                            ▼
                                        </div>
                                    </div>
                                    <p className="text-white/30 text-[10px]">
                                        * 목록에서 글을 선택하면 자동으로 추가됩니다.
                                    </p>
                                </div>
                            </div>

                            {/* 버튼 */}
                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => setShowDeleteConfirm(editingItem.id)}
                                    className="px-6 py-3 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition"
                                >
                                    🗑️ 삭제
                                </button>
                                <button
                                    onClick={async () => {
                                        await handleSave();
                                        setEditingItem(null);
                                    }}
                                    disabled={saving}
                                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:opacity-90 transition disabled:opacity-50"
                                >
                                    {saving ? '저장 중...' : '✓ 저장 후 닫기'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Selected Item Detail Modal */}
            {selectedItem && !editingItem && (
                <div
                    className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-4"
                    onClick={() => setSelectedItem(null)}
                >
                    <div
                        className="bg-gradient-to-br from-[#1a1a2e] to-[#16213e] border border-white/10 rounded-3xl max-w-5xl w-full max-h-[95vh] overflow-auto shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="sticky top-0 bg-[#1a1a2e] z-10 px-6 py-4 border-b border-white/5">
                            <div className="flex justify-between items-start">
                                <div className="flex-1 pr-4">
                                    <h2 className="text-2xl md:text-3xl font-bold text-white mb-0 leading-snug">
                                        {selectedItem.title}
                                    </h2>
                                    {/* Subtitle moved to content area */}
                                </div>
                                <div className="flex gap-2">
                                    {isAdmin && (
                                        <>
                                            <button
                                                onClick={() => promoteToGallery(selectedItem)}
                                                disabled={promotingToGallery}
                                                className="w-10 h-10 rounded-full bg-green-500/20 hover:bg-green-500/40 flex items-center justify-center transition-all disabled:opacity-50"
                                                title="갤러리에 추가"
                                            >
                                                <span className="text-green-400">{promotingToGallery ? '⏳' : '📤'}</span>
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setEditingItem(selectedItem);
                                                    setSelectedItem(null);
                                                }}
                                                className="w-10 h-10 rounded-full bg-blue-500/20 hover:bg-blue-500/40 flex items-center justify-center transition-all"
                                                title="편집"
                                            >
                                                <span className="text-blue-400">✏️</span>
                                            </button>
                                            <button
                                                onClick={() => setShowDeleteConfirm(selectedItem.id)}
                                                className="w-10 h-10 rounded-full bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center transition-all"
                                                title="삭제"
                                            >
                                                <span className="text-red-400">🗑️</span>
                                            </button>
                                        </>
                                    )}
                                    <button
                                        onClick={() => setSelectedItem(null)}
                                        className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"
                                    >
                                        <span className="text-white/70 text-xl">×</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="px-6 pb-6 pt-2">
                            {/* Subtitle - Moved from header */}
                            {selectedItem.subtitle && (
                                <p className="text-blue-300/70 text-sm mb-4 font-medium">{selectedItem.subtitle}</p>
                            )}

                            {/* Tags - Moved out of sticky header */}
                            {getTags(selectedItem).length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {(getTags(selectedItem) || [])
                                        .sort((a, b) => {
                                            if (!a || !b) return 0;
                                            // Sort by hierarchy: # -> ## -> ###
                                            const getLevel = (tag: string) => tag.startsWith('###') ? 3 : tag.startsWith('##') ? 2 : 1;
                                            return getLevel(a) - getLevel(b);
                                        })
                                        .map((tag, i) => (
                                            <button
                                                key={i}
                                                onClick={() => {
                                                    setTagFilters(prev => ({ ...prev, [tag]: 'include' }));
                                                    setSelectedItem(null);
                                                }}
                                                className={`px-3 py-1 text-xs rounded-full transition border ${tag.startsWith('###')
                                                    ? 'bg-pink-500/20 text-pink-300 border-pink-500/30 hover:bg-pink-500/30'
                                                    : tag.startsWith('##')
                                                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/30 hover:bg-purple-500/30'
                                                        : 'bg-blue-500/20 text-blue-300 border-blue-500/30 hover:bg-blue-500/30'
                                                    }`}
                                            >
                                                {tag.replace(/^#+/, '')}
                                            </button>
                                        ))}
                                </div>
                            )}

                            {/* Question Bridge Section - Moved out of sticky header */}
                            {selectedItem.question && (
                                <div className="mt-4 mb-6 p-4 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-2xl">
                                    <div className="flex items-start gap-3">
                                        <span className="text-lg">❓</span>
                                        <div className="flex-1">
                                            <p className="text-[10px] uppercase tracking-widest text-indigo-300/60 mb-1">
                                                이 뉴스가 던지는 질문
                                            </p>
                                            <p className="text-white/90 font-medium">
                                                {selectedItem.question}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            // TODO: QuestionBridgeView 모달 열기
                                            alert('같은 질문을 품은 기록들 보기 기능은 곧 추가됩니다!');
                                        }}
                                        className="mt-3 flex items-center gap-2 text-xs text-indigo-400/70 hover:text-indigo-300 transition-colors"
                                    >
                                        <span>🔗</span>
                                        <span>같은 질문을 품은 기록 보기</span>
                                        <span>→</span>
                                    </button>
                                </div>
                            )}

                            {/* Layout with floating image on left */}
                            <div className={`${selectedItem.image && typeof selectedItem.image === 'string' && !selectedItem.image.includes('unsplash.com') ? 'md:flex md:gap-6' : ''}`}>
                                {/* Floating Image - Left side on desktop */}
                                {selectedItem.image && typeof selectedItem.image === 'string' && !selectedItem.image.includes('unsplash.com') && (
                                    <div className="md:sticky md:top-24 md:self-start mb-4 md:mb-0 md:flex-shrink-0">
                                        <div className="relative group/img">
                                            <div className="md:w-96 lg:w-[480px] overflow-hidden rounded-xl border border-white/10 bg-black/30 shadow-lg hover:shadow-xl hover:shadow-blue-500/10 transition-all duration-300">
                                                <img
                                                    src={selectedItem.image}
                                                    alt={selectedItem.title}
                                                    referrerPolicy="no-referrer"
                                                    style={{
                                                        transform: `rotate(${selectedItem.imageRotation || 0}deg)`
                                                    }}
                                                    className="w-full h-auto max-h-[85vh] md:max-h-[90vh] object-contain cursor-pointer hover:scale-[1.02] transition-transform duration-300"
                                                    onClick={() => window.open(selectedItem.image, '_blank')}
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).parentElement!.parentElement!.style.display = 'none';
                                                    }}
                                                />
                                            </div>
                                            {/* Hover hint */}
                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/40 rounded-xl pointer-events-none">
                                                <span className="text-white/80 text-xs bg-black/60 px-2 py-1 rounded-full">🔍 클릭하여 확대</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Text Content - Right side on desktop */}
                                <div className="flex-1 min-w-0">
                                    <div className="text-white/80 text-base leading-relaxed whitespace-pre-wrap mb-6">
                                        {getContent(selectedItem)}
                                    </div>
                                </div>
                            </div>

                            {selectedItem.content?.[0]?.date && (
                                <div className="mt-8 pt-4 border-t border-white/10">
                                    <p className="text-white/40 text-sm flex items-center gap-2">
                                        <span>📅</span>
                                        {formatDate(selectedItem.content[0].date)}
                                    </p>
                                </div>
                            )}

                            {/* 추가 이미지 갤러리 */}
                            {(selectedItem as any).additionalImages?.length > 0 && (
                                <div className="mt-6 pt-4 border-t border-white/10">
                                    <h5 className="text-white/50 text-xs uppercase tracking-wider mb-3">📸 추가 이미지</h5>
                                    <div className="flex gap-3 overflow-x-auto pb-2">
                                        {(selectedItem as any).additionalImages.map((url: string, i: number) => (
                                            <img
                                                key={i}
                                                src={url}
                                                alt={`추가 이미지 ${i + 1}`}
                                                onClick={() => window.open(url, '_blank')}
                                                className="h-24 w-auto rounded-xl border border-white/10 cursor-pointer hover:scale-105 transition-transform"
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 외부 링크 */}
                            {((selectedItem as any).externalLinks?.length > 0) && (
                                <div className="mt-6 pt-4 border-t border-white/10">
                                    <h5 className="text-white/50 text-xs uppercase tracking-wider mb-3">🔗 관련 링크</h5>
                                    <div className="flex flex-wrap gap-2">
                                        {(selectedItem as any).externalLinks.map((link: any, i: number) => {
                                            if (!link.title && !link.url) return null;
                                            return (
                                                <a
                                                    key={i}
                                                    href={link.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-300 hover:from-blue-500/30 hover:to-purple-500/30 transition-all flex items-center gap-2 text-sm"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    🔗 {link.title || link.url}
                                                </a>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Related Articles (Linked internal posts) */}
                            {((selectedItem as any).relatedIds?.length > 0) && (
                                <div className="mt-6 pt-4 border-t border-white/10">
                                    <h5 className="text-white/50 text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
                                        <span>👀</span> 함께 읽으면 좋은 글
                                    </h5>
                                    <div className="grid grid-cols-1 gap-3">
                                        {(selectedItem as any).relatedIds.map((relId: string) => {
                                            const relItem = items.find(it => it.id === relId);
                                            if (!relItem) return null;
                                            // Extract simple tag/preview
                                            const firstTag = getTags(relItem)[0]?.replace(/^#+/, '') || 'Article';
                                            return (
                                                <div
                                                    key={relId}
                                                    onClick={() => setSelectedItem(relItem)}
                                                    className="group flex items-center p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-indigo-500/30 cursor-pointer transition-all"
                                                >
                                                    <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center mr-3 group-hover:bg-indigo-500/30 transition-colors text-xl">
                                                        📄
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="text-white text-sm font-medium truncate group-hover:text-indigo-300 transition-colors">
                                                            {relItem.title}
                                                        </h4>
                                                        <div className="flex items-center gap-2 text-[10px] text-white/40 mt-0.5">
                                                            <span className="text-indigo-400/80 uppercase tracking-wider">{firstTag}</span>
                                                            <span>•</span>
                                                            <span>{relItem.createdAt?.seconds ? new Date(relItem.createdAt.seconds * 1000).toLocaleDateString() : ''}</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-white/20 group-hover:text-white/60 transition-colors px-2">
                                                        →
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* 개념 카드에 연결 */}
                            <div className="mt-6 pt-4 border-t border-white/10">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowLinkModal(true);
                                    }}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 text-indigo-300 hover:from-indigo-500/30 hover:to-purple-500/30 transition-all"
                                >
                                    🔗 개념 카드에 연결하기
                                </button>
                            </div>

                            {/* Memos Section */}
                            <div className="mt-8 pt-6 border-t border-white/10">
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="text-white/70 text-sm font-medium flex items-center gap-2">
                                        📝 메모
                                        {memos[selectedItem.id]?.length > 0 && (
                                            <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-300">
                                                {memos[selectedItem.id].length}
                                            </span>
                                        )}
                                    </h4>
                                </div>

                                {/* Add Memo Input - Always visible for logged in users */}
                                {currentUser && (
                                    <div className="mb-4">
                                        <textarea
                                            value={newMemoText}
                                            onChange={(e) => setNewMemoText(e.target.value)}
                                            placeholder="메모를 입력하세요..."
                                            rows={2}
                                            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 resize-none text-sm"
                                        />

                                        {/* Image Preview */}
                                        {newMemoImage && (
                                            <div className="mt-2 relative inline-block">
                                                <img src={newMemoImage} alt="Memo attachment" className="h-20 rounded-lg border border-white/10" />
                                                <button
                                                    onClick={() => setNewMemoImage('')}
                                                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow-lg"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        )}

                                        <div className="flex justify-between items-center mt-3">
                                            <div className="flex items-center gap-2">
                                                <label className={`cursor-pointer px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/70 flex items-center gap-2 transition ${uploadingMemoImage ? 'opacity-50 pointer-events-none' : ''}`}>
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        className="hidden"
                                                        onChange={(e) => handleMemoImageUpload(e, false)}
                                                        disabled={uploadingMemoImage}
                                                    />
                                                    <span>{uploadingMemoImage ? '⏳' : '📷'}</span>
                                                    {uploadingMemoImage ? '업로드 중...' : '사진 첨부'}
                                                </label>
                                                <span className="text-white/20 text-[10px] hidden sm:inline">
                                                    (최대 5MB)
                                                </span>
                                            </div>

                                            <button
                                                onClick={handleAddMemo}
                                                disabled={savingMemo || uploadingMemoImage || (!newMemoText.trim() && !newMemoImage)}
                                                className="px-4 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
                                            >
                                                {savingMemo ? '저장 중...' : '등록'}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Not logged in message */}
                                {!currentUser && (
                                    <p className="text-white/40 text-sm text-center py-4">
                                        메모를 추가하려면 로그인하세요
                                    </p>
                                )}

                                {/* Memos List */}
                                <div className="space-y-3">
                                    {memos[selectedItem.id]?.map((memo) => (
                                        <div
                                            key={memo.id}
                                            className="p-4 bg-gradient-to-br from-white/5 to-white/[0.02] rounded-xl border border-white/10 group"
                                        >
                                            {editingMemo?.memoId === memo.id ? (
                                                /* Edit Mode */
                                                <div>
                                                    <textarea
                                                        value={editingMemo.text}
                                                        onChange={(e) => setEditingMemo({ ...editingMemo, text: e.target.value })}
                                                        rows={3}
                                                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 resize-none text-sm"
                                                    />

                                                    <div className="flex items-center gap-2 mt-2">
                                                        <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/70 flex items-center gap-2 transition">
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                className="hidden"
                                                                onChange={(e) => handleMemoImageUpload(e, true)}
                                                                disabled={uploadingMemoImage}
                                                            />
                                                            <span>{uploadingMemoImage ? '⏳' : '📷'}</span>
                                                            {editingMemo.imageUrl ? '이미지 변경' : '이미지 추가'}
                                                        </label>
                                                        {editingMemo.imageUrl && (
                                                            <div className="relative group/preview mt-1">
                                                                <img src={editingMemo.imageUrl} alt="Preview" className="h-8 w-8 rounded object-cover border border-white/10" />
                                                                <button
                                                                    onClick={() => setEditingMemo({ ...editingMemo, imageUrl: '' })}
                                                                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-3 h-3 flex items-center justify-center text-[8px] opacity-0 group-hover/preview:opacity-100"
                                                                >
                                                                    ×
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex justify-end gap-2 mt-2">
                                                        <button
                                                            onClick={() => setEditingMemo(null)}
                                                            className="px-3 py-1.5 text-xs rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition"
                                                        >
                                                            취소
                                                        </button>
                                                        <button
                                                            onClick={handleUpdateMemo}
                                                            disabled={savingMemo}
                                                            className="px-3 py-1.5 text-xs rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition disabled:opacity-50"
                                                        >
                                                            {savingMemo ? '저장 중...' : '저장'}
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                /* View Mode */
                                                <>
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            {memo.userPhoto ? (
                                                                <img
                                                                    src={memo.userPhoto}
                                                                    alt={memo.userName}
                                                                    className="w-6 h-6 rounded-full"
                                                                />
                                                            ) : (
                                                                <div className="w-6 h-6 rounded-full bg-blue-500/30 flex items-center justify-center text-xs text-blue-300">
                                                                    {memo.userName?.[0] || '?'}
                                                                </div>
                                                            )}
                                                            <span className="text-white/60 text-xs">{memo.userName}</span>
                                                            <span className="text-white/30 text-[10px]">
                                                                {memo.createdAt?.toDate?.()?.toLocaleDateString('ko-KR') || ''}
                                                            </span>
                                                        </div>
                                                        {currentUser?.uid === memo.userId && (
                                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                                                <button
                                                                    onClick={() => setEditingMemo({
                                                                        itemId: selectedItem.id,
                                                                        memoId: memo.id,
                                                                        text: memo.text,
                                                                        imageUrl: memo.imageUrl
                                                                    })}
                                                                    className="p-1.5 rounded-lg bg-white/10 hover:bg-blue-500/30 text-white/50 hover:text-blue-300 transition text-xs"
                                                                    title="편집"
                                                                >
                                                                    ✏️
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteMemo(selectedItem.id, memo.id)}
                                                                    className="p-1.5 rounded-lg bg-white/10 hover:bg-red-500/30 text-white/50 hover:text-red-300 transition text-xs"
                                                                    title="삭제"
                                                                >
                                                                    🗑️
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <p className="text-white/80 text-sm whitespace-pre-wrap">{memo.text}</p>
                                                    {memo.imageUrl && (
                                                        <div className="mt-2 text-left">
                                                            <img
                                                                src={memo.imageUrl}
                                                                alt="Attachment"
                                                                className="max-h-48 rounded-lg border border-white/10 cursor-pointer hover:opacity-90 transition"
                                                                onClick={() => window.open(memo.imageUrl, '_blank')}
                                                            />
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* No memos yet */}
                                {(!memos[selectedItem.id] || memos[selectedItem.id].length === 0) && currentUser && (
                                    <p className="text-white/30 text-sm text-center py-4">
                                        아직 메모가 없습니다
                                    </p>
                                )}
                            </div>

                            {/* Related Posts Section */}
                            {(() => {
                                const currentTags = getTags(selectedItem);
                                if (currentTags.length === 0) return null;

                                const relatedItems = items.filter(item => {
                                    if (item.id === selectedItem.id) return false;
                                    const itemTags = getTags(item);
                                    return currentTags.some(tag => itemTags.includes(tag));
                                }).slice(0, 4); // 최대 4개

                                if (relatedItems.length === 0) return null;

                                return (
                                    <div className="mt-8 pt-6 border-t border-white/10">
                                        <h4 className="text-white/70 text-sm font-medium mb-4 flex items-center gap-2">
                                            🔗 관련 글
                                            <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 text-purple-300">
                                                {relatedItems.length}
                                            </span>
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {relatedItems.map(item => (
                                                <div
                                                    key={item.id}
                                                    onClick={() => setSelectedItem(item)}
                                                    className="p-4 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 hover:border-purple-500/30 cursor-pointer transition-all group"
                                                >
                                                    <h5 className="text-white font-medium text-sm mb-1 group-hover:text-purple-300 transition line-clamp-1">
                                                        {item.title}
                                                    </h5>
                                                    <p className="text-white/40 text-xs line-clamp-2 mb-2">
                                                        {item.subtitle || item.desc?.slice(0, 60)}
                                                    </p>
                                                    <div className="flex flex-wrap gap-1">
                                                        {getTags(item).slice(0, 3).map((tag, i) => (
                                                            <span
                                                                key={i}
                                                                className={`px-2 py-0.5 text-[10px] rounded-full ${currentTags.includes(tag)
                                                                    ? 'bg-purple-500/30 text-purple-300'
                                                                    : 'bg-white/10 text-white/50'
                                                                    }`}
                                                            >
                                                                #{tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <div className="p-6 md:p-10 pt-14 md:pt-28">
                <div className="max-w-6xl mx-auto">
                    {/* Header */}
                    <div className="mb-6 flex items-center justify-between">
                        <div>
                            <h2 className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 mb-3">
                            </h2>
                            <p className="text-white/40 text-sm">iPhone에서 보낸 메모와 업데이트</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setShowSyncConfirm(true)}
                                className="px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 rounded-lg text-xs text-green-400 transition flex items-center gap-2"
                            >
                                <span>🔄</span> 새로고침
                            </button>
                            {isAdmin && (
                                <>
                                    <button
                                        onClick={toggleSelectAll}
                                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-white/70 transition"
                                    >
                                        {selectedIds.size === filteredItems.length && filteredItems.length > 0
                                            ? '전체 해제'
                                            : '전체 선택'}
                                    </button>
                                    <span className="px-3 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-full">
                                        👑 관리자 모드
                                    </span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Tag Cloud & Category Tabs */}
                    {allTags.length > 0 && (
                        <div className="mb-6 bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
                            {/* Collapsible Header */}
                            <button
                                onClick={() => setTagCloudExpanded(prev => !prev)}
                                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <Hash size={14} className="text-blue-400" />
                                    <span className="text-white/60 text-sm font-medium">전체 태그</span>
                                    {Object.keys(tagFilters).length > 0 && (
                                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-xs rounded-full">
                                            {Object.keys(tagFilters).length}개 필터 적용 중
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    {Object.keys(tagFilters).length > 0 && (
                                        <span
                                            onClick={(e) => { e.stopPropagation(); setTagFilters({}); }}
                                            className="text-xs text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded hover:bg-blue-500/10"
                                        >
                                            초기화
                                        </span>
                                    )}
                                    <span className={`text-white/30 transition-transform duration-200 ${tagCloudExpanded ? 'rotate-180' : ''}`}>
                                        ▼
                                    </span>
                                </div>
                            </button>

                            {/* Collapsible Content */}
                            {tagCloudExpanded && (
                                <>
                                    {/* Category Tabs */}
                                    <div className="flex overflow-x-auto no-scrollbar border-t border-b border-white/10">
                                        {CATEGORIES.map(cat => (
                                            <button
                                                key={cat}
                                                onClick={() => setActiveCategory(cat)}
                                                className={`flex-1 min-w-[60px] px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors relative ${activeCategory === cat ? 'text-white bg-white/5' : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                                                    }`}
                                            >
                                                {cat}
                                                {activeCategory === cat && (
                                                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                                                )}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="text-white/40 text-[10px]">(클릭하여 필터링 / 재클릭하여 제외)</span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {filteredTagsByCategory.filter(t => (dynamicTagCounts[t.tag] || 0) > 0).map(({ tag }) => {
                                                const filterMode = tagFilters[tag];
                                                const dynamicCount = dynamicTagCounts[tag] || 0;
                                                const isL3 = tag.startsWith('###');
                                                const isL2 = tag.startsWith('##') && !isL3;
                                                const baseColor = isL3 ? 'pink' : isL2 ? 'purple' : 'blue';

                                                return (
                                                    <button
                                                        key={tag}
                                                        onClick={() => setTagFilters(prev => {
                                                            const current = prev[tag];
                                                            if (!current) {
                                                                return { ...prev, [tag]: 'include' };
                                                            } else if (current === 'include') {
                                                                return { ...prev, [tag]: 'exclude' };
                                                            } else {
                                                                const { [tag]: _, ...rest } = prev;
                                                                return rest;
                                                            }
                                                        })}
                                                        className={`px-3 py-2 text-sm rounded-full transition-all flex items-center gap-1.5 ${filterMode === 'include'
                                                            ? `bg-gradient-to-r from-${baseColor}-500 to-${isL3 ? 'yellow' : isL2 ? 'pink' : 'purple'}-500 text-white shadow-lg`
                                                            : filterMode === 'exclude'
                                                                ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white shadow-lg line-through'
                                                                : `bg-white/5 text-${baseColor}-200/60 border border-${baseColor}-500/10 hover:border-${baseColor}-500/30 hover:bg-white/10`
                                                            }`}
                                                    >
                                                        {filterMode === 'include' && <span>✓</span>}
                                                        {filterMode === 'exclude' && <span>✗</span>}
                                                        {tag.replace(/^#{1,3}/, '')}
                                                        <span className="ml-1 text-[10px] opacity-60">
                                                            {dynamicCount}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                            {filteredTagsByCategory.length === 0 && (
                                                <div className="text-white/30 text-sm py-4 w-full text-center">
                                                    해당 카테고리의 태그가 없습니다.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* Search Bar - with Autocomplete */}
                    <div className="mb-8 relative z-50">
                        <div className="relative max-w-md">
                            <input
                                type="text"
                                placeholder="검색..."
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setShowSuggestions(true);
                                }}
                                onFocus={() => setShowSuggestions(true)}
                                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                className="w-full px-5 py-3 pl-12 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all"
                            />
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30">
                                <Search size={18} />
                            </span>

                            {/* Suggestions Dropdown */}
                            {showSuggestions && searchQuery && suggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                                    {suggestions.map(({ tag }) => (
                                        <button
                                            key={tag}
                                            onClick={() => {
                                                setSearchQuery(tag.replace(/^#+/, ''));
                                                // Optionally auto-filter by this tag
                                                setTagFilters(prev => ({ ...prev, [tag]: 'include' }));
                                                setShowSuggestions(false);
                                            }}
                                            className="w-full px-4 py-3 text-left hover:bg-white/10 text-white/80 transition-colors flex items-center justify-between group"
                                        >
                                            <span>{tag}</span>
                                            <span className="opacity-0 group-hover:opacity-100 text-blue-400 text-xs">선택</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Filter Status */}
                    {Object.keys(tagFilters).length > 0 && (
                        <div className="mb-6 flex flex-wrap items-center gap-2">
                            <span className="text-white/50 text-sm">필터:</span>
                            {Object.entries(tagFilters).map(([tag, mode]) => {
                                // Determine style based on level
                                const isL3 = tag.startsWith('###');
                                const isL2 = tag.startsWith('##') && !isL3;
                                const baseColor = isL3 ? 'pink' : isL2 ? 'purple' : 'blue';

                                return (
                                    <span
                                        key={tag}
                                        className={`px-3 py-1 rounded-full text-sm flex items-center gap-2 ${mode === 'include'
                                            ? `bg-${baseColor}-500/20 text-${baseColor}-300`
                                            : `bg-red-500/20 text-red-300 line-through`
                                            }`}
                                    >
                                        {mode === 'include' ? '✓' : '✗'} {tag.replace(/^#{1,3}/, '')}
                                        <button
                                            onClick={() => setTagFilters(prev => {
                                                const { [tag]: _, ...rest } = prev;
                                                return rest;
                                            })}
                                            className="hover:text-white"
                                        >×</button>
                                    </span>
                                );
                            })}
                            <span className="text-white/30 text-sm">({filteredItems.length}개)</span>
                        </div>
                    )}

                    {/* No Results */}
                    {filteredItems.length === 0 && (
                        <div className="text-center py-12">
                            <p className="text-white/50">
                                {searchQuery ? `"${searchQuery}"에 대한 결과가 없습니다` : '결과가 없습니다'}
                            </p>
                        </div>
                    )}

                    {/* Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                        {filteredItems.map((item, index) => (
                            <div
                                key={item.id}
                                className={`group relative bg-gradient-to-br from-white/5 to-white/[0.02] hover:from-white/10 hover:to-white/5 rounded-2xl p-6 cursor-pointer transition-all duration-500 hover:scale-[1.02] hover:shadow-xl hover:shadow-blue-500/10 border
                                    ${selectedIds.has(item.id)
                                        ? 'border-blue-500/50 ring-2 ring-blue-500/20'
                                        : 'border-white/10 hover:border-blue-500/30'}`}
                                style={{ animationDelay: `${index * 50}ms` }}
                            >
                                {/* Admin Selection Checkbox */}
                                {isAdmin && (
                                    <div
                                        className="absolute top-3 left-3 z-20"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div
                                            onClick={(e) => toggleSelection(item.id, e)}
                                            className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all cursor-pointer
                                                ${selectedIds.has(item.id)
                                                    ? 'bg-blue-500 border-blue-500'
                                                    : 'bg-black/40 border-white/30 hover:border-white/70'}`}
                                        >
                                            {selectedIds.has(item.id) && (
                                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {/* Admin Buttons */}
                                {isAdmin && (
                                    <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-all z-10">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingItem(item);
                                            }}
                                            className="w-8 h-8 rounded-full bg-blue-500/20 hover:bg-blue-500/40 flex items-center justify-center"
                                            title="편집"
                                        >
                                            <span className="text-blue-400 text-sm">✏️</span>
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setShowDeleteConfirm(item.id);
                                            }}
                                            className="w-8 h-8 rounded-full bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center"
                                            title="삭제"
                                        >
                                            <span className="text-red-400 text-sm">🗑️</span>
                                        </button>
                                    </div>
                                )}

                                <div onClick={() => setSelectedItem(item)}>
                                    {/* Image Thumbnail - Moved to Top */}
                                    {item.image && typeof item.image === 'string' && !item.image.includes('unsplash.com') && (
                                        <div className="relative w-full aspect-video md:h-48 mb-4 overflow-hidden rounded-xl bg-black/20">
                                            <img
                                                src={item.image}
                                                alt={item.title}
                                                referrerPolicy="no-referrer"
                                                style={{
                                                    transform: `rotate(${item.imageRotation || 0}deg)`
                                                }}
                                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                }}
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-60" />
                                        </div>
                                    )}

                                    {/* Accent Line */}
                                    <div className="absolute top-0 left-6 right-6 h-[2px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                                    <h3 className="text-white font-semibold text-lg mb-2 group-hover:text-blue-300 transition-colors line-clamp-2">
                                        {item.title}
                                    </h3>

                                    <p className="text-white/50 text-sm mb-3 line-clamp-2 leading-relaxed">
                                        {item.subtitle || (typeof item.desc === 'string' ? item.desc.slice(0, 80) : '')}
                                    </p>

                                    {/* Show text preview only if no image, or if short */}
                                    <p className="text-white/30 text-xs line-clamp-3 mb-4 leading-relaxed font-light">
                                        {(typeof getContent(item) === 'string' ? getContent(item) : '').slice(0, 100)}...
                                    </p>

                                    {/* Tags Preview - Flattened */}
                                    {getTags(item).length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mb-4">
                                            {getTags(item)
                                                .sort((a, b) => {
                                                    if (!a || !b) return 0;
                                                    const getLevel = (t: string) => t.startsWith('###') ? 3 : t.startsWith('##') ? 2 : 1;
                                                    return getLevel(a) - getLevel(b);
                                                })
                                                .map((tag, i) => {
                                                    const isL3 = tag.startsWith('###');
                                                    const isL2 = tag.startsWith('##') && !isL3;
                                                    const colorClass = isL3
                                                        ? 'bg-pink-500/10 text-pink-300 border-pink-500/10 hover:bg-pink-500/20'
                                                        : isL2
                                                            ? 'bg-purple-500/10 text-purple-300 border-purple-500/10 hover:bg-purple-500/20'
                                                            : 'bg-blue-500/10 text-blue-300 border-blue-500/10 hover:bg-blue-500/20';

                                                    return (
                                                        <span
                                                            key={i}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setTagFilters(prev => ({ ...prev, [tag]: 'include' }));
                                                            }}
                                                            className={`px-2 py-0.5 text-[10px] rounded-full cursor-pointer transition border ${colorClass}`}
                                                        >
                                                            #{tag.replace(/^#{1,3}/, '')}
                                                        </span>
                                                    );
                                                })
                                            }
                                        </div>
                                    )}

                                    {/* Meta Info Row */}
                                    <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/5">
                                        {item.content?.[0]?.date && (
                                            <div className="flex items-center gap-1.5 text-white/30 text-[10px]">
                                                <span>📅</span>
                                                <span>{formatDate(item.content[0].date)}</span>
                                            </div>
                                        )}

                                        {getMemoCount(item.id) > 0 && (
                                            <div className="flex items-center gap-1 text-[10px] text-yellow-300/60">
                                                <span>📝</span>
                                                <span>{getMemoCount(item.id)}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                                        <span className="text-blue-400">→</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Link to Concept Modal */}
            {showLinkModal && selectedItem && (
                <LinkToConceptModal
                    sourceId={selectedItem.id}
                    sourceType="news"
                    sourceTitle={selectedItem.title}
                    sourceExcerpt={(typeof getContent(selectedItem) === 'string' ? getContent(selectedItem) : '').slice(0, 150)}
                    sourcePath={`updates/${selectedItem.id}`}
                    onClose={() => setShowLinkModal(false)}
                    onSuccess={() => setShowLinkModal(false)}
                />
            )}
        </div>
    );
};

export default RecentUpdates;
