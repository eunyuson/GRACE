import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Save, Menu, X, List, Edit2, Plus, Trash, Check, RefreshCw, Maximize, Minimize, Book } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { db } from '../firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

// Configure worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// LocalStorage helpers - use encodeURIComponent for safe URL encoding (handles Korean/special chars)
const safeEncode = (url: string): string => {
    try {
        // First try to use a hash of the URL for consistency
        let hash = 0;
        for (let i = 0; i < url.length; i++) {
            const char = url.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        // Combine hash with filename for readability
        const filename = url.split('/').pop()?.split('?')[0] || 'unknown';
        const safeFilename = encodeURIComponent(filename).slice(0, 30);
        return `${Math.abs(hash).toString(36)}_${safeFilename}`;
    } catch {
        // Fallback: simple hash
        let hash = 0;
        for (let i = 0; i < url.length; i++) {
            hash = ((hash << 5) - hash) + url.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }
};
const getStorageKey = (url: string) => `pdf_progress_${safeEncode(url)}`;
const getTOCKey = (url: string) => `pdf_toc_${safeEncode(url)}`;

const getSavedPage = (url: string): number | null => {
    try {
        const saved = localStorage.getItem(getStorageKey(url));
        return saved ? parseInt(saved, 10) : null;
    } catch {
        return null;
    }
};

const savePage = (url: string, page: number) => {
    try {
        localStorage.setItem(getStorageKey(url), page.toString());
    } catch { }
};

const getSavedTOC = (url: string): TOCItem[] | null => {
    try {
        const saved = localStorage.getItem(getTOCKey(url));
        return saved ? JSON.parse(saved) : null;
    } catch {
        return null;
    }
};

const saveTOC = (url: string, toc: TOCItem[]) => {
    try {
        localStorage.setItem(getTOCKey(url), JSON.stringify(toc));
    } catch { }
};

// Firestore TOC helpers
const getFirestoreTOC = async (pdfId: string): Promise<TOCItem[] | null> => {
    try {
        const docRef = doc(db, 'pdfTocs', pdfId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            return data.toc || null;
        }
        return null;
    } catch (error) {
        console.error('Error fetching TOC from Firestore:', error);
        return null;
    }
};

const saveFirestoreTOC = async (pdfId: string, toc: TOCItem[]) => {
    try {
        const docRef = doc(db, 'pdfTocs', pdfId);
        await setDoc(docRef, {
            toc,
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error saving TOC to Firestore:', error);
    }
};

export interface TOCItem {
    title: string;
    page: number;
}

interface PDFViewerProps {
    url: string;
    pdfId?: string; // Unique identifier for this PDF in Firestore
    initialPage?: number;
    tableOfContents?: TOCItem[];
    isDailyReading?: boolean;
    todayInfo?: string;
}

const DEFAULT_TOC: TOCItem[] = [
    { title: "표지", page: 1 },
];

export const PDFViewer: React.FC<PDFViewerProps> = ({
    url,
    pdfId,
    initialPage = 1,
    tableOfContents = DEFAULT_TOC,
    isDailyReading = false,
    todayInfo = ''
}) => {
    const [numPages, setNumPages] = useState<number | null>(null);
    const [pageNumber, setPageNumber] = useState(initialPage);
    const [scale, setScale] = useState(1.0);
    const [fitMode, setFitMode] = useState<'width' | 'height' | 'manual'>('height'); // Default to 'fit height' (whole page)

    // Container dimensions
    const [containerWidth, setContainerWidth] = useState<number>(0);
    const [containerHeight, setContainerHeight] = useState<number>(0);

    // UI State
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isMobile, setIsMobile] = useState(false);
    const [showPageInput, setShowPageInput] = useState(false);
    const [pageInput, setPageInput] = useState('');
    const [savedPageIndicator, setSavedPageIndicator] = useState<number | null>(null);
    const [showBookmarkSaved, setShowBookmarkSaved] = useState(false);

    // TOC Editing State
    const [tocItems, setTocItems] = useState<TOCItem[]>(tableOfContents);
    const [isEditingTOC, setIsEditingTOC] = useState(false);
    const [pdfDocument, setPdfDocument] = useState<any>(null); // Store PDF proxy for outline extraction

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Initialization & Responsive Logic
    useEffect(() => {
        let unsubscribe: (() => void) | undefined;

        // Load saved TOC - priority: Firestore (Real-time) > localStorage > prop tableOfContents > DEFAULT_TOC
        const loadTOC = async () => {
            if (!isDailyReading) {
                // Try Firestore first if pdfId is provided
                if (pdfId) {
                    try {
                        const docRef = doc(db, 'pdfTocs', pdfId);
                        // Real-time listener
                        unsubscribe = onSnapshot(docRef, (docSnap) => {
                            if (docSnap.exists()) {
                                const data = docSnap.data();
                                const firestoreTOC = data.toc;
                                if (firestoreTOC && firestoreTOC.length > 0) {
                                    setTocItems(firestoreTOC);
                                    // Also save to localStorage as backup
                                    saveTOC(url, firestoreTOC);
                                }
                            } else {
                                // If document doesn't exist in Firestore, fallback to localStorage
                                const savedTOC = getSavedTOC(url);
                                if (savedTOC) {
                                    setTocItems(savedTOC);
                                } else {
                                    setTocItems(tableOfContents || DEFAULT_TOC);
                                }
                            }
                        }, (error) => {
                            console.error('Error listening to TOC updates:', error);
                            // Fallback on error
                            const savedTOC = getSavedTOC(url);
                            if (savedTOC) setTocItems(savedTOC);
                            else setTocItems(tableOfContents || DEFAULT_TOC);
                        });
                        return; // Exit here, let the listener handle updates
                    } catch (error) {
                        console.error('Error setting up listener:', error);
                    }
                }

                // Fallback to localStorage immediately if no pdfId or setup failed
                const savedTOC = getSavedTOC(url);
                if (savedTOC) {
                    setTocItems(savedTOC);
                    return;
                }

                // Fallback to prop or default
                setTocItems(tableOfContents || DEFAULT_TOC);
            } else {
                setTocItems(tableOfContents || DEFAULT_TOC);
            }
        };

        loadTOC();

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [url, pdfId, isDailyReading, tableOfContents]);

    useEffect(() => {
        const checkMobile = () => {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);
            if (mobile) setIsSidebarOpen(false);
            else setIsSidebarOpen(true);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Touch swipe handling for mobile
    const touchStartX = useRef<number>(0);
    const touchEndX = useRef<number>(0);

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        touchEndX.current = e.touches[0].clientX;
    };

    const handleTouchEnd = () => {
        const swipeThreshold = 50; // Minimum swipe distance
        const diff = touchStartX.current - touchEndX.current;

        if (Math.abs(diff) > swipeThreshold) {
            if (diff > 0) {
                // Swiped left - next page
                changePage(1);
            } else {
                // Swiped right - previous page
                changePage(-1);
            }
        }
    };

    // Container Resize Observer
    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                setContainerWidth(width);
                setContainerHeight(height);
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // Load saved page
    useEffect(() => {
        if (!isDailyReading) {
            const saved = getSavedPage(url);
            if (saved && saved !== initialPage) {
                setPageNumber(saved);
                setSavedPageIndicator(saved);
            }
        } else {
            setPageNumber(initialPage);
        }
    }, [url, isDailyReading, initialPage]);

    // Save page on change
    useEffect(() => {
        if (!isDailyReading && numPages) {
            savePage(url, pageNumber);
        }
    }, [pageNumber, url, isDailyReading, numPages]);

    // Handle Document Load
    const onDocumentLoadSuccess = (pdf: any) => {
        setNumPages(pdf.numPages);
        setPdfDocument(pdf);
    };

    // Handle Page Render Success (for Auto-Fit)
    const onPageLoadSuccess = ({ width, height, originalWidth, originalHeight }: any) => {
        // Auto-scale logic
        let newScale = scale;

        if (fitMode === 'height' && containerHeight > 0) {
            // Fit Height: Scale so page height matches container height (-padding)
            const availableHeight = containerHeight - 40; // 40px padding used in CSS
            newScale = availableHeight / originalHeight;
        } else if (fitMode === 'width' && containerWidth > 0) {
            // Fit Width: Scale so page width matches container width (-padding)
            const availableWidth = containerWidth - 40;
            newScale = availableWidth / originalWidth;
        }

        // Apply scale if it's significantly different (avoid loops) and not manual
        if (fitMode !== 'manual' && Math.abs(scale - newScale) > 0.01) {
            // Ensure min/max scale
            newScale = Math.max(0.2, Math.min(3.0, newScale));
            setScale(newScale);
        }
    };

    // Re-check fit when container resizes
    useEffect(() => {
        // We can't easily re-trigger onPageLoadSuccess without forcing update.
        // But react-pdf might re-render if we don't change anything?
        // Actually, we need to manually trigger a logic check if we have the dimensions.
        // Since we don't store page dimensions in state, we wait for next render or fit toggle.
    }, [containerWidth, containerHeight, fitMode]);


    const changePage = useCallback((offset: number) => {
        setPageNumber(prev => Math.max(1, Math.min(prev + offset, numPages || 1)));
    }, [numPages]);

    const goToPage = useCallback((page: number) => {
        setPageNumber(Math.max(1, Math.min(page, numPages || 1)));
        if (isMobile) setIsSidebarOpen(false);
    }, [numPages, isMobile]);

    // Fit Toggles
    const toggleFitMode = () => {
        if (fitMode === 'height') {
            setFitMode('width');
        } else {
            setFitMode('height');
        }
    };

    // --- TOC Editing Logic ---

    // Auto-generate TOC from PDF Outline
    const handleAutoGenerateTOC = async () => {
        if (!pdfDocument) return;
        try {
            const outline = await pdfDocument.getOutline();
            if (outline && outline.length > 0) {
                const newTOC: TOCItem[] = [];

                const processOutlineItem = async (item: any) => {
                    let pageIndex = -1;

                    // Destination can be a string (named dest) or array [ref, ...]
                    if (typeof item.dest === 'string') {
                        const dest = await pdfDocument.getDestination(item.dest);
                        if (dest) {
                            const ref = dest[0];
                            pageIndex = await pdfDocument.getPageIndex(ref);
                        }
                    } else if (Array.isArray(item.dest)) {
                        const ref = item.dest[0];
                        pageIndex = await pdfDocument.getPageIndex(ref);
                    }

                    if (pageIndex !== -1) {
                        newTOC.push({ title: item.title, page: pageIndex + 1 });
                    }

                    if (item.items) {
                        for (const child of item.items) {
                            await processOutlineItem(child);
                        }
                    }
                };

                for (const item of outline) {
                    await processOutlineItem(item);
                }

                if (newTOC.length > 0) {
                    setTocItems(newTOC);
                    saveTOC(url, newTOC);
                    if (pdfId) await saveFirestoreTOC(pdfId, newTOC);
                    alert(`성공적으로 ${newTOC.length}개의 목차를 가져왔습니다.`);
                } else {
                    alert('PDF 내에 읽을 수 있는 목차 정보가 없습니다.');
                }
            } else {
                alert('PDF 내에 목차 정보가 없습니다.');
            }
        } catch (e) {
            console.error('TOC Extraction Error:', e);
            alert('목차 자동 생성 중 오류가 발생했습니다.');
        }
    };

    const handleUpdateTOCItem = (index: number, field: keyof TOCItem, value: string | number) => {
        const newItems = [...tocItems];
        newItems[index] = { ...newItems[index], [field]: value };
        setTocItems(newItems);
    };

    const handleAddTOCItem = () => {
        setTocItems([...tocItems, { title: "새 항목", page: pageNumber }]);
    };

    const handleDeleteTOCItem = (index: number) => {
        if (confirm('이 목차 항목을 삭제하시겠습니까?')) {
            const newItems = tocItems.filter((_, i) => i !== index);
            setTocItems(newItems);
        }
    };

    const handleSaveTOC = async () => {
        // Sort by page number
        const sortedItems = [...tocItems].sort((a, b) => a.page - b.page);
        setTocItems(sortedItems);
        saveTOC(url, sortedItems);
        if (pdfId) await saveFirestoreTOC(pdfId, sortedItems);
        setIsEditingTOC(false);
    };


    return (
        <div className="flex h-screen bg-[#0a0a0a] text-[#efefef] font-sans overflow-hidden">

            {/* Sidebar (Table of Contents) */}
            <aside
                className={`
                    fixed md:relative z-50 h-full bg-[#111] border-r border-[#222] transition-all duration-300 ease-in-out flex flex-col
                    ${isSidebarOpen ? 'w-[320px] translate-x-0' : 'w-0 -translate-x-full md:w-0 md:translate-x-0 overflow-hidden'}
                `}
            >
                <div className="p-4 border-b border-[#222] flex items-center justify-between shrink-0 bg-[#151515]">
                    <h2 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
                        <List size={16} className="text-indigo-400" />
                        Table of Contents
                    </h2>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => isEditingTOC ? handleSaveTOC() : setIsEditingTOC(true)}
                            className={`p-1.5 rounded-md transition-colors ${isEditingTOC ? 'bg-indigo-600 text-white' : 'text-white/40 hover:text-white hover:bg-white/10'}`}
                            title={isEditingTOC ? "저장" : "편집"}
                        >
                            {isEditingTOC ? <Check size={16} /> : <Edit2 size={16} />}
                        </button>
                        {isMobile && (
                            <button onClick={() => setIsSidebarOpen(false)} className="p-1.5 text-white/50 hover:text-white">
                                <X size={18} />
                            </button>
                        )}
                    </div>
                </div>

                {isEditingTOC && (
                    <div className="px-4 py-2 border-b border-[#222] bg-[#1a1a1a] flex gap-2">
                        <button
                            onClick={handleAutoGenerateTOC}
                            className="flex-1 bg-white/5 hover:bg-white/10 text-white/70 text-xs py-2 rounded border border-white/10 flex items-center justify-center gap-2 transition-colors"
                        >
                            <RefreshCw size={12} />
                            자동 생성
                        </button>
                        <button
                            onClick={handleAddTOCItem}
                            className="flex-1 bg-white/5 hover:bg-white/10 text-white/70 text-xs py-2 rounded border border-white/10 flex items-center justify-center gap-2 transition-colors"
                        >
                            <Plus size={12} />
                            항목 추가
                        </button>
                    </div>
                )}

                <nav className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-gray-700">
                    {tocItems.map((item, idx) => (
                        <div
                            key={idx}
                            className={`
                                group flex items-center px-3 py-2 rounded-lg text-sm mb-1 transition-all
                                ${pageNumber === item.page ? 'bg-indigo-900/30 text-indigo-300 border border-indigo-500/30' : 'text-[#888] hover:bg-[#1a1a1a] hover:text-white/90 border border-transparent'}
                            `}
                        >
                            {isEditingTOC ? (
                                <div className="flex items-center gap-2 w-full">
                                    <input
                                        type="number"
                                        value={item.page}
                                        onChange={(e) => handleUpdateTOCItem(idx, 'page', parseInt(e.target.value))}
                                        className="w-12 bg-black/30 border border-white/10 rounded px-1 py-1 text-center text-xs focus:border-indigo-500 outline-none"
                                    />
                                    <input
                                        type="text"
                                        value={item.title}
                                        onChange={(e) => handleUpdateTOCItem(idx, 'title', e.target.value)}
                                        className="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1 text-xs focus:border-indigo-500 outline-none"
                                    />
                                    <button
                                        onClick={() => handleDeleteTOCItem(idx)}
                                        className="text-red-400 hover:text-red-300 p-1 opacity-50 hover:opacity-100"
                                    >
                                        <Trash size={12} />
                                    </button>
                                </div>
                            ) : (
                                <div onClick={() => goToPage(item.page)} className="w-full flex items-center cursor-pointer">
                                    <span className="w-8 shrink-0 text-white/20 text-[10px] font-mono">
                                        P.{item.page}
                                    </span>
                                    <span className="truncate flex-1">{item.title}</span>
                                </div>
                            )}
                        </div>
                    ))}
                    {tocItems.length === 0 && (
                        <div className="text-center py-10 text-white/20 text-xs">
                            목차가 없습니다.
                        </div>
                    )}
                </nav>
            </aside>

            {/* Main Viewer Area */}
            <main className="flex-1 flex flex-col relative w-full h-full bg-[#050505]">

                {/* Toolbar */}
                <header className="px-4 py-3 border-b border-[#222] bg-[#0f0f0f] flex items-center justify-between gap-4 shrink-0 z-20">
                    <div className="flex items-center gap-2 md:gap-4">
                        <button
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                        >
                            <Menu size={20} />
                        </button>

                        <div className="h-6 w-px bg-white/10 mx-1 hidden md:block"></div>

                        <div className="flex items-center gap-1">
                            {/* Page Controls */}
                            <button onClick={() => changePage(-1)} disabled={pageNumber <= 1} className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30">
                                <ChevronLeft size={20} />
                            </button>

                            <form
                                onSubmit={(e) => { e.preventDefault(); const p = parseInt(pageInput); if (!isNaN(p)) goToPage(p); setShowPageInput(false); }}
                                className="relative group"
                            >
                                {showPageInput ? (
                                    <input
                                        ref={inputRef}
                                        type="number"
                                        value={pageInput}
                                        onChange={(e) => setPageInput(e.target.value)}
                                        onBlur={() => setShowPageInput(false)}
                                        className="w-16 bg-[#222] border border-indigo-500 rounded px-2 py-1 text-center text-sm focus:outline-none"
                                        autoFocus
                                    />
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => { setShowPageInput(true); setPageInput(pageNumber.toString()); }}
                                        className="px-3 py-1 hover:bg-white/10 rounded text-sm font-mono"
                                    >
                                        {pageNumber} <span className="text-white/30">/</span> {numPages || '-'}
                                    </button>
                                )}
                            </form>

                            <button onClick={() => changePage(1)} disabled={pageNumber >= (numPages || 1)} className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30">
                                <ChevronRight size={20} />
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 md:gap-4">
                        {/* Auto Fit Controls */}
                        <button
                            onClick={toggleFitMode}
                            className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] text-xs text-white/80 transition-colors"
                            title={fitMode === 'height' ? "가로 맞춤으로 변경" : "세로 맞춤(전체)으로 변경"}
                        >
                            {fitMode === 'height' ? <Maximize size={14} /> : <Minimize size={14} />}
                            <span className="hidden md:inline">{fitMode === 'height' ? '한눈에 보기' : '너비 맞춤'}</span>
                        </button>

                        <div className="h-6 w-px bg-white/10 mx-1 hidden md:block"></div>

                        {/* Zoom Controls */}
                        <div className="hidden md:flex items-center bg-[#1a1a1a] rounded-lg border border-[#333] p-0.5">
                            <button onClick={() => { setScale(s => Math.max(0.2, s - 0.1)); setFitMode('manual'); }} className="p-1.5 hover:bg-white/10 rounded">
                                <ZoomOut size={16} />
                            </button>
                            <span className="text-xs w-12 text-center text-white/50">{Math.round(scale * 100)}%</span>
                            <button onClick={() => { setScale(s => Math.min(3.0, s + 0.1)); setFitMode('manual'); }} className="p-1.5 hover:bg-white/10 rounded">
                                <ZoomIn size={16} />
                            </button>
                        </div>

                        {/* Save Button */}
                        {!isDailyReading && (
                            <button
                                onClick={() => { savePage(url, pageNumber); setShowBookmarkSaved(true); setTimeout(() => setShowBookmarkSaved(false), 2000); }}
                                className={`p-2 rounded-lg border transition-all ${showBookmarkSaved
                                    ? 'bg-green-500/10 border-green-500/50 text-green-400'
                                    : 'bg-transparent border-transparent hover:bg-white/10 text-white/70'
                                    }`}
                                title="현재 페이지 저장"
                            >
                                <Save size={20} />
                            </button>
                        )}
                    </div>
                </header>

                {/* PDF Canvas Container */}
                <div
                    ref={containerRef}
                    className="flex-1 overflow-auto flex justify-center items-center bg-[#0a0a0a] relative"
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                >
                    {/* Floating Navigation Arrows - More transparent, less intrusive */}
                    <button
                        onClick={() => changePage(-1)}
                        disabled={pageNumber <= 1}
                        className="absolute left-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/10 hover:bg-black/60 hover:backdrop-blur-sm border border-white/5 hover:border-white/20 flex items-center justify-center text-white/40 hover:text-white transition-all transform hover:scale-110 disabled:opacity-0 disabled:pointer-events-none group"
                    >
                        <ChevronLeft size={28} className="group-hover:-translate-x-0.5 transition-transform" />
                    </button>

                    <button
                        onClick={() => changePage(1)}
                        disabled={pageNumber >= (numPages || 1)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/10 hover:bg-black/60 hover:backdrop-blur-sm border border-white/5 hover:border-white/20 flex items-center justify-center text-white/40 hover:text-white transition-all transform hover:scale-110 disabled:opacity-0 disabled:pointer-events-none group"
                    >
                        <ChevronRight size={28} className="group-hover:translate-x-0.5 transition-transform" />
                    </button>


                    {/* Document Area */}
                    <div className="relative shadow-2xl shadow-black/80 transition-transform duration-300">
                        <Document
                            file={url}
                            onLoadSuccess={onDocumentLoadSuccess}
                            loading={
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-white/30 gap-4 min-w-[300px] min-h-[400px]">
                                    <div className="animate-spin w-8 h-8 border-4 border-white/10 border-t-indigo-500 rounded-full"></div>
                                    <div className="text-sm font-light tracking-widest animate-pulse">LOADING PDF...</div>
                                </div>
                            }
                            error={
                                <div className="flex flex-col items-center justify-center text-red-400 gap-4 p-10 bg-[#111] rounded-xl border border-red-500/20">
                                    <p className="font-semibold">문서를 로드할 수 없습니다</p>
                                    <a href={url} target="_blank" rel="noreferrer" className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 rounded text-xs transition-colors">
                                        새 탭에서 원본 열기
                                    </a>
                                </div>
                            }
                        >
                            {numPages && (
                                <Page
                                    pageNumber={pageNumber}
                                    scale={scale}
                                    onLoadSuccess={onPageLoadSuccess}
                                    className="bg-white"
                                    renderAnnotationLayer={false}
                                    renderTextLayer={false}
                                    loading={
                                        <div
                                            style={{ width: containerWidth * 0.8, height: containerHeight * 0.8 }}
                                            className="bg-[#151515] animate-pulse flex items-center justify-center text-white/20"
                                        >
                                            <span className="text-4xl font-thin opacity-20">Page {pageNumber}</span>
                                        </div>
                                    }
                                />
                            )}
                        </Document>
                    </div>

                    {/* Saved Page Notification */}
                    {savedPageIndicator && !isDailyReading && (
                        <div className="absolute bottom-10 bg-indigo-600/90 text-white px-6 py-3 rounded-full text-sm shadow-xl animate-bounce z-50 flex items-center gap-3 backdrop-blur-md">
                            <div className="bg-white/20 p-1 rounded-full"><Book size={12} /></div>
                            <span>마지막으로 읽은 <b>{savedPageIndicator}페이지</b>를 불러왔습니다</span>
                            <button onClick={() => setSavedPageIndicator(null)} className="ml-2 text-white/50 hover:text-white"><X size={14} /></button>
                        </div>
                    )}
                </div>
            </main>

            {/* Mobile Overlay */}
            {isMobile && isSidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}
        </div>
    );
};

export default PDFViewer;
