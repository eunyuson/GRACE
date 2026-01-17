import React from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { useGallery } from '../context/GalleryContext';
import { useCursor } from '../context/CursorContext';
import { GalleryItemType } from '../data/gallery';
import { Comments } from './Comments';
import { PDFViewer } from './PDFViewer';

interface DetailViewProps {
  isOpen: boolean;
  onClose: () => void;
  item: GalleryItemType | null;
  onSelect?: (item: GalleryItemType) => void;
}

const transition = { duration: 0.8, ease: [0.16, 1, 0.3, 1] as any };

// Helper to extract YouTube ID
const getYouTubeId = (url: string | undefined): string | null => {
  if (!url) return null;
  const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);
  return (match && match[2].length === 11) ? match[2] : null;
};

export const DetailView: React.FC<DetailViewProps> = ({ isOpen, onClose, item, onSelect }) => {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const { setIsHovered, setCursorText } = useCursor();
  const { items } = useGallery();

  const [activeTab, setActiveTab] = React.useState<string>('');
  const galleryScrollRef = React.useRef<HTMLDivElement>(null);

  // Persistent video player state - keeps the iframe alive across tab changes
  const [persistentVideo, setPersistentVideo] = React.useState<{
    keyword: string;
    videoUrl: string;
    playMode: string;
    ytId: string;
  } | null>(null);

  // Whether the video is in PiP mode (mini player) or main display
  const [isInPipMode, setIsInPipMode] = React.useState(false);

  // URL viewer state
  const [urlInput, setUrlInput] = React.useState('');
  const [displayUrl, setDisplayUrl] = React.useState('');

  // Custom smooth scroll with easing
  const smoothScrollTo = React.useCallback((container: HTMLElement, targetPosition: number, duration: number = 600) => {
    const start = container.scrollLeft;
    const distance = targetPosition - start;
    const startTime = performance.now();

    // Ease out cubic for smooth deceleration
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const animateScroll = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = easeOutCubic(progress);

      container.scrollLeft = start + (distance * easeProgress);

      if (progress < 1) {
        requestAnimationFrame(animateScroll);
      }
    };

    requestAnimationFrame(animateScroll);
  }, []);

  // Auto-scroll to center the selected image with smooth animation
  React.useEffect(() => {
    if (galleryScrollRef.current && activeTab) {
      const container = galleryScrollRef.current;
      const selectedElement = container.querySelector(`[data-keyword="${activeTab}"]`) as HTMLElement;
      if (selectedElement) {
        const containerWidth = container.offsetWidth;
        const elementLeft = selectedElement.offsetLeft;
        const elementWidth = selectedElement.offsetWidth;
        const scrollPosition = elementLeft - (containerWidth / 2) + (elementWidth / 2);
        smoothScrollTo(container, scrollPosition, 500);
      }
    }
  }, [activeTab, smoothScrollTo]);

  const [isAdmin, setIsAdmin] = React.useState(false);

  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAdmin(!!user);
    });
    return () => unsubscribe();
  }, []);

  React.useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
    // Reset to default view (show main description) when item changes
    setActiveTab('STORY');
    // Clear persistent video when item changes
    setPersistentVideo(null);
    setIsInPipMode(false);
    // Clear URL viewer when item changes
    setUrlInput('');
    setDisplayUrl('');
  }, [item]);

  // Reset cursor on unmount or close
  React.useEffect(() => {
    return () => {
      setIsHovered(false);
      setCursorText('');
    };
  }, [isOpen, setIsHovered, setCursorText]);

  // Start playing a video
  // displayMode: 'pip' = mini player (for music), 'inline' = main screen (for videos)
  const startVideo = React.useCallback((keyword: string, videoUrl: string, playMode: string, displayMode: 'pip' | 'inline' = 'inline') => {
    const ytId = getYouTubeId(videoUrl);
    if (ytId) {
      setPersistentVideo({ keyword, videoUrl, playMode, ytId });
      // Set PiP mode based on displayMode
      // pip = start in mini player for uninterrupted music playback
      // inline = show in main screen (will move to PiP when changing tabs)
      setIsInPipMode(displayMode === 'pip');
    }
  }, []);

  // Handle tab switching - video goes to PiP when switching away from its tab
  const handleTabChange = React.useCallback((newTab: string) => {
    if (!item) return;

    // If we have a persistent video and we're switching away from its tab, move to PiP
    if (persistentVideo && persistentVideo.keyword !== newTab) {
      setIsInPipMode(true);
    } else if (persistentVideo && persistentVideo.keyword === newTab) {
      // Returning to video's tab - restore to main display (only if it was inline mode originally)
      // For now, keep in PiP to avoid interruption
      // User can close PiP to restart video in main
    }

    setActiveTab(newTab);
  }, [item, persistentVideo]);

  // Close PiP and stop video completely
  const closePip = React.useCallback(() => {
    setPersistentVideo(null);
    setIsInPipMode(false);
  }, []);

  // Click on PiP to return to that tab (video stays in main display)
  const returnToPipTab = React.useCallback(() => {
    if (persistentVideo) {
      setActiveTab(persistentVideo.keyword);
      setIsInPipMode(false);
    }
  }, [persistentVideo]);

  // Collect all images (main + from content sections) - moved before early return for hooks rules
  const allImages = React.useMemo(() => {
    if (!item) return [];
    const images: { id: string; image: string; keyword: string; isMain: boolean }[] = [];

    // Main image
    if (item.image) {
      images.push({ id: 'main', image: item.image, keyword: 'STORY', isMain: true });
    }

    // Content section images
    item.content?.forEach(section => {
      if (section.image) {
        images.push({ id: section.id, image: section.image, keyword: section.keyword, isMain: false });
      }
    });

    return images;
  }, [item]);

  if (!item) return null;

  // Find current content
  const currentContent = item.content.find(c => c.keyword === activeTab);

  // Check if current tab has a video (to track for PiP)
  const currentVideoUrl = currentContent?.videoUrl || (activeTab === 'STORY' && item.type === 'video' ? item.videoUrl : undefined);
  const currentYouTubeId = getYouTubeId(currentVideoUrl);

  // Get related items (exclude current)
  const relatedItems = items
    .filter((i) => i.id !== item.id)
    .slice(0, 3);

  // Check if current view is PDF (to hide metadata)
  const isPdfView = !!(currentContent?.pdfUrl || (item.type === 'pdf' ? item.pdfUrl : undefined));

  // Determine if this is a Daily Meditation QT item
  // This logic was previously only inside the PDF viewer block
  const isDailyReading =
    currentContent?.isDailyReading === true ||
    currentContent?.isDailyReading === 'true' ||
    (item.type === 'pdf' && (item.isDailyReading === true || item.isDailyReading === 'true'));

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={contentRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed top-0 left-0 w-full h-full bg-[#050505] z-[1000] overflow-y-auto overflow-x-hidden"
        >
          {/* Fixed Close Button for Mobile */}
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.3 }}
            onClick={onClose}
            className="fixed top-4 right-4 md:hidden z-[1100] w-10 h-10 flex items-center justify-center bg-black/60 backdrop-blur-md rounded-full border border-white/20 text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </motion.button>

          <div className="min-h-screen p-4 pt-16 md:p-[5vw] md:pt-[22vh]">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 mb-6 md:mb-[5vh]">
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ ...transition, delay: 0.1 }}
                className="overflow-hidden"
              >
                <h2 className="font-['Anton'] text-[clamp(2.5rem,10vw,8rem)] leading-[0.9] uppercase tracking-[-1px] md:tracking-[-2px] text-white">
                  {item.descTitle}
                </h2>
              </motion.div>

              <div className="hidden md:flex items-center gap-8">
                {isAdmin && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ ...transition, delay: 0.2 }}
                  >
                    <Link
                      to={`/admin?edit=${item.id}`}
                      className="text-[0.8rem] tracking-[3px] border-b border-white text-white hover:text-white/70 transition-colors uppercase"
                      onMouseEnter={() => { setIsHovered(true); setCursorText('EDIT'); }}
                      onMouseLeave={() => { setIsHovered(false); setCursorText(''); }}
                    >
                      EDIT MOMENT
                    </Link>
                  </motion.div>
                )}

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ ...transition, delay: 0.2 }}
                  onClick={onClose}
                  onMouseEnter={() => { setIsHovered(true); setCursorText('CLOSE'); }}
                  onMouseLeave={() => { setIsHovered(false); setCursorText(''); }}
                  className="group flex flex-col items-center cursor-pointer text-white mix-blend-difference z-50"
                >
                  <span className="text-[0.8rem] tracking-[3px] border-b border-transparent group-hover:border-white transition-all duration-300 pb-1">CLOSE</span>
                </motion.div>
              </div>
            </div>

            {/* Horizontal Image Gallery - like homepage style with center focus */}
            {allImages.length > 1 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...transition, delay: 0.15 }}
                className="mb-8 -mx-[5vw]"
              >
                <div
                  ref={galleryScrollRef}
                  className="overflow-x-auto scrollbar-hide scroll-smooth"
                  style={{ scrollSnapType: 'x mandatory' }}
                >
                  <div className="flex gap-3 md:gap-6 px-[10vw] md:px-[calc(50vw-22.5vw)]">
                    {/* Single set of images - finite scroll */}
                    {allImages.map((img) => (
                      <div
                        key={img.id}
                        data-keyword={img.keyword}
                        onClick={() => handleTabChange(img.keyword)}
                        className={`relative shrink-0 cursor-pointer overflow-hidden transition-all duration-500 group w-[75vw] md:w-[45vw] max-w-[550px] h-[45vh] md:h-[60vh] ${activeTab === img.keyword
                          ? 'opacity-100 scale-100'
                          : 'opacity-40 grayscale hover:opacity-70 hover:grayscale-0 scale-95'
                          }`}
                        style={{
                          scrollSnapAlign: 'center'
                        }}
                      >
                        <img
                          src={img.image}
                          alt={img.keyword}
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                        {/* Title overlay at bottom */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                          <span className="font-['Anton'] text-lg tracking-wider text-white uppercase">
                            {img.keyword}
                          </span>
                          {img.isMain && (
                            <span className="ml-2 text-[10px] text-white/50 tracking-widest">MAIN</span>
                          )}
                        </div>
                        {/* Selection indicator */}
                        {activeTab === img.keyword && (
                          <div className="absolute top-4 right-4 w-3 h-3 bg-white rounded-full"></div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Single Main Image/Video/PDF - only shows if there's 1 or no gallery images */}
            {allImages.length <= 1 && (
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 50 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ ...transition, delay: 0.2 }}
                className={`w-full ${isDailyReading ? 'mb-0 h-[85vh] md:h-[80vh]' : 'mb-[8vh] min-h-[70vh]'} bg-[#111] overflow-hidden relative`}
              >
                {isDailyReading ? (
                  /* Daily Meditation QT Special Layout */
                  <div className="flex flex-col lg:flex-row h-full">
                    {/* Left: PDF Viewer */}
                    <div className="flex-1 h-[55vh] lg:h-full relative border-b lg:border-b-0 lg:border-r border-white/10">
                      {(() => {
                        const displayPdfUrl = currentContent?.pdfUrl || (item.type === 'pdf' ? item.pdfUrl : undefined);
                        if (!displayPdfUrl) return null;

                        const pdfStartDate = currentContent?.pdfStartDate || item.pdfStartDate || '01-01';
                        const pagesPerDay = Number(currentContent?.pagesPerDay || item.pagesPerDay) || 2;
                        const pdfFirstPage = Number(currentContent?.pdfFirstPage || item.pdfFirstPage) || 1;

                        let pdfPage = 1;
                        let todayInfo = '';

                        const today = new Date();
                        const currentYear = today.getFullYear();

                        let startMonth = 1, startDay = 1;
                        if (pdfStartDate.includes('-')) {
                          const parts = pdfStartDate.split('-');
                          if (parts.length === 2) {
                            startMonth = parseInt(parts[0], 10);
                            startDay = parseInt(parts[1], 10);
                          } else if (parts.length === 3) {
                            startMonth = parseInt(parts[1], 10);
                            startDay = parseInt(parts[2], 10);
                          }
                        }

                        const startOfYear = new Date(currentYear, startMonth - 1, startDay);
                        const diffTime = today.getTime() - startOfYear.getTime();
                        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                        const dayNumber = Math.max(0, diffDays) + 1;
                        pdfPage = pdfFirstPage + ((dayNumber - 1) * pagesPerDay);

                        const monthDay = `${today.getMonth() + 1}월 ${today.getDate()}일`;
                        todayInfo = `📅 ${monthDay} (${dayNumber}일차) → ${pdfPage}~${pdfPage + pagesPerDay - 1}페이지`;

                        return (
                          <PDFViewer
                            key={activeTab + '-pdf-qt'}
                            url={displayPdfUrl}
                            initialPage={pdfPage}
                            isDailyReading={true}
                            todayInfo={todayInfo}
                          />
                        );
                      })()}
                    </div>

                    {/* Right: Comments Panel */}
                    <div className="h-[45vh] lg:h-full lg:w-[400px] bg-[#0a0a0a]">
                      <Comments galleryItem={item} variant="side-panel" />
                    </div>
                  </div>
                ) : (
                  /* Standard Layout */
                  (() => {
                    const displayVideoUrl = currentContent?.videoUrl || (item.type === 'video' ? item.videoUrl : undefined);
                    const displayImage = currentContent?.image || item.image;
                    const playMode = currentContent?.videoPlayMode || item.videoPlayMode || 'manual';
                    const displayMode = currentContent?.videoDisplayMode || item.videoDisplayMode || 'inline';
                    const ytId = getYouTubeId(displayVideoUrl);

                    // Check if this tab's video is currently playing
                    const isCurrentlyPlaying = persistentVideo && persistentVideo.keyword === activeTab;
                    // Check if playing in main screen (not PiP)
                    const isPlayingInline = isCurrentlyPlaying && !isInPipMode;

                    // YouTube video
                    if (ytId) {
                      // If playing inline (in main screen), show the iframe
                      if (isPlayingInline) {
                        return (
                          <iframe
                            className="w-full h-full bg-black"
                            src={`https://www.youtube.com/embed/${persistentVideo!.ytId}?autoplay=1&loop=1&playlist=${persistentVideo!.ytId}&rel=0&controls=1&enablejsapi=1${persistentVideo!.playMode === 'muted-autoplay' ? '&mute=1' : ''}`}
                            title="YouTube video player"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        );
                      }

                      // If playing in PiP, show "playing in mini player" overlay
                      if (isCurrentlyPlaying && isInPipMode) {
                        return (
                          <div className="relative w-full h-full">
                            <img
                              src={displayImage || `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`}
                              alt={item.title}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                              <div className="text-center">
                                <div className="flex items-center justify-center gap-2 mb-2">
                                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                                  <span className="text-white text-lg tracking-wider uppercase">Playing in Mini Player</span>
                                </div>
                                <p className="text-white/60 text-sm">Look at the bottom-right corner</p>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      // Not playing - show thumbnail with play button
                      return (
                        <div
                          className="relative w-full h-full group cursor-pointer"
                          onClick={() => startVideo(activeTab, displayVideoUrl!, playMode, displayMode)}
                        >
                          <img
                            src={displayImage || `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/50 transition-all duration-300">
                            <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                              <svg className="w-10 h-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          </div>
                          <div className="absolute bottom-4 left-4 flex items-center gap-2">
                            <span className="text-white/70 text-sm tracking-wider uppercase">
                              {displayMode === 'pip' ? '🎵 Play as Music' : '🎬 Play Video'}
                            </span>
                          </div>
                        </div>
                      );
                    }

                    // Regular video (non-YouTube)
                    if (displayVideoUrl && !ytId) {
                      return (
                        <video
                          key={activeTab + '-video'}
                          src={displayVideoUrl}
                          className="w-full h-full object-cover"
                          autoPlay
                          muted
                          loop
                          playsInline
                        />
                      );
                    }

                    // PDF document viewer
                    const displayPdfUrl = currentContent?.pdfUrl || (item.type === 'pdf' ? item.pdfUrl : undefined);
                    if (displayPdfUrl) {
                      // 일일 묵상(큐티) 페이지 계산 - true 또는 'true' 모두 체크
                      // isDailyReading is now calculated above
                      const pdfStartDate = currentContent?.pdfStartDate || item.pdfStartDate || '01-01';
                      const pagesPerDay = Number(currentContent?.pagesPerDay || item.pagesPerDay) || 2;
                      // PDF 시작 페이지 (표지/목차 제외, 실제 본문 시작 페이지)
                      const pdfFirstPage = Number(currentContent?.pdfFirstPage || item.pdfFirstPage) || 1;

                      let pdfPage = 1;
                      let todayInfo = '';

                      const pdfUrlWithPage = `${displayPdfUrl}#toolbar=1&navpanes=0&scrollbar=1&view=FitV`;

                      return (
                        <PDFViewer
                          key={activeTab + '-pdf'}
                          url={displayPdfUrl}
                          initialPage={pdfPage}
                          isDailyReading={false}
                          todayInfo={todayInfo}
                        />
                      );
                    }

                    // Link type - display external URL in iframe
                    const displayLinkUrl = currentContent?.externalUrl || (item.type === 'link' ? item.externalUrl : undefined);
                    if (displayLinkUrl) {
                      return (
                        <div className="relative w-full h-full">
                          <iframe
                            key={activeTab + '-link'}
                            src={displayLinkUrl}
                            title="External Website"
                            className="w-full h-full bg-white"
                            sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-popups-to-escape-sandbox"
                          />
                          {/* Direct link button overlay */}
                          <a
                            href={displayLinkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute top-4 right-4 px-4 py-2 bg-black/70 hover:bg-black/90 backdrop-blur-sm border border-white/20 hover:border-white/40 rounded-lg text-white text-xs tracking-wider transition-all duration-300 flex items-center gap-2 uppercase z-10"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                              <polyline points="15 3 21 3 21 9"></polyline>
                              <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                            새 창에서 열기
                          </a>
                        </div>
                      );
                    }

                    // Image fallback
                    return (
                      <img
                        key={activeTab + '-img'}
                        src={displayImage}
                        alt={item.title}
                        className="w-full h-full object-contain"
                      />
                    );
                  })()
                )}
              </motion.div>
            )}

            {/* Content Grid - Hidden for Daily Meditation QT */}
            {!isDailyReading && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-[15vh] text-[#f0f0f0] font-['Inter']">
                {/* Metadata */}
                {!isPdfView && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...transition, delay: 0.3 }}
                    className="md:col-span-3 space-y-8"
                  >
                    <div>
                      <h3 className="text-[10px] tracking-[2px] opacity-40 uppercase mb-2">Collection</h3>
                      <p className="text-sm">Grace Surf Daily</p>
                    </div>
                    <div>
                      <h3 className="text-[10px] tracking-[2px] opacity-40 uppercase mb-2">Date</h3>
                      <p className="text-sm">{currentContent?.date || 'N/A'}</p>
                    </div>
                  </motion.div>
                )}

                {/* Mobile Keywords Navigation - horizontal scroll */}
                {!isPdfView && (
                  <div className="md:hidden mb-6 -mx-4 px-4 overflow-x-auto">
                    <div className="flex gap-3 pb-2">
                      <button
                        onClick={() => handleTabChange('STORY')}
                        className={`shrink-0 px-4 py-2 text-xs tracking-[2px] uppercase border transition-all ${activeTab === 'STORY'
                          ? 'border-white text-white bg-white/10'
                          : 'border-white/20 text-white/50 hover:text-white/80'
                          }`}
                      >
                        STORY
                      </button>
                      {item.content.map((contentItem) => (
                        <button
                          key={contentItem.id}
                          onClick={() => handleTabChange(contentItem.keyword)}
                          className={`shrink-0 px-4 py-2 text-xs tracking-[2px] uppercase border transition-all ${activeTab === contentItem.keyword
                            ? 'border-white text-white bg-white/10'
                            : 'border-white/20 text-white/50 hover:text-white/80'
                            }`}
                        >
                          {contentItem.keyword}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Main Text */}
                <div className={`${isPdfView ? 'md:col-span-12' : 'md:col-span-6'} md:pr-12 min-h-[300px]`}>
                  <motion.h3
                    key={`title-${activeTab}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="text-2xl font-light mb-8 leading-snug"
                  >
                    {activeTab === 'STORY' ? item.subtitle : activeTab}
                  </motion.h3>

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`content-${activeTab}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.3 }}
                      className="text-[#a0a0a0] leading-[1.8] font-light space-y-6 whitespace-pre-line"
                    >
                      {currentContent ? currentContent.text : item.desc}

                      {/* 외부 링크 버튼 */}
                      {currentContent?.externalUrl && (
                        <motion.a
                          href={currentContent.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: 0.1 }}
                          className="inline-flex items-center gap-2 mt-6 px-5 py-3 bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40 rounded-lg text-white/90 hover:text-white text-sm tracking-wider transition-all duration-300 group"
                          onMouseEnter={() => { setIsHovered(true); setCursorText('OPEN'); }}
                          onMouseLeave={() => { setIsHovered(false); setCursorText(''); }}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                          >
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                          </svg>
                          <span>사이트 바로가기</span>
                        </motion.a>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Keywords Navigation */}
                {!isPdfView && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...transition, delay: 0.5 }}
                    className="md:col-span-3 border-l border-white/10 pl-8 hidden md:block"
                  >
                    <div className="sticky top-24">
                      <h3 className="text-[10px] tracking-[2px] opacity-40 uppercase mb-8">KEYWORDS</h3>
                      <ul className="space-y-6 text-sm text-[#888] max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                        {/* STORY (Main description) */}
                        <li
                          onClick={() => handleTabChange('STORY')}
                          className={`cursor-pointer transition-all duration-300 flex items-center group ${activeTab === 'STORY' ? 'text-white' : 'hover:text-white/60'}`}
                        >
                          <span className={`w-1.5 h-1.5 bg-white rounded-full mr-3 transition-transform duration-300 ${activeTab === 'STORY' ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`} />
                          <span className="tracking-[2px] uppercase">STORY</span>
                        </li>
                        {item.content.map((contentItem) => (
                          <li
                            key={contentItem.id}
                            onClick={() => handleTabChange(contentItem.keyword)}
                            className={`cursor-pointer transition-all duration-300 flex items-center group ${activeTab === contentItem.keyword ? 'text-white' : 'hover:text-white/60'}`}
                          >
                            <span className={`w-1.5 h-1.5 bg-white rounded-full mr-3 transition-transform duration-300 ${activeTab === contentItem.keyword ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`} />
                            <span className="tracking-[2px] uppercase">{contentItem.keyword}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </motion.div>
                )}
              </div>
            )}

            {/* Comments Section - Only show here if NOT Daily Reading (mostly for standard view) */}
            {!isDailyReading && <Comments galleryItem={item} />}

            {/* Related */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...transition, delay: 0.6 }}
              className="border-t border-white/10 pt-[8vh]"
            >
              <h3 className="text-[10px] tracking-[2px] opacity-40 uppercase mb-8">Related Moments</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {relatedItems.map((related, idx) => (
                  <div
                    key={related.id}
                    className="group relative aspect-[4/5] overflow-hidden cursor-pointer bg-[#111]"
                    onClick={() => {
                      if (onSelect) onSelect(related);
                      // Scroll to top
                      if (contentRef.current) contentRef.current.scrollTop = 0;
                    }}
                    onMouseEnter={() => { setIsHovered(true); setCursorText('VIEW'); }}
                    onMouseLeave={() => { setIsHovered(false); setCursorText(''); }}
                  >
                    <img
                      src={(() => {
                        if (related.type === 'video' && related.videoUrl) {
                          const ytId = related.videoUrl.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/)?.[2];
                          if (ytId && ytId.length === 11) {
                            return `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`;
                          }
                        }
                        return related.image;
                      })()}
                      alt={related.title}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (target.src.includes('maxresdefault')) {
                          target.src = target.src.replace('maxresdefault', 'hqdefault');
                        }
                      }}

                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-60 group-hover:opacity-100"
                    />
                    <div className="absolute bottom-4 left-4 z-10">
                      <p className="font-['Anton'] text-2xl uppercase">{related.title}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* PiP YouTube Player - Only shows when in PiP mode */}
          {persistentVideo && isInPipMode && (
            <div
              className="fixed bottom-6 right-6 z-[1100] w-[320px] h-[180px] rounded-lg shadow-2xl transition-all duration-300 ease-out group"
            >
              <div className="relative w-full h-full overflow-hidden rounded-lg border border-white/20">
                {/* YouTube iframe - stays alive! */}
                <iframe
                  className="w-full h-full bg-black"
                  src={`https://www.youtube.com/embed/${persistentVideo.ytId}?autoplay=1&loop=1&playlist=${persistentVideo.ytId}&rel=0&controls=1&enablejsapi=1${persistentVideo.playMode === 'muted-autoplay' ? '&mute=1' : ''}`}
                  title="YouTube video player"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />

                {/* PiP mode controls */}
                {isInPipMode && (
                  <>
                    {/* Close button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); closePip(); }}
                      className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/70 hover:bg-red-600 text-white flex items-center justify-center transition-all duration-200 opacity-0 group-hover:opacity-100"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>

                    {/* Return to content button */}
                    <button
                      onClick={returnToPipTab}
                      className="absolute top-2 left-2 z-10 px-2 py-1 rounded bg-black/70 hover:bg-white/20 text-white text-[10px] tracking-wider uppercase transition-all duration-200 opacity-0 group-hover:opacity-100 flex items-center gap-1"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6"></polyline>
                      </svg>
                      {persistentVideo.keyword}
                    </button>

                    {/* Expand overlay */}
                    <div
                      onClick={returnToPipTab}
                      className="absolute inset-0 cursor-pointer"
                      style={{ background: 'transparent' }}
                    />

                    {/* Label */}
                    <div className="absolute -top-6 left-0 text-[10px] tracking-wider text-white/50 uppercase opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      Playing • Click to expand
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
