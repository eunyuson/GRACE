import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useGallery } from '../context/GalleryContext';
import { GalleryItemType } from '../data/gallery';
import { GalleryItem } from './GalleryItem';
import { Navigation } from './Navigation';
import { DetailView } from './DetailView';
import { useCursor } from '../context/CursorContext';

const CONFIG = {
  ease: 0.08,
  parallax: 0.15,
  minScale: 0.72,
  maxScale: 1.0
};

import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../firebase';

export const Gallery: React.FC = () => {
  const { items: galleryItems, moveItem } = useGallery();
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<GalleryItemType | null>(null);
  const [currentIndex, setCurrentIndex] = useState(1);
  const { setIsHovered } = useCursor();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
      // Simple check: if user exists and is not anonymous (or check specific UID if needed)
      // For now, assuming any logged in user (who is not anonymous) might be admin, 
      // OR adhering to the previous pattern where we rely on setlist planner's auth
      // To be safe, let's assume if email matches specific admin or just any authenticated user?
      // PleaseGallery uses 'isAdmin' prop passed from parent or checks user.
      // SetlistPlanner uses 'currentUser'. 
      // Let's assume if user is logged in, they are admin for this purpose, same as PraiseGallery if 'isAdmin' prop was true.
      // Actually PraiseGallery takes 'isAdmin' prop. Start page doesn't usually have login.
      // The user must login somewhere else (SetlistPlanner).
      // If 'currentUser' exists, show arrows.
      if (user && !user.isAnonymous) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // ... (items memo) ...

  const items = React.useMemo(() => {
    return [
      ...galleryItems,
      ...galleryItems,
      ...galleryItems,
      ...galleryItems,
      ...galleryItems
    ];
  }, [galleryItems]);

  // Check for item URL parameter and open detail view
  useEffect(() => {
    const itemId = searchParams.get('item');
    if (itemId && galleryItems.length > 0 && !isDetailOpen) {
      const item = galleryItems.find(i => i.id === itemId);
      if (item) {
        // Open detail directly
        state.current.isDetailOpen = true;
        setIsDetailOpen(true);
        setSelectedItem(item);
        setIsHovered(false);

        if (containerRef.current) {
          containerRef.current.style.opacity = '0';
        }

        // Remove the query parameter from URL
        setSearchParams({});
      }
    }
  }, [searchParams, galleryItems, isDetailOpen, setSearchParams, setIsHovered]);

  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Animation state
  const state = useRef({
    current: 0,
    target: 0,
    itemTotalWidth: 0,
    isDetailOpen: false
  });

  const requestRef = useRef<number>(0);

  // Resize handler
  const updateMetrics = useCallback(() => {
    if (!itemRefs.current[0]) return;

    // Measure one item
    const firstItem = itemRefs.current[0];
    const style = window.getComputedStyle(firstItem);
    const itemWidth = firstItem.offsetWidth + parseFloat(style.marginRight);

    // Update state
    state.current.itemTotalWidth = itemWidth * galleryItems.length;

    // Initialize position if needed (only once or on reset)
    // In original code: state.target = state.itemTotalWidth * 2; state.current = ...
    // We only want to set this if it's the first run to center the "middle" set
    if (state.current.current === 0) {
      state.current.target = state.current.itemTotalWidth * 2;
      state.current.current = state.current.itemTotalWidth * 2;
    }
  }, []);

  // Main animation loop
  const animate = useCallback(() => {
    if (!containerRef.current) return;

    const s = state.current;

    // Lerp
    s.current += (s.target - s.current) * CONFIG.ease;

    // Infinite loop reset
    // If we scrolled past the 4th set (index 3), jump back to 3rd set (index 2)?
    // Original: if (target > width * 3) target -= width; current -= width;
    //           if (target < width) target += width; current += width;
    // NOTE: width here is the width of ONE FULL SET (10 items).
    // We have 5 sets: 0, 1, 2, 3, 4.
    // Start at set 2 (index 2).
    // If we go > set 3, go back to set 2.
    // If we go < set 1, go forward to set 2.

    if (s.target > s.itemTotalWidth * 3) {
      s.target -= s.itemTotalWidth;
      s.current -= s.itemTotalWidth;
    } else if (s.target < s.itemTotalWidth) {
      s.target += s.itemTotalWidth;
      s.current += s.itemTotalWidth;
    }

    // Apply transform to container
    if (!s.isDetailOpen) {
      containerRef.current.style.transform = `translate3d(${-s.current}px, 0, 0)`;
    }

    // Calculate current index
    const relativePos = s.current % s.itemTotalWidth;
    // If relativePos is negative, normalize? current should be positive mostly due to init at 2x width.
    // Normalized index:
    const activeIndex = Math.floor((relativePos / s.itemTotalWidth) * galleryItems.length);
    const displayIndex = ((activeIndex + galleryItems.length) % galleryItems.length) + 1;

    // Update React state less frequently if possible, but here we need it for UI ticks.
    // To avoid React render loop thrashing, maybe only update if changed.
    setCurrentIndex((prev) => (prev !== displayIndex ? displayIndex : prev));

    // Parallax & Scale
    const viewportCenter = window.innerWidth / 2;

    itemRefs.current.forEach((item, i) => {
      if (!item) return;

      const rect = item.getBoundingClientRect();
      const itemCenter = rect.left + rect.width / 2; // VX is typo, just calculate

      const distanceFromCenter = Math.abs(viewportCenter - (rect.left + rect.width / 2));
      const normalizedDistance = Math.min(distanceFromCenter / (window.innerWidth * 0.8), 1);

      const scale = CONFIG.maxScale - (normalizedDistance * (CONFIG.maxScale - CONFIG.minScale));
      const opacity = 1.0 - (normalizedDistance * 0.5);

      item.style.transform = `scale(${scale})`;
      item.style.opacity = opacity.toString();

      if (!s.isDetailOpen) {
        const img = item.querySelector('.gallery-img') as HTMLElement;
        if (img) {
          const offset = ((rect.left + rect.width / 2) - viewportCenter) * CONFIG.parallax;
          img.style.transform = `translate3d(${-offset}px, 0, 0)`;
        }
      }
    });

    requestRef.current = requestAnimationFrame(animate);
  }, []);

  // Events
  useEffect(() => {
    updateMetrics();
    window.addEventListener('resize', updateMetrics);
    requestRef.current = requestAnimationFrame(animate);

    const onWheel = (e: WheelEvent) => {
      if (state.current.isDetailOpen) return;
      // Original logic: state.target += (e.deltaY + e.deltaX) * 1.2;
      // We might need to prevent default if it's strictly a horizontal experience without vertical scroll page.
      // e.preventDefault(); // Original did this.
      state.current.target += (e.deltaY + e.deltaX) * 1.2;
    };

    let startX = 0;
    let startTarget = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (state.current.isDetailOpen) return;
      startX = e.touches[0].clientX;
      startTarget = state.current.target;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (state.current.isDetailOpen) return;
      const delta = (startX - e.touches[0].clientX) * 1.5;
      state.current.target = startTarget + delta;
    };

    window.addEventListener('wheel', onWheel, { passive: false }); // passive: false to allow preventDefault if we add it
    window.addEventListener('touchstart', onTouchStart);
    window.addEventListener('touchmove', onTouchMove);

    return () => {
      window.removeEventListener('resize', updateMetrics);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      cancelAnimationFrame(requestRef.current);
    };
  }, [animate, updateMetrics]);


  const navigateTo = (index: number) => {
    // If detail is open, update the detail view content directly
    if (state.current.isDetailOpen) {
      setSelectedItem(galleryItems[index]);
      // Also update scroll position in background so if we close it's there?
      // The original code updates target too.
    }

    if (!itemRefs.current[0]) return;
    const firstItem = itemRefs.current[0];
    const style = window.getComputedStyle(firstItem);
    const itemWidth = firstItem.offsetWidth + parseFloat(style.marginRight);

    // We align the "middle" set (index 2) to be the reference
    // sets: 0, 1, 2, 3, 4. 
    // galleryItems.length = 10.
    // itemTotalWidth = 10 * itemWidth.
    // Target for index 0 of set 2 = itemTotalWidth * 2.
    // Target for index i of set 2 = (itemTotalWidth * 2) + (i * itemWidth).

    state.current.target = (state.current.itemTotalWidth * 2) + (index * itemWidth);
  };

  const openDetail = useCallback((item: GalleryItemType) => {
    state.current.isDetailOpen = true;
    setIsDetailOpen(true);
    setSelectedItem(item);
    setIsHovered(false); // Reset cursor

    // Hide container
    if (containerRef.current) {
      containerRef.current.style.opacity = '0';
    }
  }, [setIsHovered]);

  const closeDetail = () => {
    setIsDetailOpen(false);

    // Delay setting state.isDetailOpen to allow animation?
    // Original waits 600ms before hiding display.
    // Here we use AnimatePresence, so we just toggle state.
    // But we need to sync the 'opacity: 1' of container.

    setTimeout(() => {
      state.current.isDetailOpen = false;
      if (containerRef.current) {
        containerRef.current.style.opacity = '1';
      }
    }, 600); // Match transition duration
  };

  return (
    <>
      <div className={`transition-all duration-500 z-[2000] relative ${isDetailOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <Navigation
          currentIndex={currentIndex}
          total={galleryItems.length}
          onNavigate={navigateTo}
          showIndex={true}
        />
      </div>

      <main
        ref={containerRef}
        className="scroll-container absolute top-0 left-0 h-full flex items-center will-change-transform pl-[35vw] transition-opacity duration-600 ease-[cubic-bezier(0.23,1,0.32,1)]"
      >
        {items.map((item, i) => (
          <GalleryItem
            key={i}
            item={item}
            ref={(el) => { itemRefs.current[i] = el; }}
            onClick={() => openDetail(item)}
            isAdmin={isAdmin}
            onMoveLeft={() => moveItem(item.id, 'left')}
            onMoveRight={() => moveItem(item.id, 'right')}
          />
        ))}
      </main>

      <DetailView
        isOpen={isDetailOpen}
        onClose={closeDetail}
        item={selectedItem}
        onSelect={openDetail}
      />
    </>
  );
};
