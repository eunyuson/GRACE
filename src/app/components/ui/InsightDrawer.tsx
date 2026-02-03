'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Pin, PinOff, Plus, Edit3, ChevronRight, Book, MessageCircle, Lightbulb, Eye, EyeOff, Sparkles, Check, XCircle, Loader2, Search, Trash2, Save } from 'lucide-react';
import { collection, collectionGroup, doc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../../firebase';
import { ConceptCard, SequenceItem, ResponseSnippet, SequenceData, AIConclusionSuggestion, AIScriptureSuggestion } from '../../types/questionBridge';
import { generateReactionSnippets, generateConclusionCandidates, recommendScriptures, isAIEnabled } from '../../services/aiService';

// 뉴스 아이템 타입 (RecentUpdates에서 가져옴)
interface NewsItem {
    id: string;
    title: string;
    subtitle?: string;
    content?: string;
    images?: string[];
    createdAt: any;
}

// 묵상 아이템 타입 (MyReflections에서 가져옴)
interface ReflectionItem {
    id: string;
    parentTitle?: string;
    content: string;
    text?: string; // 일부 묵상은 text 필드 사용
    bibleRef?: string;
    verse?: string;
    createdAt: any;
    imageUrl?: string; // 묵상 이미지
    parentImage?: string; // 부모(설교 등) 이미지
    _path?: string; // 문서 경로 (서브컬렉션 참조용)
}

interface InsightDrawerProps {
    concept: ConceptCard;
    isOpen: boolean;
    onClose: () => void;
    onUpdate: (updatedConcept: ConceptCard) => void;
    isNewMode?: boolean; // 새 카드 생성 모드
    isEditMode?: boolean; // 기존 카드 편집 모드
    onCreateNew?: (newConcept: ConceptCard) => Promise<ConceptCard | null>; // 새 카드 생성 콜백
    currentUser?: User | null;
}

export const InsightDrawer: React.FC<InsightDrawerProps> = ({
    concept,
    isOpen,
    onClose,
    onUpdate,
    isNewMode = false,
    isEditMode = false,
    onCreateNew,
    currentUser
}) => {
    // 로컬 상태
    const [localConcept, setLocalConcept] = useState<ConceptCard>(concept);

    // Concept prop이 변경되면 localConcept 동기화 (저장 후 확실한 상태 반영)
    useEffect(() => {
        // 편집 중이 아닐 때만 동기화하여 덮어쓰기 방지
        // 또는 변경된 concept의 ID가 다르면(다른 카드 열림) 무조건 동기화
        if (localConcept.id !== concept.id) {
            setLocalConcept(concept);
        } else if (!isEditMode && isViewMode) {
            setLocalConcept(concept);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [concept]);
    const [newsItems, setNewsItems] = useState<Map<string, NewsItem>>(new Map());
    const [reflectionItems, setReflectionItems] = useState<Map<string, ReflectionItem>>(new Map());
    const [allReflections, setAllReflections] = useState<ReflectionItem[]>([]);
    const [allNews, setAllNews] = useState<NewsItem[]>([]);
    const [newResponse, setNewResponse] = useState('');
    const [isAddingResponse, setIsAddingResponse] = useState(false);
    const [loading, setLoading] = useState(true);

    // 읽기/편집 모드: 새 카드 모드 또는 편집 모드면 편집 모드로 시작, 아니면 읽기 모드로 시작
    const [isViewMode, setIsViewMode] = useState(!isNewMode && !isEditMode);

    // isNewMode, isEditMode, isOpen이 변경되면 isViewMode 업데이트
    useEffect(() => {
        if (isOpen) {
            if (isNewMode || isEditMode) {
                setIsViewMode(false);
            } else {
                setIsViewMode(true);
            }
        }
    }, [isNewMode, isEditMode, isOpen]);

    const [showNewsPicker, setShowNewsPicker] = useState(false);
    const [showReflectionPicker, setShowReflectionPicker] = useState(false);
    const [newsSearchQuery, setNewsSearchQuery] = useState('');
    const [reflectionSearchQuery, setReflectionSearchQuery] = useState('');


    // AI 상태
    const [aiReactionsLoading, setAiReactionsLoading] = useState(false);
    const [aiConclusionsLoading, setAiConclusionsLoading] = useState(false);
    const [aiScripturesLoading, setAiScripturesLoading] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);

    // 시퀀스 초기화
    // 시퀀스 초기화 (데이터 무결성 보장)
    // 시퀀스 초기화 (데이터 무결성 보장)
    const getSequence = (): SequenceData => {
        const s = localConcept.sequence;
        return {
            ...(s || {}), // 기존 데이터 유지 (undefined 인 경우 빈 객체)
            recent: s?.recent || [],
            responses: s?.responses || [],
            aStatement: s?.aStatement || '',
            scriptureSupport: s?.scriptureSupport || [],
            aiReactionSuggestions: s?.aiReactionSuggestions || [],
            aiConclusionSuggestions: s?.aiConclusionSuggestions || [],
            aiScriptureSuggestions: s?.aiScriptureSuggestions || []
        } as SequenceData;
    };

    // 연결된 뉴스/묵상 데이터 로드 + 전체 목록 로드
    useEffect(() => {
        const loadLinkedItems = async (loadedReflections: ReflectionItem[] = []) => {
            setLoading(true);
            const sequence = getSequence();

            // 연결된 뉴스 로드
            const newsMap = new Map<string, NewsItem>();
            for (const item of sequence.recent) {
                if (item.sourceType === 'news') {
                    try {
                        const docRef = doc(db, 'updates', item.sourceId);
                        const docSnap = await getDoc(docRef);
                        if (docSnap.exists()) {
                            const data = docSnap.data();
                            // RecentUpdates의 데이터 구조(image, additionalImages)를 NewsItem의 images 배열로 매핑
                            const images = [data.image, ...(data.additionalImages || [])].filter(Boolean);

                            newsMap.set(item.sourceId, {
                                id: item.sourceId,
                                ...data,
                                images: images.length > 0 ? images : undefined,
                                content: typeof data.content === 'string' ? data.content : JSON.stringify(data.content || '')
                            } as NewsItem);
                        }
                    } catch (e) {
                        console.error('Error loading news:', e);
                    }
                }
            }
            setNewsItems(newsMap);

            // 연결된 묵상 로드
            const reflectionMap = new Map<string, ReflectionItem>();
            for (const item of sequence.scriptureSupport) {
                if (item.sourceType === 'reflection') {
                    try {
                        let docRef;
                        let docSnap = null;
                        let foundDoc = false;

                        // 1. sourcePath가 있으면 해당 경로 사용 (서브컬렉션 지원)
                        if (item.sourcePath) {
                            docRef = doc(db, item.sourcePath);
                            docSnap = await getDoc(docRef);
                            foundDoc = docSnap.exists();
                        }

                        // 2. 경로로 못 찾으면 loadedReflections에서 찾기 (서브컬렉션 데이터 사용)
                        if (!foundDoc) {
                            const foundInLoaded = loadedReflections.find(r => r.id === item.sourceId);
                            if (foundInLoaded) {
                                reflectionMap.set(item.sourceId, foundInLoaded);
                                console.log(`[InsightDrawer] Found reflection ${item.sourceId} in loaded list`);
                                continue; // 다음 항목으로
                            }
                        }

                        // 3. 문서를 찾았으면 데이터 추출
                        if (foundDoc && docSnap) {
                            const data = docSnap.data();
                            if (data) {
                                const content = typeof data.content === 'string' ? data.content :
                                    typeof data.text === 'string' ? data.text :
                                        JSON.stringify(data.content || data.text || '');

                                reflectionMap.set(item.sourceId, {
                                    id: item.sourceId,
                                    ...data,
                                    content,
                                    _path: item.sourcePath
                                } as ReflectionItem);
                            }
                        } else {
                            console.warn(`Reflection not found: ${item.sourceId}, path: ${item.sourcePath}`);
                        }
                    } catch (e: any) {
                        console.error('Error loading reflection:', e);
                        // 에러 발생 시 loadedReflections에서라도 찾기
                        const foundInLoaded = loadedReflections.find(r => r.id === item.sourceId);
                        if (foundInLoaded) reflectionMap.set(item.sourceId, foundInLoaded);
                    }
                }
            }
            setReflectionItems(reflectionMap);

            setLoading(false);
        };

        // 전체 뉴스 목록 로드
        const loadAllNews = async () => {
            try {
                const q = query(collection(db, 'updates'), orderBy('createdAt', 'desc'), limit(50));
                const snapshot = await getDocs(q);
                const items = snapshot.docs.map(doc => {
                    const data = doc.data();
                    // RecentUpdates와 호환되도록 image 필드 매핑
                    // 빈 문자열과 공백만 있는 URL 제거
                    const images = [data.image, ...(data.additionalImages || [])]
                        .filter(url => url && typeof url === 'string' && url.trim().length > 0);

                    return {
                        id: doc.id,
                        ...data,
                        images: images.length > 0 ? images : undefined,
                        content: typeof data.content === 'string' ? data.content : JSON.stringify(data.content || '')
                    } as NewsItem;
                });
                setAllNews(items);
            } catch (e) {
                console.error('Error loading all news:', e);
            }
        };

        // 전체 묵상 목록 로드 (collectionGroup으로 모든 서브컬렉션에서 가져오기) - 반환값 포함
        const loadAllReflections = async (): Promise<ReflectionItem[]> => {
            try {
                // collectionGroup을 사용하여 모든 memos 서브컬렉션에서 가져오기
                // users/{uid}/memos, gallery/{id}/memos, updates/{id}/memos 등
                // 참고: Firebase 인덱스 없이 작동하도록 orderBy 제거, 클라이언트에서 정렬
                const q = query(collectionGroup(db, 'memos'), limit(200));
                const snapshot = await getDocs(q);
                const items = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        // text 또는 content 필드 지원 (문자열 보장)
                        content: typeof data.content === 'string' ? data.content :
                            typeof data.text === 'string' ? data.text :
                                JSON.stringify(data.content || data.text || ''),
                        imageUrl: data.imageUrl,
                        parentImage: data.parentImage,
                        _path: doc.ref.path
                    } as ReflectionItem;
                });

                // 클라이언트에서 createdAt 기준 내림차순 정렬
                items.sort((a, b) => {
                    const aTime = a.createdAt?.toDate?.() || new Date(0);
                    const bTime = b.createdAt?.toDate?.() || new Date(0);
                    return bTime.getTime() - aTime.getTime();
                });

                setAllReflections(items);
                console.log('[InsightDrawer] Loaded reflections:', items.length);
                return items;
            } catch (e: any) {
                console.error('Error loading all reflections:', e);
                // 인덱스 오류 시 대체 방법 시도
                if (e.code === 'failed-precondition') {
                    console.warn('인덱스 오류. 대체 방법으로 시도합니다...');
                    try {
                        // 인덱스 없이도 가능한 단순 쿼리
                        const simpleQ = query(collectionGroup(db, 'memos'));
                        const snapshot = await getDocs(simpleQ);
                        const items = snapshot.docs.map(doc => {
                            const data = doc.data();
                            return {
                                id: doc.id,
                                ...data,
                                content: typeof data.content === 'string' ? data.content :
                                    typeof data.text === 'string' ? data.text :
                                        JSON.stringify(data.content || data.text || ''),
                                imageUrl: data.imageUrl,
                                parentImage: data.parentImage,
                                _path: doc.ref.path
                            } as ReflectionItem;
                        });
                        items.sort((a, b) => {
                            const aTime = a.createdAt?.toDate?.() || new Date(0);
                            const bTime = b.createdAt?.toDate?.() || new Date(0);
                            return bTime.getTime() - aTime.getTime();
                        });
                        setAllReflections(items.slice(0, 100));
                        console.log('[InsightDrawer] Fallback loaded reflections:', items.length);
                        return items.slice(0, 100);
                    } catch (fallbackError) {
                        console.error('Fallback also failed:', fallbackError);
                        return [];
                    }
                }
                return [];
            }
        };

        if (isOpen) {
            // 먼저 전체 목록을 로드한 후 연결된 항목 로드 (fallback 로직에서 allReflections 사용을 위해)
            const loadData = async () => {
                await loadAllNews();
                const loadedReflections = await loadAllReflections();
                await loadLinkedItems(loadedReflections);
            };
            loadData();
        }
    }, [isOpen, concept]); // concept 전체를 의존성으로 추가하여 Firestore에서 로드된 데이터 반영

    // 뉴스 연결 추가
    const handleAddNewsLink = (newsId: string) => {
        const sequence = getSequence();

        // 이미 연결되어 있는지 확인
        if (sequence.recent.some(item => item.sourceId === newsId)) {
            return;
        }

        const newItem: SequenceItem = {
            sourceType: 'news',
            sourceId: newsId,
            pinned: false,
            confidence: 1.0,
            sourcePath: undefined,
            addedAt: Timestamp.now()
        };

        const updated = {
            ...localConcept,
            sequence: {
                ...sequence,
                recent: [...sequence.recent, newItem]
            }
        };

        // newsItems에도 추가
        const newsItem = allNews.find(n => n.id === newsId);
        if (newsItem) {
            setNewsItems(prev => new Map(prev).set(newsId, newsItem));
        }

        setLocalConcept(updated);
        saveToFirestore(updated);
        setShowNewsPicker(false);
        setNewsSearchQuery('');
    };

    // 뉴스 연결 해제
    const handleRemoveNewsLink = (newsId: string) => {
        const sequence = getSequence();
        const updated = {
            ...localConcept,
            sequence: {
                ...sequence,
                recent: sequence.recent.filter(item => item.sourceId !== newsId)
            }
        };
        setLocalConcept(updated);
        saveToFirestore(updated);
    };

    // 묵상 연결 추가
    const handleAddReflectionLink = (reflectionId: string) => {
        const sequence = getSequence();

        // 이미 연결되어 있는지 확인
        if (sequence.scriptureSupport.some(item => item.sourceId === reflectionId)) {
            return;
        }

        // path 찾기
        const reflectionItem = allReflections.find(r => r.id === reflectionId);

        const newItem: SequenceItem = {
            sourceType: 'reflection',
            sourceId: reflectionId,
            sourcePath: reflectionItem?._path || null as any, // undefined 대신 null 사용 (Firestore 저장 위해)
            pinned: false,
            confidence: 1.0,
            addedAt: Timestamp.now()
        };

        const updated = {
            ...localConcept,
            sequence: {
                ...sequence,
                scriptureSupport: [...sequence.scriptureSupport, newItem]
            }
        };

        // reflectionItems에도 추가
        if (reflectionItem) {
            setReflectionItems(prev => new Map(prev).set(reflectionId, reflectionItem));
        }

        setLocalConcept(updated);
        saveToFirestore(updated);
        setShowReflectionPicker(false);
        setReflectionSearchQuery('');
    };

    // 묵상 연결 해제
    const handleRemoveReflectionLink = (reflectionId: string) => {
        const sequence = getSequence();
        const updated = {
            ...localConcept,
            sequence: {
                ...sequence,
                scriptureSupport: sequence.scriptureSupport.filter(item => item.sourceId !== reflectionId)
            }
        };
        setLocalConcept(updated);
        saveToFirestore(updated);
    };

    // Firestore에 변경 저장
    const saveToFirestore = async (updatedConcept: ConceptCard) => {
        // 새 카드 모드(임시 ID)일 때는 Firestore 저장 건너뛰기
        // 최종 저장 버튼에서 onCreateNew로 저장함
        if (updatedConcept.id.startsWith('temp_')) {
            onUpdate(updatedConcept);
            return;
        }

        try {
            const docRef = doc(db, 'concepts', updatedConcept.id);
            // Firestore는 undefined 값을 허용하지 않으므로 null 또는 빈 값으로 변환
            await updateDoc(docRef, {
                conceptName: updatedConcept.conceptName || '',
                question: updatedConcept.question || '',
                conclusion: updatedConcept.conclusion ?? null,  // undefined -> null
                aStatement: (updatedConcept as any).aStatement ?? null,  // 루트 레벨 aStatement도 저장
                sequence: updatedConcept.sequence || null,
                updatedAt: Timestamp.now()
            });
            onUpdate(updatedConcept);
        } catch (e: any) {
            console.error('Error saving concept:', e);
            alert(`저장 중 오류가 발생했습니다: ${e.message}`);
        }
    };

    // 반응 추가
    const handleAddResponse = () => {
        if (!newResponse.trim()) return;

        const sequence = getSequence();
        const newSnippet: ResponseSnippet = {
            id: `resp_${Date.now()}`,
            text: newResponse.trim(),
            pinned: false,
            source: 'manual',
            createdAt: Timestamp.now()
        };

        const updated = {
            ...localConcept,
            sequence: {
                ...sequence,
                responses: [...(sequence.responses || []), newSnippet]
            }
        };

        setLocalConcept(updated);
        saveToFirestore(updated);
        setNewResponse('');
        setIsAddingResponse(false);
    };

    // 반응 핀 토글
    const handleToggleResponsePin = (responseId: string) => {
        const sequence = getSequence();
        const updated = {
            ...localConcept,
            sequence: {
                ...sequence,
                responses: sequence.responses.map(r =>
                    r.id === responseId ? { ...r, pinned: !r.pinned } : r
                )
            }
        };
        setLocalConcept(updated);
        saveToFirestore(updated);
    };

    // 반응 삭제
    const handleDeleteResponse = (responseId: string) => {
        const sequence = getSequence();
        const updated = {
            ...localConcept,
            sequence: {
                ...sequence,
                responses: sequence.responses.filter(r => r.id !== responseId)
            }
        };
        setLocalConcept(updated);
        saveToFirestore(updated);
    };

    // 시퀀스 아이템 핀 토글
    const handleToggleItemPin = (type: 'recent' | 'scripture', sourceId: string) => {
        const sequence = getSequence();
        const key = type === 'recent' ? 'recent' : 'scriptureSupport';
        const updated = {
            ...localConcept,
            sequence: {
                ...sequence,
                [key]: sequence[key].map(item =>
                    item.sourceId === sourceId ? { ...item, pinned: !item.pinned } : item
                )
            }
        };
        setLocalConcept(updated);
        saveToFirestore(updated);
    };

    // ============================================
    // AI 터치포인트 1: 뉴스 → 반응 스니펫 생성
    // ============================================
    const handleGenerateReactions = async () => {
        if (!isAIEnabled()) {
            setAiError('AI 기능이 비활성화되어 있습니다. API 키를 설정하세요.');
            return;
        }

        const seq = getSequence();
        if (seq.recent.length === 0) {
            setAiError('연결된 뉴스가 없습니다. 먼저 뉴스를 연결하세요.');
            return;
        }

        setAiReactionsLoading(true);
        setAiError(null);

        try {
            // 첫 번째 뉴스의 내용 사용
            const firstNews = newsItems.get(seq.recent[0].sourceId);
            if (!firstNews) throw new Error('뉴스 데이터를 찾을 수 없습니다.');

            const result = await generateReactionSnippets(
                firstNews.title,
                firstNews.content || firstNews.subtitle || '',
                localConcept.conceptName
            );

            if (result.success && result.snippets.length > 0) {
                const suggestions: ResponseSnippet[] = result.snippets.map((text, i) => ({
                    id: `ai_react_${Date.now()}_${i}`,
                    text,
                    pinned: false,
                    source: 'ai' as const,
                    status: 'suggested' as const,
                    createdAt: Timestamp.now()
                }));

                const updated = {
                    ...localConcept,
                    sequence: { ...seq, aiReactionSuggestions: suggestions }
                };
                setLocalConcept(updated);
                saveToFirestore(updated);
            } else {
                setAiError(result.error || 'AI 반응 생성 실패');
            }
        } catch (e: any) {
            setAiError(e.message);
        } finally {
            setAiReactionsLoading(false);
        }
    };

    // AI 반응 선택 (제안 → 확정)
    const handleSelectAIReaction = (snippetId: string) => {
        const seq = getSequence();
        const suggestion = seq.aiReactionSuggestions?.find(s => s.id === snippetId);
        if (!suggestion) return;

        // 확정된 반응으로 이동
        const confirmedSnippet: ResponseSnippet = {
            ...suggestion,
            status: 'selected',
            pinned: true
        };

        const updated = {
            ...localConcept,
            sequence: {
                ...seq,
                responses: [...seq.responses, confirmedSnippet],
                aiReactionSuggestions: seq.aiReactionSuggestions?.filter(s => s.id !== snippetId)
            }
        };
        setLocalConcept(updated);
        saveToFirestore(updated);
    };

    // AI 반응 제외
    const handleRejectAIReaction = (snippetId: string) => {
        const seq = getSequence();
        const updated = {
            ...localConcept,
            sequence: {
                ...seq,
                aiReactionSuggestions: seq.aiReactionSuggestions?.filter(s => s.id !== snippetId)
            }
        };
        setLocalConcept(updated);
        saveToFirestore(updated);
    };

    // ============================================
    // AI 터치포인트 2: 반응 → 결론 후보 생성
    // ============================================
    const handleGenerateConclusions = async () => {
        if (!isAIEnabled()) {
            setAiError('AI 기능이 비활성화되어 있습니다.');
            return;
        }

        const seq = getSequence();
        const selectedReactions = seq.responses.filter(r => r.pinned).map(r => r.text);

        if (selectedReactions.length === 0) {
            setAiError('먼저 반응을 선택(핀)하세요.');
            return;
        }

        setAiConclusionsLoading(true);
        setAiError(null);

        try {
            const result = await generateConclusionCandidates(
                selectedReactions,
                localConcept.conceptName,
                localConcept.question || ''
            );

            if (result.success && result.candidates.length > 0) {
                const suggestions: AIConclusionSuggestion[] = result.candidates.map((text, i) => ({
                    id: `ai_concl_${Date.now()}_${i}`,
                    text,
                    status: 'suggested' as const,
                    createdAt: Timestamp.now()
                }));

                const updated = {
                    ...localConcept,
                    sequence: { ...seq, aiConclusionSuggestions: suggestions }
                };
                setLocalConcept(updated);
                saveToFirestore(updated);
            } else {
                setAiError(result.error || 'AI 결론 생성 실패');
            }
        } catch (e: any) {
            setAiError(e.message);
        } finally {
            setAiConclusionsLoading(false);
        }
    };

    // AI 결론 선택 (확정)
    const handleSelectAIConclusion = (conclusionId: string) => {
        const seq = getSequence();
        const suggestion = seq.aiConclusionSuggestions?.find(c => c.id === conclusionId);
        if (!suggestion) return;

        const updated = {
            ...localConcept,
            conclusion: suggestion.text,
            sequence: {
                ...seq,
                aiConclusionSuggestions: seq.aiConclusionSuggestions?.map(c =>
                    c.id === conclusionId ? { ...c, status: 'selected' as const } : { ...c, status: 'rejected' as const }
                )
            }
        };
        setLocalConcept(updated);
        saveToFirestore(updated);

        // 결론 확정 후 자동으로 묵상 추천 시작
        setTimeout(() => handleGenerateScriptures(), 500);
    };

    // ============================================
    // AI 터치포인트 3: 결론 → 묵상 추천
    // ============================================
    const handleGenerateScriptures = async () => {
        if (!isAIEnabled()) return;
        if (!localConcept.conclusion) return;

        setAiScripturesLoading(true);
        setAiError(null);

        try {
            const result = await recommendScriptures(
                localConcept.conclusion,
                allReflections.map(r => ({
                    id: r.id,
                    content: r.content,
                    bibleRef: r.bibleRef,
                    parentTitle: r.parentTitle
                }))
            );

            if (result.success && result.candidates.length > 0) {
                const suggestions: AIScriptureSuggestion[] = result.candidates.map(c => ({
                    reflectionId: c.reflectionId,
                    reason: c.reason,
                    status: 'suggested' as const,
                    similarity: c.similarity
                }));

                const seq = getSequence();
                const updated = {
                    ...localConcept,
                    sequence: { ...seq, aiScriptureSuggestions: suggestions }
                };
                setLocalConcept(updated);
                saveToFirestore(updated);
            }
        } catch (e: any) {
            console.error('Scripture recommendation error:', e);
        } finally {
            setAiScripturesLoading(false);
        }
    };

    // AI 묵상 핀 확정
    const handlePinAIScripture = (reflectionId: string) => {
        const seq = getSequence();

        // scripture에 추가
        const newItem: SequenceItem = {
            sourceType: 'reflection',
            sourceId: reflectionId,
            pinned: true,
            confidence: 1.0,
            addedAt: Timestamp.now()
        };

        const updated = {
            ...localConcept,
            sequence: {
                ...seq,
                scriptureSupport: [...seq.scriptureSupport, newItem],
                aiScriptureSuggestions: seq.aiScriptureSuggestions?.filter(s => s.reflectionId !== reflectionId)
            }
        };
        setLocalConcept(updated);
        saveToFirestore(updated);
    };

    // 개념 카드 삭제 (Drawer 내부에서)
    const handleDeleteConcept = async () => {
        if (isNewMode) return;
        if (!confirm('정말로 이 개념 카드를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;

        try {
            await deleteDoc(doc(db, 'concepts', localConcept.id));
            onClose(); // 닫기
            // 상위 컴포넌트에서 리스트가 갱신되어야 함 (onSnapshot 사용 중이므로 자동)
        } catch (e: any) {
            console.error('Delete error:', e);
            alert(`삭제 실패: ${e.message}`);
        }
    };

    const sequence = getSequence();

    const [editingNewsId, setEditingNewsId] = useState<string | null>(null);
    const [editedNewsContent, setEditedNewsContent] = useState('');
    const [editedNewsTitle, setEditedNewsTitle] = useState('');
    const [editedNewsSubtitle, setEditedNewsSubtitle] = useState('');

    // 묵상 편집 상태
    const [editingReflectionId, setEditingReflectionId] = useState<string | null>(null);
    const [editedReflectionContent, setEditedReflectionContent] = useState('');
    const [editedReflectionBibleRef, setEditedReflectionBibleRef] = useState('');
    const [editedReflectionVerse, setEditedReflectionVerse] = useState('');

    const handleStartEditNews = (news: NewsItem) => {
        setEditingNewsId(news.id);
        const cleaned = cleanContent(news.content || '').text;
        setEditedNewsContent(cleaned);
        setEditedNewsTitle(news.title);
        setEditedNewsSubtitle(news.subtitle || '');
    };

    const handleSaveNews = async (newsId: string) => {
        try {
            await updateDoc(doc(db, 'updates', newsId), {
                title: editedNewsTitle,
                subtitle: editedNewsSubtitle,
                content: editedNewsContent,
                // If the original content was complex JSON, we are replacing it with plain text. 
                // This is desired as we are "cleaning" it.
            });

            // Local state update
            const news = newsItems.get(newsId);
            if (news) {
                const updated = { ...news, title: editedNewsTitle, subtitle: editedNewsSubtitle, content: editedNewsContent };
                setNewsItems(prev => new Map(prev).set(newsId, updated));
            }

            setEditingNewsId(null);
        } catch (e) {
            console.error('Error updating news:', e);
            alert('업데이트 실패');
        }
    };

    const handleStartEditReflection = (reflection: ReflectionItem) => {
        setEditingReflectionId(reflection.id);
        const displayContent = reflection.content || (reflection as any).text || '';
        setEditedReflectionContent(cleanContent(displayContent).text);
        setEditedReflectionBibleRef(reflection.bibleRef || '');
        setEditedReflectionVerse(reflection.verse || '');
    };

    const handleSaveReflection = async (reflectionId: string) => {
        try {
            await updateDoc(doc(db, 'reflections', reflectionId), {
                content: editedReflectionContent,
                bibleRef: editedReflectionBibleRef,
                verse: editedReflectionVerse,
            });

            // Local state update
            const reflection = reflectionItems.get(reflectionId);
            if (reflection) {
                const updated = {
                    ...reflection,
                    content: editedReflectionContent,
                    bibleRef: editedReflectionBibleRef,
                    verse: editedReflectionVerse
                };
                setReflectionItems(prev => new Map(prev).set(reflectionId, updated));
            }

            setEditingReflectionId(null);
        } catch (e) {
            console.error('Error updating reflection:', e);
            alert('묵상 업데이트 실패');
        }
    };

    // 헬퍼: 컨텐츠 정제 (JSON 파싱, 태그 제거)
    const cleanContent = (rawContent: string) => {
        let content = rawContent;
        let images: string[] = [];

        // 1. JSON 파싱 시도
        try {
            if (content.trim().startsWith('[') || content.trim().startsWith('{')) {
                const parsed = JSON.parse(content);
                // 배열이면 각 항목 처리
                if (Array.isArray(parsed)) {
                    // "text" 필드나 "content" 필드가 있는 객체 찾기
                    const textItem = parsed.find(item => item.text || item.content);
                    if (textItem) {
                        content = textItem.text || textItem.content;
                    }
                    // 단순 문자열 배열인 경우
                    else if (typeof parsed[0] === 'string') {
                        content = parsed.join('\n');
                    }
                }
                // 객체이면 text/content 필드 추출
                else if (typeof parsed === 'object') {
                    content = parsed.text || parsed.content || content;
                }
            }
        } catch (e) {
            // 파싱 실패 시 원본 사용
        }

        // 2. 태그 제거 (#태그, ##태그 등)
        // 줄 단위로 처리하여 태그만 있는 줄 제거 또는 인라인 태그 제거
        content = content.replace(/#\S+/g, '').trim();

        // 3. 불필요한 공백 제거 (연속된 줄바꿈 보존)
        content = content.trim();

        return { text: content, images };
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-[4000] bg-black/70 backdrop-blur-sm"
                    />

                    {/* Modal Panel (Centered) */}
                    <div className="fixed inset-0 z-[4001] flex items-center justify-center p-4 md:p-8 pointer-events-none">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="w-full max-w-5xl h-[90vh] bg-[#0F0F12] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col pointer-events-auto"
                        >
                            {/* Header - 고정 */}
                            <div className="flex-shrink-0 p-4 md:p-6 border-b border-white/10">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Lightbulb className="w-5 h-5 text-yellow-400" />
                                            {isViewMode ? (
                                                <h2 className="text-xl md:text-2xl font-bold text-white">
                                                    {localConcept.conceptName || '개념 이름'}
                                                </h2>
                                            ) : (
                                                <input
                                                    type="text"
                                                    value={localConcept.conceptName}
                                                    onChange={(e) => setLocalConcept(prev => ({ ...prev, conceptName: e.target.value }))}
                                                    placeholder="개념 이름을 입력하세요"
                                                    className="text-xl md:text-2xl font-bold text-white bg-transparent border-b border-white/30 focus:border-white/60 focus:outline-none placeholder-white/30 w-full"
                                                />
                                            )}
                                        </div>
                                        {isViewMode ? (
                                            <p className="text-sm text-white/60">
                                                {localConcept.question || '질문이 없습니다'}
                                            </p>
                                        ) : (
                                            <input
                                                type="text"
                                                value={localConcept.question}
                                                onChange={(e) => setLocalConcept(prev => ({ ...prev, question: e.target.value }))}
                                                placeholder="이 개념이 붙잡고 있는 질문은?"
                                                className="text-sm text-white/60 bg-transparent border-b border-white/20 focus:border-white/40 focus:outline-none placeholder-white/30 w-full"
                                            />
                                        )}
                                        <p className="text-xs text-white/40 mt-1 italic">
                                            정의/결론이 아니라 흐름
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {/* View/Edit Toggle */}
                                        <button
                                            onClick={() => setIsViewMode(!isViewMode)}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all border ${isViewMode
                                                ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/30'
                                                : 'bg-amber-500/20 border-amber-500/30 text-amber-300 hover:bg-amber-500/30'
                                                }`}
                                        >
                                            {isViewMode ? (
                                                <>
                                                    <Edit3 className="w-4 h-4" />
                                                    <span className="text-sm font-medium">편집하기</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Eye className="w-4 h-4" />
                                                    <span className="text-sm font-medium">읽기 모드</span>
                                                </>
                                            )}
                                        </button>

                                        {/* Delete Button (Edit Mode Only, Not New Mode) */}
                                        {!isViewMode && !isNewMode && (
                                            <button
                                                onClick={handleDeleteConcept}
                                                className="p-2 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                                                title="개념 카드 삭제"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        )}

                                        <button
                                            onClick={onClose}
                                            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                                        >
                                            <X className="w-5 h-5 text-white" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Scrollable Content */}
                            <div className="flex-1 overflow-y-auto">
                                {loading ? (
                                    <div className="flex items-center justify-center h-32 text-white/50">
                                        로딩 중...
                                    </div>
                                ) : isViewMode ? (
                                    /* ========== 읽기 모드: 스토리텔링 뷰 ========== */
                                    <div className="p-4 md:p-6 space-y-8">
                                        {/* A 문장: 세상의 관점 */}
                                        <section className="space-y-4">


                                            {/* 연결된 뉴스 표시 - 로그인 사용자만 */}
                                            {currentUser && sequence.recent.length > 0 && (
                                                <div className="space-y-3">
                                                    {sequence.recent.map((item) => {
                                                        const news = newsItems.get(item.sourceId);
                                                        if (!news) return null;

                                                        return (
                                                            <div
                                                                key={item.sourceId}
                                                                className="rounded-2xl border border-white/10 bg-white/5 p-5 relative overflow-hidden"
                                                            >
                                                                {editingNewsId === news.id ? (
                                                                    <div className="space-y-3" onClick={e => e.stopPropagation()}>
                                                                        <input
                                                                            className="w-full bg-white/10 p-2 rounded text-white font-bold"
                                                                            value={editedNewsTitle}
                                                                            onChange={e => setEditedNewsTitle(e.target.value)}
                                                                            placeholder="제목"
                                                                        />
                                                                        <input
                                                                            className="w-full bg-white/10 p-2 rounded text-white/80 text-sm"
                                                                            value={editedNewsSubtitle}
                                                                            onChange={e => setEditedNewsSubtitle(e.target.value)}
                                                                            placeholder="부제목"
                                                                        />
                                                                        <textarea
                                                                            className="w-full h-32 bg-white/10 p-2 rounded text-white/60 text-sm"
                                                                            value={editedNewsContent}
                                                                            onChange={e => setEditedNewsContent(e.target.value)}
                                                                            placeholder="내용"
                                                                        />
                                                                        <div className="flex justify-end gap-2">
                                                                            <button
                                                                                onClick={() => setEditingNewsId(null)}
                                                                                className="px-3 py-1 bg-white/10 rounded text-xs text-white"
                                                                            >
                                                                                취소
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleSaveNews(news.id)}
                                                                                className="px-3 py-1 bg-blue-500 rounded text-xs text-white"
                                                                            >
                                                                                저장
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex flex-col md:flex-row gap-6 md:gap-8">
                                                                        {/* 글 - 왼쪽 (PC) / 아래 (모바일) */}
                                                                        <div className="flex-1 min-w-0 order-2 md:order-1">
                                                                            <div className="group/edit relative">
                                                                                <h4 className="text-xl md:text-2xl font-bold text-white mb-3 leading-tight pr-8">
                                                                                    {news.title}
                                                                                </h4>
                                                                                {/* Admin Edit Trigger */}
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleStartEditNews(news);
                                                                                    }}
                                                                                    className="absolute top-0 right-0 opacity-0 group-hover/edit:opacity-100 p-1.5 bg-white/10 hover:bg-white/20 rounded-full transition-all"
                                                                                    title="관리자 편집"
                                                                                >
                                                                                    <Edit3 className="w-4 h-4 text-white/70" />
                                                                                </button>
                                                                            </div>
                                                                            {news.subtitle && (
                                                                                <p className="text-white/70 text-base font-medium mb-3">
                                                                                    {news.subtitle}
                                                                                </p>
                                                                            )}
                                                                            {news.content && (
                                                                                <p className="text-white/50 text-sm leading-relaxed whitespace-pre-wrap">
                                                                                    {cleanContent(typeof news.content === 'string' ? news.content : '').text}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                        {/* 이미지 - 오른쪽 (PC) / 위 (모바일) - 아이폰 스타일 */}
                                                                        {news.images?.[0] && (
                                                                            <div className="flex-shrink-0 w-full md:w-[340px] order-1 md:order-2">
                                                                                <div className="relative aspect-[9/16] rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-black/50 group-hover:border-white/20 transition-colors">
                                                                                    <img
                                                                                        src={news.images[0]}
                                                                                        alt=""
                                                                                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                                                                        onError={(e) => {
                                                                                            (e.target as HTMLImageElement).parentElement!.parentElement!.style.display = 'none';
                                                                                        }}
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {/* 뉴스가 없을 때 안내 - 로그인 사용자만 */}
                                            {currentUser && sequence.recent.length === 0 && (
                                                <button
                                                    onClick={() => { setIsViewMode(false); setShowNewsPicker(true); }}
                                                    className="w-full py-4 text-center text-white/40 text-sm border border-dashed border-white/20 rounded-xl hover:bg-white/5 hover:border-white/30 transition-all"
                                                >
                                                    + 이 관점을 보여주는 뉴스 연결하기
                                                </button>
                                            )}

                                            {/* A Statement merged below */}
                                        </section>

                                        {/* B 문장: 성경의 관점 */}
                                        <section className="space-y-4">
                                            <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                                                {/* A Statement Part */}
                                                <div className="p-6 border-b border-white/5 bg-gradient-to-br from-orange-500/5 to-transparent">
                                                    <p className="text-lg text-white leading-relaxed">
                                                        <span className="text-white/60">"우리는 보통 </span>
                                                        <span className="text-orange-300 font-semibold">{localConcept.conceptName}</span>
                                                        <span className="text-white/60">를(을) </span>
                                                        {sequence.aStatement ? (
                                                            <span className="text-white font-medium">{sequence.aStatement}</span>
                                                        ) : (
                                                            <span className="text-white/40 italic">___</span>
                                                        )}
                                                        <span className="text-white/60">라고 생각합니다."</span>
                                                    </p>
                                                </div>

                                                {/* B Statement Part */}
                                                <div className="p-6 bg-gradient-to-br from-emerald-500/5 to-transparent">
                                                    <p className="text-lg text-white leading-relaxed">
                                                        <span className="text-white/60">"그러나 성경에서 </span>
                                                        <span className="text-emerald-300 font-semibold">{localConcept.conceptName}</span>
                                                        <span className="text-white/60">는(은) </span>
                                                        {localConcept.conclusion ? (
                                                            <span className="text-white font-medium">{localConcept.conclusion}</span>
                                                        ) : (
                                                            <span className="text-white/40 italic">___라기보다 ___입니다</span>
                                                        )}
                                                        <span className="text-white/60">."</span>
                                                    </p>
                                                </div>
                                            </div>

                                            {/* 연결된 묵상 표시 - 로그인 사용자만 */}
                                            {currentUser && sequence.scriptureSupport.length > 0 && (
                                                <div className="space-y-3">
                                                    {sequence.scriptureSupport.map((item) => {
                                                        const reflection = reflectionItems.get(item.sourceId);
                                                        if (!reflection) return null;

                                                        const displayContent = reflection.content || (reflection as any).text || '';

                                                        return (
                                                            <div
                                                                key={item.sourceId}
                                                                className="bg-gradient-to-br from-amber-500/10 to-yellow-600/5 border border-amber-500/20 rounded-2xl p-5"
                                                            >
                                                                {editingReflectionId === reflection.id ? (
                                                                    // 편집 모드
                                                                    <div className="space-y-3" onClick={e => e.stopPropagation()}>
                                                                        <input
                                                                            className="w-full bg-white/10 p-2 rounded text-amber-300 font-semibold text-sm"
                                                                            value={editedReflectionBibleRef}
                                                                            onChange={e => setEditedReflectionBibleRef(e.target.value)}
                                                                            placeholder="성경 구절 (예: 요한복음 3:16)"
                                                                        />
                                                                        <input
                                                                            className="w-full bg-white/10 p-2 rounded text-white/80 text-sm italic"
                                                                            value={editedReflectionVerse}
                                                                            onChange={e => setEditedReflectionVerse(e.target.value)}
                                                                            placeholder="말씀 본문"
                                                                        />
                                                                        <textarea
                                                                            className="w-full h-32 bg-white/10 p-2 rounded text-white/80 text-sm"
                                                                            value={editedReflectionContent}
                                                                            onChange={e => setEditedReflectionContent(e.target.value)}
                                                                            placeholder="묵상 내용"
                                                                        />
                                                                        <div className="flex justify-end gap-2">
                                                                            <button
                                                                                onClick={() => setEditingReflectionId(null)}
                                                                                className="px-3 py-1 bg-white/10 rounded text-xs text-white"
                                                                            >
                                                                                취소
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleSaveReflection(reflection.id)}
                                                                                className="px-3 py-1 bg-amber-500 rounded text-xs text-white"
                                                                            >
                                                                                저장
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    // 보기 모드
                                                                    <div className="group/edit relative">
                                                                        {reflection.bibleRef && (
                                                                            <div className="flex items-center gap-2 mb-3">
                                                                                <Book className="w-4 h-4 text-amber-400" />
                                                                                <span className="text-amber-300 font-semibold text-sm">
                                                                                    {reflection.bibleRef}
                                                                                </span>
                                                                            </div>
                                                                        )}
                                                                        {reflection.verse && (
                                                                            <p className="text-white/80 text-base italic mb-3 border-l-2 border-amber-500/30 pl-3">
                                                                                "{reflection.verse}"
                                                                            </p>
                                                                        )}
                                                                        {/* 편집 버튼 */}
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleStartEditReflection(reflection);
                                                                            }}
                                                                            className="absolute top-0 right-0 opacity-0 group-hover/edit:opacity-100 p-1.5 bg-white/10 hover:bg-white/20 rounded-full transition-all"
                                                                            title="묵상 편집"
                                                                        >
                                                                            <Edit3 className="w-4 h-4 text-amber-400" />
                                                                        </button>
                                                                        {/* 이미지와 글 가로 배치 */}
                                                                        <div className="flex gap-4">
                                                                            {/* 글 - 왼쪽 */}
                                                                            <div className="flex-1 min-w-0">
                                                                                <p className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap">
                                                                                    {cleanContent(displayContent).text}
                                                                                </p>
                                                                                {reflection.parentTitle && (
                                                                                    <p className="text-white/40 text-xs mt-3 flex items-center gap-1">
                                                                                        <span>From</span>
                                                                                        <span className="text-amber-500/50">{reflection.parentTitle}</span>
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                            {/* 이미지 - 오른쪽 */}
                                                                            {(reflection.imageUrl || reflection.parentImage) && (
                                                                                <div className="flex-shrink-0 w-32 h-32 rounded-xl overflow-hidden">
                                                                                    <img
                                                                                        src={reflection.imageUrl || reflection.parentImage}
                                                                                        alt=""
                                                                                        className="w-full h-full object-cover"
                                                                                    />
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {/* 묵상이 없을 때 안내 - 로그인 사용자만 */}
                                            {currentUser && sequence.scriptureSupport.length === 0 && (
                                                <button
                                                    onClick={() => { setIsViewMode(false); setShowReflectionPicker(true); }}
                                                    className="w-full py-4 text-center text-white/40 text-sm border border-dashed border-white/20 rounded-xl hover:bg-white/5 hover:border-white/30 transition-all"
                                                >
                                                    + 이 결론을 뒷받침하는 묵상 연결하기
                                                </button>
                                            )}
                                        </section>

                                        {/* 편집 모드로 전환 안내 */}
                                        <div className="text-center py-4">
                                            <button
                                                onClick={() => setIsViewMode(false)}
                                                className="inline-flex items-center gap-2 px-4 py-2 text-sm text-white/50 hover:text-white/70 transition-colors"
                                            >
                                                <Edit3 className="w-4 h-4" />
                                                편집 모드로 전환
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    /* ========== 편집 모드: 기존 4 Sections ========== */
                                    <div className="p-4 md:p-6 space-y-6">

                                        {/* ========== Section 1: RECENT (현실) ========== */}
                                        <section className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 text-blue-400">
                                                    <Eye className="w-4 h-4" />
                                                    <h3 className="text-sm font-semibold uppercase tracking-wider">
                                                        RECENT — 내 눈에 들어온 장면
                                                    </h3>
                                                </div>
                                                <button
                                                    onClick={() => setShowNewsPicker(true)}
                                                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-500/20 text-blue-300 rounded-full hover:bg-blue-500/30 transition-colors"
                                                >
                                                    <Plus className="w-3 h-3" />
                                                    뉴스 연결
                                                </button>
                                            </div>

                                            {sequence.recent.length === 0 ? (
                                                <div
                                                    className="relative overflow-hidden rounded-2xl cursor-pointer transition-all group/empty hover:scale-[1.01]"
                                                    onClick={() => setShowNewsPicker(true)}
                                                >
                                                    {/* Gradient Background */}
                                                    <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 via-cyan-500/5 to-purple-600/10 opacity-50 group-hover/empty:opacity-100 transition-opacity" />
                                                    <div className="absolute inset-0 border border-dashed border-blue-400/30 group-hover/empty:border-blue-400/50 rounded-2xl transition-colors" />

                                                    {/* Animated dots background */}
                                                    <div className="absolute inset-0 opacity-20">
                                                        <div className="absolute top-4 left-4 w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                                                        <div className="absolute top-8 right-8 w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse delay-100" />
                                                        <div className="absolute bottom-6 left-12 w-1 h-1 rounded-full bg-purple-400 animate-pulse delay-200" />
                                                    </div>

                                                    {/* Content */}
                                                    <div className="relative py-12 px-6 text-center">
                                                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center group-hover/empty:scale-110 transition-transform">
                                                            <Plus className="w-8 h-8 text-blue-400" />
                                                        </div>
                                                        <h4 className="text-white/80 font-medium mb-1">뉴스를 연결하세요</h4>
                                                        <p className="text-sm text-white/40">최근 뉴스에서 마음에 와닿은 기사를 선택합니다</p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    {sequence.recent.map((item) => {
                                                        const news = newsItems.get(item.sourceId);
                                                        if (!news) return null;

                                                        return (
                                                            <div
                                                                key={item.sourceId}
                                                                className="relative overflow-hidden rounded-2xl border border-white/10 group hover:border-blue-400/30 transition-all p-5"
                                                            >
                                                                <div className="flex flex-col md:flex-row gap-6">
                                                                    {/* 글 - 왼쪽 */}
                                                                    <div className="flex-1 min-w-0 order-2 md:order-1">
                                                                        {/* Pinned Badge */}
                                                                        {item.pinned && (
                                                                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 text-[10px] font-medium mb-2">
                                                                                <Pin className="w-3 h-3" /> 고정됨
                                                                            </div>
                                                                        )}
                                                                        <h4 className="text-lg font-bold text-white mb-2 leading-tight">
                                                                            {news.title}
                                                                        </h4>
                                                                        {news.subtitle && (
                                                                            <p className="text-sm text-white/60 mb-2">
                                                                                {news.subtitle}
                                                                            </p>
                                                                        )}
                                                                    </div>

                                                                    {/* 이미지 - 오른쪽 (아이폰 스타일) */}
                                                                    {news.images?.[0] && (
                                                                        <div className="flex-shrink-0 w-full md:w-[160px] order-1 md:order-2">
                                                                            <div className="relative aspect-[9/16] rounded-xl overflow-hidden border border-white/10 bg-black/50">
                                                                                <img
                                                                                    src={news.images[0]}
                                                                                    alt=""
                                                                                    className="absolute inset-0 w-full h-full object-cover"
                                                                                    onError={(e) => {
                                                                                        (e.target as HTMLImageElement).parentElement!.parentElement!.style.display = 'none';
                                                                                    }}
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* Action Buttons */}
                                                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                                                    <button
                                                                        onClick={() => handleToggleItemPin('recent', item.sourceId)}
                                                                        className="p-1.5 rounded-full bg-black/60 backdrop-blur-sm hover:bg-black/80 transition-colors mr-1"
                                                                        title={item.pinned ? "고정 해제" : "상단 고정"}
                                                                    >
                                                                        {item.pinned ? (
                                                                            <Pin className="w-3.5 h-3.5 text-yellow-400" />
                                                                        ) : (
                                                                            <PinOff className="w-3.5 h-3.5 text-white/70" />
                                                                        )}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleRemoveNewsLink(item.sourceId)}
                                                                        className="p-1.5 rounded-full bg-red-500/40 backdrop-blur-sm hover:bg-red-500/60 transition-colors"
                                                                        title="삭제"
                                                                    >
                                                                        <Trash2 className="w-3.5 h-3.5 text-white" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </section>

                                        {/* ========== Section 2: RESPONSE (반응/오해) ========== */}
                                        <section className="space-y-3">
                                            <div className="flex items-center gap-2 text-purple-400">
                                                <MessageCircle className="w-4 h-4" />
                                                <h3 className="text-sm font-semibold uppercase tracking-wider">
                                                    RESPONSE — 내 안에서 일어난 반응
                                                </h3>
                                            </div>

                                            {/* Response Chips */}
                                            <div className="flex flex-wrap gap-2">
                                                {sequence.responses.map((resp) => (
                                                    <div
                                                        key={resp.id}
                                                        className={`group relative px-3 py-1.5 rounded-full text-sm transition-all ${resp.pinned
                                                            ? 'bg-purple-500/30 text-purple-200 border border-purple-500/50'
                                                            : 'bg-white/10 text-white/70 border border-white/10'
                                                            }`}
                                                    >
                                                        <span>{resp.text}</span>

                                                        {/* Actions on hover */}
                                                        <div className="absolute -top-1 -right-1 hidden group-hover:flex gap-1">
                                                            <button
                                                                onClick={() => handleToggleResponsePin(resp.id)}
                                                                className="p-1 rounded-full bg-purple-500/50 hover:bg-purple-500/70"
                                                            >
                                                                {resp.pinned ? (
                                                                    <PinOff className="w-3 h-3 text-white" />
                                                                ) : (
                                                                    <Pin className="w-3 h-3 text-white" />
                                                                )}
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteResponse(resp.id)}
                                                                className="p-1 rounded-full bg-red-500/50 hover:bg-red-500/70"
                                                            >
                                                                <X className="w-3 h-3 text-white" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}

                                                {/* Add Response Button */}
                                                {isAddingResponse ? (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            value={newResponse}
                                                            onChange={(e) => setNewResponse(e.target.value)}
                                                            onKeyDown={(e) => e.key === 'Enter' && handleAddResponse()}
                                                            placeholder="반응 입력..."
                                                            className="px-3 py-1.5 rounded-full text-sm bg-white/10 text-white border border-white/20 focus:border-purple-400 focus:outline-none w-40"
                                                            autoFocus
                                                        />
                                                        <button
                                                            onClick={handleAddResponse}
                                                            className="p-1.5 rounded-full bg-purple-500/50 hover:bg-purple-500/70"
                                                        >
                                                            <Plus className="w-4 h-4 text-white" />
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setIsAddingResponse(false);
                                                                setNewResponse('');
                                                            }}
                                                            className="p-1.5 rounded-full bg-white/10 hover:bg-white/20"
                                                        >
                                                            <X className="w-4 h-4 text-white/50" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => setIsAddingResponse(true)}
                                                        className="px-3 py-1.5 rounded-full text-sm bg-white/5 text-white/50 border border-dashed border-white/20 hover:bg-white/10 hover:text-white/70 transition-colors flex items-center gap-1"
                                                    >
                                                        <Plus className="w-3 h-3" /> 반응 추가
                                                    </button>
                                                )}
                                            </div>

                                            {/* AI Reaction Helper */}
                                            <div className="pt-2 pb-2">
                                                {/* 1. AI 미설정 알림 */}
                                                {!isAIEnabled() && (
                                                    <div className="w-full py-2.5 flex items-center justify-center gap-2 text-xs text-red-400/70 bg-red-500/5 border border-red-500/10 rounded-xl mb-2">
                                                        <Sparkles className="w-3 h-3" />
                                                        <span>AI 기능을 사용하려면 설정이 필요합니다 (.env 확인)</span>
                                                    </div>
                                                )}

                                                {/* 2. 뉴스 미연결 알림 (AI 켜져있을 때만) */}
                                                {isAIEnabled() && sequence.recent.length === 0 && (
                                                    <div className="w-full py-2.5 flex items-center justify-center gap-2 text-xs text-white/30 bg-white/5 border border-white/5 rounded-xl cursor-not-allowed">
                                                        <Sparkles className="w-3 h-3" />
                                                        <span>뉴스를 먼저 연결하면 AI 도움을 받을 수 있습니다</span>
                                                    </div>
                                                )}

                                                {/* 3. AI 제안 표시 */}
                                                {isAIEnabled() && sequence.recent.length > 0 && sequence.aiReactionSuggestions && sequence.aiReactionSuggestions.length > 0 && (
                                                    <div className="p-3 bg-purple-500/5 border border-purple-500/20 rounded-xl space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-xs text-purple-300 flex items-center gap-1">
                                                                <Sparkles className="w-3 h-3" />
                                                                AI가 발견한 내면의 반응
                                                            </span>
                                                            <button
                                                                onClick={() => {
                                                                    const seq = getSequence();
                                                                    setLocalConcept({
                                                                        ...localConcept,
                                                                        sequence: { ...seq, aiReactionSuggestions: [] }
                                                                    });
                                                                }}
                                                                className="text-xs text-white/30 hover:text-white/50"
                                                            >
                                                                닫기
                                                            </button>
                                                        </div>
                                                        <div className="flex flex-wrap gap-2">
                                                            {sequence.aiReactionSuggestions.map((suggestion) => (
                                                                <div key={suggestion.id} className="flex items-center gap-1 animate-fadeIn">
                                                                    <button
                                                                        onClick={() => handleSelectAIReaction(suggestion.id)}
                                                                        className="px-3 py-1.5 rounded-full text-xs bg-purple-500/10 text-purple-200 border border-purple-500/30 hover:bg-purple-500/20 hover:border-purple-500/50 transition-all text-left"
                                                                    >
                                                                        {suggestion.text}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleRejectAIReaction(suggestion.id)}
                                                                        className="p-1 rounded-full text-white/20 hover:text-white/40 hover:bg-white/5"
                                                                    >
                                                                        <X className="w-3 h-3" />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* 4. AI 생성 버튼 (제안 없고 뉴스 있을 때) */}
                                                {isAIEnabled() && sequence.recent.length > 0 && (!sequence.aiReactionSuggestions || sequence.aiReactionSuggestions.length === 0) && (
                                                    <button
                                                        onClick={handleGenerateReactions}
                                                        disabled={aiReactionsLoading}
                                                        className="w-full py-2.5 flex items-center justify-center gap-2 text-xs text-purple-300/70 bg-purple-500/5 border border-purple-500/10 rounded-xl hover:bg-purple-500/10 transition-all"
                                                    >
                                                        {aiReactionsLoading ? (
                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                        ) : (
                                                            <Sparkles className="w-3 h-3" />
                                                        )}
                                                        {aiReactionsLoading ? 'AI가 반응을 분석중입니다...' : '이 뉴스에서 어떤 마음이 들었나요? (AI 도움받기)'}
                                                    </button>
                                                )}

                                                {aiError && <p className="text-xs text-red-400 mt-2 text-center">{aiError}</p>}
                                            </div>

                                            {/* A Statement - 바로 입력 가능, 전체 저장 시 저장됨 */}
                                            <div className="mt-4 p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-xl border border-purple-500/20">
                                                <span className="text-xs text-purple-300/70 font-medium block mb-2">A 문장 (세상의 관점)</span>
                                                <div className="text-white text-lg leading-relaxed">
                                                    <span className="text-white/60">"우리는 보통 </span>
                                                    <span className="text-purple-300 font-semibold">{localConcept.conceptName}</span>
                                                    <span className="text-white/60">를(을) </span>
                                                    <input
                                                        type="text"
                                                        value={sequence.aStatement || ''}
                                                        onChange={(e) => {
                                                            const newValue = e.target.value;
                                                            setLocalConcept(prev => ({
                                                                ...prev,
                                                                sequence: {
                                                                    ...getSequence(),
                                                                    aStatement: newValue
                                                                }
                                                            }));
                                                        }}
                                                        placeholder="___"
                                                        className="bg-white/10 border-b border-purple-500/50 text-white px-2 py-0.5 mx-1 outline-none focus:border-purple-400 min-w-[200px] rounded"
                                                    />
                                                    <span className="text-white/60">라고 생각합니다."</span>
                                                </div>
                                            </div>
                                        </section>

                                        {/* ========== Section 3: CONCLUSION (결론) ========== */}
                                        <section className="space-y-3">
                                            <div className="flex items-center gap-2 text-green-400">
                                                <Lightbulb className="w-4 h-4" />
                                                <h3 className="text-sm font-semibold uppercase tracking-wider">
                                                    CONCLUSION — 내가 붙잡게 된 결론
                                                </h3>
                                            </div>

                                            {/* B Statement - 바로 입력 가능, 전체 저장 시 저장됨 */}
                                            <div className="p-4 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-xl border border-green-500/20">
                                                <span className="text-xs text-green-300/70 font-medium block mb-2">B 문장 (성경의 관점)</span>
                                                <div className="text-white text-lg leading-relaxed">
                                                    <span className="text-white/60">"그러나 성경에서 </span>
                                                    <span className="text-green-300 font-semibold">{localConcept.conceptName}</span>
                                                    <span className="text-white/60">는(은) </span>
                                                    <input
                                                        type="text"
                                                        value={localConcept.conclusion || ''}
                                                        onChange={(e) => {
                                                            const newValue = e.target.value;
                                                            setLocalConcept(prev => ({
                                                                ...prev,
                                                                conclusion: newValue
                                                            }));
                                                        }}
                                                        placeholder="___라기보다 ___입니다"
                                                        className="bg-white/10 border-b border-green-500/50 text-white px-2 py-0.5 mx-1 outline-none focus:border-green-400 min-w-[240px] rounded"
                                                    />
                                                    <span className="text-white/60">."</span>
                                                </div>
                                            </div>

                                            {/* AI Conclusion Helper */}
                                            <div className="pt-2">
                                                {/* All logic simplified to flat conditions */}
                                                {!isAIEnabled() && (
                                                    <div className="w-full py-2.5 flex items-center justify-center gap-2 text-xs text-red-400/70 bg-red-500/5 border border-red-500/10 rounded-xl mb-2">
                                                        <Sparkles className="w-3 h-3" />
                                                        <span>AI 기능을 사용하려면 설정이 필요합니다</span>
                                                    </div>
                                                )}

                                                {isAIEnabled() && !sequence.responses.some(r => r.pinned) && sequence.responses.length > 0 && (
                                                    <div className="w-full py-2.5 flex items-center justify-center gap-2 text-xs text-white/30 bg-white/5 border border-white/5 rounded-xl cursor-not-allowed">
                                                        <Sparkles className="w-3 h-3" />
                                                        <span>중요한 반응을 핀(고정)하면 AI가 결론을 제안합니다</span>
                                                    </div>
                                                )}

                                                {isAIEnabled() && sequence.responses.some(r => r.pinned) && sequence.aiConclusionSuggestions && sequence.aiConclusionSuggestions.length > 0 && (
                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between px-1">
                                                            <span className="text-xs text-green-300 flex items-center gap-1">
                                                                <Sparkles className="w-3 h-3" />
                                                                AI가 제안하는 성경적 관점
                                                            </span>
                                                            <button
                                                                onClick={() => {
                                                                    const seq = getSequence();
                                                                    setLocalConcept({
                                                                        ...localConcept,
                                                                        sequence: { ...seq, aiConclusionSuggestions: [] }
                                                                    });
                                                                }}
                                                                className="text-xs text-white/30 hover:text-white/50"
                                                            >
                                                                닫기
                                                            </button>
                                                        </div>
                                                        <div className="grid gap-2">
                                                            {sequence.aiConclusionSuggestions.map((suggestion) => (
                                                                <div
                                                                    key={suggestion.id}
                                                                    className="p-3 bg-green-500/5 border border-green-500/20 rounded-xl hover:bg-green-500/10 transition-all cursor-pointer group"
                                                                    onClick={() => handleSelectAIConclusion(suggestion.id)}
                                                                >
                                                                    <div className="flex gap-2">
                                                                        <Sparkles className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                                                                        <p className="text-sm text-green-100/80 leading-relaxed">
                                                                            {suggestion.text.replace('그러나 성경에서 ', '').replace(/는\(은\)|은\(는\)/, '').replace('라기보다', '...라기보다').trim()}
                                                                        </p>
                                                                    </div>
                                                                    <p className="text-[10px] text-green-500/50 mt-2 pl-6 group-hover:text-green-500/70">
                                                                        클릭하여 이 결론 선택하기
                                                                    </p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {isAIEnabled() && sequence.responses.some(r => r.pinned) && (!sequence.aiConclusionSuggestions || sequence.aiConclusionSuggestions.length === 0) && (
                                                    <button
                                                        onClick={handleGenerateConclusions}
                                                        disabled={aiConclusionsLoading}
                                                        className="w-full py-2.5 flex items-center justify-center gap-2 text-xs text-green-300/70 bg-green-500/5 border border-green-500/10 rounded-xl hover:bg-green-500/10 transition-all"
                                                    >
                                                        {aiConclusionsLoading ? (
                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                        ) : (
                                                            <Sparkles className="w-3 h-3" />
                                                        )}
                                                        {aiConclusionsLoading ? '성경적 관점을 찾고 있습니다...' : '이 반응들을 성경에서는 어떻게 볼까요? (AI 도움받기)'}
                                                    </button>
                                                )}
                                            </div>
                                        </section>

                                        {/* ========== Section 4: SCRIPTURE SUPPORT (말씀 근거) ========== */}
                                        <section className="space-y-3 pb-8">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 text-amber-400">
                                                    <Book className="w-4 h-4" />
                                                    <h3 className="text-sm font-semibold uppercase tracking-wider">
                                                        SCRIPTURE SUPPORT — 결론을 떠받치는 말씀
                                                    </h3>
                                                </div>
                                                <button
                                                    onClick={() => setShowReflectionPicker(true)}
                                                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-amber-500/20 text-amber-300 rounded-full hover:bg-amber-500/30 transition-colors"
                                                >
                                                    <Plus className="w-3 h-3" />
                                                    묵상 연결
                                                </button>
                                            </div>

                                            {sequence.scriptureSupport.length === 0 ? (
                                                <div
                                                    className="relative overflow-hidden rounded-2xl cursor-pointer transition-all group/empty hover:scale-[1.01]"
                                                    onClick={() => setShowReflectionPicker(true)}
                                                >
                                                    {/* Gradient Background */}
                                                    <div className="absolute inset-0 bg-gradient-to-br from-amber-600/10 via-orange-500/5 to-yellow-600/10 opacity-50 group-hover/empty:opacity-100 transition-opacity" />
                                                    <div className="absolute inset-0 border border-dashed border-amber-400/30 group-hover/empty:border-amber-400/50 rounded-2xl transition-colors" />

                                                    {/* Animated dots background */}
                                                    <div className="absolute inset-0 opacity-20">
                                                        <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                                        <div className="absolute top-8 left-8 w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse delay-100" />
                                                        <div className="absolute bottom-6 right-12 w-1 h-1 rounded-full bg-yellow-400 animate-pulse delay-200" />
                                                    </div>

                                                    {/* Content */}
                                                    <div className="relative py-12 px-6 text-center">
                                                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center group-hover/empty:scale-110 transition-transform">
                                                            <Book className="w-8 h-8 text-amber-400" />
                                                        </div>
                                                        <h4 className="text-white/80 font-medium mb-1">묵상을 연결하세요</h4>
                                                        <p className="text-sm text-white/40">나의 묵상 기록에서 결론을 뒷받침하는 말씀을 선택합니다</p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    {sequence.scriptureSupport.map((item) => {
                                                        const reflection = reflectionItems.get(item.sourceId);
                                                        if (!reflection) return null;

                                                        return (
                                                            <div
                                                                key={item.sourceId}
                                                                className="bg-white/5 rounded-xl p-4 border border-white/10 relative group"
                                                            >
                                                                {/* Action Buttons */}
                                                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <button
                                                                        onClick={() => handleToggleItemPin('scripture', item.sourceId)}
                                                                        className="p-1.5 rounded-full bg-black/50 hover:bg-black/70"
                                                                    >
                                                                        {item.pinned ? (
                                                                            <Pin className="w-3 h-3 text-yellow-400" />
                                                                        ) : (
                                                                            <PinOff className="w-3 h-3 text-white/50" />
                                                                        )}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleRemoveReflectionLink(item.sourceId)}
                                                                        className="p-1.5 rounded-full bg-red-500/30 hover:bg-red-500/50"
                                                                    >
                                                                        <Trash2 className="w-3 h-3 text-red-300" />
                                                                    </button>
                                                                </div>

                                                                {/* Bible Reference */}
                                                                {reflection.bibleRef && (
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-medium">
                                                                            {reflection.bibleRef}
                                                                        </span>
                                                                        {item.pinned && (
                                                                            <span className="text-xs text-yellow-400/70 flex items-center gap-1">
                                                                                <Pin className="w-3 h-3" /> 고정됨
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                )}

                                                                {/* Verse Quote */}
                                                                {reflection.verse && (
                                                                    <blockquote className="text-sm text-white/70 italic border-l-2 border-amber-500/50 pl-3 mb-2">
                                                                        "{reflection.verse}"
                                                                    </blockquote>
                                                                )}

                                                                {/* Reflection Content - 이미지와 글 가로 배치 */}
                                                                <div className="flex gap-3">
                                                                    {/* 글 - 왼쪽 */}
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-sm text-white/80 line-clamp-3 leading-relaxed whitespace-pre-wrap">
                                                                            {cleanContent(reflection.content).text}
                                                                        </p>

                                                                        {/* Parent Title */}
                                                                        {reflection.parentTitle && (
                                                                            <p className="text-xs text-white/40 mt-2">
                                                                                출처: {reflection.parentTitle}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                    {/* 이미지 - 오른쪽 */}
                                                                    {(reflection.imageUrl || reflection.parentImage) && (
                                                                        <div className="flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden">
                                                                            <img
                                                                                src={reflection.imageUrl || reflection.parentImage}
                                                                                alt=""
                                                                                className="w-full h-full object-cover"
                                                                            />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            {/* AI Scripture Suggestions */}
                                            {isAIEnabled() && localConcept.conclusion && (sequence.aiScriptureSuggestions?.length ?? 0) > 0 && (
                                                <div className="mt-4 pt-4 border-t border-white/5">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <span className="text-xs text-amber-300 flex items-center gap-1">
                                                            <Sparkles className="w-3 h-3" />
                                                            AI가 연결한 말씀 추천
                                                        </span>
                                                        <button
                                                            onClick={() => {
                                                                const seq = getSequence();
                                                                setLocalConcept({
                                                                    ...localConcept,
                                                                    sequence: { ...seq, aiScriptureSuggestions: [] }
                                                                });
                                                            }}
                                                            className="text-xs text-white/30 hover:text-white/50"
                                                        >
                                                            닫기
                                                        </button>
                                                    </div>
                                                    <div className="space-y-2">
                                                        {sequence.aiScriptureSuggestions!.map((suggestion) => {
                                                            const reflection = allReflections.find(r => r.id === suggestion.reflectionId);
                                                            if (!reflection) return null;
                                                            return (
                                                                <div
                                                                    key={suggestion.reflectionId}
                                                                    className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl hover:bg-amber-500/10 transition-all cursor-pointer group"
                                                                    onClick={() => handlePinAIScripture(suggestion.reflectionId)}
                                                                >
                                                                    <div className="flex justify-between items-start gap-2 mb-1">
                                                                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-medium">
                                                                            {reflection.bibleRef || '말씀'}
                                                                        </span>
                                                                        <span className="text-[10px] text-amber-500/50">
                                                                            {Math.round((suggestion.similarity ?? 0) * 100)}% 일치
                                                                        </span>
                                                                    </div>
                                                                    <p className="text-xs text-white/60 line-clamp-2 mb-2">
                                                                        {cleanContent(reflection.content).text}
                                                                    </p>
                                                                    <div className="flex items-center gap-1 text-[10px] text-amber-300/70 bg-amber-500/10 px-2 py-1 rounded-lg">
                                                                        <Sparkles className="w-2.5 h-2.5" />
                                                                        {suggestion.reason}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </section>

                                        {/* ========== 저장 & 읽기 모드 전환 버튼 (편집 모드 전용) ========== */}
                                        {!isViewMode && (
                                            <div className="pt-4 pb-8 flex flex-col gap-3 border-t border-white/10 mt-8">
                                                <button
                                                    onClick={async () => {
                                                        // 유효성 검사
                                                        if (!localConcept.conceptName.trim()) {
                                                            alert('개념 이름을 입력해주세요');
                                                            return;
                                                        }
                                                        if (!localConcept.question.trim()) {
                                                            alert('질문을 입력해주세요');
                                                            return;
                                                        }

                                                        // 새 카드 생성 모드
                                                        if (isNewMode && onCreateNew && localConcept.id.startsWith('temp_')) {
                                                            const savedConcept = await onCreateNew(localConcept);
                                                            if (savedConcept) {
                                                                setLocalConcept(savedConcept);
                                                                // 상태 업데이트가 충분히 반영된 후 모드 전환
                                                                setTimeout(() => setIsViewMode(true), 100);
                                                            }
                                                        } else {
                                                            // 기존 카드 저장
                                                            await saveToFirestore(localConcept);
                                                            // 안전하게 모드 전환
                                                            setTimeout(() => setIsViewMode(true), 100);
                                                        }
                                                    }}
                                                    className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                                                >
                                                    <Save className="w-5 h-5" />
                                                    {isNewMode ? '개념 카드 생성하기' : '저장하고 읽기 모드로'}
                                                </button>

                                                {!isNewMode && (
                                                    <button
                                                        onClick={() => setIsViewMode(true)}
                                                        className="w-full py-2.5 text-white/50 hover:text-white/70 transition-colors flex items-center justify-center gap-2"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                        변경 취소하고 읽기 모드로
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                </>
            )}

            {/* ========== News Picker Modal ========== */}
            {showNewsPicker && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[5000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setShowNewsPicker(false)}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-gradient-to-br from-[#1a1a2e] to-[#16213e] rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden border border-white/10 shadow-2xl"
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-white/10">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Eye className="w-5 h-5 text-blue-400" />
                                    뉴스 연결하기
                                </h3>
                                <button
                                    onClick={() => setShowNewsPicker(false)}
                                    className="p-1.5 rounded-full bg-white/10 hover:bg-white/20"
                                >
                                    <X className="w-4 h-4 text-white" />
                                </button>
                            </div>
                            {/* Search */}
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                                <input
                                    type="text"
                                    value={newsSearchQuery}
                                    onChange={(e) => setNewsSearchQuery(e.target.value)}
                                    placeholder="뉴스 검색..."
                                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-blue-500/50"
                                />
                            </div>
                        </div>

                        {/* News List */}
                        <div className="p-4 overflow-y-auto max-h-[60vh] space-y-2">
                            {allNews
                                .filter(news =>
                                    !sequence.recent.some(r => r.sourceId === news.id) &&
                                    (newsSearchQuery === '' ||
                                        news.title.toLowerCase().includes(newsSearchQuery.toLowerCase()) ||
                                        (news.subtitle?.toLowerCase().includes(newsSearchQuery.toLowerCase())))
                                )
                                .map(news => (
                                    <div
                                        key={news.id}
                                        onClick={() => handleAddNewsLink(news.id)}
                                        className="p-3 bg-white/5 rounded-xl border border-white/10 hover:border-blue-500/30 hover:bg-blue-500/5 cursor-pointer transition-all flex gap-3"
                                    >
                                        {/* 글 - 왼쪽 */}
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-medium text-white line-clamp-2">{news.title}</h4>
                                            {news.subtitle && (
                                                <p className="text-xs text-white/50 line-clamp-1 mt-1">{news.subtitle}</p>
                                            )}
                                        </div>
                                        {/* 이미지 - 오른쪽 (글 읽을 수 있는 적당한 크기) */}
                                        {news.images?.[0] && (
                                            <div className="w-28 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-white/5">
                                                <img
                                                    src={news.images[0]}
                                                    alt=""
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => {
                                                        // 이미지 로드 실패 시 부모 div 숨기기
                                                        (e.target as HTMLImageElement).parentElement!.style.display = 'none';
                                                    }}
                                                />
                                            </div>
                                        )}
                                        <Plus className="w-5 h-5 text-blue-400 flex-shrink-0 self-center" />
                                    </div>
                                ))
                            }
                            {allNews.filter(news => !sequence.recent.some(r => r.sourceId === news.id)).length === 0 && (
                                <div className="text-center py-8 text-white/40">
                                    연결할 수 있는 뉴스가 없습니다
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )
            }

            {/* ========== Reflection Picker Modal ========== */}
            {
                showReflectionPicker && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[5000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={() => setShowReflectionPicker(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-gradient-to-br from-[#1a1a2e] to-[#16213e] rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden border border-white/10 shadow-2xl"
                        >
                            {/* Header */}
                            <div className="p-4 border-b border-white/10">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <Book className="w-5 h-5 text-amber-400" />
                                        묵상 연결하기
                                    </h3>
                                    <button
                                        onClick={() => setShowReflectionPicker(false)}
                                        className="p-1.5 rounded-full bg-white/10 hover:bg-white/20"
                                    >
                                        <X className="w-4 h-4 text-white" />
                                    </button>
                                </div>
                                {/* Search */}
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                                    <input
                                        type="text"
                                        value={reflectionSearchQuery}
                                        onChange={(e) => setReflectionSearchQuery(e.target.value)}
                                        placeholder="묵상 검색..."
                                        className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-amber-500/50"
                                    />
                                </div>
                            </div>

                            {/* Reflection List */}
                            <div className="p-4 overflow-y-auto max-h-[60vh] space-y-2">
                                {allReflections.length === 0 ? (
                                    <div className="text-center py-12">
                                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                                            <Book className="w-8 h-8 text-amber-400/50" />
                                        </div>
                                        <p className="text-white/60 font-medium mb-1">묵상 기록이 없습니다</p>
                                        <p className="text-sm text-white/40">먼저 '나의 묵상'에서 묵상을 작성해주세요</p>
                                    </div>
                                ) : (
                                    <>
                                        {allReflections
                                            .filter(reflection =>
                                                !sequence.scriptureSupport.some(s => s.sourceId === reflection.id) &&
                                                (reflectionSearchQuery === '' ||
                                                    (reflection.content || '').toLowerCase().includes(reflectionSearchQuery.toLowerCase()) ||
                                                    (reflection.bibleRef?.toLowerCase().includes(reflectionSearchQuery.toLowerCase())) ||
                                                    (reflection.parentTitle?.toLowerCase().includes(reflectionSearchQuery.toLowerCase())))
                                            )
                                            .map(reflection => {
                                                const displayContent = reflection.content || reflection.text || '';

                                                return (
                                                    <div
                                                        key={reflection.id}
                                                        onClick={() => handleAddReflectionLink(reflection.id)}
                                                        className="p-4 bg-white/5 rounded-xl border border-white/10 hover:border-amber-500/40 hover:bg-amber-500/10 cursor-pointer transition-all group"
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            {/* 글 - 왼쪽 */}
                                                            <div className="flex-1 min-w-0">
                                                                {/* Header: Bible ref + Parent title */}
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    {reflection.bibleRef && (
                                                                        <span className="inline-block px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-semibold">
                                                                            📖 {reflection.bibleRef}
                                                                        </span>
                                                                    )}
                                                                    {reflection.parentTitle && (
                                                                        <span className="text-xs text-white/40">
                                                                            {reflection.parentTitle}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {/* Content */}
                                                                <p className="text-sm text-white/80 line-clamp-2 leading-relaxed">
                                                                    {cleanContent(displayContent).text}
                                                                </p>
                                                            </div>
                                                            {/* Image Thumbnail - 오른쪽 */}
                                                            {(reflection.imageUrl || reflection.parentImage) && (
                                                                <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-black/20">
                                                                    <img src={reflection.imageUrl || reflection.parentImage} alt="" className="w-full h-full object-cover" />
                                                                </div>
                                                            )}
                                                            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-500/30 transition-colors self-center">
                                                                <Plus className="w-5 h-5 text-amber-400" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        }
                                        {allReflections.filter(r => !sequence.scriptureSupport.some(s => s.sourceId === r.id)).length === 0 && (
                                            <div className="text-center py-8 text-white/40">
                                                이미 모든 묵상이 연결되어 있습니다
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )
            }
        </AnimatePresence >
    );
};

export default InsightDrawer;
