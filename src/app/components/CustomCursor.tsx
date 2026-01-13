import React, { useEffect, useRef } from 'react';
import { useCursor } from '../context/CursorContext';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const CustomCursor: React.FC = () => {
  const cursorRef = useRef<HTMLDivElement>(null);
  const { isHovered, cursorText } = useCursor();

  useEffect(() => {
    const moveCursor = (e: MouseEvent) => {
      if (cursorRef.current) {
        cursorRef.current.style.left = `${e.clientX}px`;
        cursorRef.current.style.top = `${e.clientY}px`;
      }
    };
    window.addEventListener('mousemove', moveCursor);
    return () => {
      window.removeEventListener('mousemove', moveCursor);
    };
  }, []);

  return (
    <div
      ref={cursorRef}
      className={cn(
        "fixed top-0 left-0 w-5 h-5 border border-white/40 bg-white/10 rounded-full pointer-events-none z-[9999] -translate-x-1/2 -translate-y-1/2 transition-[width,height,background-color] duration-300 ease-out mix-blend-difference flex items-center justify-center",
        isHovered && "w-20 h-20 bg-white text-black"
      )}
    >
      <span
        className={cn(
          "text-[10px] opacity-0 font-bold uppercase transition-opacity duration-300",
          isHovered && "opacity-100"
        )}
      >
        {cursorText || 'SURF'}
      </span>
    </div>
  );
};
