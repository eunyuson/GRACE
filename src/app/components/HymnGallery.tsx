import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, X, Download, Music, Grid, List } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../firebase';

interface Hymn {
    id: string;
    number: number;
    title: string;
    imageUrl: string;
    pptUrl?: string;
    lyrics?: string;
}

export const HymnGallery: React.FC = () => {
    const [hymns, setHymns] = useState<Hymn[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedHymn, setSelectedHymn] = useState<Hymn | null>(null);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    useEffect(() => {
        // Fetch hymns - optimize by limiting initial load if needed, but for 645 items it's okay-ish to load basic data
        // Ideally we interact with a collection 'hymns'
        const q = query(collection(db, 'hymns'), orderBy('number', 'asc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Hymn));
            setHymns(items);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching hymns:", error);
            setLoading(false);
            // Optionally set error state here if you had one, but at least stop loading
        });

        return () => unsubscribe();
    }, []);

    const filteredHymns = hymns.filter(h =>
        h.number.toString().includes(searchQuery) ||
        h.title.includes(searchQuery) ||
        (h.lyrics && h.lyrics.includes(searchQuery))
    );

    return (
        <div className="w-full h-full overflow-hidden flex flex-col pt-32 px-4 md:px-10 pb-10">
            {/* Header & Search */}
            <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
                <div>
                    <h1 className="text-4xl md:text-6xl font-['Anton'] text-white mb-2">HYMNS</h1>
                    <p className="text-white/40 font-['Inter'] tracking-wider text-sm">새찬송가 (1-645)</p>
                </div>

                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="relative flex-1 md:w-80">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={18} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="장수, 제목, 가사 검색..."
                            className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-all"
                        />
                    </div>

                    <div className="flex bg-white/5 rounded-lg p-1 border border-white/10">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}
                        >
                            <Grid size={18} />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}
                        >
                            <List size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar -mr-4 pr-4">
                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    </div>
                ) : filteredHymns.length === 0 ? (
                    <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl">
                        <p className="text-white/30">
                            {hymns.length === 0 ? '아직 등록된 찬송가가 없습니다.' : '검색 결과가 없습니다.'}
                        </p>
                        {hymns.length === 0 && (
                            <p className="text-white/20 text-sm mt-2">관리자에게 데이터 입력을 요청하세요.</p>
                        )}
                    </div>
                ) : (
                    <>
                        {viewMode === 'grid' ? (
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                                {filteredHymns.map((hymn) => (
                                    <motion.div
                                        key={hymn.id}
                                        layoutId={`hymn-${hymn.id}`}
                                        onClick={() => setSelectedHymn(hymn)}
                                        className="group cursor-pointer bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:border-white/30 transition-all hover:-translate-y-1"
                                    >
                                        <div className="aspect-[3/4] bg-black/40 relative">
                                            {hymn.imageUrl ? (
                                                <img
                                                    src={hymn.imageUrl}
                                                    alt={hymn.title}
                                                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                                    loading="lazy"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-white/10">
                                                    <Music size={32} />
                                                </div>
                                            )}
                                            <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-xs font-bold text-white border border-white/10">
                                                {hymn.number}장
                                            </div>
                                        </div>
                                        <div className="p-3">
                                            <h3 className="text-white/90 text-sm font-medium truncate">{hymn.title}</h3>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {filteredHymns.map((hymn) => (
                                    <motion.div
                                        key={hymn.id}
                                        onClick={() => setSelectedHymn(hymn)}
                                        className="flex items-center gap-4 p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 cursor-pointer transition-colors"
                                    >
                                        <div className="w-12 h-12 bg-black/40 rounded-lg flex items-center justify-center flex-shrink-0 text-white font-bold border border-white/5">
                                            {hymn.number}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-white font-medium">{hymn.title}</h3>
                                            {hymn.lyrics && (
                                                <p className="text-white/40 text-xs truncate">{hymn.lyrics.slice(0, 50)}...</p>
                                            )}
                                        </div>
                                        {hymn.imageUrl && <div className="text-xs text-white/30 px-2 py-1 border border-white/10 rounded bg-black/20">악보</div>}
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Detail Modal */}
            <AnimatePresence>
                {selectedHymn && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[3000] bg-black/95 backdrop-blur-md flex items-center justify-center p-4"
                        onClick={() => setSelectedHymn(null)}
                    >
                        <motion.div
                            layoutId={`hymn-${selectedHymn.id}`}
                            className="w-full h-full max-w-5xl bg-[#111] rounded-2xl overflow-hidden flex flex-col md:flex-row border border-white/10 shadow-2xl relative"
                            onClick={e => e.stopPropagation()}
                        >
                            <button
                                onClick={() => setSelectedHymn(null)}
                                className="absolute top-4 right-4 z-10 p-2 bg-black/50 rounded-full text-white/70 hover:text-white hover:bg-black/80 transition-all border border-white/10"
                            >
                                <X size={20} />
                            </button>

                            {/* Left: Image */}
                            <div className="flex-1 bg-black flex items-center justify-center p-4 md:p-8 overflow-hidden relative group">
                                {selectedHymn.imageUrl ? (
                                    <img
                                        src={selectedHymn.imageUrl}
                                        alt={selectedHymn.title}
                                        className="max-w-full max-h-full object-contain shadow-2xl"
                                    />
                                ) : (
                                    <div className="text-white/20 flex flex-col items-center gap-4">
                                        <Music size={64} />
                                        <p>악보 이미지가 없습니다</p>
                                    </div>
                                )}
                                <a
                                    href={selectedHymn.imageUrl}
                                    download
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="absolute bottom-6 right-6 bg-white text-black px-4 py-2 rounded-full font-bold shadow-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2"
                                >
                                    <Download size={16} /> 원본 보기
                                </a>
                            </div>

                            {/* Right: Info */}
                            <div className="w-full md:w-80 bg-[#1a1a1a] p-6 border-l border-white/10 flex flex-col overflow-y-auto">
                                <div className="mb-6">
                                    <div className="inline-block px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded text-xs font-bold mb-2 border border-indigo-500/20">
                                        {selectedHymn.number}장
                                    </div>
                                    <h2 className="text-2xl font-bold text-white leading-tight">{selectedHymn.title}</h2>
                                </div>

                                {selectedHymn.lyrics && (
                                    <div className="flex-1 overflow-y-auto min-h-[200px]">
                                        <h3 className="text-xs uppercase tracking-wider text-white/40 mb-3 font-bold">가사</h3>
                                        <p className="text-white/80 whitespace-pre-wrap leading-relaxed text-sm font-light">
                                            {selectedHymn.lyrics}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
