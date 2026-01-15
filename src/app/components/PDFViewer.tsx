import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// PDF.js worker 설정
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

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
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
    const [currentPage, setCurrentPage] = useState(initialPage);
    const [totalPages, setTotalPages] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [scale, setScale] = useState(1);
    const [rendering, setRendering] = useState(false);

    // PDF 문서 로드
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        const loadPDF = async () => {
            try {
                const loadingTask = pdfjsLib.getDocument({
                    url,
                    cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
                    cMapPacked: true,
                });

                const pdf = await loadingTask.promise;

                if (!cancelled) {
                    setPdfDoc(pdf);
                    setTotalPages(pdf.numPages);
                    setCurrentPage(Math.min(initialPage, pdf.numPages));
                    setLoading(false);
                }
            } catch (err) {
                if (!cancelled) {
                    console.error('PDF 로드 오류:', err);
                    setError('PDF를 불러올 수 없습니다');
                    setLoading(false);
                }
            }
        };

        loadPDF();

        return () => {
            cancelled = true;
        };
    }, [url, initialPage]);

    // 페이지 렌더링
    const renderPage = useCallback(async (pageNum: number) => {
        if (!pdfDoc || !canvasRef.current || !containerRef.current || rendering) return;

        setRendering(true);

        try {
            const page = await pdfDoc.getPage(pageNum);
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');

            if (!context) return;

            // 컨테이너 크기에 맞게 스케일 계산
            const containerWidth = containerRef.current.clientWidth - 32; // padding 고려
            const viewport = page.getViewport({ scale: 1 });
            const calculatedScale = containerWidth / viewport.width;
            const scaledViewport = page.getViewport({ scale: calculatedScale * scale });

            // 고해상도 디스플레이 지원
            const pixelRatio = window.devicePixelRatio || 1;
            canvas.width = scaledViewport.width * pixelRatio;
            canvas.height = scaledViewport.height * pixelRatio;
            canvas.style.width = `${scaledViewport.width}px`;
            canvas.style.height = `${scaledViewport.height}px`;

            context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

            await page.render({
                canvasContext: context,
                viewport: scaledViewport,
            }).promise;

        } catch (err) {
            console.error('페이지 렌더링 오류:', err);
        } finally {
            setRendering(false);
        }
    }, [pdfDoc, scale, rendering]);

    // 페이지 변경시 렌더링
    useEffect(() => {
        if (pdfDoc && currentPage > 0) {
            renderPage(currentPage);
        }
    }, [pdfDoc, currentPage, renderPage]);

    // 윈도우 리사이즈 처리
    useEffect(() => {
        let resizeTimeout: NodeJS.Timeout;

        const handleResize = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (pdfDoc && currentPage > 0) {
                    renderPage(currentPage);
                }
            }, 200);
        };

        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            clearTimeout(resizeTimeout);
        };
    }, [pdfDoc, currentPage, renderPage]);

    // 페이지 네비게이션
    const goToPage = (page: number) => {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page);
        }
    };

    const prevPage = () => goToPage(currentPage - 1);
    const nextPage = () => goToPage(currentPage + 1);

    // 줌 컨트롤
    const zoomIn = () => setScale(s => Math.min(s + 0.25, 3));
    const zoomOut = () => setScale(s => Math.max(s - 0.25, 0.5));
    const resetZoom = () => setScale(1);

    if (loading) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-[#1a1a1a]">
                <div className="text-center">
                    <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mb-4 mx-auto"></div>
                    <p className="text-sm text-white/50 tracking-widest">PDF 로딩중...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-[#1a1a1a] p-8">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-500 mb-4">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-sm text-white/70 mb-4">{error}</p>
                <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-white/10 border border-white/20 text-xs tracking-widest hover:bg-white/20 transition-colors"
                >
                    새 탭에서 열기
                </a>
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col bg-[#1a1a1a]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-black/50 border-b border-white/10 shrink-0 flex-wrap gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                    </svg>
                    <span className="text-sm text-white/70 tracking-wider uppercase">PDF Document</span>
                    {isDailyReading && todayInfo && (
                        <span className="text-xs text-blue-400 tracking-wide">{todayInfo}</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 text-[10px] tracking-widest border border-white/20 hover:bg-white/10 transition-colors"
                    >
                        새 탭
                    </a>
                    <a
                        href={url}
                        download
                        className="px-3 py-1.5 text-[10px] tracking-widest bg-white/10 border border-white/20 hover:bg-white/20 transition-colors"
                    >
                        다운로드
                    </a>
                </div>
            </div>

            {/* Navigation Bar */}
            <div className="flex items-center justify-between px-4 py-2 bg-black/30 border-b border-white/10 shrink-0">
                {/* Page Navigation */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={prevPage}
                        disabled={currentPage <= 1}
                        className="w-8 h-8 flex items-center justify-center border border-white/20 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="15 18 9 12 15 6" />
                        </svg>
                    </button>

                    <div className="flex items-center gap-1 text-sm">
                        <input
                            type="number"
                            value={currentPage}
                            onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
                            className="w-12 bg-black/50 border border-white/20 px-2 py-1 text-center text-xs focus:border-white outline-none"
                            min={1}
                            max={totalPages}
                        />
                        <span className="text-white/50 text-xs">/ {totalPages}</span>
                    </div>

                    <button
                        onClick={nextPage}
                        disabled={currentPage >= totalPages}
                        className="w-8 h-8 flex items-center justify-center border border-white/20 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="9 18 15 12 9 6" />
                        </svg>
                    </button>
                </div>

                {/* Zoom Controls */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={zoomOut}
                        disabled={scale <= 0.5}
                        className="w-8 h-8 flex items-center justify-center border border-white/20 hover:bg-white/10 disabled:opacity-30 transition-colors"
                        title="축소"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                    </button>

                    <button
                        onClick={resetZoom}
                        className="px-2 h-8 text-[10px] tracking-widest border border-white/20 hover:bg-white/10 transition-colors"
                    >
                        {Math.round(scale * 100)}%
                    </button>

                    <button
                        onClick={zoomIn}
                        disabled={scale >= 3}
                        className="w-8 h-8 flex items-center justify-center border border-white/20 hover:bg-white/10 disabled:opacity-30 transition-colors"
                        title="확대"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* PDF Canvas Container */}
            <div
                ref={containerRef}
                className="flex-1 overflow-auto flex justify-center p-4 bg-[#2a2a2a]"
                style={{ minHeight: '60vh' }}
            >
                <div className="relative">
                    {rendering && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                            <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                        </div>
                    )}
                    <canvas
                        ref={canvasRef}
                        className="shadow-2xl max-w-full"
                        style={{ touchAction: 'pan-x pan-y' }}
                    />
                </div>
            </div>

            {/* Mobile Swipe Hint */}
            <div className="md:hidden text-center py-2 text-[10px] text-white/30 tracking-widest bg-black/30">
                ← → 버튼을 사용하여 페이지 이동
            </div>
        </div>
    );
};

export default PDFViewer;
