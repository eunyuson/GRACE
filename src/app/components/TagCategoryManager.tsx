'use client';

import React, { useState, useEffect } from 'react';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// 태그 카테고리 정의
export const TAG_CATEGORIES = {
    category: { label: '📂 범주/소속', order: 1, color: 'from-blue-500/20 to-cyan-500/20', textColor: 'text-blue-300', borderColor: 'border-blue-500/30' },
    christian: { label: '✝️ 기독교 핵심', order: 2, color: 'from-purple-500/20 to-pink-500/20', textColor: 'text-purple-300', borderColor: 'border-purple-500/30' },
    emotion: { label: '💭 감정', order: 3, color: 'from-green-500/20 to-emerald-500/20', textColor: 'text-green-300', borderColor: 'border-green-500/30' },
    uncategorized: { label: '🏷️ 미분류', order: 4, color: 'from-gray-500/20 to-gray-600/20', textColor: 'text-gray-300', borderColor: 'border-gray-500/30' }
};

export type TagCategoryType = keyof typeof TAG_CATEGORIES;

interface TagCategoryManagerProps {
    allTags: { tag: string; count: number }[];
    isAdmin: boolean;
    onClose: () => void;
}

export interface TagMapping {
    [tag: string]: TagCategoryType;
}

export default function TagCategoryManager({ allTags, isAdmin, onClose }: TagCategoryManagerProps) {
    const [tagMapping, setTagMapping] = useState<TagMapping>({});
    const [draggedTag, setDraggedTag] = useState<string | null>(null);
    const [dragOverCategory, setDragOverCategory] = useState<TagCategoryType | null>(null);
    const [saveStatus, setSaveStatus] = useState('');

    // Firebase에서 태그 매핑 로드
    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'settings', 'tagCategories'), (snapshot) => {
            if (snapshot.exists()) {
                setTagMapping(snapshot.data() as TagMapping);
            }
        });
        return () => unsubscribe();
    }, []);

    // 태그를 카테고리별로 그룹화
    const getTagsByCategory = (category: TagCategoryType) => {
        return allTags.filter(({ tag }) => {
            const mappedCategory = tagMapping[tag] || 'uncategorized';
            return mappedCategory === category;
        });
    };

    // 드래그 시작
    const handleDragStart = (e: React.DragEvent, tag: string) => {
        if (!isAdmin) return;
        setDraggedTag(tag);
        e.dataTransfer.effectAllowed = 'move';
    };

    // 드래그 오버
    const handleDragOver = (e: React.DragEvent, category: TagCategoryType) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverCategory(category);
    };

    // 드래그 종료
    const handleDragLeave = () => {
        setDragOverCategory(null);
    };

    // 드롭 & 자동저장
    const handleDrop = async (e: React.DragEvent, category: TagCategoryType) => {
        e.preventDefault();
        if (!draggedTag || !isAdmin) return;

        const newMapping = { ...tagMapping, [draggedTag]: category };
        setTagMapping(newMapping);
        setDraggedTag(null);
        setDragOverCategory(null);

        // Firebase에 자동 저장
        setSaveStatus('저장 중...');
        try {
            await setDoc(doc(db, 'settings', 'tagCategories'), newMapping);
            setSaveStatus('✓ 저장됨');
            setTimeout(() => setSaveStatus(''), 2000);
        } catch (error) {
            console.error('Save error:', error);
            setSaveStatus('저장 실패');
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="bg-gradient-to-br from-[#1a1a2e] to-[#16213e] border border-white/10 rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-auto shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="sticky top-0 bg-gradient-to-b from-[#1a1a2e] via-[#1a1a2e] to-transparent p-6 pb-4 z-10">
                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                                🏷️ 태그 카테고리 관리
                            </h2>
                            <p className="text-white/50 text-sm mt-1">
                                {isAdmin ? '태그를 드래그하여 카테고리에 분류하세요' : '태그 분류 현황'}
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            {saveStatus && (
                                <span className={`text-sm px-3 py-1 rounded-full ${saveStatus.includes('✓') ? 'bg-green-500/20 text-green-400' :
                                        saveStatus.includes('실패') ? 'bg-red-500/20 text-red-400' :
                                            'bg-white/10 text-white/50'
                                    }`}>
                                    {saveStatus}
                                </span>
                            )}
                            <button
                                onClick={onClose}
                                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                </div>

                {/* Category Sections */}
                <div className="p-6 pt-2 space-y-4">
                    {(Object.keys(TAG_CATEGORIES) as TagCategoryType[])
                        .sort((a, b) => TAG_CATEGORIES[a].order - TAG_CATEGORIES[b].order)
                        .map((categoryKey) => {
                            const category = TAG_CATEGORIES[categoryKey];
                            const tags = getTagsByCategory(categoryKey);
                            const isDropTarget = dragOverCategory === categoryKey;

                            return (
                                <div
                                    key={categoryKey}
                                    onDragOver={(e) => handleDragOver(e, categoryKey)}
                                    onDragLeave={handleDragLeave}
                                    onDrop={(e) => handleDrop(e, categoryKey)}
                                    className={`
                                        p-5 rounded-2xl border-2 transition-all duration-300
                                        ${isDropTarget
                                            ? 'border-white/50 bg-white/10 scale-[1.01] shadow-lg shadow-white/5'
                                            : `border-transparent bg-gradient-to-r ${category.color}`
                                        }
                                    `}
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className={`font-semibold text-lg ${category.textColor}`}>
                                            {category.label}
                                        </h3>
                                        <span className={`px-2.5 py-1 text-xs rounded-full bg-white/10 ${category.textColor}`}>
                                            {tags.length}개
                                        </span>
                                    </div>

                                    <div className="flex flex-wrap gap-2 min-h-[48px]">
                                        {tags.length === 0 ? (
                                            <p className="text-white/25 text-sm py-2 italic">
                                                {isAdmin ? '여기로 태그를 드래그하세요' : '태그 없음'}
                                            </p>
                                        ) : (
                                            tags.map(({ tag, count }) => (
                                                <div
                                                    key={tag}
                                                    draggable={isAdmin}
                                                    onDragStart={(e) => handleDragStart(e, tag)}
                                                    onDragEnd={() => setDraggedTag(null)}
                                                    className={`
                                                        px-4 py-2 rounded-xl text-sm font-medium
                                                        bg-white/10 border ${category.borderColor}
                                                        ${isAdmin ? 'cursor-grab active:cursor-grabbing hover:bg-white/20 hover:scale-105 hover:shadow-lg' : ''}
                                                        ${draggedTag === tag ? 'opacity-40 scale-95' : 'opacity-100'}
                                                        transition-all duration-200
                                                    `}
                                                >
                                                    <span className={category.textColor}>#{tag}</span>
                                                    <span className="ml-2 text-white/40 text-xs">{count}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 p-6 pt-4 bg-gradient-to-t from-[#16213e] via-[#16213e] to-transparent">
                    <div className="flex justify-between items-center">
                        <p className="text-white/40 text-xs flex items-center gap-2">
                            💡 드래그 후 놓으면 자동 저장됩니다
                        </p>
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-medium hover:opacity-90 transition shadow-lg shadow-purple-500/20"
                        >
                            완료
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
