import React, { createContext, useContext, useState } from 'react';

type CursorContextType = {
  isHovered: boolean;
  setIsHovered: (hovered: boolean) => void;
  cursorText: string;
  setCursorText: (text: string) => void;
};

const CursorContext = createContext<CursorContextType>({
  isHovered: false,
  setIsHovered: () => {},
  cursorText: '',
  setCursorText: () => {},
});

export const useCursor = () => useContext(CursorContext);

export const CursorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [cursorText, setCursorText] = useState('');

  return (
    <CursorContext.Provider value={{ isHovered, setIsHovered, cursorText, setCursorText }}>
      {children}
    </CursorContext.Provider>
  );
};
