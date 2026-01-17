import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure worker using CDN to ensure compatibility without complex build setup
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// localStorage helpers for reading progress
const getStorageKey = (url: string) => `pdf_progress_${btoa(url).slice(0, 50)}`;

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
    } catch {
        // localStorage not available
    }
};

interface PDFViewerProps {
    url: string;
    initialPage?: number;
    isDailyReading?: boolean;
    todayInfo?: string;
}

export const PDFViewer: React.FC<PDFViewerProps> = ({
    url,
    initialPage = 1,
    isDailyReading = false,
    todayInfo = ''
}) => {
    const [numPages, setNumPages] = useState<number | null>(null);
    const [pageNumber, setPageNumber] = useState(initialPage);
    const [scale, setScale] = useState(1);
    const [containerWidth, setContainerWidth] = useState<number>(0);
    const [pageInput, setPageInput] = useState('');
    const [showPageInput, setShowPageInput] = useState(false);
    const [savedPageIndicator, setSavedPageIndicator] = useState<number | null>(null);
    const [showBookmarkSaved, setShowBookmarkSaved] = useState(false);
    const [containerHeight, setContainerHeight] = useState<number>(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Load saved page on mount (only for non-QT PDFs)
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

    // Auto-save page on change (only for non-QT PDFs)
    useEffect(() => {
        if (!isDailyReading && numPages) {
            savePage(url, pageNumber);
        }
    }, [pageNumber, url, isDailyReading, numPages]);

    // Clear saved indicator after a few seconds
    useEffect(() => {
        if (savedPageIndicator) {
            const timer = setTimeout(() => setSavedPageIndicator(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [savedPageIndicator]);

    // Focus input when shown
    useEffect(() => {
        if (showPageInput && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [showPageInput]);

    // Measure container for responsive PDF rendering
    useEffect(() => {
        if (!containerRef.current) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentBoxSize) {
                    setContainerWidth(entry.contentBoxSize[0].inlineSize);
                    setContainerHeight(entry.contentBoxSize[0].blockSize);
                } else {
                    setContainerWidth(entry.contentRect.width);
                    setContainerHeight(entry.contentRect.height);
                }
            }
        });

        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
        setNumPages(numPages);
    };

    const changePage = useCallback((offset: number) => {
        setPageNumber(prevPageNumber => {
            const newPage = prevPageNumber + offset;
            return Math.max(1, Math.min(newPage, numPages || 1));
        });
    }, [numPages]);

    const goToPage = useCallback((page: number) => {
        const validPage = Math.max(1, Math.min(page, numPages || 1));
        setPageNumber(validPage);
        setShowPageInput(false);
        setPageInput('');
    }, [numPages]);

    const handlePageInputSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const page = parseInt(pageInput, 10);
        if (!isNaN(page)) {
            goToPage(page);
        }
    };

    const handlePageInputKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            setShowPageInput(false);
            setPageInput('');
        }
    };

    const previousPage = () => changePage(-1);
    const nextPage = () => changePage(1);

    // Explicit bookmark save with visual feedback
    const handleBookmarkSave = () => {
        if (!isDailyReading) {
            savePage(url, pageNumber);
            setShowBookmarkSaved(true);
            setTimeout(() => setShowBookmarkSaved(false), 2000);
        }
    };

    return (
        <div className="w-full h-full flex flex-col bg-[#1a1a1a]">
            {/* Header / Controls */}
            <div className="flex items-center justify-between px-4 py-3 bg-black/50 border-b border-white/10 shrink-0 flex-wrap gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                    {/* Page indicator - clickable to show input */}
                    {showPageInput ? (
                        <form onSubmit={handlePageInputSubmit} className="flex items-center gap-2">
                            <input
                                ref={inputRef}
                                type="number"
                                min={1}
                                max={numPages || 1}
                                value={pageInput}
                                onChange={(e) => setPageInput(e.target.value)}
                                onKeyDown={handlePageInputKeyDown}
                                onBlur={() => { setShowPageInput(false); setPageInput(''); }}
                                placeholder={pageNumber.toString()}
                                className="w-16 px-2 py-1 text-sm bg-white/10 border border-white/30 rounded text-white text-center focus:outline-none focus:border-blue-400"
                            />
                            <span className="text-sm text-white/50">/ {numPages || '...'}</span>
                        </form>
                    ) : (
                        <button
                            onClick={() => { setShowPageInput(true); setPageInput(pageNumber.toString()); }}
                            className="text-sm text-white/70 font-medium tracking-wide hover:text-white transition-colors cursor-pointer"
                            title="클릭하여 페이지 입력"
                        >
                            {numPages ? `PAGE ${pageNumber} / ${numPages}` : 'LOADING...'}
                        </button>
                    )}

                    {isDailyReading && todayInfo && (
                        <span className="text-xs text-blue-400 tracking-wide">{todayInfo}</span>
                    )}

                    {/* Saved page indicator */}
                    {savedPageIndicator && !isDailyReading && (
                        <span className="text-xs text-green-400 animate-pulse">
                            📖 {savedPageIndicator}페이지에서 이어보기
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-white/5 rounded-lg overflow-hidden border border-white/5">
                        <button
                            onClick={() => setScale(s => Math.max(0.5, s - 0.1))}
                            className="px-3 py-1 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                            title="Zoom Out"
                        >
                            -
                        </button>
                        <span className="text-xs text-white/50 w-12 text-center border-l border-r border-white/5 py-1">
                            {Math.round(scale * 100)}%
                        </span>
                        <button
                            onClick={() => setScale(s => Math.min(2.0, s + 0.1))}
                            className="px-3 py-1 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                            title="Zoom In"
                        >
                            +
                        </button>
                    </div>

                    <a
                        href={url}
                        download
                        className="px-3 py-1 text-[10px] tracking-widest bg-white/10 hover:bg-white/20 border border-white/20 transition-colors rounded"
                    >
                        DOWNLOAD
                    </a>
                </div>
            </div>

            {/* Main Viewer Area */}
            <div
                className="flex-1 w-full relative bg-[#111] overflow-auto flex items-center justify-center"
                ref={containerRef}
            >
                {/* Left Navigation Button */}
                {numPages && (
                    <button
                        onClick={previousPage}
                        disabled={pageNumber <= 1}
                        className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-black/60 hover:bg-black/80 backdrop-blur-sm rounded-full border border-white/20 text-white hover:text-blue-400 disabled:opacity-20 disabled:hover:text-white transition-all shadow-xl"
                        title="이전 페이지"
                    >
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                )}

                {/* Right Navigation Button */}
                {numPages && (
                    <button
                        onClick={nextPage}
                        disabled={pageNumber >= (numPages || 1)}
                        className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-black/60 hover:bg-black/80 backdrop-blur-sm rounded-full border border-white/20 text-white hover:text-blue-400 disabled:opacity-20 disabled:hover:text-white transition-all shadow-xl"
                        title="다음 페이지"
                    >
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                )}

                <Document
                    file={url}
                    onLoadSuccess={onDocumentLoadSuccess}
                    loading={
                        <div className="absolute inset-0 flex items-center justify-center text-white/50">
                            <div className="flex flex-col items-center gap-4">
                                <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                <span className="text-xs tracking-widest opacity-70">LOADING DOCUMENT...</span>
                            </div>
                        </div>
                    }
                    error={
                        <div className="flex flex-col items-center justify-center h-full text-red-400 text-sm gap-2">
                            <p>Unable to load PDF directly.</p>
                            <a href={url} target="_blank" rel="noreferrer" className="px-4 py-2 bg-white/10 rounded hover:bg-white/20 transition-colors text-white">
                                Open Original File
                            </a>
                        </div>
                    }
                    className="flex flex-col items-center"
                >
                    {/* Render current page - fit to height */}
                    {containerHeight > 0 && (
                        <Page
                            pageNumber={pageNumber}
                            height={(containerHeight - 32) * scale}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                            className="bg-white shadow-2xl"
                            loading={
                                <div className="h-[60vh] w-full flex items-center justify-center text-white/20">
                                    <div className="animate-pulse">Loading Page...</div>
                                </div>
                            }
                        />
                    )}
                </Document>

                {/* Bottom info bar with bookmark */}
                {numPages && !isDailyReading && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/70 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-xl z-20">
                        <button
                            onClick={() => { setShowPageInput(true); setPageInput(pageNumber.toString()); }}
                            className="text-white/70 text-sm hover:text-white transition-colors"
                            title="페이지 입력"
                        >
                            {pageNumber} / {numPages}
                        </button>
                        <div className="w-px h-4 bg-white/20"></div>
                        <button
                            onClick={handleBookmarkSave}
                            className={`transition-all duration-300 ${showBookmarkSaved ? 'text-green-400' : 'text-white/60 hover:text-yellow-400'}`}
                            title="여기까지 읽음 저장"
                        >
                            {showBookmarkSaved ? (
                                <span className="text-xs">✓ 저장됨</span>
                            ) : (
                                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                </svg>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PDFViewer;

