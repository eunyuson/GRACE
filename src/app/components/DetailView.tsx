import React from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { useGallery } from '../context/GalleryContext';
import { useCursor } from '../context/CursorContext';
import { GalleryItemType } from '../data/gallery';
import { Comments } from './Comments';

interface DetailViewProps {
  isOpen: boolean;
  onClose: () => void;
  item: GalleryItemType | null;
  onSelect?: (item: GalleryItemType) => void;
}

const transition = { duration: 0.8, ease: [0.16, 1, 0.3, 1] as any };

export const DetailView: React.FC<DetailViewProps> = ({ isOpen, onClose, item, onSelect }) => {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const { setIsHovered, setCursorText } = useCursor();
  const { items } = useGallery();

  const [activeTab, setActiveTab] = React.useState<string>('');
  const galleryScrollRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to center the selected image
  React.useEffect(() => {
    if (galleryScrollRef.current && activeTab) {
      const container = galleryScrollRef.current;
      const selectedElement = container.querySelector(`[data-keyword="${activeTab}"]`) as HTMLElement;
      if (selectedElement) {
        const containerWidth = container.offsetWidth;
        const elementLeft = selectedElement.offsetLeft;
        const elementWidth = selectedElement.offsetWidth;
        const scrollPosition = elementLeft - (containerWidth / 2) + (elementWidth / 2);
        container.scrollTo({ left: scrollPosition, behavior: 'smooth' });
      }
    }
  }, [activeTab]);

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
  }, [item]);

  // Reset cursor on unmount or close
  React.useEffect(() => {
    return () => {
      setIsHovered(false);
      setCursorText('');
    };
  }, [isOpen, setIsHovered, setCursorText]);

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

  // Get related items (exclude current)
  const relatedItems = items
    .filter((i) => i.id !== item.id)
    .slice(0, 3);

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
          <div className="min-h-screen p-[5vw] pt-[22vh]">
            {/* Header */}
            <div className="flex justify-between items-end mb-[5vh]">
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ ...transition, delay: 0.1 }}
                className="overflow-hidden"
              >
                <h2 className="font-['Anton'] text-[clamp(3.5rem,10vw,8rem)] leading-[0.85] uppercase tracking-[-2px] text-white">
                  {item.descTitle}
                </h2>
              </motion.div>

              <div className="flex items-center gap-8">
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
                  <div className="flex gap-4 px-[5vw]">
                    {/* Single set of images - finite scroll */}
                    {allImages.map((img) => (
                      <div
                        key={img.id}
                        data-keyword={img.keyword}
                        onClick={() => setActiveTab(img.keyword)}
                        className={`relative shrink-0 cursor-pointer overflow-hidden transition-all duration-500 group ${activeTab === img.keyword
                          ? 'opacity-100 scale-100'
                          : 'opacity-40 grayscale hover:opacity-70 hover:grayscale-0 scale-95'
                          }`}
                        style={{
                          width: '35vw',
                          maxWidth: '400px',
                          height: '50vh',
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

            {/* Single Main Image/Video - only shows if there's 1 or no gallery images */}
            {allImages.length <= 1 && (
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 50 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ ...transition, delay: 0.2 }}
                className="w-full h-[70vh] mb-[8vh] bg-[#111] overflow-hidden relative"
              >
                {(() => {
                  const displayVideoUrl = currentContent?.videoUrl || (item.type === 'video' ? item.videoUrl : undefined);
                  const displayImage = currentContent?.image || item.image;
                  const playMode = currentContent?.videoPlayMode || item.videoPlayMode || 'manual';

                  if (displayVideoUrl) {
                    const ytId = displayVideoUrl.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/)?.[2];
                    if (ytId && ytId.length === 11) {
                      let embedParams = `loop=1&playlist=${ytId}&rel=0&controls=1`;
                      if (playMode === 'muted-autoplay') {
                        embedParams = `autoplay=1&mute=1&${embedParams}`;
                      } else if (playMode === 'autoplay') {
                        embedParams = `autoplay=1&${embedParams}`;
                      }
                      return (
                        <iframe
                          key={activeTab + '-video'}
                          className="w-full h-full object-cover"
                          src={`https://www.youtube.com/embed/${ytId}?${embedParams}`}
                          title="YouTube video player"
                          frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      );
                    }
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
                  return (
                    <img
                      key={activeTab + '-img'}
                      src={displayImage}
                      alt={item.title}
                      className="w-full h-full object-contain"
                    />
                  );
                })()}
              </motion.div>
            )}

            {/* Content Grid */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-[15vh] text-[#f0f0f0] font-['Inter']">
              {/* Metadata */}
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

              {/* Mobile Keywords Navigation - horizontal scroll */}
              <div className="md:hidden mb-6 -mx-4 px-4 overflow-x-auto">
                <div className="flex gap-3 pb-2">
                  <button
                    onClick={() => setActiveTab('STORY')}
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
                      onClick={() => setActiveTab(contentItem.keyword)}
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

              {/* Main Text */}
              <div className="md:col-span-6 md:pr-12 min-h-[300px]">
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
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Keywords Navigation */}
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
                      onClick={() => setActiveTab('STORY')}
                      className={`cursor-pointer transition-all duration-300 flex items-center group ${activeTab === 'STORY' ? 'text-white' : 'hover:text-white/60'}`}
                    >
                      <span className={`w-1.5 h-1.5 bg-white rounded-full mr-3 transition-transform duration-300 ${activeTab === 'STORY' ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`} />
                      <span className="tracking-[2px] uppercase">STORY</span>
                    </li>
                    {item.content.map((contentItem) => (
                      <li
                        key={contentItem.id}
                        onClick={() => setActiveTab(contentItem.keyword)}
                        className={`cursor-pointer transition-all duration-300 flex items-center group ${activeTab === contentItem.keyword ? 'text-white' : 'hover:text-white/60'}`}
                      >
                        <span className={`w-1.5 h-1.5 bg-white rounded-full mr-3 transition-transform duration-300 ${activeTab === contentItem.keyword ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`} />
                        <span className="tracking-[2px] uppercase">{contentItem.keyword}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            </div>

            {/* Comments Section */}
            <Comments galleryItem={item} />

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
        </motion.div>
      )}
    </AnimatePresence>
  );
};
