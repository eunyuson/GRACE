import React, { useState } from 'react';
import { HymnGallery } from './HymnGallery';
import { PraiseGallery } from './PraiseGallery';

interface HymnTabsProps {
  isAdmin?: boolean;
}

export const HymnTabs: React.FC<HymnTabsProps> = ({ isAdmin = false }) => {
  const [active, setActive] = useState<'hymn' | 'praise'>('hymn');

  return (
    <div className="relative w-full h-full">
      <div className="fixed top-24 md:top-28 left-4 md:left-10 z-[2200] flex gap-1 p-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 shadow-lg pointer-events-auto">
        <button
          onClick={() => setActive('hymn')}
          className={`px-3 py-1.5 text-[9px] md:text-[10px] tracking-[0.15em] uppercase rounded-full transition-all ${
            active === 'hymn'
              ? 'bg-gradient-to-r from-green-500/30 to-teal-500/30 text-white'
              : 'text-white/50 hover:text-white/80'
          }`}
        >
          🎵 찬송가
        </button>
        <button
          onClick={() => setActive('praise')}
          className={`px-3 py-1.5 text-[9px] md:text-[10px] tracking-[0.15em] uppercase rounded-full transition-all ${
            active === 'praise'
              ? 'bg-gradient-to-r from-emerald-500/30 to-green-500/30 text-white'
              : 'text-white/50 hover:text-white/80'
          }`}
        >
          🎶 찬양곡
        </button>
      </div>

      {active === 'hymn' ? (
        <HymnGallery isAdmin={isAdmin} />
      ) : (
        <PraiseGallery isAdmin={isAdmin} />
      )}
    </div>
  );
};
