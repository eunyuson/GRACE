import React from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, orderBy, serverTimestamp, where, limit } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useGallery } from '../context/GalleryContext';
import { useCursor } from '../context/CursorContext';
import { GalleryItemType } from '../data/gallery';
import { Comments } from './Comments';
import { PDFViewer } from './PDFViewer';

interface Memo {
  id: string;
  text: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  createdAt?: any;
  updatedAt?: any;
}

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

  // QT Side Panel tab state
  const [sidePanelTab, setSidePanelTab] = React.useState<'memos' | 'comments'>('memos');
  // Floating panel open/close state for QT
  const [isFloatingPanelOpen, setIsFloatingPanelOpen] = React.useState(false);

  // Panel resizing state
  const [panelSize, setPanelSize] = React.useState<{ width: number; height: number } | null>(null);
  const [isResizing, setIsResizing] = React.useState(false);
  const resizeStartPos = React.useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    // Since anchored bottom-right:
    // width/height at start
    const panel = document.getElementById('qt-memo-panel');
    if (panel) {
      resizeStartPos.current = {
        x: e.clientX,
        y: e.clientY,
        w: panelSize?.width || panel.offsetWidth,
        h: panelSize?.height || panel.offsetHeight
      };
    }
  };

  React.useEffect(() => {
    const handleResizeMove = (e: MouseEvent) => {
      if (!isResizing || !resizeStartPos.current) return;

      const deltaX = resizeStartPos.current.x - e.clientX; // Moving left increases width
      const deltaY = resizeStartPos.current.y - e.clientY; // Moving up increases height

      const newWidth = Math.max(300, Math.min(1000, resizeStartPos.current.w + deltaX));
      const newHeight = Math.max(300, Math.min(1000, resizeStartPos.current.h + deltaY));

      setPanelSize({ width: newWidth, height: newHeight });
    };

    const handleResizeEnd = () => {
      setIsResizing(false);
      resizeStartPos.current = null;
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [isResizing]);


  // Memo state for QT (Personal Reflection Mode)
  const [currentUser, setCurrentUser] = React.useState<User | null>(null);
  const [myMemo, setMyMemo] = React.useState<Memo | null>(null);
  const [memoText, setMemoText] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [lastSavedText, setLastSavedText] = React.useState('');

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
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to USER's memo for the current item (QT) - Personal Reflection
  React.useEffect(() => {
    if (!item?.id || !currentUser) {
      setMyMemo(null);
      setMemoText('');
      setLastSavedText('');
      return;
    }
    const q = query(
      collection(db, 'gallery', String(item.id), 'memos'),
      where('userId', '==', currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        const data = doc.data();
        setMyMemo({ id: doc.id, ...data } as Memo);
        // Only update text from DB if we are not currently editing (to avoid race conditions)
        // Or strictly sync on initial load/remote update
        // Here we rely on local state for editing, but need to init
        if (memoText === '' && lastSavedText === '') {
          setMemoText(data.text);
          setLastSavedText(data.text);
        }
      } else {
        setMyMemo(null);
        // Don't clear text if user started typing before sync? Actually safer to clear or init.
      }
    });
    return () => unsubscribe();
  }, [item?.id, currentUser]);

  // Helper to extract hashtags
  const extractHashtags = (text: string): string[] => {
    const regex = /#[\w가-힣]+/g;
    const matches = text.match(regex);
    return matches ? matches.map(tag => tag.slice(1)) : []; // Remove '#'
  };

  // Auto-save logic
  React.useEffect(() => {
    // Skip if text hasn't changed from what's saved
    if (memoText === lastSavedText) return;

    // Debounce save
    const timeoutId = setTimeout(async () => {
      if (!currentUser || !item?.id) return;

      setIsSaving(true);
      const tags = extractHashtags(memoText);
      // Main image or fallback
      const mainImage = item.image || (item.content && item.content.find(c => c.image)?.image) || '';

      try {
        if (myMemo) {
          // Update existing
          await updateDoc(doc(db, 'gallery', String(item.id), 'memos', myMemo.id), {
            text: memoText,
            tags: tags,
            updatedAt: serverTimestamp(),
            // Update metadata in case it changed (though unlikely for title/image)
            parentTitle: item.title,
            parentImage: mainImage,
            parentDate: item.date // Useful for sorting by event date
          });
        } else {
          // Create new
          await addDoc(collection(db, 'gallery', String(item.id), 'memos'), {
            text: memoText,
            tags: tags,
            userId: currentUser.uid,
            userName: currentUser.displayName || '익명',
            userPhoto: currentUser.photoURL || '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            // Denormalized data for "My Reflections" list view
            parentId: item.id,
            parentTitle: item.title,
            parentImage: mainImage,
            parentDate: item.date
          });
        }
        setLastSavedText(memoText);
      } catch (e) {
        console.error('Auto-save failed:', e);
      } finally {
        setIsSaving(false);
      }
    }, 1500); // 1.5s debounce

    return () => clearTimeout(timeoutId);
  }, [memoText, lastSavedText, currentUser, item?.id, myMemo]);

  // Handlers removed in favor of auto-save logic

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
                className={`w-full ${isDailyReading ? 'mb-0 h-[85vh] md:h-[125vh]' : 'mb-[8vh] min-h-[70vh]'} bg-[#111] overflow-hidden relative`}
              >
                {isDailyReading ? (
                  /* Daily Meditation QT Special Layout - Full Screen PDF with Floating Panel */
                  <div className="relative w-full h-full">
                    {/* Full Screen PDF Viewer */}
                    <div className="w-full h-full">
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

                    {/* Floating Panel Toggle Button */}
                    <button
                      onClick={() => setIsFloatingPanelOpen(!isFloatingPanelOpen)}
                      className={`fixed bottom-6 right-6 z-[60] w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 ${isFloatingPanelOpen
                        ? 'bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 rotate-0'
                        : 'bg-gradient-to-r from-gray-700 to-gray-600 hover:from-gray-600 hover:to-gray-500'
                        }`}
                      style={{
                        boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
                      }}
                    >
                      <span className="text-white text-2xl">{isFloatingPanelOpen ? '✕' : '📝'}</span>
                      {!isFloatingPanelOpen && myMemo && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full border border-black/50"></span>
                      )}
                    </button>

                    {/* Floating Slide Panel - Personal Reflection UI */}
                    <div
                      id="qt-memo-panel"
                      style={panelSize ? { width: panelSize.width, height: panelSize.height } : undefined}
                      className={`fixed bottom-24 right-6 z-[55] ${!panelSize ? 'w-[90vw] md:w-[500px] h-[60vh] max-h-[800px]' : ''} bg-[#0a0a0a]/30 backdrop-blur-2xl rounded-3xl border border-white/20 overflow-hidden transition-all duration-500 transform ${isFloatingPanelOpen
                        ? 'translate-y-0 opacity-100 scale-100 shadow-[0_20px_80px_rgba(0,0,0,0.8)]'
                        : 'translate-y-12 opacity-0 scale-95 pointer-events-none'
                        }`}
                    >
                      {/* Resize Handle (Top-Left) */}
                      {/* Resize Handle (Top-Left) */}
                      <div
                        onMouseDown={handleResizeStart}
                        className="absolute top-2 left-2 w-8 h-8 z-[60] cursor-nw-resize flex items-center justify-center group bg-black/20 hover:bg-black/40 rounded-full backdrop-blur-sm transition-all border border-white/10"
                        title="Resize Panel"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/50 group-hover:text-white transition-colors rotate-90">
                          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                        </svg>
                      </div>

                      {/* Panel Header */}
                      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
                        <div className="flex gap-4">
                          <button
                            onClick={() => setSidePanelTab('memos')}
                            className={`text-sm font-medium transition-colors relative ${sidePanelTab === 'memos'
                              ? 'text-white'
                              : 'text-white/40 hover:text-white/70'
                              }`}
                          >
                            나의 묵상
                            {sidePanelTab === 'memos' && (
                              <motion.div
                                layoutId="activeTab"
                                className="absolute -bottom-[21px] left-0 right-0 h-[2px] bg-yellow-400"
                              />
                            )}
                          </button>
                          <button
                            onClick={() => setSidePanelTab('comments')}
                            className={`text-sm font-medium transition-colors relative ${sidePanelTab === 'comments'
                              ? 'text-white'
                              : 'text-white/40 hover:text-white/70'
                              }`}
                          >
                            댓글
                            {sidePanelTab === 'comments' && (
                              <motion.div
                                layoutId="activeTab"
                                className="absolute -bottom-[21px] left-0 right-0 h-[2px] bg-blue-400"
                              />
                            )}
                          </button>
                        </div>
                        {isSaving && (
                          <div className="flex items-center gap-2 text-[10px] text-white/50 animate-pulse">
                            <div className="w-1.5 h-1.5 rounded-full bg-yellow-400"></div>
                            저장 중...
                          </div>
                        )}
                        {!isSaving && memoText === lastSavedText && memoText.length > 0 && (
                          <div className="flex items-center gap-1 text-[10px] text-white/30">
                            <span>✓</span> 저장됨
                          </div>
                        )}
                      </div>

                      {/* Panel Content */}
                      <div className="h-[calc(100%-57px)]">
                        {sidePanelTab === 'memos' ? (
                          <div className="h-full flex flex-col p-6">
                            {currentUser ? (
                              <>
                                <div className="mb-2 text-xs text-white/30 font-light flex justify-between">
                                  <span>{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</span>
                                  <span>{memoText.length}자</span>
                                </div>
                                <textarea
                                  value={memoText}
                                  onChange={(e) => setMemoText(e.target.value)}
                                  placeholder="오늘의 말씀 묵상을 이곳에 자유롭게 기록하세요..."
                                  className="flex-1 w-full bg-transparent border-0 text-white/90 placeholder-white/20 text-base leading-relaxed resize-none focus:outline-none focus:ring-0 selection:bg-yellow-500/30"
                                  spellCheck={false}
                                />
                                <div className="mt-4 flex flex-col gap-2">
                                  <button
                                    onClick={async () => {
                                      if (!currentUser || !item?.id || memoText.trim() === '') return;
                                      setIsSaving(true);
                                      const tags = extractHashtags(memoText);
                                      const mainImage = item.image || (item.content && item.content.find(c => c.image)?.image) || '';
                                      try {
                                        if (myMemo) {
                                          await updateDoc(doc(db, 'gallery', String(item.id), 'memos', myMemo.id), {
                                            text: memoText,
                                            tags: tags,
                                            updatedAt: serverTimestamp(),
                                            parentTitle: item.title,
                                            parentImage: mainImage,
                                            parentDate: item.date
                                          });
                                        } else {
                                          await addDoc(collection(db, 'gallery', String(item.id), 'memos'), {
                                            text: memoText,
                                            tags: tags,
                                            userId: currentUser.uid,
                                            userName: currentUser.displayName || '익명',
                                            userPhoto: currentUser.photoURL || '',
                                            createdAt: serverTimestamp(),
                                            updatedAt: serverTimestamp(),
                                            parentId: item.id,
                                            parentTitle: item.title,
                                            parentImage: mainImage,
                                            parentDate: item.date
                                          });
                                        }
                                        setLastSavedText(memoText);
                                        alert('묵상이 저장되었습니다! ✅');
                                      } catch (e) {
                                        console.error('Save failed:', e);
                                        alert('저장에 실패했습니다.');
                                      } finally {
                                        setIsSaving(false);
                                      }
                                    }}
                                    disabled={isSaving || memoText.trim() === ''}
                                    className="w-full py-2.5 px-4 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black font-semibold rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    {isSaving ? '저장 중...' : '💾 저장하기'}
                                  </button>
                                </div>
                              </>
                            ) : (
                              <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                                  <span className="text-2xl">🔒</span>
                                </div>
                                <div>
                                  <h3 className="text-white font-medium mb-1">로그인이 필요합니다</h3>
                                  <p className="text-white/40 text-sm">나만의 묵상 노트를 작성하려면 로그인해주세요.</p>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="h-full overflow-y-auto">
                            <Comments galleryItem={item} variant="side-panel" />
                          </div>
                        )}
                      </div>
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
                      className="text-[#a0a0a0] leading-[1.8] font-light whitespace-pre-line"
                    >
                      {/* Left Floating Image */}
                      {(() => {
                        const floatingImage = currentContent?.image || (activeTab === 'STORY' ? item.image : undefined);
                        if (floatingImage) {
                          return (
                            <motion.div
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.5 }}
                              className="float-left mr-6 mb-4 w-[45%] md:w-[40%] max-w-[300px] rounded-lg overflow-hidden shadow-xl"
                            >
                              <img
                                src={floatingImage}
                                alt={activeTab}
                                className="w-full h-auto object-cover"
                              />
                            </motion.div>
                          );
                        }
                        return null;
                      })()}
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
