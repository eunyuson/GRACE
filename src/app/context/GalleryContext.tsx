import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase';

// 타입 정의
export interface GalleryContentSection {
  id: string;
  keyword: string;
  text: string;
  date?: string;
  image?: string;
  videoUrl?: string;
  videoPlayMode?: 'muted-autoplay' | 'manual' | 'autoplay';
  videoDisplayMode?: 'pip' | 'inline'; // pip: 미니 플레이어 (음악용), inline: 메인 화면 재생
  pdfUrl?: string; // PDF 문서 URL
  externalUrl?: string; // 외부 링크 URL (클릭 시 새 탭에서 열림)
  // 일일 묵상(큐티) PDF 설정
  isDailyReading?: boolean | string; // 날짜별 페이지 자동 이동 활성화
  pdfStartDate?: string; // 책 시작일 (예: '01-01' 또는 '2026-01-01')
  pagesPerDay?: number | string; // 하루당 페이지 수 (기본값: 2)
  pdfFirstPage?: number | string; // 북의 실제 시작 페이지 (예: 표지/목차 제외, 기본값: 1)
}

export interface GalleryItemType {
  id: string; // Firestore 문서 ID (string)
  index: string;
  title: string;
  subtitle: string;
  image: string;
  type?: 'image' | 'video' | 'pdf' | 'link';
  externalUrl?: string; // 외부 링크 URL (type이 'link'인 경우)
  videoUrl?: string;
  videoPlayMode?: 'muted-autoplay' | 'manual' | 'autoplay';
  videoDisplayMode?: 'pip' | 'inline'; // pip: 미니 플레이어 (음악용), inline: 메인 화면 재생
  pdfUrl?: string; // PDF 문서 URL
  // 일일 묵상(큐티) PDF 설정
  isDailyReading?: boolean | string;
  pdfStartDate?: string;
  pagesPerDay?: number | string;
  pdfFirstPage?: number | string; // 북의 실제 시작 페이지
  descTitle: string;
  desc: string;
  content: GalleryContentSection[];
}

interface GalleryContextType {
  items: GalleryItemType[];
  loading: boolean;
  error: string | null;
  updateItem: (updatedItem: GalleryItemType) => Promise<void>;
  addItem: (newItem: Omit<GalleryItemType, 'id'>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
}

const GalleryContext = createContext<GalleryContextType | undefined>(undefined);

export const GalleryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<GalleryItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Firestore에서 실시간 데이터 구독
  useEffect(() => {
    const galleryRef = collection(db, 'gallery');
    const q = query(galleryRef, orderBy('index', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const galleryItems: GalleryItemType[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as GalleryItemType[];
        setItems(galleryItems);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Firestore error:', err);
        setError('데이터를 불러오는 데 실패했습니다.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // 아이템 업데이트
  const updateItem = async (updatedItem: GalleryItemType) => {
    try {
      const docRef = doc(db, 'gallery', updatedItem.id);
      const { id, ...data } = updatedItem;
      await updateDoc(docRef, data);
    } catch (err) {
      console.error('Update error:', err);
      throw new Error('아이템 업데이트에 실패했습니다.');
    }
  };

  // 새 아이템 추가
  const addItem = async (newItem: Omit<GalleryItemType, 'id'>) => {
    try {
      const galleryRef = collection(db, 'gallery');
      await addDoc(galleryRef, newItem);
    } catch (err) {
      console.error('Add error:', err);
      throw new Error('아이템 추가에 실패했습니다.');
    }
  };

  // 아이템 삭제
  const deleteItem = async (id: string) => {
    try {
      const docRef = doc(db, 'gallery', id);
      await deleteDoc(docRef);
    } catch (err) {
      console.error('Delete error:', err);
      throw new Error('아이템 삭제에 실패했습니다.');
    }
  };

  return (
    <GalleryContext.Provider value={{ items, loading, error, updateItem, addItem, deleteItem }}>
      {children}
    </GalleryContext.Provider>
  );
};

export const useGallery = () => {
  const context = useContext(GalleryContext);
  if (context === undefined) {
    throw new Error('useGallery must be used within a GalleryProvider');
  }
  return context;
};
