import React, { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure worker using CDN to ensure compatibility without complex build setup
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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
    const containerRef = useRef<HTMLDivElement>(null);

    // Sync page number when props change (e.g. opening different file or calculated daily page)
    useEffect(() => {
        setPageNumber(initialPage);
    }, [initialPage, url]);

    // Measure container for responsive PDF rendering
    useEffect(() => {
        if (!containerRef.current) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentBoxSize) {
                    setContainerWidth(entry.contentBoxSize[0].inlineSize);
                } else {
                    setContainerWidth(entry.contentRect.width);
                }
            }
        });

        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
        setNumPages(numPages);
    };

    const changePage = (offset: number) => {
        setPageNumber(prevPageNumber => {
            const newPage = prevPageNumber + offset;
            return Math.max(1, Math.min(newPage, numPages || 1));
        });
    };

    const previousPage = () => changePage(-1);
    const nextPage = () => changePage(1);

    return (
        <div className="w-full h-full flex flex-col bg-[#1a1a1a]">
            {/* Header / Controls */}
            <div className="flex items-center justify-between px-4 py-3 bg-black/50 border-b border-white/10 shrink-0 flex-wrap gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm text-white/70 font-medium tracking-wide">
                        {numPages ? `PAGE ${pageNumber} / ${numPages}` : 'LOADING...'}
                    </span>
                    {isDailyReading && todayInfo && (
                        <span className="text-xs text-blue-400 tracking-wide">{todayInfo}</span>
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
                className="flex-1 w-full relative bg-[#111] overflow-auto flex justify-center p-4"
                ref={containerRef}
            >
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
                    className="flex flex-col items-center shadow-2xl"
                >
                    {/* Render current page */}
                    {containerWidth > 0 && (
                        <Page
                            pageNumber={pageNumber}
                            width={Math.min(containerWidth * 0.95, 1200) * scale}
                            renderTextLayer={true}
                            renderAnnotationLayer={true}
                            className="bg-white shadow-2xl"
                            loading={
                                <div className="h-[60vh] w-full flex items-center justify-center text-white/20">
                                    <div className="animate-pulse">Loading Page...</div>
                                </div>
                            }
                        />
                    )}
                </Document>

                {/* Floating Navigation Buttons (Bottom Center) - Only show when loaded */}
                {numPages && (
                    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-6 bg-[#1a1a1a]/90 backdrop-blur-md px-8 py-3 rounded-full border border-white/10 shadow-2xl z-20 transition-all duration-300 hover:scale-105">
                        <button
                            onClick={previousPage}
                            disabled={pageNumber <= 1}
                            className="text-white hover:text-blue-400 disabled:opacity-30 disabled:hover:text-white transition-colors"
                            title="Previous Page"
                        >
                            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>

                        <span className="text-white font-['Anton'] tracking-wider min-w-[3ch] text-center text-lg">
                            {pageNumber}
                        </span>

                        <button
                            onClick={nextPage}
                            disabled={pageNumber >= (numPages || 1)}
                            className="text-white hover:text-blue-400 disabled:opacity-30 disabled:hover:text-white transition-colors"
                            title="Next Page"
                        >
                            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PDFViewer;
