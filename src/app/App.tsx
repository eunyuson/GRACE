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

const Home = () => {
  const [activeTab, setActiveTab] = useState<'gallery' | 'updates' | 'concepts' | 'reflections'>('gallery');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAdmin(!!user);
    });
    return () => unsubscribe();
  }, []);

  return (
    <>
      <nav className="fixed top-6 left-4 md:top-10 md:left-10 z-[2100] text-white mix-blend-difference">
        <Link to="/" className="pointer-events-auto cursor-pointer hover:opacity-100 transition-opacity">
          <h1 className="font-bold text-[10px] md:text-xs tracking-[0.2em] md:tracking-[0.3em] opacity-80 font-['Inter'] hover:opacity-100">GRACE SURF DAILY</h1>
          <p className="text-[8px] md:text-[9px] tracking-[0.3em] md:tracking-[0.4em] opacity-40 mt-1 uppercase font-['Inter']">매일 은혜 서핑</p>
        </Link>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-1 mt-6 p-1 bg-white/5 rounded-2xl backdrop-blur-sm max-w-[320px] md:max-w-none">
          <button
            onClick={() => setActiveTab('gallery')}
            className={`px-3 md:px-4 py-1.5 text-[8px] md:text-[10px] tracking-[0.1em] md:tracking-[0.15em] uppercase transition-all duration-300 rounded-full ${activeTab === 'gallery'
              ? 'bg-white/20 text-white'
              : 'text-white/50 hover:text-white/80'
              }`}
          >
            갤러리
          </button>
          <button
            onClick={() => setActiveTab('updates')}
            className={`px-3 md:px-4 py-1.5 text-[8px] md:text-[10px] tracking-[0.1em] md:tracking-[0.15em] uppercase transition-all duration-300 rounded-full ${activeTab === 'updates'
              ? 'bg-gradient-to-r from-blue-500/30 to-purple-500/30 text-white'
              : 'text-white/50 hover:text-white/80'
              }`}
          >
            ✨ 최근 소식
          </button>
          <button
            onClick={() => setActiveTab('concepts')}
            className={`px-3 md:px-4 py-1.5 text-[8px] md:text-[10px] tracking-[0.1em] md:tracking-[0.15em] uppercase transition-all duration-300 rounded-full ${activeTab === 'concepts'
              ? 'bg-gradient-to-r from-indigo-500/30 to-purple-500/30 text-white'
              : 'text-white/50 hover:text-white/80'
              }`}
          >
            💡 개념 카드
          </button>
          <button
            onClick={() => setActiveTab('reflections')}
            className={`px-3 md:px-4 py-1.5 text-[8px] md:text-[10px] tracking-[0.1em] md:tracking-[0.15em] uppercase transition-all duration-300 rounded-full ${activeTab === 'reflections'
              ? 'bg-gradient-to-r from-yellow-500/30 to-orange-500/30 text-white'
              : 'text-white/50 hover:text-white/80'
              }`}
          >
            나의 묵상
          </button>
        </div>
      </nav>

      {/* Content based on active tab */}
      {activeTab === 'gallery' ? (
        <Gallery />
      ) : activeTab === 'updates' ? (
        <RecentUpdates isAdmin={isAdmin} />
      ) : activeTab === 'concepts' ? (
        <ConceptCards />
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


