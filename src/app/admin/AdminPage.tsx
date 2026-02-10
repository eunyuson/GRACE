import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable, UploadTaskSnapshot } from 'firebase/storage';
import heic2any from 'heic2any';
import { auth, storage } from '../firebase';
import { useGallery, GalleryItemType, GalleryContentSection } from '../context/GalleryContext';
import { AdminLogin } from './AdminLogin';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import Cropper, { Area } from 'react-easy-crop';
import getCroppedImg from '../../utils/cropImage';

const EmptyItem: Omit<GalleryItemType, 'id'> = {
  index: '00',
  title: '',
  subtitle: '',
  image: '',
  descTitle: '',
  desc: '',
  content: [],
  type: 'image',
  videoUrl: ''
};

// 이미지 업로드 컴포넌트
const ImageUploader: React.FC<{
  currentUrl: string;
  onUpload: (url: string) => void;
  label?: string;
}> = ({ currentUrl, onUpload, label = "IMAGE" }) => {
  const [mode, setMode] = useState<'view' | 'link' | 'upload'>('view'); // 'view' is default, showing current image
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [urlInput, setUrlInput] = useState(currentUrl);

  // Crop State
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUrlInput(currentUrl);
  }, [currentUrl]);

  const onFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];

      // HEIC Support
      const isHeic = file.type === 'image/heic' ||
        file.type === 'image/heif' ||
        file.name.toLowerCase().endsWith('.heic') ||
        file.name.toLowerCase().endsWith('.heif');

      if (isHeic) {
        setStatus('HEIC 변환 중...');
        setUploading(true); // Show status
        try {
          const convertedBlob = await heic2any({
            blob: file,
            toType: 'image/jpeg',
            quality: 0.8
          });
          const jpegBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
          const reader = new FileReader();
          reader.addEventListener('load', () => {
            setCropImageSrc(reader.result?.toString() || '');
            setUploading(false);
            setStatus('');
          });
          reader.readAsDataURL(jpegBlob);
        } catch (err) {
          console.error(err);
          alert('HEIC 변환 실패. JPG/PNG를 사용해주세요.');
          setUploading(false);
          setStatus('');
        }
        // Reset input
        e.target.value = '';
        return;
      }

      // Normal Image
      const reader = new FileReader();
      reader.addEventListener('load', () => setCropImageSrc(reader.result?.toString() || ''));
      reader.readAsDataURL(file);
      e.target.value = '';
    }
  };

  const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleUploadCroppedImage = async () => {
    if (!cropImageSrc || !croppedAreaPixels) return;

    setUploading(true);
    setStatus('이미지 처리 중...');

    try {
      const croppedBlob = await getCroppedImg(cropImageSrc, croppedAreaPixels);
      if (!croppedBlob) throw new Error('Could not create cropped image');

      // Upload Blob to Firebase
      const timestamp = Date.now();
      const storageFileName = `gallery/cropped_${timestamp}.jpg`;
      const storageRef = ref(storage, storageFileName);
      const metadata = { contentType: 'image/jpeg' };

      const uploadTask = uploadBytesResumable(storageRef, croppedBlob, metadata);

      uploadTask.on('state_changed',
        (snapshot: UploadTaskSnapshot) => {
          const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setProgress(Math.round(p));
          setStatus(`업로드 중... ${Math.round(p)}%`);
        },
        (error) => {
          console.error(error);
          setStatus('업로드 실패');
          setUploading(false);
        },
        async () => {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          onUpload(downloadUrl);
          setUploading(false);
          setStatus('완료!');
          setCropImageSrc(null); // Close modal
          setMode('view'); // Back to view mode
        }
      );
    } catch (e: any) {
      console.error(e);
      let msg = '이미지 처리 중 오류가 발생했습니다.';
      if (e.message === 'Could not create cropped image' || e.type === 'error') {
        msg = '보안상 편집할 수 없는 이미지입니다. (다운로드 후 파일로 업로드해주세요)';
      }
      setStatus(msg);
      alert(msg);
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] text-white/40 block tracking-widest">{label}</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode('link')}
            className={`text-[10px] px-2 py-1 ${mode === 'link' ? 'bg-white text-black font-bold' : 'text-white/50 hover:text-white'}`}
          >
            🔗 링크
          </button>
          <button
            type="button"
            onClick={() => setMode('upload')}
            className={`text-[10px] px-2 py-1 ${mode === 'upload' ? 'bg-white text-black font-bold' : 'text-white/50 hover:text-white'}`}
          >
            📁 파일
          </button>
        </div>
      </div>

      {mode === 'link' && (
        <div className="flex gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onBlur={() => { if (urlInput.trim()) onUpload(urlInput.trim()); }}
            placeholder="https://..."
            className="flex-1 bg-[#111] border border-white/20 p-2 text-xs focus:border-white outline-none"
          />
        </div>
      )}

      {mode === 'upload' && (
        <div className="flex gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 bg-white/10 border border-dashed border-white/20 p-4 text-xs text-white/60 hover:bg-white/20 hover:text-white transition-colors"
          >
            {uploading ? `${status}` : '📷 클릭하여 이미지 선택 (JPG, PNG)'}
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={onFileSelect}
            accept="image/*"
            className="hidden"
          />
        </div>
      )}

      {currentUrl && (
        <div className="relative w-full h-32 bg-black border border-white/10 overflow-hidden group">
          <img src={currentUrl} alt="Preview" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button
              onClick={() => window.open(currentUrl, '_blank')}
              className="px-3 py-1 bg-white/20 text-[10px] hover:bg-white/40 text-white"
            >
              확대
            </button>
            <button
              // Load current URL into cropper
              onClick={() => {
                // Check if it's a data URL or remote
                // Try to load it. If CORS fails later, we catch it in handleUploadCroppedImage or getCroppedImg
                setCropImageSrc(currentUrl);
                setMode('upload'); // Switch to upload UI logic conceptually
              }}
              className="px-3 py-1 bg-blue-500/50 text-[10px] hover:bg-blue-500/80 text-white"
            >
              편집
            </button>
            <button
              onClick={() => { onUpload(''); setUrlInput(''); }}
              className="px-3 py-1 bg-red-500/50 text-[10px] hover:bg-red-500/80 text-white"
            >
              삭제
            </button>
          </div>
        </div>
      )}

      {/* Crop Modal */}
      {cropImageSrc && (
        <div className="fixed inset-0 z-[4000] bg-black flex flex-col">
          <div className="p-4 flex justify-between items-center border-b border-white/10 bg-[#111]">
            <h3 className="text-sm font-bold tracking-widest">EDIT IMAGE</h3>
            <button
              onClick={() => setCropImageSrc(null)}
              className="text-white/50 hover:text-white px-4 py-2"
            >
              CANCEL
            </button>
          </div>

          <div className="relative flex-1 bg-black">
            <Cropper
              image={cropImageSrc}
              crop={crop}
              zoom={zoom}
              aspect={16 / 9}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
            />
          </div>

          <div className="p-6 bg-[#111] border-t border-white/10">
            <div className="flex items-center gap-4 mb-6 max-w-md mx-auto">
              <span className="text-[10px] text-white/50 w-12 text-right">ZOOM</span>
              <input
                type="range"
                value={zoom}
                min={1}
                max={3}
                step={0.1}
                aria-labelledby="Zoom"
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 accent-white h-1 bg-white/20 rounded-lg cursor-pointer"
              />
            </div>
            <div className="flex justify-center">
              <button
                onClick={handleUploadCroppedImage}
                disabled={uploading}
                className="px-8 py-3 bg-white text-black font-bold tracking-widest text-xs hover:bg-[#ccc] disabled:opacity-50"
              >
                {uploading ? 'PROCESSING...' : 'CROP & UPLOAD'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// PDF 업로드 컴포넌트
const PdfUploader: React.FC<{
  currentUrl: string;
  onUpload: (url: string) => void;
  label?: string;
}> = ({ currentUrl, onUpload, label = "PDF" }) => {
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [urlInput, setUrlInput] = useState(currentUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUrlInput(currentUrl);
  }, [currentUrl]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // PDF 파일 검증
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('PDF 파일만 업로드 가능합니다.');
      return;
    }

    setUploading(true);
    setProgress(0);
    setStatus('업로드 시작...');

    try {
      const timestamp = Date.now();
      const storageFileName = `documents/${timestamp}_${file.name}`;
      const storageRef = ref(storage, storageFileName);

      const metadata = {
        contentType: 'application/pdf'
      };

      const uploadTask = uploadBytesResumable(storageRef, file, metadata);

      uploadTask.on('state_changed',
        (snapshot: UploadTaskSnapshot) => {
          const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setProgress(Math.round(p));
          setStatus(`업로드 중... ${Math.round(p)}%`);
        },
        (error: Error) => {
          console.error('Upload error:', error);
          alert('업로드 중 오류가 발생했습니다: ' + error.message);
          setUploading(false);
          setStatus('');
        },
        async () => {
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            onUpload(downloadUrl);
            setUrlInput(downloadUrl);
            setStatus('완료!');
            setTimeout(() => {
              setStatus('');
              setUploading(false);
            }, 1000);
          } catch (urlError) {
            console.error('Get URL error:', urlError);
            setUploading(false);
          }
        }
      );
    } catch (error) {
      console.error('Process error:', error);
      setUploading(false);
      setStatus('오류 발생');
    }
  };

  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
      onUpload(urlInput.trim());
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-[10px] text-white/40 block tracking-widest">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onBlur={handleUrlSubmit}
          placeholder="https://... 또는 파일 업로드"
          className="flex-1 bg-[#111] border border-white/20 p-2 text-xs focus:border-white outline-none"
        />
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".pdf,application/pdf"
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="px-3 py-2 bg-white/10 border border-white/20 text-[10px] tracking-widest hover:bg-white/20 disabled:opacity-50 min-w-[60px]"
        >
          {uploading ? `${progress}%` : '📄'}
        </button>
      </div>
      {status && (
        <p className="text-[10px] text-white/50 tracking-widest animate-pulse">{status}</p>
      )}
      {currentUrl && (
        <div className="flex items-center gap-2 p-2 bg-black border border-white/10">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <span className="text-xs text-white/70 truncate flex-1">PDF 첨부됨</span>
          <a href={currentUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:underline">미리보기</a>
        </div>
      )}
    </div>
  );
};

// Draggable Gallery Item Component
const DraggableGalleryItem: React.FC<{
  item: GalleryItemType;
  index: number;
  moveItem: (dragIndex: number, hoverIndex: number) => void;
  onDragEnd: () => void;
  onEdit: (item: GalleryItemType) => void;
  onDelete: (id: string) => void;
}> = ({ item, index, moveItem, onDragEnd, onEdit, onDelete }) => {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag] = useDrag({
    type: 'GALLERY_ITEM',
    item: { index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    end: () => {
      onDragEnd();
    },
  });

  const [{ isOver }, drop] = useDrop({
    accept: 'GALLERY_ITEM',
    hover: (draggedItem: { index: number }) => {
      if (draggedItem.index !== index) {
        moveItem(draggedItem.index, index);
        draggedItem.index = index;
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  drag(drop(ref));

  return (
    <div
      ref={ref}
      className={`bg-[#161616] p-4 flex gap-6 items-center border transition-all cursor-move group ${isDragging ? 'opacity-50 border-blue-500' : isOver ? 'border-blue-500/50' : 'border-white/5 hover:border-white/20'
        }`}
    >
      {/* Drag Handle */}
      <div className="flex items-center justify-center w-6 text-white/20 group-hover:text-white/40 transition-colors">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="4" y1="8" x2="20" y2="8"></line>
          <line x1="4" y1="16" x2="20" y2="16"></line>
        </svg>
      </div>

      {/* Thumbnail */}
      <div
        className="w-16 h-16 bg-[#222] shrink-0 overflow-hidden cursor-pointer"
        onClick={() => {
          window.location.href = `/?item=${item.id}`;
        }}
      >
        {(() => {
          // YouTube 썸네일 지원
          if (item.type === 'video' && item.videoUrl) {
            const ytId = item.videoUrl.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/)?.[2];
            if (ytId && ytId.length === 11) {
              return <img src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`} alt={item.title} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" />;
            }
          }
          return <img src={item.image} alt={item.title} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" />;
        })()}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-4 mb-1">
          <span className="font-['Anton'] text-lg text-white/40 group-hover:text-white/60 transition-colors">{item.index}</span>
          <h3 className="font-bold text-lg group-hover:text-white transition-colors">{item.title}</h3>
        </div>
        <p className="text-xs text-white/50 truncate">{item.subtitle}</p>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            window.location.href = `/?item=${item.id}`;
          }}
          className="px-4 py-2 border border-blue-500/50 text-[10px] tracking-widest text-blue-400 hover:bg-blue-500/20 transition-colors"
        >
          VIEW
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(item);
          }}
          className="px-4 py-2 border border-white/20 text-[10px] tracking-widest hover:bg-white hover:text-black transition-colors"
        >
          EDIT
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(item.id);
          }}
          className="px-4 py-2 border border-red-900/50 text-[10px] tracking-widest text-red-500 hover:bg-red-900/20 transition-colors"
        >
          DELETE
        </button>
      </div>
    </div>
  );
};

export const AdminPage: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const { items, loading, error, addItem, updateItem, deleteItem, reorderItems } = useGallery();
  const [editingItem, setEditingItem] = useState<GalleryItemType | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newItem, setNewItem] = useState<Omit<GalleryItemType, 'id'>>(EmptyItem);
  const [saving, setSaving] = useState(false);

  // Local display items for optimistic UI during drag
  const [displayItems, setDisplayItems] = useState<GalleryItemType[]>([]);

  // Quick Upload State
  const [showQuickUpload, setShowQuickUpload] = useState(false);
  const [quickUploadUrl, setQuickUploadUrl] = useState('');

  // Firebase Auth 상태 감시
  const [searchParams, setSearchParams] = useSearchParams();

  // URL query edit param check
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId && items.length > 0 && !loading) {
      const itemToEdit = items.find(i => String(i.id) === editId);
      if (itemToEdit) {
        setEditingItem(itemToEdit);
        // Clean URL
        setSearchParams({});
      }
    }
  }, [items, loading, searchParams, setSearchParams]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
    });

    return () => unsubscribe();
  }, []);

  // 로그아웃 핸들러
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // 인증 상태 확인 중
  if (isAuthenticated === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-white">
        <p className="text-xs tracking-widest opacity-50">AUTHENTICATING...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AdminLogin onLogin={() => setIsAuthenticated(true)} />;
  }

  const handleSave = async () => {
    if (editingItem) {
      setSaving(true);
      try {
        await updateItem(editingItem);
        setEditingItem(null);
      } catch (err) {
        alert('저장에 실패했습니다. 다시 시도해주세요.');
      } finally {
        setSaving(false);
      }
    }
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      await addItem(newItem);
      setIsCreating(false);
      setNewItem({ ...EmptyItem, content: [] });
      alert('새 아이템이 추가되었습니다!');
    } catch (err) {
      alert('추가에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('정말 이 아이템을 삭제하시겠습니까?')) {
      try {
        await deleteItem(id);
      } catch (err) {
        alert('삭제에 실패했습니다. 다시 시도해주세요.');
      }
    }
  };

  const handleChange = (field: keyof GalleryItemType, value: any, isNew: boolean = false) => {
    if (isNew) {
      setNewItem({ ...newItem, [field]: value });
    } else if (editingItem) {
      setEditingItem({ ...editingItem, [field]: value });
    }
  };

  // Sync displayItems with items
  useEffect(() => {
    setDisplayItems(items);
  }, [items]);

  // Handle drag and drop move
  const handleMoveItem = useCallback((dragIndex: number, hoverIndex: number) => {
    setDisplayItems((prevItems) => {
      const newItems = [...prevItems];
      const [draggedItem] = newItems.splice(dragIndex, 1);
      newItems.splice(hoverIndex, 0, draggedItem);
      return newItems;
    });
  }, []);

  // Handle drag end - save to database
  const handleDragEnd = useCallback(async () => {
    // Find the differences between displayItems and items
    const hasChanges = displayItems.some((item, idx) => item.id !== items[idx]?.id);
    if (hasChanges) {
      const startIndex = items.findIndex((item, idx) => item.id !== displayItems[idx]?.id);
      const endIndex = displayItems.findIndex((item, idx) => item.id !== items[idx]?.id);
      if (startIndex !== -1 && endIndex !== -1) {
        try {
          await reorderItems(startIndex, endIndex);
        } catch (err) {
          console.error('Failed to reorder items:', err);
          // Revert to original order on error
          setDisplayItems(items);
        }
      }
    }
  }, [displayItems, items, reorderItems]);


  // Content Section Handlers
  const addContentSection = (isNew: boolean) => {
    const newSection: GalleryContentSection = {
      id: `section-${Date.now()}`,
      keyword: 'NEW SECTION',
      text: ''
    };

    if (isNew) {
      setNewItem({ ...newItem, content: [...newItem.content, newSection] });
    } else if (editingItem) {
      setEditingItem({ ...editingItem, content: [...editingItem.content, newSection] });
    }
  };

  const updateContentSection = (sectionId: string, field: keyof GalleryContentSection, value: string, isNew: boolean) => {
    if (isNew) {
      setNewItem({
        ...newItem,
        content: newItem.content.map(c => c.id === sectionId ? { ...c, [field]: value } : c)
      });
    } else if (editingItem) {
      setEditingItem({
        ...editingItem,
        content: editingItem.content.map(c => c.id === sectionId ? { ...c, [field]: value } : c)
      });
    }
  };

  const deleteContentSection = (sectionId: string, isNew: boolean) => {
    if (window.confirm('이 섹션을 삭제하시겠습니까?')) {
      if (isNew) {
        setNewItem({
          ...newItem,
          content: newItem.content.filter(c => c.id !== sectionId)
        });
      } else if (editingItem) {
        setEditingItem({
          ...editingItem,
          content: editingItem.content.filter(c => c.id !== sectionId)
        });
      }
    }
  };

  const renderContentEditor = (item: GalleryItemType | Omit<GalleryItemType, 'id'>, isNew: boolean) => (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b border-white/10 pb-2 mb-4">
        <h3 className="text-xs opacity-50 tracking-widest">CONTENT SECTIONS</h3>
        <button
          onClick={() => addContentSection(isNew)}
          className="text-[10px] bg-white text-black px-3 py-1 font-bold tracking-widest hover:bg-[#ccc]"
        >
          + ADD SECTION
        </button>
      </div>

      <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
        {item.content.length === 0 && (
          <p className="text-xs text-white/30 text-center py-8 border border-dashed border-white/10">
            No content sections yet. Add one to start.
          </p>
        )}
        {item.content.map((section) => (
          <div key={section.id} className="bg-[#111] p-4 border border-white/10 relative group">
            <button
              onClick={() => deleteContentSection(section.id, isNew)}
              className="absolute top-2 right-2 text-white/20 hover:text-red-500 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <div className="mb-3">
              <label className="text-[10px] text-white/40 block mb-1 tracking-widest">KEYWORD</label>
              <input
                type="text"
                value={section.keyword}
                onChange={(e) => updateContentSection(section.id, 'keyword', e.target.value, isNew)}
                className="w-full bg-black border border-white/20 p-2 text-xs font-bold tracking-widest focus:border-white outline-none uppercase"
                placeholder="e.g. STORY"
              />
            </div>
            <div className="mb-3">
              <label className="text-[10px] text-white/40 block mb-1 tracking-widest">DATE</label>
              <input
                type="date"
                value={section.date || ''}
                onChange={(e) => updateContentSection(section.id, 'date', e.target.value, isNew)}
                className="w-full bg-black border border-white/20 p-2 text-xs focus:border-white outline-none"
              />
            </div>
            <div className="mb-3">
              <ImageUploader
                label="SECTION IMAGE"
                currentUrl={section.image || ''}
                onUpload={(url) => updateContentSection(section.id, 'image', url, isNew)}
              />
            </div>
            <div className="mb-3">
              <label className="text-[10px] text-white/40 block mb-1 tracking-widest">VIDEO URL (YouTube)</label>
              <input
                type="text"
                value={section.videoUrl || ''}
                onChange={(e) => updateContentSection(section.id, 'videoUrl', e.target.value, isNew)}
                className="w-full bg-black border border-white/20 p-2 text-xs focus:border-white outline-none"
                placeholder="https://youtu.be/..."
              />
              {section.videoUrl && (
                <div className="mt-2 flex gap-2">
                  <select
                    value={section.videoPlayMode || 'manual'}
                    onChange={(e) => updateContentSection(section.id, 'videoPlayMode', e.target.value, isNew)}
                    className="flex-1 bg-black border border-white/20 p-2 text-[10px] focus:border-white outline-none"
                  >
                    <option value="manual">🎬 수동 재생</option>
                    <option value="muted-autoplay">🔇 음소거 자동</option>
                    <option value="autoplay">🔊 소리 자동</option>
                  </select>
                  <select
                    value={section.videoDisplayMode || 'inline'}
                    onChange={(e) => updateContentSection(section.id, 'videoDisplayMode', e.target.value, isNew)}
                    className="flex-1 bg-black border border-white/20 p-2 text-[10px] focus:border-white outline-none"
                  >
                    <option value="inline">📺 메인 화면 재생</option>
                    <option value="pip">🎵 미니 플레이어 (음악용)</option>
                  </select>
                </div>
              )}
            </div>
            <div className="mb-3">
              <PdfUploader
                label="PDF 문서"
                currentUrl={section.pdfUrl || ''}
                onUpload={(url) => updateContentSection(section.id, 'pdfUrl', url, isNew)}
              />
              {/* 일일 묵상(큐티) 설정 */}
              {section.pdfUrl && (
                <div className="mt-3 p-3 border border-white/10 bg-black/30 space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={section.isDailyReading === true || section.isDailyReading === 'true'}
                      onChange={(e) => updateContentSection(section.id, 'isDailyReading', e.target.checked ? 'true' : '', isNew)}
                      className="w-4 h-4 accent-blue-500"
                    />
                    <span className="text-[11px] text-white/70 tracking-wide">📅 일일 묵상(큐티) - 오늘 날짜에 맞는 페이지로 자동 이동</span>
                  </label>

                  {(section.isDailyReading || (section as any).isDailyReading === 'true') && (
                    <div className="grid grid-cols-3 gap-3 pl-6">
                      <div>
                        <label className="text-[10px] text-white/40 block mb-1 tracking-widest">시작일 (MM-DD)</label>
                        <input
                          type="text"
                          value={section.pdfStartDate || '01-01'}
                          onChange={(e) => updateContentSection(section.id, 'pdfStartDate', e.target.value, isNew)}
                          placeholder="01-01"
                          className="w-full bg-black border border-white/20 p-2 text-xs focus:border-white outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-white/40 block mb-1 tracking-widest">시작 페이지</label>
                        <input
                          type="number"
                          value={section.pdfFirstPage || 1}
                          onChange={(e) => updateContentSection(section.id, 'pdfFirstPage', e.target.value, isNew)}
                          min="1"
                          placeholder="1"
                          className="w-full bg-black border border-white/20 p-2 text-xs focus:border-white outline-none"
                        />
                        <span className="text-[8px] text-white/30 block mt-1">본문 시작 페이지</span>
                      </div>
                      <div>
                        <label className="text-[10px] text-white/40 block mb-1 tracking-widest">하루당 페이지</label>
                        <input
                          type="number"
                          value={section.pagesPerDay || 2}
                          onChange={(e) => updateContentSection(section.id, 'pagesPerDay', e.target.value, isNew)}
                          min="1"
                          className="w-full bg-black border border-white/20 p-2 text-xs focus:border-white outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="mb-3">
              <label className="text-[10px] text-white/40 block mb-1 tracking-widest">외부 링크 URL</label>
              <input
                type="text"
                value={section.externalUrl || ''}
                onChange={(e) => updateContentSection(section.id, 'externalUrl', e.target.value, isNew)}
                className="w-full bg-black border border-white/20 p-2 text-xs focus:border-white outline-none"
                placeholder="https://example.com"
              />
              {section.externalUrl && (
                <p className="text-[10px] text-blue-400/70 mt-1">
                  🔗 클릭 시 새 탭에서 열림
                </p>
              )}
            </div>
            <div className="mb-3">
              <label className="text-[10px] text-white/40 block mb-1 tracking-widest">CONTENT</label>
              <textarea
                value={section.text}
                onChange={(e) => updateContentSection(section.id, 'text', e.target.value, isNew)}
                className="w-full bg-black border border-white/20 p-2 text-sm leading-relaxed focus:border-white outline-none h-24 resize-y"
                placeholder="Section content..."
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen h-screen bg-[#111] text-[#f0f0f0] font-['Inter'] overflow-y-auto">
      <div className="max-w-6xl mx-auto p-8 pt-12 pb-24">
        <header className="flex justify-between items-center mb-12 border-b border-white/10 pb-8">
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="text-white/40 hover:text-white transition-colors"
              title="홈으로 이동"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
            </Link>
            <h1 className="text-3xl font-['Anton'] tracking-widest">DASHBOARD</h1>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setIsCreating(true)}
              className="px-6 py-2 bg-white text-black text-xs font-bold tracking-[0.2em] hover:bg-[#ccc] transition-colors"
            >
              + ADD NEW MOMENT
            </button>
            <button
              onClick={() => {
                setShowQuickUpload(true);
                setQuickUploadUrl('');
              }}
              className="px-6 py-2 border border-blue-500/50 text-blue-400 text-xs font-bold tracking-[0.2em] hover:bg-blue-500/10 transition-colors mr-2"
            >
              ★ QUICK UPLOAD
            </button>
            <button
              onClick={handleLogout}
              className="px-6 py-2 border border-white/20 text-xs tracking-[0.2em] hover:bg-white/10 transition-colors"
            >
              LOGOUT
            </button>
          </div>
        </header>

        {/* Quick Upload Modal */}
        {showQuickUpload && (
          <div className="fixed inset-0 bg-black/90 z-[3000] flex items-center justify-center p-8">
            <div className="bg-[#1a1a1a] p-8 w-full max-w-md border border-white/10 relative">
              <button
                onClick={() => setShowQuickUpload(false)}
                className="absolute top-4 right-4 text-white/40 hover:text-white"
              >
                ✕
              </button>

              <h2 className="text-xl mb-6 font-bold tracking-widest text-center">QUICK IMAGE UPLOAD</h2>

              <div className="space-y-6">
                <div className="p-4 bg-black border border-dashed border-white/20 text-center">
                  <ImageUploader
                    currentUrl={quickUploadUrl}
                    onUpload={(url) => setQuickUploadUrl(url)}
                    label="UPLOAD IMAGE TO GET URL"
                  />
                </div>

                {quickUploadUrl && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2">
                    <label className="text-[10px] text-white/40 block tracking-widest">GENERATED URL</label>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={quickUploadUrl}
                        className="flex-1 bg-black border border-white/20 p-2 text-xs text-white/70 focus:outline-none"
                        onClick={(e) => e.currentTarget.select()}
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(quickUploadUrl);
                          alert('URL copied to clipboard!');
                        }}
                        className="bg-white text-black px-3 py-2 text-[10px] font-bold tracking-widest hover:bg-[#ccc]"
                      >
                        COPY
                      </button>
                    </div>
                    <p className="text-[10px] text-blue-400 mt-2 text-center">
                      ✨ Copy this URL and paste it into your Google Sheet!
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-20">
            <p className="text-xs tracking-widest opacity-50">LOADING...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="text-center py-20">
            <p className="text-xs tracking-widest text-red-500">{error}</p>
          </div>
        )}

        {isCreating && (
          <div className="bg-[#1a1a1a] p-8 mb-12 border border-white/10 rounded-lg">
            <h2 className="text-xl mb-6 font-bold tracking-widest">CREATE NEW</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="INDEX (e.g. 11)"
                  className="w-full bg-[#111] border border-white/20 p-3 text-sm focus:border-white outline-none"
                  value={newItem.index}
                  onChange={(e) => handleChange('index', e.target.value, true)}
                />
                <input
                  type="text"
                  placeholder="TITLE (English)"
                  className="w-full bg-[#111] border border-white/20 p-3 text-sm focus:border-white outline-none"
                  value={newItem.title}
                  onChange={(e) => handleChange('title', e.target.value, true)}
                />
                <input
                  type="text"
                  placeholder="SUBTITLE (Korean)"
                  className="w-full bg-[#111] border border-white/20 p-3 text-sm focus:border-white outline-none"
                  value={newItem.subtitle}
                  onChange={(e) => handleChange('subtitle', e.target.value, true)}
                />
                <div className="space-y-2">
                  <label className="text-[10px] text-white/40 tracking-widest">DESCRIPTION</label>
                  <textarea
                    className="w-full bg-[#111] border border-white/20 p-3 text-sm focus:border-white outline-none h-20"
                    value={newItem.desc}
                    onChange={(e) => handleChange('desc', e.target.value, true)}
                  />
                </div>
                <div className="flex gap-4 items-end">
                  <div className="w-1/3">
                    <label className="text-[10px] text-white/40 block mb-1 tracking-widest">TYPE</label>
                    <select
                      className="w-full bg-[#111] border border-white/20 p-3 text-sm focus:border-white outline-none"
                      value={newItem.type || 'image'}
                      onChange={(e) => handleChange('type', e.target.value, true)}
                    >
                      <option value="image">IMAGE</option>
                      <option value="video">VIDEO</option>
                      <option value="pdf">PDF</option>
                      <option value="link">LINK (외부 URL)</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    {newItem.type === 'video' ? (
                      <div className="space-y-2">
                        <label className="text-[10px] text-white/40 block tracking-widest">VIDEO URL</label>
                        <input
                          type="text"
                          placeholder="YouTube URL"
                          className="w-full bg-[#111] border border-white/20 p-3 text-sm focus:border-white outline-none"
                          value={newItem.videoUrl}
                          onChange={(e) => handleChange('videoUrl', e.target.value, true)}
                        />
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="text-[10px] text-white/40 block tracking-widest mb-1">재생 방식</label>
                            <select
                              className="w-full bg-[#111] border border-white/20 p-2 text-xs focus:border-white outline-none"
                              value={newItem.videoPlayMode || 'manual'}
                              onChange={(e) => handleChange('videoPlayMode', e.target.value, true)}
                            >
                              <option value="manual">🎬 수동 재생</option>
                              <option value="muted-autoplay">🔇 음소거 자동</option>
                              <option value="autoplay">🔊 소리 자동</option>
                            </select>
                          </div>
                          <div className="flex-1">
                            <label className="text-[10px] text-white/40 block tracking-widest mb-1">표시 방식</label>
                            <select
                              className="w-full bg-[#111] border border-white/20 p-2 text-xs focus:border-white outline-none"
                              value={newItem.videoDisplayMode || 'inline'}
                              onChange={(e) => handleChange('videoDisplayMode', e.target.value, true)}
                            >
                              <option value="inline">📺 메인 화면</option>
                              <option value="pip">🎵 미니 플레이어 (음악)</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    ) : newItem.type === 'pdf' ? (
                      <div className="space-y-2">
                        <PdfUploader
                          currentUrl={newItem.pdfUrl || ''}
                          onUpload={(url) => handleChange('pdfUrl', url, true)}
                          label="PDF 문서"
                        />
                        {newItem.pdfUrl && (
                          <div className="p-3 border border-white/10 bg-black/30 space-y-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={newItem.isDailyReading === true || newItem.isDailyReading === 'true'}
                                onChange={(e) => handleChange('isDailyReading', e.target.checked ? 'true' : '', true)}
                                className="w-4 h-4 accent-blue-500"
                              />
                              <span className="text-[11px] text-white/70 tracking-wide">📅 일일 묵상(큐티)</span>
                            </label>
                            {(newItem.isDailyReading === true || newItem.isDailyReading === 'true') && (
                              <div className="grid grid-cols-3 gap-3 pl-6">
                                <div>
                                  <label className="text-[10px] text-white/40 block mb-1 tracking-widest">시작일 (MM-DD)</label>
                                  <input
                                    type="text"
                                    value={newItem.pdfStartDate || '01-01'}
                                    onChange={(e) => handleChange('pdfStartDate', e.target.value, true)}
                                    placeholder="01-01"
                                    className="w-full bg-black border border-white/20 p-2 text-xs focus:border-white outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] text-white/40 block mb-1 tracking-widest">시작 페이지</label>
                                  <input
                                    type="number"
                                    value={newItem.pdfFirstPage || 1}
                                    onChange={(e) => handleChange('pdfFirstPage', e.target.value, true)}
                                    min="1"
                                    placeholder="1"
                                    className="w-full bg-black border border-white/20 p-2 text-xs focus:border-white outline-none"
                                  />
                                  <span className="text-[8px] text-white/30 block mt-1">본문 시작 페이지</span>
                                </div>
                                <div>
                                  <label className="text-[10px] text-white/40 block mb-1 tracking-widest">하루당 페이지</label>
                                  <input
                                    type="number"
                                    value={newItem.pagesPerDay || 2}
                                    onChange={(e) => handleChange('pagesPerDay', e.target.value, true)}
                                    min="1"
                                    className="w-full bg-black border border-white/20 p-2 text-xs focus:border-white outline-none"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {/* 썸네일 이미지 (PDF용) */}
                        <ImageUploader
                          currentUrl={newItem.image}
                          onUpload={(url) => handleChange('image', url, true)}
                          label="썸네일 이미지"
                        />
                      </div>
                    ) : newItem.type === 'link' ? (
                      <div className="space-y-2">
                        <label className="text-[10px] text-white/40 block tracking-widest">외부 링크 URL</label>
                        <input
                          type="text"
                          placeholder="https://example.com"
                          className="w-full bg-[#111] border border-white/20 p-3 text-sm focus:border-white outline-none"
                          value={newItem.externalUrl || ''}
                          onChange={(e) => handleChange('externalUrl', e.target.value, true)}
                        />
                        <p className="text-[10px] text-white/30">클릭 시 이 URL로 바로 이동합니다</p>
                        <ImageUploader
                          currentUrl={newItem.image}
                          onUpload={(url) => handleChange('image', url, true)}
                          label="썸네일 이미지"
                        />
                      </div>
                    ) : (
                      <ImageUploader
                        currentUrl={newItem.image}
                        onUpload={(url) => handleChange('image', url, true)}
                        label="MAIN IMAGE"
                      />
                    )}
                  </div>
                </div>
                {/* Preview */}
                <div className="aspect-video bg-black flex items-center justify-center overflow-hidden border border-white/10">
                  {newItem.type === 'video' && newItem.videoUrl ? (
                    (() => {
                      const ytId = newItem.videoUrl.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/)?.[2];
                      if (ytId && ytId.length === 11) {
                        return (
                          <iframe
                            className="w-full h-full object-cover"
                            src={`https://www.youtube.com/embed/${ytId}`}
                            title="YouTube video player"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        );
                      }
                      return (
                        <video src={newItem.videoUrl} className="w-full h-full object-cover" controls />
                      );
                    })()
                  ) : newItem.type === 'pdf' && newItem.pdfUrl ? (
                    <div className="flex flex-col items-center justify-center gap-2 text-white/50">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-500">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                      <span className="text-xs tracking-widest">PDF DOCUMENT</span>
                    </div>
                  ) : newItem.image ? (
                    <img src={newItem.image} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs opacity-30">PREVIEW</span>
                  )}
                </div>
              </div>

              {renderContentEditor(newItem, true)}
            </div>
            <div className="flex justify-end gap-4 mt-8">
              <button onClick={() => setIsCreating(false)} className="px-6 py-2 text-xs hover:text-white/70 tracking-widest">CANCEL</button>
              <button
                onClick={handleCreate}
                className="px-6 py-2 bg-white text-black text-xs font-bold tracking-widest hover:bg-[#ccc] disabled:opacity-50"
                disabled={saving}
              >
                {saving ? 'SAVING...' : 'SAVE'}
              </button>
            </div>
          </div>
        )}

        <DndProvider backend={HTML5Backend}>
          <div className="grid gap-4">
            {displayItems.map((item, index) => (
              <DraggableGalleryItem
                key={item.id}
                item={item}
                index={index}
                moveItem={handleMoveItem}
                onDragEnd={handleDragEnd}
                onEdit={setEditingItem}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </DndProvider>
      </div>

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/90 z-[3000] flex items-center justify-center p-8 overflow-y-auto">
          <div className="bg-[#1a1a1a] p-8 w-full max-w-5xl max-h-[90vh] overflow-y-auto border border-white/10 my-8">
            <h2 className="text-xl mb-6 font-bold tracking-widest">EDIT MOMENT</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <input
                  type="text"
                  value={editingItem.index}
                  onChange={(e) => handleChange('index', e.target.value)}
                  className="w-full bg-[#111] border border-white/20 p-3 text-sm focus:border-white outline-none"
                  placeholder="INDEX"
                />
                <input
                  type="text"
                  value={editingItem.title}
                  onChange={(e) => handleChange('title', e.target.value)}
                  className="w-full bg-[#111] border border-white/20 p-3 text-sm focus:border-white outline-none"
                  placeholder="TITLE"
                />
                <input
                  type="text"
                  value={editingItem.subtitle}
                  onChange={(e) => handleChange('subtitle', e.target.value)}
                  className="w-full bg-[#111] border border-white/20 p-3 text-sm focus:border-white outline-none"
                  placeholder="SUBTITLE"
                />
                <div className="space-y-2">
                  <label className="text-[10px] text-white/40 tracking-widest">DESCRIPTION</label>
                  <textarea
                    className="w-full bg-[#111] border border-white/20 p-3 text-sm focus:border-white outline-none h-20"
                    value={editingItem.desc}
                    onChange={(e) => handleChange('desc', e.target.value)}
                  />
                </div>
                <div className="flex gap-4 items-end">
                  <div className="w-1/3">
                    <label className="text-[10px] text-white/40 block mb-1 tracking-widest">TYPE</label>
                    <select
                      className="w-full bg-[#111] border border-white/20 p-3 text-sm focus:border-white outline-none"
                      value={editingItem.type || 'image'}
                      onChange={(e) => handleChange('type', e.target.value)}
                    >
                      <option value="image">IMAGE</option>
                      <option value="video">VIDEO</option>
                      <option value="pdf">PDF</option>
                      <option value="link">LINK (외부 URL)</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    {editingItem.type === 'video' ? (
                      <div className="space-y-2">
                        <label className="text-[10px] text-white/40 block tracking-widest">VIDEO URL</label>
                        <input
                          type="text"
                          className="w-full bg-[#111] border border-white/20 p-3 text-sm focus:border-white outline-none"
                          value={editingItem.videoUrl || ''}
                          onChange={(e) => handleChange('videoUrl', e.target.value)}
                        />
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="text-[10px] text-white/40 block tracking-widest mb-1">재생 방식</label>
                            <select
                              className="w-full bg-[#111] border border-white/20 p-2 text-xs focus:border-white outline-none"
                              value={editingItem.videoPlayMode || 'manual'}
                              onChange={(e) => handleChange('videoPlayMode', e.target.value)}
                            >
                              <option value="manual">🎬 수동 재생</option>
                              <option value="muted-autoplay">🔇 음소거 자동</option>
                              <option value="autoplay">🔊 소리 자동</option>
                            </select>
                          </div>
                          <div className="flex-1">
                            <label className="text-[10px] text-white/40 block tracking-widest mb-1">표시 방식</label>
                            <select
                              className="w-full bg-[#111] border border-white/20 p-2 text-xs focus:border-white outline-none"
                              value={editingItem.videoDisplayMode || 'inline'}
                              onChange={(e) => handleChange('videoDisplayMode', e.target.value)}
                            >
                              <option value="inline">📺 메인 화면</option>
                              <option value="pip">🎵 미니 플레이어 (음악)</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    ) : editingItem.type === 'pdf' ? (
                      <div className="space-y-2">
                        <PdfUploader
                          currentUrl={editingItem.pdfUrl || ''}
                          onUpload={(url) => handleChange('pdfUrl', url)}
                          label="PDF 문서"
                        />
                        {editingItem.pdfUrl && (
                          <div className="p-3 border border-white/10 bg-black/30 space-y-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editingItem.isDailyReading === true || editingItem.isDailyReading === 'true'}
                                onChange={(e) => handleChange('isDailyReading', e.target.checked ? 'true' : '')}
                                className="w-4 h-4 accent-blue-500"
                              />
                              <span className="text-[11px] text-white/70 tracking-wide">📅 일일 묵상(큐티)</span>
                            </label>
                            {(editingItem.isDailyReading === true || editingItem.isDailyReading === 'true') && (
                              <div className="grid grid-cols-3 gap-3 pl-6">
                                <div>
                                  <label className="text-[10px] text-white/40 block mb-1 tracking-widest">시작일 (MM-DD)</label>
                                  <input
                                    type="text"
                                    value={editingItem.pdfStartDate || '01-01'}
                                    onChange={(e) => handleChange('pdfStartDate', e.target.value)}
                                    placeholder="01-01"
                                    className="w-full bg-black border border-white/20 p-2 text-xs focus:border-white outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] text-white/40 block mb-1 tracking-widest">시작 페이지</label>
                                  <input
                                    type="number"
                                    value={editingItem.pdfFirstPage || 1}
                                    onChange={(e) => handleChange('pdfFirstPage', e.target.value)}
                                    min="1"
                                    placeholder="1"
                                    className="w-full bg-black border border-white/20 p-2 text-xs focus:border-white outline-none"
                                  />
                                  <span className="text-[8px] text-white/30 block mt-1">본문 시작 페이지</span>
                                </div>
                                <div>
                                  <label className="text-[10px] text-white/40 block mb-1 tracking-widest">하루당 페이지</label>
                                  <input
                                    type="number"
                                    value={editingItem.pagesPerDay || 2}
                                    onChange={(e) => handleChange('pagesPerDay', e.target.value)}
                                    min="1"
                                    className="w-full bg-black border border-white/20 p-2 text-xs focus:border-white outline-none"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {/* 썸네일 이미지 (PDF용) */}
                        <ImageUploader
                          currentUrl={editingItem.image}
                          onUpload={(url) => handleChange('image', url)}
                          label="썸네일 이미지"
                        />
                      </div>
                    ) : editingItem.type === 'link' ? (
                      <div className="space-y-2">
                        <label className="text-[10px] text-white/40 block tracking-widest">외부 링크 URL</label>
                        <input
                          type="text"
                          placeholder="https://example.com"
                          className="w-full bg-[#111] border border-white/20 p-3 text-sm focus:border-white outline-none"
                          value={editingItem.externalUrl || ''}
                          onChange={(e) => handleChange('externalUrl', e.target.value)}
                        />
                        <p className="text-[10px] text-white/30">클릭 시 이 URL로 바로 이동합니다</p>
                        <ImageUploader
                          currentUrl={editingItem.image}
                          onUpload={(url) => handleChange('image', url)}
                          label="썸네일 이미지"
                        />
                      </div>
                    ) : (
                      <ImageUploader
                        currentUrl={editingItem.image}
                        onUpload={(url) => handleChange('image', url)}
                        label="MAIN IMAGE"
                      />
                    )}
                  </div>
                </div>
                {/* Preview */}
                <div className="aspect-video bg-black flex items-center justify-center overflow-hidden border border-white/10">
                  {editingItem.type === 'video' && editingItem.videoUrl ? (
                    (() => {
                      const ytId = editingItem.videoUrl.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/)?.[2];
                      if (ytId && ytId.length === 11) {
                        return (
                          <iframe
                            className="w-full h-full object-cover"
                            src={`https://www.youtube.com/embed/${ytId}`}
                            title="YouTube video player"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        );
                      }
                      return (
                        <video src={editingItem.videoUrl} className="w-full h-full object-cover" controls />
                      );
                    })()
                  ) : editingItem.type === 'pdf' && editingItem.pdfUrl ? (
                    <div className="flex flex-col items-center justify-center gap-2 text-white/50">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-500">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                      <span className="text-xs tracking-widest">PDF DOCUMENT</span>
                    </div>
                  ) : editingItem.image ? (
                    <img src={editingItem.image} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs opacity-30">PREVIEW</span>
                  )}
                </div>
              </div>

              {renderContentEditor(editingItem, false)}
            </div>
            <div className="flex justify-end gap-4 mt-8">
              <button onClick={() => setEditingItem(null)} className="px-6 py-2 text-xs hover:text-white/70 tracking-widest">CANCEL</button>
              <button
                onClick={handleSave}
                className="px-6 py-2 bg-white text-black text-xs font-bold tracking-widest hover:bg-[#ccc] disabled:opacity-50"
                disabled={saving}
              >
                {saving ? 'SAVING...' : 'SAVE CHANGES'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
