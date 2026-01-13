import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase';

interface GuestbookMessage {
    id: string;
    name: string;
    message: string;
    createdAt: any;
}

interface GuestbookProps {
    onClose: () => void;
}

export const Guestbook: React.FC<GuestbookProps> = ({ onClose }) => {
    const [messages, setMessages] = useState<GuestbookMessage[]>([]);
    const [name, setName] = useState('');
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        // 메시지 구독
        const q = query(collection(db, 'guestbook'), orderBy('createdAt', 'desc'));
        const unsubscribeMsgs = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as GuestbookMessage[];
            setMessages(msgs);
        });

        // 관리자 권한 확인
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            setIsAdmin(!!user);
        });

        return () => {
            unsubscribeMsgs();
            unsubscribeAuth();
        };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !message.trim()) return;

        setSubmitting(true);
        try {
            await addDoc(collection(db, 'guestbook'), {
                name: name.trim(),
                message: message.trim(),
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
            await deleteDoc(doc(db, 'guestbook', id));
        } catch (error) {
            console.error('Error deleting document: ', error);
            alert('삭제에 실패했습니다. 관리자 권한을 확인해주세요.');
        }
    };

    const formatDate = (timestamp: any) => {
        if (!timestamp) return '';
        const date = timestamp.toDate();
        return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
    };

    return (
        <div className="fixed inset-0 z-[2500] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-[#111] border border-white/10 h-[80vh] flex flex-col relative font-['Inter']">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-white/10">
                    <h2 className="text-xl font-['Anton'] tracking-widest text-white">GUESTBOOK</h2>
                    <button
                        onClick={onClose}
                        className="text-white/50 hover:text-white transition-colors"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                {/* Messages List */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    {messages.length === 0 && (
                        <div className="text-center text-white/20 text-xs tracking-widest py-10">
                            NO MESSAGES YET.<br />BE THE FIRST TO WRITE.
                        </div>
                    )}
                    {messages.map((msg) => (
                        <div key={msg.id} className="space-y-2 group relative">
                            <div className="flex justify-between items-baseline">
                                <span className="text-sm font-bold text-white tracking-wider">{msg.name}</span>
                                <span className="text-[10px] text-white/30 tracking-widest">{formatDate(msg.createdAt)}</span>
                            </div>
                            <p className="text-sm text-white/70 font-light leading-relaxed whitespace-pre-wrap">{msg.message}</p>

                            {isAdmin && (
                                <button
                                    onClick={() => handleDelete(msg.id)}
                                    className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-red-500 hover:text-red-400 bg-black/50 px-2 py-1"
                                >
                                    DELETE
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                {/* Input Form */}
                <form onSubmit={handleSubmit} className="p-6 border-t border-white/10 bg-[#0a0a0a]">
                    <div className="space-y-4">
                        <div>
                            <input
                                type="text"
                                placeholder="YOUR NAME"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-[#111] border border-white/20 p-3 text-xs text-white focus:border-white outline-none tracking-widest placeholder:text-white/20"
                                maxLength={20}
                                required
                            />
                        </div>
                        <div>
                            <textarea
                                placeholder="LEAVE A MESSAGE..."
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                className="w-full bg-[#111] border border-white/20 p-3 text-xs text-white focus:border-white outline-none tracking-wider placeholder:text-white/20 resize-none h-20"
                                maxLength={300}
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full bg-white text-black py-3 text-xs font-bold tracking-[0.2em] hover:bg-[#ccc] transition-colors disabled:opacity-50"
                        >
                            {submitting ? 'SENDING...' : 'SEND MESSAGE'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
