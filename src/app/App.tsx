import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import { CursorProvider } from './context/CursorContext';
import { GalleryProvider } from './context/GalleryContext';
import { CustomCursor } from './components/CustomCursor';
import { Gallery } from './components/Gallery';
import { RecentUpdates } from './components/RecentUpdates';
import { AdminPage } from './admin/AdminPage';
import { MyReflections } from './components/MyReflections';
import { ConceptCards } from './components/ConceptCards';

import { HymnTabs } from './components/HymnTabs';
import { SetlistPlanner } from './components/SetlistPlanner';


const Home = () => {
  const [activeTab, setActiveTab] = useState<'gallery' | 'updates' | 'concepts' | 'reflections' | 'hymns' | 'setlist'>('gallery');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAdmin(!!user);
    });
    return () => unsubscribe();
  }, []);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-[2100] text-white print-hide">
        <div className="flex items-center gap-2 px-3 py-2 md:px-10 md:py-6 md:gap-8">
          <Link to="/" className="pointer-events-auto cursor-pointer hover:opacity-100 transition-opacity flex-shrink-0">
            <h1 className="font-bold text-[9px] md:text-xs tracking-[0.2em] md:tracking-[0.3em] opacity-80 font-['Inter'] hover:opacity-100 whitespace-nowrap mix-blend-difference">GRACE</h1>
          </Link>

          {/* Tab Navigation - single scrollable row on mobile */}
          <div className="flex-1 overflow-x-auto no-scrollbar">
            <div className="flex gap-0.5 p-0.5 bg-white/5 rounded-xl backdrop-blur-sm w-max md:w-auto mix-blend-difference">
              <button
                onClick={() => setActiveTab('gallery')}
                className={`px-2.5 md:px-4 py-1 text-[8px] md:text-[10px] tracking-[0.05em] md:tracking-[0.15em] uppercase transition-all duration-300 rounded-lg whitespace-nowrap ${activeTab === 'gallery'
                  ? 'bg-white/20 text-white'
                  : 'text-white/50 hover:text-white/80'
                  }`}
              >
                갤러리
              </button>
              <button
                onClick={() => setActiveTab('updates')}
                className={`px-2.5 md:px-4 py-1 text-[8px] md:text-[10px] tracking-[0.05em] md:tracking-[0.15em] uppercase transition-all duration-300 rounded-lg whitespace-nowrap ${activeTab === 'updates'
                  ? 'bg-gradient-to-r from-blue-500/30 to-purple-500/30 text-white'
                  : 'text-white/50 hover:text-white/80'
                  }`}
              >
                <span className="md:hidden">소식</span>
                <span className="hidden md:inline">✨ 최근 소식</span>
              </button>
              <button
                onClick={() => setActiveTab('concepts')}
                className={`px-2.5 md:px-4 py-1 text-[8px] md:text-[10px] tracking-[0.05em] md:tracking-[0.15em] uppercase transition-all duration-300 rounded-lg whitespace-nowrap ${activeTab === 'concepts'
                  ? 'bg-gradient-to-r from-indigo-500/30 to-purple-500/30 text-white'
                  : 'text-white/50 hover:text-white/80'
                  }`}
              >
                <span className="md:hidden">개념</span>
                <span className="hidden md:inline">💡 개념 카드</span>
              </button>
              <button
                onClick={() => setActiveTab('reflections')}
                className={`px-2.5 md:px-4 py-1 text-[8px] md:text-[10px] tracking-[0.05em] md:tracking-[0.15em] uppercase transition-all duration-300 rounded-lg whitespace-nowrap ${activeTab === 'reflections'
                  ? 'bg-gradient-to-r from-yellow-500/30 to-orange-500/30 text-white'
                  : 'text-white/50 hover:text-white/80'
                  }`}
              >
                묵상
              </button>
              <button
                onClick={() => setActiveTab('hymns')}
                className={`px-2.5 md:px-4 py-1 text-[8px] md:text-[10px] tracking-[0.05em] md:tracking-[0.15em] uppercase transition-all duration-300 rounded-lg whitespace-nowrap ${activeTab === 'hymns'
                  ? 'bg-gradient-to-r from-green-500/30 to-teal-500/30 text-white'
                  : 'text-white/50 hover:text-white/80'
                  }`}
              >
                <span className="md:hidden">🎵 찬송</span>
                <span className="hidden md:inline">🎵 찬송가</span>
              </button>
              <button
                onClick={() => setActiveTab('setlist')}
                className={`px-2.5 md:px-4 py-1 text-[8px] md:text-[10px] tracking-[0.05em] md:tracking-[0.15em] uppercase transition-all duration-300 rounded-lg whitespace-nowrap ${activeTab === 'setlist'
                  ? 'bg-gradient-to-r from-emerald-500/30 to-green-500/30 text-white'
                  : 'text-white/50 hover:text-white/80'
                  }`}
              >
                콘티
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Content based on active tab */}
      {activeTab === 'gallery' ? (
        <Gallery isAdmin={isAdmin} />
      ) : activeTab === 'updates' ? (
        <RecentUpdates isAdmin={isAdmin} />
      ) : activeTab === 'concepts' ? (
        <ConceptCards />
      ) : activeTab === 'hymns' ? (
        <HymnTabs isAdmin={isAdmin} />
      ) : activeTab === 'setlist' ? (
        <SetlistPlanner />
      ) : (
        <MyReflections
          onSelectCallback={(parentId) => {
            // Navigate to Gallery and open the item using the existing deep link logic in Gallery.tsx
            // 1. Set tab to gallery
            setActiveTab('gallery');
            // 2. Update URL query parameter without full reload, so Gallery.tsx detects it
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('item', parentId);
            window.history.pushState({}, '', newUrl);
          }}
        />
      )}

      <Link
        to="/admin"
        className="fixed bottom-4 left-4 z-[2000] text-[8px] text-white/10 hover:text-white/40 tracking-widest uppercase transition-colors cursor-none"
        style={{ cursor: 'none' }}
      >
        Admin Access
      </Link>
    </>
  );
};

export default function App() {
  return (
    <div className="bg-[#050505] text-[#f0f0f0] h-screen w-screen overflow-hidden select-none font-['Inter'] relative">
      <GalleryProvider>
        <CursorProvider>
          <BrowserRouter>
            <CustomCursor />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/admin" element={<AdminPage />} />
              {/* Embed Route for formatting in iframes */}
              <Route path="/embed/concepts" element={<ConceptCards maxItems={6} />} />
              <Route path="/share/concepts" element={<ConceptCards />} />
            </Routes>

          </BrowserRouter>
        </CursorProvider>
      </GalleryProvider>
    </div>
  );
}

