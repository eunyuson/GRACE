import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, deleteDoc, doc, updateDoc, addDoc, orderBy, serverTimestamp, getDoc, getDocs } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from '../firebase';

interface Memo {
    id: string;
    text: string;
    userId: string;
    userName: string;
    userPhoto?: string;
    createdAt?: any;
    updatedAt?: any;
}

interface UpdateItem {
    id: string;
    title: string;
    subtitle: string;
    desc: string;
    image?: string;
    content: { id?: string; text: string; date?: string; keyword?: string }[];
    createdAt?: any;
    sheetRowId?: string;
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
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

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
    const [editingMemo, setEditingMemo] = useState<{ itemId: string; memoId: string; text: string } | null>(null);
    const [showMemoInput, setShowMemoInput] = useState<string | null>(null);
    const [savingMemo, setSavingMemo] = useState(false);

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
                    .map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    } as UpdateItem));

                updates.sort((a, b) => {
                    // content[0].date (실제 작성 날짜) 우선, 없으면 createdAt 사용
                    const getDate = (item: UpdateItem) => {
                        const contentDate = item.content?.[0]?.date;
                        if (contentDate) return new Date(contentDate);
                        return item.createdAt?.toDate?.() || new Date(0);
                    };
                    const dateA = getDate(a);
                    const dateB = getDate(b);
                    return dateB.getTime() - dateA.getTime();
                });
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

    // 메모 추가
    const handleAddMemo = async (itemId: string) => {
        if (!currentUser || !newMemoText.trim()) return;
        setSavingMemo(true);

        try {
            await addDoc(collection(db, 'updates', itemId, 'memos'), {
                text: newMemoText.trim(),
                userId: currentUser.uid,
                userName: currentUser.displayName || '익명',
                userPhoto: currentUser.photoURL || '',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            setNewMemoText('');
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
        if (!editingMemo || !editingMemo.text.trim()) return;
        setSavingMemo(true);

        try {
            await updateDoc(doc(db, 'updates', editingMemo.itemId, 'memos', editingMemo.memoId), {
                text: editingMemo.text.trim(),
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
        const tagSection = item.content?.find(c => c.keyword === 'TAGS');
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
                image: editingItem.image || ''
            });
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
        return item.content?.find(c => c.keyword === 'CONTENT')?.text || item.desc || '';
    };

    // 태그 문자열 가져오기
    const getTagsString = (item: UpdateItem) => {
        return item.content?.find(c => c.keyword === 'TAGS')?.text || '';
    };

    // 검색 + 태그 필터링 (포함/제외)
    const filteredItems = items.filter(item => {
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
        return (
            item.title?.toLowerCase().includes(q) ||
            item.subtitle?.toLowerCase().includes(q) ||
            item.desc?.toLowerCase().includes(q) ||
            item.content?.[0]?.text?.toLowerCase().includes(q)
        );
    });

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
        filteredItems.forEach(item => {
            getTags(item).forEach(tag => {
                counts[tag] = (counts[tag] || 0) + 1;
            });
        });
        return counts;
    }, [filteredItems, tagFilters, searchQuery, allTags]);

    // 날짜 포맷 (시간 포함)
    const formatDate = (dateStr: string | undefined) => {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
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
                                <input
                                    type="text"
                                    value={getTagsString(editingItem)}
                                    onChange={(e) => handleTagsChange(e.target.value)}
                                    placeholder="태그1, 태그2, 태그3"
                                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                                />
                                {getTagsString(editingItem) && (
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {getTagsString(editingItem).split(',').map((t, i) => t.trim()).filter(Boolean).map((tag, i) => (
                                            <span key={i} className="px-2 py-1 text-xs rounded-full bg-purple-500/20 text-purple-300">
                                                #{tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* 이미지 URL */}
                            <div>
                                <label className="text-white/50 text-xs uppercase tracking-wider mb-1 block">대표 이미지 URL</label>
                                <input
                                    type="text"
                                    value={editingItem.image || ''}
                                    onChange={(e) => handleEditChange('image', e.target.value)}
                                    placeholder="https://drive.google.com/..."
                                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50"
                                />
                                {editingItem.image && (
                                    <div className="mt-3 rounded-xl overflow-hidden border border-white/10">
                                        <img
                                            src={editingItem.image}
                                            alt="Preview"
                                            className="w-full max-h-48 object-contain bg-black/30"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* 추가 이미지 URLs */}
                            <div>
                                <label className="text-white/50 text-xs uppercase tracking-wider mb-1 block">
                                    추가 이미지 URL (한 줄에 하나씩)
                                </label>
                                <textarea
                                    value={(editingItem as any).additionalImages?.join('\n') || ''}
                                    onChange={(e) => handleEditChange('additionalImages', e.target.value.split('\n').filter(url => url.trim()))}
                                    placeholder="https://drive.google.com/image1&#10;https://drive.google.com/image2"
                                    rows={3}
                                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 resize-none text-sm"
                                />
                                {(editingItem as any).additionalImages?.length > 0 && (
                                    <div className="flex gap-2 mt-2 overflow-x-auto pb-2">
                                        {(editingItem as any).additionalImages.map((url: string, i: number) => (
                                            <img
                                                key={i}
                                                src={url}
                                                alt={`추가 ${i + 1}`}
                                                className="w-16 h-16 object-cover rounded-lg border border-white/10"
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* 외부 링크 */}
                            <div>
                                <label className="text-white/50 text-xs uppercase tracking-wider mb-1 block">
                                    관련 링크 (한 줄에 하나씩: 제목|URL)
                                </label>
                                <textarea
                                    value={(editingItem as any).externalLinks?.map((l: any) => `${l.title}|${l.url}`).join('\n') || ''}
                                    onChange={(e) => {
                                        const links = e.target.value.split('\n').filter(line => line.trim()).map(line => {
                                            const [title, url] = line.split('|');
                                            return { title: title?.trim() || url?.trim() || '', url: url?.trim() || title?.trim() || '' };
                                        });
                                        handleEditChange('externalLinks', links);
                                    }}
                                    placeholder="네이버 블로그|https://blog.naver.com/...&#10;유튜브 영상|https://youtube.com/..."
                                    rows={3}
                                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 resize-none text-sm"
                                />
                                {(editingItem as any).externalLinks?.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {(editingItem as any).externalLinks.map((link: any, i: number) => (
                                            <a
                                                key={i}
                                                href={link.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="px-3 py-1.5 text-xs rounded-full bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition flex items-center gap-1"
                                            >
                                                🔗 {link.title}
                                            </a>
                                        ))}
                                    </div>
                                )}
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
                        <div className="sticky top-0 bg-gradient-to-b from-[#1a1a2e] to-transparent p-6 pb-4">
                            <div className="flex justify-between items-start">
                                <div className="flex-1 pr-4">
                                    <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 leading-tight">
                                        {selectedItem.title}
                                    </h2>
                                    {selectedItem.subtitle && (
                                        <p className="text-blue-300/70 text-sm">{selectedItem.subtitle}</p>
                                    )}
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

                            {/* Tags */}
                            {getTags(selectedItem).length > 0 && (
                                <div className="mt-4 flex flex-col gap-2">
                                    {/* Level 1 Tags (# or No Hash) */}
                                    {getTags(selectedItem).filter(t => !t.startsWith('##')).length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                            {getTags(selectedItem).filter(t => !t.startsWith('##')).map((tag, i) => (
                                                <button
                                                    key={`l1-${i}`}
                                                    onClick={() => {
                                                        setTagFilters(prev => ({ ...prev, [tag]: 'include' }));
                                                        setSelectedItem(null);
                                                    }}
                                                    className="px-3 py-1 text-xs rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition"
                                                >
                                                    {tag.replace(/^#/, '')}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Level 2 Tags (##) */}
                                    {getTags(selectedItem).filter(t => t.startsWith('##') && !t.startsWith('###')).length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                            {getTags(selectedItem).filter(t => t.startsWith('##') && !t.startsWith('###')).map((tag, i) => (
                                                <button
                                                    key={`l2-${i}`}
                                                    onClick={() => {
                                                        setTagFilters(prev => ({ ...prev, [tag]: 'include' }));
                                                        setSelectedItem(null);
                                                    }}
                                                    className="px-3 py-1 text-xs rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition"
                                                >
                                                    {tag.replace(/^##/, '')}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Level 3 Tags (###) */}
                                    {getTags(selectedItem).filter(t => t.startsWith('###')).length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                            {getTags(selectedItem).filter(t => t.startsWith('###')).map((tag, i) => (
                                                <button
                                                    key={`l3-${i}`}
                                                    onClick={() => {
                                                        setTagFilters(prev => ({ ...prev, [tag]: 'include' }));
                                                        setSelectedItem(null);
                                                    }}
                                                    className="px-3 py-1 text-xs rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30 hover:bg-pink-500/30 transition"
                                                >
                                                    {tag.replace(/^###/, '')}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Content */}
                        <div className="px-6 pb-6">
                            {/* Layout with floating image on left */}
                            <div className={`${selectedItem.image && !selectedItem.image.includes('unsplash.com') ? 'md:flex md:gap-6' : ''}`}>
                                {/* Floating Image - Left side on desktop */}
                                {selectedItem.image && !selectedItem.image.includes('unsplash.com') && (
                                    <div className="md:sticky md:top-24 md:self-start mb-4 md:mb-0 md:flex-shrink-0">
                                        <div className="relative group/img">
                                            <div className="md:w-96 lg:w-[480px] overflow-hidden rounded-xl border border-white/10 bg-black/30 shadow-lg hover:shadow-xl hover:shadow-blue-500/10 transition-all duration-300">
                                                <img
                                                    src={selectedItem.image}
                                                    alt={selectedItem.title}
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
                            {(selectedItem as any).externalLinks?.length > 0 && (
                                <div className="mt-6 pt-4 border-t border-white/10">
                                    <h5 className="text-white/50 text-xs uppercase tracking-wider mb-3">🔗 관련 링크</h5>
                                    <div className="flex flex-wrap gap-2">
                                        {(selectedItem as any).externalLinks.map((link: any, i: number) => (
                                            <a
                                                key={i}
                                                href={link.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-300 hover:from-blue-500/30 hover:to-purple-500/30 transition-all flex items-center gap-2 text-sm"
                                            >
                                                🔗 {link.title}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}

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
                                            onBlur={async () => {
                                                if (newMemoText.trim() && selectedItem) {
                                                    setSavingMemo(true);
                                                    try {
                                                        await addDoc(collection(db, 'updates', selectedItem.id, 'memos'), {
                                                            text: newMemoText.trim(),
                                                            userId: currentUser.uid,
                                                            userName: currentUser.displayName || '익명',
                                                            userPhoto: currentUser.photoURL || '',
                                                            createdAt: serverTimestamp(),
                                                            updatedAt: serverTimestamp()
                                                        });
                                                        setNewMemoText('');
                                                    } catch (error) {
                                                        console.error('Auto-save memo error:', error);
                                                    } finally {
                                                        setSavingMemo(false);
                                                    }
                                                }
                                            }}
                                            placeholder="메모를 입력하고 바깥을 클릭하면 자동 저장됩니다..."
                                            rows={2}
                                            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 resize-none text-sm"
                                        />
                                        <p className="text-white/30 text-xs mt-1 flex items-center gap-1">
                                            {savingMemo ? '⚙️ 저장 중...' : '💡 입력 후 바깥 클릭 시 자동 저장'}
                                        </p>
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
                                                                        text: memo.text
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
            <div className="p-6 md:p-10 pt-24 md:pt-28">
                <div className="max-w-6xl mx-auto">
                    {/* Header */}
                    <div className="mb-6 flex items-center justify-between">
                        <div>
                            <h2 className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 mb-3">
                                최근 소식
                            </h2>
                            <p className="text-white/40 text-sm">iPhone에서 보낸 메모와 업데이트</p>
                        </div>
                        <div className="flex items-center gap-3">
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

                    {/* Tag Cloud */}
                    {allTags.length > 0 && (
                        <div className="mb-6 p-4 bg-white/5 rounded-2xl border border-white/10">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-white/50 text-xs uppercase tracking-wider">태그</span>
                                <span className="text-white/30 text-[10px]">(클릭: 포함 → 제외 → 해제)</span>
                                {Object.keys(tagFilters).length > 0 && (
                                    <button
                                        onClick={() => setTagFilters({})}
                                        className="text-xs text-blue-400 hover:text-blue-300 ml-auto"
                                    >
                                        필터 초기화
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-col gap-6">
                                {/* Level 1 Tags (# or No Hash) */}
                                {allTags.filter(t => !t.tag.startsWith('##')).length > 0 && (
                                    <div className="flex flex-col gap-3">
                                        {/* Optional Label if needed, or just the group */}
                                        <div className="flex flex-wrap gap-2">
                                            {allTags.filter(t => !t.tag.startsWith('##')).map(({ tag }) => {
                                                const filterMode = tagFilters[tag];
                                                const dynamicCount = dynamicTagCounts[tag] || 0;
                                                const isZeroCount = dynamicCount === 0 && Object.keys(tagFilters).length > 0;
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
                                                        className={`px-3 py-1.5 text-xs rounded-full transition-all flex items-center gap-1 ${filterMode === 'include'
                                                            ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg'
                                                            : filterMode === 'exclude'
                                                                ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white shadow-lg line-through'
                                                                : isZeroCount
                                                                    ? 'bg-white/5 text-blue-200/30 hover:bg-white/10 hover:text-blue-200/50'
                                                                    : 'bg-white/5 text-blue-200/60 border border-blue-500/10 hover:border-blue-500/30'
                                                            }`}
                                                    >
                                                        {filterMode === 'include' && <span>✓</span>}
                                                        {filterMode === 'exclude' && <span>✗</span>}
                                                        {tag.replace(/^#/, '')}
                                                        <span className={`ml-1 text-[10px] ${isZeroCount ? 'opacity-30' : 'opacity-60'}`}>
                                                            {dynamicCount}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Divider if Level 2 exists */}
                                {allTags.filter(t => t.tag.startsWith('##') && !t.tag.startsWith('###')).length > 0 &&
                                    allTags.filter(t => !t.tag.startsWith('##')).length > 0 && (
                                        <div className="w-full h-px bg-white/20 my-4" />
                                    )}

                                {/* Level 2 Tags (##) */}
                                {allTags.filter(t => t.tag.startsWith('##') && !t.tag.startsWith('###')).length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {allTags.filter(t => t.tag.startsWith('##') && !t.tag.startsWith('###')).map(({ tag }) => {
                                            const filterMode = tagFilters[tag];
                                            const dynamicCount = dynamicTagCounts[tag] || 0;
                                            const isZeroCount = dynamicCount === 0 && Object.keys(tagFilters).length > 0;
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
                                                    className={`px-3 py-1.5 text-xs rounded-full transition-all flex items-center gap-1 ${filterMode === 'include'
                                                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                                                        : filterMode === 'exclude'
                                                            ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white shadow-lg line-through'
                                                            : isZeroCount
                                                                ? 'bg-white/5 text-purple-200/30 hover:bg-white/10 hover:text-purple-200/50'
                                                                : 'bg-white/5 text-purple-200/60 border border-purple-500/10 hover:border-purple-500/30'
                                                        }`}
                                                >
                                                    {filterMode === 'include' && <span>✓</span>}
                                                    {filterMode === 'exclude' && <span>✗</span>}
                                                    {tag.replace(/^##/, '')}
                                                    <span className={`ml-1 text-[10px] ${isZeroCount ? 'opacity-30' : 'opacity-60'}`}>
                                                        {dynamicCount}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Divider if Level 3 exists */}
                                {allTags.filter(t => t.tag.startsWith('###')).length > 0 &&
                                    (allTags.filter(t => !t.tag.startsWith('###')).length > 0) && (
                                        <div className="w-full h-px bg-white/20 my-4" />
                                    )}

                                {/* Level 3 Tags (###) */}
                                {allTags.filter(t => t.tag.startsWith('###')).length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {allTags.filter(t => t.tag.startsWith('###')).map(({ tag }) => {
                                            const filterMode = tagFilters[tag];
                                            const dynamicCount = dynamicTagCounts[tag] || 0;
                                            const isZeroCount = dynamicCount === 0 && Object.keys(tagFilters).length > 0;
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
                                                    className={`px-3 py-1.5 text-xs rounded-full transition-all flex items-center gap-1 ${filterMode === 'include'
                                                        ? 'bg-gradient-to-r from-pink-500 to-yellow-500 text-white shadow-lg'
                                                        : filterMode === 'exclude'
                                                            ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white shadow-lg line-through'
                                                            : isZeroCount
                                                                ? 'bg-white/5 text-pink-200/30 hover:bg-white/10 hover:text-pink-200/50'
                                                                : 'bg-white/5 text-pink-200/60 border border-pink-500/10 hover:border-pink-500/30'
                                                        }`}
                                                >
                                                    {filterMode === 'include' && <span>✓</span>}
                                                    {filterMode === 'exclude' && <span>✗</span>}
                                                    {tag.replace(/^###/, '')}
                                                    <span className={`ml-1 text-[10px] ${isZeroCount ? 'opacity-30' : 'opacity-60'}`}>
                                                        {dynamicCount}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Search Bar */}
                    <div className="mb-8">
                        <div className="relative max-w-md">
                            <input
                                type="text"
                                placeholder="검색..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full px-5 py-3 pl-12 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all"
                            />
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30">🔍</span>
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
                                    {item.image && !item.image.includes('unsplash.com') && (
                                        <div className="relative w-full aspect-video md:h-48 mb-4 overflow-hidden rounded-xl bg-black/20">
                                            <img
                                                src={item.image}
                                                alt={item.title}
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
                                        {item.subtitle || item.desc?.slice(0, 80)}
                                    </p>

                                    {/* Show text preview only if no image, or if short */}
                                    <p className="text-white/30 text-xs line-clamp-3 mb-4 leading-relaxed font-light">
                                        {getContent(item).slice(0, 100)}...
                                    </p>

                                    {/* Tags Preview - Grouped by Level */}
                                    {getTags(item).length > 0 && (
                                        <div className="flex flex-col gap-2 mb-4">
                                            {/* Level 1 (#) */}
                                            {getTags(item).filter(t => !t.startsWith('##')).length > 0 && (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {getTags(item).filter(t => !t.startsWith('##')).slice(0, 5).map((tag, i) => (
                                                        <span
                                                            key={`l1-${i}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setTagFilters(prev => ({ ...prev, [tag]: 'include' }));
                                                            }}
                                                            className="px-2 py-0.5 text-[10px] rounded-full bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 cursor-pointer transition border border-blue-500/10"
                                                        >
                                                            #{tag.replace(/^#/, '')}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Level 2 (##) */}
                                            {getTags(item).filter(t => t.startsWith('##') && !t.startsWith('###')).length > 0 && (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {getTags(item).filter(t => t.startsWith('##') && !t.startsWith('###')).slice(0, 5).map((tag, i) => (
                                                        <span
                                                            key={`l2-${i}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setTagFilters(prev => ({ ...prev, [tag]: 'include' }));
                                                            }}
                                                            className="px-2 py-0.5 text-[10px] rounded-full bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 cursor-pointer transition border border-purple-500/10"
                                                        >
                                                            #{tag.replace(/^##/, '')}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Level 3 (###) */}
                                            {getTags(item).filter(t => t.startsWith('###')).length > 0 && (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {getTags(item).filter(t => t.startsWith('###')).slice(0, 5).map((tag, i) => (
                                                        <span
                                                            key={`l3-${i}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setTagFilters(prev => ({ ...prev, [tag]: 'include' }));
                                                            }}
                                                            className="px-2 py-0.5 text-[10px] rounded-full bg-pink-500/10 text-pink-300 hover:bg-pink-500/20 cursor-pointer transition border border-pink-500/10"
                                                        >
                                                            #{tag.replace(/^###/, '')}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
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
        </div>
    );
};

export default RecentUpdates;
