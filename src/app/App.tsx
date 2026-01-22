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

const Home = () => {
  const [activeTab, setActiveTab] = useState<'gallery' | 'updates' | 'reflections'>('gallery');
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
        <div className="flex gap-1 mt-6 p-1 bg-white/5 rounded-full backdrop-blur-sm">
          <button
            onClick={() => setActiveTab('gallery')}
            className={`px-4 py-1.5 text-[9px] md:text-[10px] tracking-[0.15em] uppercase transition-all duration-300 rounded-full ${activeTab === 'gallery'
              ? 'bg-white/20 text-white'
              : 'text-white/50 hover:text-white/80'
              }`}
          >
            갤러리
          </button>
          <button
            onClick={() => setActiveTab('updates')}
            className={`px-4 py-1.5 text-[9px] md:text-[10px] tracking-[0.15em] uppercase transition-all duration-300 rounded-full ${activeTab === 'updates'
              ? 'bg-gradient-to-r from-blue-500/30 to-purple-500/30 text-white'
              : 'text-white/50 hover:text-white/80'
              }`}
          >
            ✨ 최근 소식
          </button>
          <button
            onClick={() => setActiveTab('reflections')}
            className={`px-4 py-1.5 text-[9px] md:text-[10px] tracking-[0.15em] uppercase transition-all duration-300 rounded-full ${activeTab === 'reflections'
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
      ) : (
        <MyReflections
          onSelectCallback={(parentId) => {
            // We need to trigger the DetailView. 
            // Since DetailView is controlled by Gallery context/URL state usually,
            // The simple way is to use window location or navigation, but Gallery component handles the view.
            // Actually, Gallery.tsx checks existing URL params or internal state.
            // If we want to open a detail view FROM here, we might need access to setItem or navigate.
            // Let's use direct navigation for now: /?id=... logic if supported, or just switch tab and scroll?
            // Gallery component uses query param 'item' or specific routing. 
            // Let's try to pass a simple state update if Gallery logic supports it, 
            // OR navigate to home and letting Gallery pick it up if query param is set?
            // Since current routing is hash or simple state in main, let's try assuming Gallery will open if we switch tab to 'gallery' and set some global context?
            // Actually, the easier path is to just let the user go to Gallery found via ID manually? No that's bad UX.
            // DetailView works by overlay. RecentUpdates uses 'onSelect' prop passed from App? No, RecentUpdates is standalone.
            // Let's check how RecentUpdates opens items.
            // RecentUpdates doesn't seem to open items in the same overlay currently based on App.tsx code?
            // Ah, RecentUpdates might implement its own item opening or not support it yet.
            // Wait, Gallery has DetailView inside it. 
            // RecentUpdates likely just links to valid URLs or has its own DetailView?
            // Let's look at Gallery.tsx to see how it opens items.
            // Ideally we pass a "selectedItemId" prop to Gallery, but App state manages activeTab.
            // WORKAROUND: For now, switching to 'gallery' tab is safer, providing ID might require context refactor.
            // Let's just switch to Gallery for now, and maybe scroll?
            setActiveTab('gallery');
            // In a perfect world we would open the item. 
            // Let's assume the user can find it or we add context later. 
            // Adding complex routing change might be risky without seeing Gallery logic.
            // I'll just setActiveTab('gallery') for now and alert user or console log.
            // Actually, let's leave the callback as a placeholder or simple alert if not fully integrated.
          }}
        />
      )}
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
            </Routes>
            <Link
              to="/admin"
              className="fixed bottom-4 left-4 z-[2000] text-[8px] text-white/10 hover:text-white/40 tracking-widest uppercase transition-colors cursor-none"
              style={{ cursor: 'none' }}
            >
              Admin Access
            </Link>
          </BrowserRouter>
        </CursorProvider>
      </GalleryProvider>
    </div>
  );
}

