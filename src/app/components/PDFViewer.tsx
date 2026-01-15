import React, { useState } from 'react';

interface PDFViewerProps {
    url: string;
    initialPage?: number;
    isDailyReading?: boolean;
    todayInfo?: string;
}

export const PDFViewer: React.FC<PDFViewerProps> = ({
    url,
    isDailyReading = false,
    todayInfo = ''
}) => {
    const [loading, setLoading] = useState(true);

    // Google Docs Viewer URL 생성
    // embedded=true: 임베디드 모드
    // url: PDF 파일 주소 (반드시 인코딩 필요)
    const gdocsUrl = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`;

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
                        원본 보기
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

            {/* Viewer Container */}
            <div
                className="flex-1 w-full relative bg-white"
                style={{ minHeight: isDailyReading ? '85vh' : '65vh' }}
            >
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a1a] z-10">
                        <div className="text-center">
                            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mb-4 mx-auto"></div>
                            <p className="text-sm text-white/50 tracking-widest">문서 로딩중...</p>
                        </div>
                    </div>
                )}

                <iframe
                    src={gdocsUrl}
                    className="w-full h-full border-0"
                    title="PDF Viewer"
                    onLoad={() => setLoading(false)}
                    allow="autoplay"
                />
            </div>
        </div>
    );
};

export default PDFViewer;
