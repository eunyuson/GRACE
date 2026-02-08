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
      {active === 'hymn' ? (
        <HymnGallery
          isAdmin={isAdmin}
          currentTab={active}
          onTabChange={setActive}
        />
      ) : (
        <PraiseGallery
          isAdmin={isAdmin}
          currentTab={active}
          onTabChange={setActive}
        />
      )}
    </div>
  );
};
