import React, { forwardRef } from 'react';
import { GalleryItemType } from '../data/gallery';
import { useCursor } from '../context/CursorContext';

interface GalleryItemProps {
  item: GalleryItemType;
  onClick: () => void;
  // We might pass style for the transform if we were doing React-state animation, 
  // but here we are doing ref-based manipulation, so style comes from parent imperatively mostly.
  // Actually, the parent sets transform directly on the DOM element.
}

export const GalleryItem = forwardRef<HTMLDivElement, GalleryItemProps>(({ item, onClick }, QX) => {
  const { setIsHovered, setCursorText } = useCursor();

  // Extract YouTube ID
  const getYoutubeId = (url: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  // YouTube 썸네일 품질 순서: maxresdefault -> hqdefault -> mqdefault -> default
  const [thumbnailUrl, setThumbnailUrl] = React.useState<string>('');

  React.useEffect(() => {
    if (item.type === 'video' && item.videoUrl) {
      const ytId = getYoutubeId(item.videoUrl);
      if (ytId) {
        // 먼저 hqdefault 시도 (대부분의 영상에서 사용 가능)
        setThumbnailUrl(`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`);
      } else {
        setThumbnailUrl(item.image);
      }
    } else {
      setThumbnailUrl(item.image);
    }
  }, [item]);

  const handleThumbnailError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.target as HTMLImageElement;
    const currentSrc = target.src;

    if (currentSrc.includes('hqdefault')) {
      target.src = currentSrc.replace('hqdefault', 'mqdefault');
    } else if (currentSrc.includes('mqdefault')) {
      target.src = currentSrc.replace('mqdefault', 'default');
    } else if (currentSrc.includes('/default.jpg')) {
      // 모든 YouTube 썸네일 실패시 기본 이미지 사용
      target.src = item.image || '/placeholder.jpg';
    }
  };

  // Handle click - external link opens in new tab, others open detail view
  const handleClick = () => {
    if (item.type === 'link' && item.externalUrl) {
      window.open(item.externalUrl, '_blank', 'noopener,noreferrer');
    } else {
      onClick();
    }
  };

  return (
    <article
      ref={QX}
      className="gallery-item group relative mr-[5vw] w-[35vw] max-w-[600px] h-[65vh] shrink-0 cursor-pointer will-change-transform"
      onClick={handleClick}
      onMouseEnter={() => {
        setIsHovered(true);
        setCursorText(item.type === 'link' ? 'LINK' : 'OPEN');
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        setCursorText('');
      }}
    >
      <span className="index-number font-['Anton'] text-[6rem] leading-none opacity-[0.03] absolute -top-[4rem] -right-[2rem] pointer-events-none text-white select-none">
        {item.index}
      </span>

      <div className="image-wrapper w-full h-full overflow-hidden relative bg-[#111] rounded-[2px]">
        <img
          src={thumbnailUrl}
          alt={item.title}
          onError={handleThumbnailError}
          className="gallery-img w-[140%] h-full object-cover absolute -left-[20%] grayscale brightness-[0.6] transition-[filter] duration-[800ms] ease-out group-hover:grayscale-0 group-hover:brightness-100 will-change-transform"
        />
        {item.type === 'video' && (
          <div className="absolute inset-0 flex items-center justify-center opacity-50 group-hover:opacity-100 transition-opacity">
            <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center">
              <div className="w-0 h-0 border-t-[8px] border-t-transparent border-l-[14px] border-l-white border-b-[8px] border-b-transparent ml-1"></div>
            </div>
          </div>
        )}
        {item.type === 'link' && (
          <div className="absolute inset-0 flex items-center justify-center opacity-50 group-hover:opacity-100 transition-opacity">
            <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </div>
          </div>
        )}
      </div>

      <div className="meta-info absolute -bottom-[3.5rem] left-0 z-10 pointer-events-none transition-transform duration-400 text-white">
        <h2 className="title font-['Anton'] text-[3rem] uppercase leading-none tracking-[-1px]">
          {item.title}
        </h2>
        <p className="subtitle text-[0.75rem] tracking-[4px] mt-2 opacity-40 uppercase font-['Inter']">
          {item.subtitle}
        </p>
      </div>
    </article>
  );
});

GalleryItem.displayName = 'GalleryItem';
