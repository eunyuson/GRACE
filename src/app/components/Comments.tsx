import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, query, orderBy, where } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from '../firebase';
import { GalleryItemType } from '../data/gallery';

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
        <div className="border-t border-white/10 pt-[8vh] mt-[8vh] font-['Inter']">
            <h3 className="text-[10px] tracking-[2px] opacity-40 uppercase mb-8">COMMENTS</h3>

            {/* 댓글 목록 */}
            <div className="space-y-6 mb-10 max-h-[400px] overflow-y-auto pr-2">
                {comments.length === 0 && (
                    <p className="text-xs text-white/20 tracking-widest py-6 text-center">
                        NO COMMENTS YET. BE THE FIRST TO WRITE.
                    </p>
                )}
                {comments.map((comment) => (
                    <div key={comment.id} className="flex gap-4 group">
                        {/* 갤러리 썸네일 */}
                        <div className="w-12 h-12 bg-[#222] rounded overflow-hidden shrink-0">
                            <img
                                src={comment.galleryImage}
                                alt={comment.galleryTitle}
                                className="w-full h-full object-cover opacity-70"
                            />
                        </div>

                        {/* 댓글 내용 */}
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-baseline mb-1">
                                <span className="text-sm font-bold text-white">{comment.name}</span>
                                <span className="text-[10px] text-white/30 tracking-widest">{formatDate(comment.createdAt)}</span>
                            </div>
                            <p className="text-sm text-white/70 font-light leading-relaxed whitespace-pre-wrap">{comment.message}</p>
                        </div>

                        {/* 삭제 버튼 (관리자용) */}
                        {user && (
                            <button
                                onClick={() => handleDelete(comment.id)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-red-500 hover:text-red-400 self-start"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* 입력 폼 */}
            <form onSubmit={handleSubmit} className="space-y-4 bg-[#0a0a0a] p-6 border border-white/10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input
                        type="text"
                        placeholder="YOUR NAME"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-[#111] border border-white/20 p-3 text-sm text-white focus:border-white outline-none placeholder:text-white/20"
                        maxLength={20}
                        required
                    />
                    <div className="hidden md:block" />
                </div>
                <textarea
                    placeholder="LEAVE A COMMENT..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full bg-[#111] border border-white/20 p-3 text-sm text-white focus:border-white outline-none placeholder:text-white/20 resize-none h-20"
                    maxLength={500}
                    required
                />
                <button
                    type="submit"
                    disabled={submitting}
                    className="px-8 py-3 bg-white text-black text-xs font-bold tracking-[0.2em] hover:bg-[#ccc] transition-colors disabled:opacity-50"
                >
                    {submitting ? 'SENDING...' : 'POST COMMENT'}
                </button>
            </form>
        </div>
    );
};
