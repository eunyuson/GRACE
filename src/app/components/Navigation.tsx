import React, { useState, useEffect } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { onAuthStateChanged, signInWithRedirect, signOut, GoogleAuthProvider, User, getRedirectResult } from 'firebase/auth';
import { auth } from '../firebase';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface NavigationProps {
  currentIndex: number; // 1-based
  total: number;
  onNavigate: (index: number) => void;
  showIndex: boolean;
}

export const Navigation: React.FC<NavigationProps> = ({ currentIndex, total, onNavigate, showIndex }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Handle redirect result on page load (for mobile browsers)
  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          console.log('Redirect login successful:', result.user.email);
        }
      })
      .catch((error) => {
        console.error('Redirect login error:', error);
      });
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      // Use redirect instead of popup for mobile compatibility
      await signInWithRedirect(auth, provider);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className="fixed top-[40px] left-1/2 -translate-x-1/2 w-[90vw] max-w-[1200px] flex items-center justify-between z-[2000] transition-opacity duration-500 text-white">
      <div className="flex items-center justify-center gap-[8px] grow">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            onClick={() => onNavigate(i)}
            className={cn(
              "tick w-[1px] bg-white/20 cursor-pointer transition-[height,background-color] duration-300 relative",
              "after:content-[''] after:absolute after:-top-[15px] after:-left-[5px] after:-right-[5px] after:-bottom-[15px]",
              "hover:bg-white/60 hover:h-[16px]",
              i === currentIndex - 1 ? "bg-white h-[22px]" : "h-[10px]"
            )}
          />
        ))}
      </div>

      {!loading && (
        <div className="flex items-center gap-4 min-w-[80px] justify-end">
          {user ? (
            <>
              <span className="font-['Inter'] text-[0.65rem] tracking-[1px] text-white/60 truncate max-w-[100px]">
                {user.displayName?.split(' ')[0] || 'User'}
              </span>
              <button
                onClick={handleLogout}
                className="font-['Inter'] text-[0.75rem] tracking-[2px] font-normal hover:text-white/70 transition-colors uppercase"
              >
                LOGOUT
              </button>
            </>
          ) : (
            <button
              onClick={handleLogin}
              className="font-['Inter'] text-[0.75rem] tracking-[2px] font-normal hover:text-white/70 transition-colors uppercase"
            >
              LOGIN
            </button>
          )}
        </div>
      )}
    </div>
  );
};
