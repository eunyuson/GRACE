import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface UpdateItem {
    id: string;
    title: string;
    subtitle: string;
    desc: string;
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
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [allTags, setAllTags] = useState<{ tag: string; count: number }[]>([]);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

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
                    const dateA = a.createdAt?.toDate?.() || new Date(0);
                    const dateB = b.createdAt?.toDate?.() || new Date(0);
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
                    .sort((a, b) => b.count - a.count);
                setAllTags(sortedTags);

                setLoading(false);
            },
            (error) => {
                console.error('Firestore error:', error);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, []);

    // 태그 추출 (# 제거)
    const getTags = (item: UpdateItem): string[] => {
        const tagSection = item.content?.find(c => c.keyword === 'TAGS');
        if (tagSection?.text) {
            return tagSection.text
                .split(',')
                .map(t => t.trim().replace(/^#/, ''))  // 앞의 # 제거
                .filter(Boolean);
        }
        return [];
    };

    // 삭제 함수
    const handleDelete = async (id: string) => {
        try {
            await deleteDoc(doc(db, 'updates', id));
            setShowDeleteConfirm(null);
            setSelectedItem(null);
            setEditingItem(null);
        } catch (error) {
            console.error('Delete error:', error);
            alert('삭제 실패');
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
                content: editingItem.content
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
    const handleEditChange = (field: string, value: string) => {
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

    // 검색 + 태그 필터링 (복수 태그 AND 조건)
    const filteredItems = items.filter(item => {
        if (selectedTags.length > 0) {
            const itemTags = getTags(item);
            // 선택된 모든 태그가 아이템에 포함되어야 함
            if (!selectedTags.every(tag => itemTags.includes(tag))) return false;
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

    // 날짜 포맷
    const formatDate = (dateStr: string | undefined) => {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            return new Intl.DateTimeFormat('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
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

                            {/* 버튼 */}
                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => setShowDeleteConfirm(editingItem.id)}
                                    className="px-6 py-3 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition"
                                >
                                    🗑️ 삭제
                                </button>
                                <button
                                    onClick={() => setEditingItem(null)}
                                    className="flex-1 py-3 rounded-xl bg-white/10 text-white/70 hover:bg-white/20 transition"
                                >
                                    취소
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:opacity-90 transition disabled:opacity-50"
                                >
                                    {saving ? '저장 중...' : '💾 저장'}
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
                        className="bg-gradient-to-br from-[#1a1a2e] to-[#16213e] border border-white/10 rounded-3xl max-w-2xl w-full max-h-[85vh] overflow-auto shadow-2xl"
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
                                <div className="flex flex-wrap gap-2 mt-4">
                                    {getTags(selectedItem).map((tag, i) => (
                                        <button
                                            key={i}
                                            onClick={() => {
                                                setSelectedTags(prev => prev.includes(tag) ? prev : [...prev, tag]);
                                                setSelectedItem(null);
                                            }}
                                            className="px-3 py-1 text-xs rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition"
                                        >
                                            #{tag}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Content */}
                        <div className="px-6 pb-6">
                            <div className="text-white/80 text-base leading-relaxed whitespace-pre-wrap">
                                {getContent(selectedItem)}
                            </div>

                            {selectedItem.content?.[0]?.date && (
                                <div className="mt-8 pt-4 border-t border-white/10">
                                    <p className="text-white/40 text-sm flex items-center gap-2">
                                        <span>📅</span>
                                        {formatDate(selectedItem.content[0].date)}
                                    </p>
                                </div>
                            )}
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
                        {isAdmin && (
                            <span className="px-3 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-full">
                                👑 관리자 모드
                            </span>
                        )}
                    </div>

                    {/* Tag Cloud */}
                    {allTags.length > 0 && (
                        <div className="mb-6 p-4 bg-white/5 rounded-2xl border border-white/10">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-white/50 text-xs uppercase tracking-wider">태그</span>
                                {selectedTags.length > 0 && (
                                    <button
                                        onClick={() => setSelectedTags([])}
                                        className="text-xs text-blue-400 hover:text-blue-300"
                                    >
                                        전체 보기
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {allTags.map(({ tag, count }) => (
                                    <button
                                        key={tag}
                                        onClick={() => setSelectedTags(prev =>
                                            prev.includes(tag)
                                                ? prev.filter(t => t !== tag)
                                                : [...prev, tag]
                                        )}
                                        className={`px-3 py-1.5 text-xs rounded-full transition-all ${selectedTags.includes(tag)
                                            ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg'
                                            : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                                            }`}
                                    >
                                        #{tag}
                                        <span className="ml-1.5 text-[10px] opacity-60">{count}</span>
                                    </button>
                                ))}
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
                    {selectedTags.length > 0 && (
                        <div className="mb-6 flex flex-wrap items-center gap-2">
                            <span className="text-white/50 text-sm">필터:</span>
                            {selectedTags.map(tag => (
                                <span key={tag} className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full text-sm flex items-center gap-2">
                                    #{tag}
                                    <button
                                        onClick={() => setSelectedTags(prev => prev.filter(t => t !== tag))}
                                        className="hover:text-white"
                                    >×</button>
                                </span>
                            ))}
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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
                        {filteredItems.map((item, index) => (
                            <div
                                key={item.id}
                                className="group relative bg-gradient-to-br from-white/5 to-white/[0.02] hover:from-white/10 hover:to-white/5 border border-white/10 hover:border-blue-500/30 rounded-2xl p-6 cursor-pointer transition-all duration-500 hover:scale-[1.02] hover:shadow-xl hover:shadow-blue-500/10"
                                style={{ animationDelay: `${index * 50}ms` }}
                            >
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
                                    {/* Accent Line */}
                                    <div className="absolute top-0 left-6 right-6 h-[2px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                                    <h3 className="text-white font-semibold text-lg mb-3 group-hover:text-blue-300 transition-colors line-clamp-2">
                                        {item.title}
                                    </h3>

                                    <p className="text-white/50 text-sm mb-4 line-clamp-2">
                                        {item.subtitle || item.desc?.slice(0, 80)}
                                    </p>

                                    <p className="text-white/30 text-xs line-clamp-3 mb-4">
                                        {getContent(item).slice(0, 120)}...
                                    </p>

                                    {/* Tags Preview */}
                                    {getTags(item).length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mb-4">
                                            {getTags(item).slice(0, 3).map((tag, i) => (
                                                <span
                                                    key={i}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedTags(prev => prev.includes(tag) ? prev : [...prev, tag]);
                                                    }}
                                                    className="px-2 py-0.5 text-[10px] rounded-full bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 cursor-pointer transition"
                                                >
                                                    #{tag}
                                                </span>
                                            ))}
                                            {getTags(item).length > 3 && (
                                                <span className="text-white/30 text-[10px]">+{getTags(item).length - 3}</span>
                                            )}
                                        </div>
                                    )}

                                    {/* Date */}
                                    {item.content?.[0]?.date && (
                                        <div className="flex items-center gap-2 text-white/30 text-[11px]">
                                            <span>📅</span>
                                            <span>{formatDate(item.content[0].date)}</span>
                                        </div>
                                    )}

                                    {/* Hover Arrow */}
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
