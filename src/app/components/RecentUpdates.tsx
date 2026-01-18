import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

interface UpdateItem {
    id: string;
    title: string;
    subtitle: string;
    desc: string;
    content: { text: string; date?: string }[];
    createdAt?: any;
}

export const RecentUpdates: React.FC = () => {
    const [items, setItems] = useState<UpdateItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedItem, setSelectedItem] = useState<UpdateItem | null>(null);

    useEffect(() => {
        // Query for items that have sheetRowId (synced from Google Sheets)
        const q = query(collection(db, 'gallery'));

        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                // Filter items that have sheetRowId (from iPhone shortcut sync)
                const updates = snapshot.docs
                    .map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }))
                    .filter(item => item.sheetRowId) as UpdateItem[];

                // Sort by createdAt client-side
                updates.sort((a, b) => {
                    const dateA = a.createdAt?.toDate?.() || new Date(0);
                    const dateB = b.createdAt?.toDate?.() || new Date(0);
                    return dateB.getTime() - dateA.getTime();
                });
                setItems(updates);
                setLoading(false);
            },
            (error) => {
                console.error('Firestore error:', error);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, []);

    if (loading) {
        return (
            <div className="w-full h-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    <span className="text-xs tracking-widest text-white/50">LOADING...</span>
                </div>
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                    <p className="text-white/50 text-sm mb-2">아직 소식이 없습니다</p>
                    <p className="text-white/30 text-xs">iPhone 단축어로 메모를 추가해보세요</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-full overflow-auto">
            {/* Selected Item Detail Modal */}
            {selectedItem && (
                <div
                    className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
                    onClick={() => setSelectedItem(null)}
                >
                    <div
                        className="bg-[#111] border border-white/10 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-auto p-6 md:p-8"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h2 className="text-xl md:text-2xl font-bold text-white mb-2">{selectedItem.title}</h2>
                                <p className="text-white/50 text-sm">{selectedItem.subtitle}</p>
                            </div>
                            <button
                                onClick={() => setSelectedItem(null)}
                                className="text-white/50 hover:text-white text-2xl"
                            >
                                ×
                            </button>
                        </div>
                        <div className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap">
                            {selectedItem.content?.[0]?.text || selectedItem.desc}
                        </div>
                        {selectedItem.content?.[0]?.date && (
                            <p className="text-white/30 text-xs mt-6">
                                {new Date(selectedItem.content[0].date).toLocaleDateString('ko-KR')}
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Cards Grid */}
            <div className="p-6 md:p-10">
                <div className="max-w-6xl mx-auto">
                    <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 tracking-tight">
                        최근 소식
                    </h2>
                    <p className="text-white/40 text-sm mb-8">iPhone에서 보낸 메모와 업데이트</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                        {items.map((item) => (
                            <div
                                key={item.id}
                                onClick={() => setSelectedItem(item)}
                                className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl p-5 cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl"
                            >
                                <h3 className="text-white font-semibold text-lg mb-2 group-hover:text-blue-400 transition-colors line-clamp-2">
                                    {item.title}
                                </h3>
                                <p className="text-white/50 text-sm mb-3 line-clamp-2">
                                    {item.subtitle || item.desc}
                                </p>
                                <p className="text-white/40 text-xs line-clamp-3">
                                    {item.content?.[0]?.text?.slice(0, 100)}...
                                </p>
                                {item.content?.[0]?.date && (
                                    <p className="text-white/30 text-[10px] mt-4 uppercase tracking-wider">
                                        {new Date(item.content[0].date).toLocaleDateString('ko-KR')}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RecentUpdates;
