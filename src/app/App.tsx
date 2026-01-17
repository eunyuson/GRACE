import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { CursorProvider } from './context/CursorContext';
import { GalleryProvider } from './context/GalleryContext';
import { CustomCursor } from './components/CustomCursor';
import { Gallery } from './components/Gallery';
import { AdminPage } from './admin/AdminPage';

const Home = () => {
  return (
    <>
      <nav className="fixed top-10 left-10 z-[2100] text-white mix-blend-difference">
        <Link to="/" className="pointer-events-auto cursor-pointer hover:opacity-100 transition-opacity">
          <h1 className="font-bold text-xs tracking-[0.3em] opacity-80 font-['Inter'] hover:opacity-100">GRACE SURF DAILY</h1>
          <p className="text-[9px] tracking-[0.4em] opacity-40 mt-1 uppercase font-['Inter']">매일 은혜 서핑</p>
        </Link>
      </nav>
      <Gallery />
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
