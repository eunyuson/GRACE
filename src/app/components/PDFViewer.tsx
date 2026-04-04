import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Save, Menu, X, Edit2, Plus, Trash, Check, RefreshCw, Maximize, Minimize, Book, FileText, Image as ImageIcon } from 'lucide-react';
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

const getPdfDisplayName = (url: string) => {
    const fallbackBase = 'https://pdf.local';

    try {
        const parsed = new URL(url, fallbackBase);
        const filename = parsed.pathname.split('/').pop() || 'PDF Document';
        return decodeURIComponent(filename)
            .replace(/\.pdf$/i, '')
            .replace(/[-_]+/g, ' ')
            .trim() || 'PDF Document';
    } catch {
        const filename = url.split('/').pop()?.split('?')[0] || 'PDF Document';
        return decodeURIComponent(filename)
            .replace(/\.pdf$/i, '')
            .replace(/[-_]+/g, ' ')
            .trim() || 'PDF Document';
    }
};

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
    readerTitle?: string;
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
    todayInfo = '',
    readerTitle = ''
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
    const [lastSavedPage, setLastSavedPage] = useState<number | null>(null);

    // TOC Editing State
    const [tocItems, setTocItems] = useState<TOCItem[]>(tableOfContents);
    const [isEditingTOC, setIsEditingTOC] = useState(false);
    const [pdfDocument, setPdfDocument] = useState<any>(null); // Store PDF proxy for outline extraction

    // Text View State
    const [viewMode, setViewMode] = useState<'pdf' | 'text'>('pdf'); // Default to PDF view
    const [textContent, setTextContent] = useState<string>('');
    const [isExtracting, setIsExtracting] = useState(false);
    const [extractProgress, setExtractProgress] = useState(0);

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
            setLastSavedPage(saved);
            if (saved && saved !== initialPage) {
                setPageNumber(saved);
                setSavedPageIndicator(saved);
            }
        } else {
            setPageNumber(initialPage);
            setLastSavedPage(null);
        }
    }, [url, isDailyReading, initialPage]);

    // Save page on change
    useEffect(() => {
        if (!isDailyReading && numPages) {
            savePage(url, pageNumber);
            setLastSavedPage(pageNumber);
        }
    }, [pageNumber, url, isDailyReading, numPages]);

    // Handle Document Load
    const onDocumentLoadSuccess = (pdf: any) => {
        setNumPages(pdf.numPages);
        setPdfDocument(pdf);

        // Auto-extract text if in text mode
        if (viewMode === 'text') {
            extractAllText(pdf);
        }
    };

    const extractAllText = async (pdf: any) => {
        if (!pdf) return;
        if (textContent) return; // Already extracted

        setIsExtracting(true);
        setExtractProgress(0);

        try {
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map((item: any) => item.str).join(' ');
                fullText += `\n\n--- Page ${i} ---\n\n${pageText}`;
                setExtractProgress(Math.round((i / pdf.numPages) * 100));
            }
            setTextContent(fullText);
        } catch (e) {
            console.error('Text extraction failed:', e);
            setTextContent('텍스트를 추출하는 중 오류가 발생했습니다.');
        } finally {
            setIsExtracting(false);
        }
    };

    // Toggle View Mode
    const toggleViewMode = () => {
        if (viewMode === 'pdf') {
            setViewMode('text');
            if (pdfDocument && !textContent) {
                extractAllText(pdfDocument);
            }
        } else {
            setViewMode('pdf');
        }
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

    const handleSaveCurrentPage = useCallback(() => {
        savePage(url, pageNumber);
        setLastSavedPage(pageNumber);
        setShowBookmarkSaved(true);
        window.setTimeout(() => setShowBookmarkSaved(false), 2000);
    }, [pageNumber, url]);

    const displayTitle = readerTitle.trim() || getPdfDisplayName(url);
    const readingProgress = numPages ? Math.round((pageNumber / numPages) * 100) : 0;
    const fitModeLabel = fitMode === 'height' ? '한눈에 보기' : fitMode === 'width' ? '너비 맞춤' : '수동 확대';
    const activeTocItem = [...tocItems].reverse().find((item) => item.page <= pageNumber) || null;
    const readerStatus = todayInfo || (numPages
        ? `${pageNumber} / ${numPages} 페이지`
        : 'PDF를 불러오는 중입니다.');

    const renderOutlineContent = (showMobileClose = false) => (
        <>
            <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
                        Outline
                    </div>
                    <h2 className="mt-2 text-lg font-semibold text-white">목차</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                        {tocItems.length > 0
                            ? `${tocItems.length}개의 목차 항목이 연결되어 있습니다.`
                            : '등록된 목차가 없어서 자동 생성 또는 수동 입력이 필요합니다.'}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => isEditingTOC ? handleSaveTOC() : setIsEditingTOC(true)}
                        className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${isEditingTOC
                            ? 'border-indigo-400/60 bg-indigo-500/20 text-indigo-100'
                            : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                            }`}
                        title={isEditingTOC ? "저장" : "편집"}
                    >
                        {isEditingTOC ? <Check size={14} /> : <Edit2 size={14} />}
                    </button>

                    {showMobileClose && (
                        <button
                            onClick={() => setIsSidebarOpen(false)}
                            className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                        >
                            닫기
                        </button>
                    )}
                </div>
            </div>

            {isEditingTOC && (
                <div className="mb-4 grid gap-2 sm:grid-cols-2">
                    <button
                        onClick={handleAutoGenerateTOC}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <RefreshCw size={14} />
                        자동 생성
                    </button>
                    <button
                        onClick={handleAddTOCItem}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <Plus size={14} />
                        항목 추가
                    </button>
                </div>
            )}

            <nav className="min-h-0 flex-1 overflow-y-auto pr-1">
                {tocItems.length > 0 ? tocItems.map((item, idx) => (
                    <div
                        key={idx}
                        className={`mb-2 rounded-2xl border px-3 py-3 text-sm transition-all ${pageNumber === item.page
                            ? 'border-indigo-400/50 bg-indigo-500/12 text-indigo-100'
                            : 'border-white/6 bg-white/[0.03] text-slate-300 hover:border-white/10 hover:bg-white/[0.05] hover:text-white'
                            }`}
                    >
                        {isEditingTOC ? (
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    value={item.page}
                                    onChange={(e) => handleUpdateTOCItem(idx, 'page', parseInt(e.target.value))}
                                    className="w-14 rounded-xl border border-white/10 bg-black/20 px-2 py-2 text-center text-xs text-white outline-none focus:border-indigo-400/60"
                                />
                                <input
                                    type="text"
                                    value={item.title}
                                    onChange={(e) => handleUpdateTOCItem(idx, 'title', e.target.value)}
                                    className="flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white outline-none focus:border-indigo-400/60"
                                />
                                <button
                                    onClick={() => handleDeleteTOCItem(idx)}
                                    className="p-2 text-red-300 transition-colors hover:text-red-200"
                                >
                                    <Trash size={14} />
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => goToPage(item.page)}
                                className="flex w-full items-center gap-3 text-left"
                            >
                                <span className="inline-flex min-w-12 justify-center rounded-full border border-white/10 bg-black/15 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">
                                    P {item.page}
                                </span>
                                <span className="truncate">{item.title}</span>
                            </button>
                        )}
                    </div>
                )) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-10 text-center text-sm text-slate-400">
                        목차가 없습니다.
                    </div>
                )}
            </nav>
        </>
    );


    return (
        <div
            className="h-full min-h-0 overflow-hidden p-2 text-[#eef2ff] md:p-4"
            style={{
                background: 'radial-gradient(circle at top left, rgba(124, 58, 237, 0.26), transparent 32%), radial-gradient(circle at top right, rgba(34, 197, 94, 0.12), transparent 28%), linear-gradient(180deg, #0b1020 0%, #0f172a 48%, #09111f 100%)'
            }}
        >
            <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
                <aside className="hidden min-h-0 flex-col rounded-[24px] border border-white/10 bg-[rgba(15,23,42,0.78)] p-4 shadow-[0_24px_60px_rgba(2,6,23,0.42)] backdrop-blur-xl lg:flex">
                    {renderOutlineContent(false)}
                </aside>

                <section className="relative flex min-h-0 flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[rgba(15,23,42,0.78)] shadow-[0_24px_60px_rgba(2,6,23,0.42)] backdrop-blur-xl">
                    <div className="border-b border-white/10 px-4 py-4">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
                                    Gallery Reader
                                </div>
                                <h2 className="mt-2 truncate text-xl font-semibold text-white md:text-2xl">
                                    {displayTitle}
                                </h2>
                                <p className="mt-2 text-sm leading-6 text-slate-300">
                                    {readerStatus}
                                </p>
                            </div>

                            <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="hidden shrink-0 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white md:inline-flex"
                            >
                                원본 열기
                            </a>
                        </div>
                    </div>

                    <div className="border-b border-white/10 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    onClick={() => setIsSidebarOpen(true)}
                                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
                                >
                                    <Menu size={16} />
                                    목차
                                </button>

                                <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/15 p-1">
                                    <button
                                        onClick={() => changePage(-1)}
                                        disabled={pageNumber <= 1}
                                        className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
                                    >
                                        <ChevronLeft size={18} />
                                    </button>

                                    <form
                                        onSubmit={(e) => {
                                            e.preventDefault();
                                            const p = parseInt(pageInput, 10);
                                            if (!isNaN(p)) goToPage(p);
                                            setShowPageInput(false);
                                        }}
                                        className="relative"
                                    >
                                        {showPageInput ? (
                                            <input
                                                ref={inputRef}
                                                type="number"
                                                value={pageInput}
                                                onChange={(e) => setPageInput(e.target.value)}
                                                onBlur={() => setShowPageInput(false)}
                                                className="w-16 rounded-full border border-indigo-400/60 bg-[#111827] px-3 py-2 text-center text-sm text-white outline-none"
                                                autoFocus
                                            />
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowPageInput(true);
                                                    setPageInput(pageNumber.toString());
                                                }}
                                                className="rounded-full px-3 py-2 text-sm font-medium text-white/85 transition-colors hover:bg-white/10"
                                            >
                                                {pageNumber} <span className="text-white/35">/</span> {numPages || '-'}
                                            </button>
                                        )}
                                    </form>

                                    <button
                                        onClick={() => changePage(1)}
                                        disabled={pageNumber >= (numPages || 1)}
                                        className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                </div>

                                {viewMode === 'pdf' && (
                                    <button
                                        onClick={toggleFitMode}
                                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                                        title={fitMode === 'height' ? "가로 맞춤으로 변경" : "세로 맞춤으로 변경"}
                                    >
                                        {fitMode === 'height' ? <Maximize size={15} /> : <Minimize size={15} />}
                                        <span className="hidden md:inline">{fitMode === 'height' ? '한눈에 보기' : '너비 맞춤'}</span>
                                    </button>
                                )}

                                {viewMode === 'pdf' && (
                                    <div className="hidden items-center rounded-full border border-white/10 bg-black/15 p-1 md:inline-flex">
                                        <button
                                            onClick={() => {
                                                setScale((s) => Math.max(0.2, s - 0.1));
                                                setFitMode('manual');
                                            }}
                                            className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                                        >
                                            <ZoomOut size={15} />
                                        </button>
                                        <span className="min-w-12 text-center text-xs text-slate-400">
                                            {Math.round(scale * 100)}%
                                        </span>
                                        <button
                                            onClick={() => {
                                                setScale((s) => Math.min(3.0, s + 0.1));
                                                setFitMode('manual');
                                            }}
                                            className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                                        >
                                            <ZoomIn size={15} />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    onClick={toggleViewMode}
                                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${viewMode === 'text'
                                        ? 'border-indigo-400/60 bg-indigo-500/20 text-indigo-100'
                                        : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white'
                                        }`}
                                    title={viewMode === 'pdf' ? "텍스트로 보기" : "PDF로 보기"}
                                >
                                    {viewMode === 'pdf' ? <FileText size={15} /> : <ImageIcon size={15} />}
                                    <span>{viewMode === 'pdf' ? '텍스트 보기' : 'PDF 보기'}</span>
                                </button>

                                {!isDailyReading && (
                                    <button
                                        onClick={handleSaveCurrentPage}
                                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${showBookmarkSaved
                                            ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200'
                                            : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white'
                                            }`}
                                        title="현재 페이지 저장"
                                    >
                                        <Save size={15} />
                                        <span>현재 페이지 저장</span>
                                    </button>
                                )}

                                <a
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white md:hidden"
                                >
                                    원본 열기
                                </a>
                            </div>
                        </div>
                    </div>

                    <div
                        ref={containerRef}
                        className="relative flex-1 min-h-0 overflow-auto bg-[#080d18] p-3 md:p-4"
                    >
                        <div className="relative flex min-h-full items-center justify-center rounded-[20px] border border-white/5 bg-[rgba(2,6,23,0.42)] p-3 md:p-5">
                            {viewMode === 'text' && (
                                <div className="absolute inset-0 z-30 overflow-auto rounded-[20px] bg-[#080d18] p-4 md:p-8">
                                    <div className="mx-auto max-w-4xl">
                                        {isExtracting ? (
                                            <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-white/50">
                                                <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-indigo-500"></div>
                                                <div>텍스트 추출 중... {extractProgress}%</div>
                                            </div>
                                        ) : (
                                            <div className="whitespace-pre-wrap text-lg leading-relaxed text-slate-300">
                                                {textContent || "텍스트를 추출할 수 없습니다."}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {viewMode === 'pdf' && (
                                <>
                                    <button
                                        onClick={() => changePage(-1)}
                                        disabled={pageNumber <= 1}
                                        className="absolute left-3 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/25 text-white/70 transition-all hover:scale-105 hover:bg-black/50 hover:text-white disabled:pointer-events-none disabled:opacity-0 md:left-4"
                                    >
                                        <ChevronLeft size={24} />
                                    </button>

                                    <button
                                        onClick={() => changePage(1)}
                                        disabled={pageNumber >= (numPages || 1)}
                                        className="absolute right-3 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/25 text-white/70 transition-all hover:scale-105 hover:bg-black/50 hover:text-white disabled:pointer-events-none disabled:opacity-0 md:right-4"
                                    >
                                        <ChevronRight size={24} />
                                    </button>
                                </>
                            )}

                            <div className="relative z-10 shadow-[0_18px_38px_rgba(0,0,0,0.28)] transition-transform duration-300">
                                <Document
                                    file={url}
                                    onLoadSuccess={onDocumentLoadSuccess}
                                    loading={
                                        <div className="flex min-h-[400px] min-w-[300px] flex-col items-center justify-center gap-4 text-white/30">
                                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/10 border-t-indigo-500"></div>
                                            <div className="text-sm tracking-[0.22em] text-white/40">LOADING PDF</div>
                                        </div>
                                    }
                                    error={
                                        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-red-500/20 bg-[#111827] p-10 text-red-300">
                                            <p className="font-semibold">문서를 로드할 수 없습니다</p>
                                            <a
                                                href={url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="rounded-full border border-red-400/20 bg-red-500/10 px-4 py-2 text-xs transition-colors hover:bg-red-500/20"
                                            >
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
                                            renderTextLayer={true}
                                            loading={
                                                <div
                                                    style={{ width: containerWidth * 0.8, height: containerHeight * 0.8 }}
                                                    className="flex items-center justify-center bg-[#151515] text-white/20"
                                                >
                                                    <span className="text-4xl font-thin opacity-20">Page {pageNumber}</span>
                                                </div>
                                            }
                                        />
                                    )}
                                </Document>
                            </div>

                            {savedPageIndicator && !isDailyReading && (
                                <div className="absolute bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-indigo-300/20 bg-indigo-500/85 px-5 py-3 text-sm text-white shadow-xl backdrop-blur-md">
                                    <div className="rounded-full bg-white/20 p-1">
                                        <Book size={12} />
                                    </div>
                                    <span>마지막으로 읽은 <b>{savedPageIndicator}페이지</b>를 불러왔습니다</span>
                                    <button
                                        onClick={() => setSavedPageIndicator(null)}
                                        className="text-white/60 transition-colors hover:text-white"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                <aside className="min-h-0 overflow-auto rounded-[24px] border border-white/10 bg-[rgba(15,23,42,0.78)] p-4 shadow-[0_24px_60px_rgba(2,6,23,0.42)] backdrop-blur-xl">
                    <div className="flex h-full flex-col">
                        <div className="mb-4">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">
                                Reading Log
                            </div>
                            <h3 className="mt-2 text-lg font-semibold text-white">현재 페이지 기록</h3>
                            <p className="mt-2 text-sm leading-6 text-slate-300">
                                {todayInfo || '현재 읽는 위치와 보기 상태를 한눈에 확인할 수 있습니다.'}
                            </p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Current Page</div>
                                <div className="mt-2 text-2xl font-semibold text-white">{pageNumber}</div>
                                <div className="mt-1 text-sm text-slate-400">
                                    전체 {numPages || '-'}페이지
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Progress</div>
                                <div className="mt-2 text-2xl font-semibold text-white">{readingProgress}%</div>
                                <div className="mt-3 h-2 rounded-full bg-white/10">
                                    <div
                                        className="h-2 rounded-full bg-gradient-to-r from-violet-400 to-cyan-400 transition-all"
                                        style={{ width: `${readingProgress}%` }}
                                    />
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">View Mode</div>
                                <div className="mt-2 text-lg font-semibold text-white">
                                    {viewMode === 'pdf' ? 'PDF 화면' : '텍스트 화면'}
                                </div>
                                <div className="mt-1 text-sm text-slate-400">
                                    {viewMode === 'pdf' ? fitModeLabel : '본문 텍스트 추출'}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Saved Page</div>
                                <div className="mt-2 text-lg font-semibold text-white">
                                    {lastSavedPage ? `${lastSavedPage}페이지` : '없음'}
                                </div>
                                <div className="mt-1 text-sm text-slate-400">
                                    {pdfId ? '현재 PDF 위치 저장 지원' : '로컬 저장소 기반'}
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 rounded-[20px] border border-white/10 bg-white/[0.04] p-4">
                            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Current Section</div>
                            <div className="mt-2 text-base font-semibold text-white">
                                {activeTocItem?.title || '현재 페이지에 연결된 목차 없음'}
                            </div>
                            <div className="mt-2 text-sm leading-6 text-slate-300">
                                {activeTocItem
                                    ? `${activeTocItem.page}페이지 기준 섹션입니다.`
                                    : '왼쪽 목차를 편집하거나 자동 생성하면 이 영역과 함께 동기화됩니다.'}
                            </div>
                        </div>

                        <div className="mt-4 rounded-[20px] border border-white/10 bg-white/[0.04] p-4">
                            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Reader Status</div>
                            <div className="mt-3 space-y-2 text-sm text-slate-300">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-slate-400">배율</span>
                                    <span>{Math.round(scale * 100)}%</span>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-slate-400">목차 항목</span>
                                    <span>{tocItems.length}개</span>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-slate-400">읽기 방식</span>
                                    <span>{isDailyReading ? '일일 묵상' : '일반 읽기'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-auto pt-4">
                            <div className="flex flex-col gap-2">
                                {!isDailyReading && (
                                    <button
                                        onClick={handleSaveCurrentPage}
                                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-indigo-400/45 bg-gradient-to-r from-violet-500/25 to-blue-500/20 px-4 py-3 text-sm font-medium text-indigo-50 transition-colors hover:from-violet-500/35 hover:to-blue-500/30"
                                    >
                                        <Save size={15} />
                                        현재 페이지 저장
                                    </button>
                                )}

                                <a
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                                >
                                    새 탭에서 원본 열기
                                </a>
                            </div>
                        </div>
                    </div>
                </aside>
            </div>

            {isMobile && isSidebarOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
                        onClick={() => setIsSidebarOpen(false)}
                    />
                    <aside className="fixed inset-x-3 bottom-3 top-3 z-50 flex flex-col rounded-[24px] border border-white/10 bg-[rgba(15,23,42,0.96)] p-4 shadow-[0_24px_60px_rgba(2,6,23,0.52)] backdrop-blur-xl">
                        {renderOutlineContent(true)}
                    </aside>
                </>
            )}
        </div>
    );
};

export default PDFViewer;
