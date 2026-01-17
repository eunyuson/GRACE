import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, query, orderBy, where } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from '../firebase';
import { GalleryItemType } from '../data/gallery';
import { motion, AnimatePresence } from 'motion/react';

interface Comment {
    id: string;
    name: string;
    message: string;
    galleryId: string;
    galleryTitle: string;
    galleryImage: string;
    createdAt: any;
}

interface CommentsProps {
    galleryItem: GalleryItemType;
    variant?: 'bottom-fixed' | 'side-panel';
}

// YouTube ID 추출 헬퍼
const getYoutubeId = (url: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
};

// 썸네일 URL 가져오기
const getThumbnail = (item: GalleryItemType) => {
    if (item.type === 'video' && item.videoUrl) {
        const ytId = getYoutubeId(item.videoUrl);
        if (ytId) {
            return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
        }
    }
    return item.image;
};

export const Comments: React.FC<CommentsProps> = ({ galleryItem, variant = 'bottom-fixed' }) => {
    const [comments, setComments] = useState<Comment[]>([]);
    const [user, setUser] = useState<User | null>(null);
    const [name, setName] = useState('');
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        // 모든 댓글 가져오기 (클라이언트에서 필터링)
        const q = query(
            collection(db, 'comments'),
            orderBy('createdAt', 'desc')
        );
        const unsubscribeMsgs = onSnapshot(q, (snapshot) => {
            const allMsgs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Comment[];
            // 해당 갤러리의 댓글만 필터링
            const filteredMsgs = allMsgs.filter(msg => msg.galleryId === String(galleryItem.id));
            setComments(filteredMsgs);
        }, (error) => {
            console.error('Error fetching comments:', error);
        });

        // 사용자 상태 확인
        const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            if (currentUser?.displayName) {
                setName(currentUser.displayName);
            }
        });

        return () => {
            unsubscribeMsgs();
            unsubscribeAuth();
        };
    }, [galleryItem.id]);

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!name.trim() || !message.trim()) return;

        setSubmitting(true);
        try {
            await addDoc(collection(db, 'comments'), {
                name: name.trim(),
                message: message.trim(),
                galleryId: String(galleryItem.id),
                galleryTitle: galleryItem.title,
                galleryImage: getThumbnail(galleryItem),
                createdAt: serverTimestamp()
            });
            setMessage('');
        } catch (error) {
            console.error('Error adding document: ', error);
            alert('메시지 전송에 실패했습니다.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('정말 이 메시지를 삭제하시겠습니까?')) return;

        try {
            await deleteDoc(doc(db, 'comments', id));
        } catch (error) {
            console.error('Error deleting document: ', error);
            alert('삭제에 실패했습니다.');
        }
    };

    const formatDate = (timestamp: any) => {
        if (!timestamp) return '';
        const date = timestamp.toDate();
        return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
    };

    // 키보드 이벤트 핸들러 - Ctrl/Cmd + Enter로 제출
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
        }
    };

    const isSidePanel = variant === 'side-panel';

    if (isSidePanel) {
        return (
            <div className="flex flex-col h-full bg-black/40 backdrop-blur-md border-l border-white/10 relative">
                <div className="flex-1 overflow-y-auto p-4 pb-20 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                    <h3 className="text-[10px] tracking-[2px] opacity-40 uppercase mb-6 sticky top-0 bg-black/0 backdrop-blur-sm py-2 z-10">
                        📌 Memos ({comments.length})
                    </h3>

                    <div className="space-y-4">
                        {comments.length === 0 ? (
                            <p className="text-sm text-white/30 tracking-wide py-8 text-center">
                                아직 메모가 없습니다.
                            </p>
                        ) : (
                            comments.map((comment) => (
                                <motion.div
                                    key={comment.id}
                                    initial={{ opacity: 0, x: 10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="group bg-white/5 p-3 rounded-lg hover:bg-white/10 transition-colors border border-white/5"
                                >
                                    <div className="flex items-baseline gap-2 mb-1">
                                        <span className="text-xs font-medium text-white/90">{comment.name}</span>
                                        <span className="text-[9px] text-white/30">{formatDate(comment.createdAt)}</span>
                                        {user && (
                                            <button
                                                onClick={() => handleDelete(comment.id)}
                                                className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[9px] text-red-500 hover:text-red-400"
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-xs text-white/70 leading-relaxed whitespace-pre-wrap break-words">{comment.message}</p>
                                </motion.div>
                            ))
                        )}
                    </div>
                </div>

                <div className="p-3 bg-black/60 border-t border-white/10 mt-auto">
                    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
                        <input
                            type="text"
                            placeholder="이름"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-black/40 border border-white/20 px-3 py-2 text-xs text-white rounded-lg focus:border-white/50 outline-none placeholder:text-white/40"
                            maxLength={20}
                            required
                        />
                        <div className="relative">
                            <textarea
                                placeholder="메모 입력..."
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="w-full bg-black/40 border border-white/20 px-3 py-2 text-xs text-white rounded-lg focus:border-white/50 outline-none placeholder:text-white/40 resize-none h-[80px]"
                                maxLength={1000}
                                required
                            />
                            <button
                                type="submit"
                                disabled={submitting || !message.trim() || !name.trim()}
                                className="absolute bottom-2 right-2 px-3 py-1 bg-white/90 hover:bg-white text-black text-[10px] font-bold tracking-wider rounded transition-all disabled:opacity-50"
                            >
                                {submitting ? '...' : '저장'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <>
            {/* 과거 메모 목록 - 페이지 하단에 표시 (스크롤해서 볼 수 있음) */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="border-t border-white/10 pt-[8vh] pb-[20vh] font-['Inter']"
            >
                <h3 className="text-[10px] tracking-[2px] opacity-40 uppercase mb-8">
                    📌 Memos ({comments.length})
                </h3>

                <div className="space-y-4 max-w-3xl">
                    {comments.length === 0 ? (
                        <p className="text-sm text-white/30 tracking-wide py-8">
                            아직 메모가 없습니다. 하단의 입력창에서 메모를 남겨보세요.
                        </p>
                    ) : (
                        comments.map((comment) => (
                            <motion.div
                                key={comment.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="group bg-white/5 p-4 rounded-lg hover:bg-white/10 transition-colors border border-white/5"
                            >
                                <div className="flex items-baseline gap-3 mb-2">
                                    <span className="text-sm font-medium text-white/90">{comment.name}</span>
                                    <span className="text-[10px] text-white/30">{formatDate(comment.createdAt)}</span>
                                    {user && (
                                        <button
                                            onClick={() => handleDelete(comment.id)}
                                            className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-red-500 hover:text-red-400"
                                        >
                                            삭제
                                        </button>
                                    )}
                                </div>
                                <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{comment.message}</p>
                            </motion.div>
                        ))
                    )}
                </div>
            </motion.div>

            {/* 플로팅 메모 입력 바 - 항상 하단에 고정 */}
            <div className="fixed bottom-0 left-0 right-0 z-[1050] font-['Inter']">
                <div className="bg-black/70 backdrop-blur-xl border-t border-white/10">
                    <div className="max-w-4xl mx-auto px-4 py-3">
                        <form onSubmit={handleSubmit} className="flex items-end gap-3">
                            <input
                                type="text"
                                placeholder="이름"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-20 md:w-24 bg-black/40 border border-white/20 px-3 py-2 text-sm text-white rounded-lg focus:border-white/50 outline-none placeholder:text-white/40"
                                maxLength={20}
                                required
                            />
                            <div className="flex-1 relative">
                                <textarea
                                    placeholder="📝 메모를 입력하세요... (Ctrl+Enter로 저장)"
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    className="w-full bg-black/40 border border-white/20 px-4 py-2 text-sm text-white rounded-lg focus:border-white/50 outline-none placeholder:text-white/40 resize-none min-h-[40px] max-h-[120px]"
                                    maxLength={1000}
                                    rows={1}
                                    style={{
                                        height: message.split('\n').length > 1 ? 'auto' : '40px',
                                        minHeight: '40px'
                                    }}
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={submitting || !message.trim() || !name.trim()}
                                className="px-4 py-2 bg-white/90 hover:bg-white text-black text-xs font-bold tracking-wider rounded-lg transition-all disabled:opacity-50 shrink-0 h-[40px]"
                            >
                                {submitting ? '...' : '저장'}
                            </button>
                        </form>
                        <p className="text-[10px] text-white/30 mt-1 hidden md:block">
                            💡 엔터로 줄바꿈 • Ctrl(⌘)+Enter로 저장 • 스크롤을 내려 과거 메모 보기
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
};
