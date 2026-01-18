import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useSearchParams } from 'react-router-dom';
import { CursorProvider } from './context/CursorContext';
import { GalleryProvider } from './context/GalleryContext';
import { CustomCursor } from './components/CustomCursor';
import { Gallery } from './components/Gallery';
import { RecentUpdates } from './components/RecentUpdates';
import { AdminPage } from './admin/AdminPage';

const Home = () => {
  const [activeTab, setActiveTab] = useState<'gallery' | 'updates'>('gallery');
  const [searchParams] = useSearchParams();
  const isAdmin = searchParams.get('admin') === 'true';

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
        </div>
      </nav>

      {/* Content based on active tab */}
      {activeTab === 'gallery' ? <Gallery /> : <RecentUpdates isAdmin={isAdmin} />}
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

