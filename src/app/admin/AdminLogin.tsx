import React, { useState, useEffect } from 'react';
import { signInWithRedirect, GoogleAuthProvider, getRedirectResult } from 'firebase/auth';
import { auth } from '../firebase';

interface AdminLoginProps {
  onLogin: () => void;
}

const googleProvider = new GoogleAuthProvider();

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLogin }) => {
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [loading, setLoading] = useState(false);

  // Handle redirect result on page load (for mobile browsers)
  useEffect(() => {
    setLoading(true);
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          console.log('Redirect login successful:', result.user.email);
          onLogin();
        }
      })
      .catch((err: any) => {
        console.error('Redirect login error:', err);
        setErrorCode(err.code || 'unknown');

        if (err.code === 'auth/unauthorized-domain') {
          setError('도메인이 승인되지 않았습니다. Firebase Console → Authentication → Settings → Authorized domains에 도메인을 추가하세요.');
        } else if (err.code === 'auth/configuration-not-found') {
          setError('Firebase 설정을 찾을 수 없습니다. .env 파일을 확인하세요.');
        } else if (err.code === 'auth/operation-not-allowed') {
          setError('Google 로그인이 비활성화되어 있습니다. Firebase Console에서 활성화하세요.');
        } else if (err.code === 'auth/internal-error') {
          setError('내부 오류입니다. Firebase Console에서 Google 로그인이 활성화되었는지 확인하세요.');
        } else if (err.code) {
          setError(err.message || '알 수 없는 오류가 발생했습니다.');
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [onLogin]);

  const handleGoogleLogin = async () => {
    setError('');
    setErrorCode('');
    setLoading(true);

    try {
      // Use redirect instead of popup for mobile compatibility
      await signInWithRedirect(auth, googleProvider);
      // Note: onLogin will be called in the useEffect after redirect returns
    } catch (err: any) {
      console.error('Google login error:', err);
      setErrorCode(err.code || 'unknown');
      setError(err.message || '로그인 시작 중 오류가 발생했습니다.');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white font-['Inter']">
      <h1 className="text-4xl mb-12 font-['Anton'] tracking-widest">ADMIN ACCESS</h1>

      <div className="flex flex-col gap-6 w-96">
        {error && (
          <div className="text-center">
            <p className="text-red-500 text-xs tracking-widest mb-2">{error}</p>
            {errorCode && (
              <p className="text-white/30 text-[10px] tracking-widest">
                Error Code: {errorCode}
              </p>
            )}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          className="flex items-center justify-center gap-3 border border-white/30 py-4 px-6 hover:bg-white hover:text-black transition-all text-xs tracking-[0.2em] duration-500 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          {loading ? 'SIGNING IN...' : 'SIGN IN WITH GOOGLE'}
        </button>
      </div>

      <div className="text-white/30 text-[10px] mt-8 tracking-widest text-center max-w-sm space-y-2">
        <p>Firebase Console → Authentication → Sign-in method</p>
        <p>→ Google 활성화 필요</p>
      </div>
    </div>
  );
};
