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

export const Comments: React.FC<CommentsProps> = ({ galleryItem }) => {
    const [comments, setComments] = useState<Comment[]>([]);
    const [user, setUser] = useState<User | null>(null);
    const [name, setName] = useState('');
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
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

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[1050] font-['Inter']">
            {/* 토글 버튼 - 항상 보임 */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="absolute -top-10 right-6 flex items-center gap-2 px-4 py-2 bg-black/70 backdrop-blur-md border border-white/20 rounded-t-lg text-white/80 hover:text-white hover:bg-black/80 transition-all"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <span className="text-xs tracking-widest uppercase">
                    MEMO {comments.length > 0 && `(${comments.length})`}
                </span>
                <motion.svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <polyline points="18 15 12 9 6 15"></polyline>
                </motion.svg>
            </button>

            {/* 메모 패널 */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ y: '100%', opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: '100%', opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="bg-black/80 backdrop-blur-xl border-t border-white/10"
                    >
                        <div className="max-w-4xl mx-auto p-6 max-h-[50vh] overflow-y-auto">
                            {/* 헤더 */}
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-[10px] tracking-[2px] opacity-40 uppercase">
                                    MEMO FOR "{galleryItem.title}"
                                </h3>
                                <button
                                    onClick={() => setIsExpanded(false)}
                                    className="text-white/40 hover:text-white transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            </div>

                            {/* 입력 폼 - 상단에 배치 */}
                            <form onSubmit={handleSubmit} className="mb-6 space-y-3 bg-white/5 p-4 rounded-lg border border-white/10">
                                <div className="flex gap-3">
                                    <input
                                        type="text"
                                        placeholder="이름"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-32 bg-black/50 border border-white/20 px-3 py-2 text-sm text-white rounded focus:border-white/50 outline-none placeholder:text-white/30"
                                        maxLength={20}
                                        required
                                    />
                                    <input
                                        type="text"
                                        placeholder="메모를 입력하세요..."
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        className="flex-1 bg-black/50 border border-white/20 px-3 py-2 text-sm text-white rounded focus:border-white/50 outline-none placeholder:text-white/30"
                                        maxLength={500}
                                        required
                                    />
                                    <button
                                        type="submit"
                                        disabled={submitting}
                                        className="px-4 py-2 bg-white/90 hover:bg-white text-black text-xs font-bold tracking-wider rounded transition-colors disabled:opacity-50"
                                    >
                                        {submitting ? '...' : '저장'}
                                    </button>
                                </div>
                            </form>

                            {/* 댓글 목록 */}
                            <div className="space-y-3">
                                {comments.length === 0 && (
                                    <p className="text-xs text-white/30 tracking-widest py-4 text-center">
                                        아직 메모가 없습니다
                                    </p>
                                )}
                                {comments.map((comment) => (
                                    <motion.div
                                        key={comment.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="flex gap-3 group bg-white/5 p-3 rounded-lg hover:bg-white/10 transition-colors"
                                    >
                                        {/* 댓글 내용 */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline gap-2 mb-1">
                                                <span className="text-sm font-medium text-white/90">{comment.name}</span>
                                                <span className="text-[10px] text-white/30">{formatDate(comment.createdAt)}</span>
                                            </div>
                                            <p className="text-sm text-white/70 leading-relaxed">{comment.message}</p>
                                        </div>

                                        {/* 삭제 버튼 (관리자용) */}
                                        {user && (
                                            <button
                                                onClick={() => handleDelete(comment.id)}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-red-500 hover:text-red-400 self-start shrink-0"
                                            >
                                                삭제
                                            </button>
                                        )}
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
