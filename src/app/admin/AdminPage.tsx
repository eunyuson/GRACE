import React, { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable, UploadTaskSnapshot } from 'firebase/storage';
import heic2any from 'heic2any';
import { auth, storage } from '../firebase';
import { useGallery, GalleryItemType, GalleryContentSection } from '../context/GalleryContext';
import { AdminLogin } from './AdminLogin';

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

    setUploading(true);
    setProgress(0);
    setStatus('처리 중...');

    try {
      let fileToUpload: Blob = file;
      let fileName = file.name;

      // HEIC/HEIF 파일 감지 및 변환
      const isHeic = file.type === 'image/heic' ||
        file.type === 'image/heif' ||
        file.name.toLowerCase().endsWith('.heic') ||
        file.name.toLowerCase().endsWith('.heif');

      if (isHeic) {
        setStatus('HEIC → JPEG 변환 중... (시간이 걸릴 수 있습니다)');
        try {
          const convertedBlob = await heic2any({
            blob: file,
            toType: 'image/jpeg',
            quality: 0.7
          });
          // heic2any can return array or single blob
          fileToUpload = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
          fileName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
        } catch (convError) {
          console.error('HEIC conversion failed:', convError);
          setStatus('변환 실패, 원본으로 시도 중...');
        }
      }

      setStatus('업로드 시작...');
      const timestamp = Date.now();
      const storageFileName = `gallery/${timestamp}_${fileName}`;
      const storageRef = ref(storage, storageFileName);

      // 메타데이터 설정
      const metadata = {
        contentType: isHeic ? 'image/jpeg' : file.type
      };

      // 업로드 진행상황 모니터링
      const uploadTask = uploadBytesResumable(storageRef, fileToUpload, metadata);

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
          // 완료 시
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
          accept="image/*,.heic,.heif"
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="px-3 py-2 bg-white/10 border border-white/20 text-[10px] tracking-widest hover:bg-white/20 disabled:opacity-50 min-w-[60px]"
        >
          {uploading ? `${progress}%` : '📁'}
        </button>
      </div>
      {status && (
        <p className="text-[10px] text-white/50 tracking-widest animate-pulse">{status}</p>
      )}
      {currentUrl && (
        <div className="w-full h-20 bg-black border border-white/10 overflow-hidden">
          <img src={currentUrl} alt="Preview" className="w-full h-full object-cover" />
        </div>
      )}
    </div>
  );
};

export const AdminPage: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const { items, loading, error, addItem, updateItem, deleteItem } = useGallery();
  const [editingItem, setEditingItem] = useState<GalleryItemType | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newItem, setNewItem] = useState<Omit<GalleryItemType, 'id'>>(EmptyItem);
  const [saving, setSaving] = useState(false);

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

      <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
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
              <label className="text-[10px] text-white/40 block mb-1 tracking-widest">IMAGE URL</label>
              <input
                type="text"
                value={section.image || ''}
                onChange={(e) => updateContentSection(section.id, 'image', e.target.value, isNew)}
                className="w-full bg-black border border-white/20 p-2 text-xs focus:border-white outline-none"
                placeholder="https://..."
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
              onClick={handleLogout}
              className="px-6 py-2 border border-white/20 text-xs tracking-[0.2em] hover:bg-white/10 transition-colors"
            >
              LOGOUT
            </button>
          </div>
        </header>

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
                    </select>
                  </div>
                  <div className="flex-1">
                    {newItem.type === 'video' ? (
                      <div className="space-y-2">
                        <label className="text-[10px] text-white/40 block tracking-widest">VIDEO URL</label>
                        <input
                          type="text"
                          placeholder="VIDEO URL (MP4)"
                          className="w-full bg-[#111] border border-white/20 p-3 text-sm focus:border-white outline-none"
                          value={newItem.videoUrl}
                          onChange={(e) => handleChange('videoUrl', e.target.value, true)}
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

        <div className="grid gap-4">
          {items.map(item => (
            <div key={item.id} className="bg-[#161616] p-4 flex gap-6 items-center border border-white/5 hover:border-white/20 transition-all">
              <div className="w-16 h-16 bg-[#222] shrink-0 overflow-hidden">
                <img src={item.image} alt={item.title} className="w-full h-full object-cover opacity-70" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-4 mb-1">
                  <span className="font-['Anton'] text-lg text-white/40">{item.index}</span>
                  <h3 className="font-bold text-lg">{item.title}</h3>
                </div>
                <p className="text-xs text-white/50 truncate">{item.subtitle}</p>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={() => setEditingItem(item)}
                  className="px-4 py-2 border border-white/20 text-[10px] tracking-widest hover:bg-white hover:text-black transition-colors"
                >
                  EDIT
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="px-4 py-2 border border-red-900/50 text-[10px] tracking-widest text-red-500 hover:bg-red-900/20 transition-colors"
                >
                  DELETE
                </button>
              </div>
            </div>
          ))}
        </div>
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
                  ) : (
                    <img src={editingItem.image} alt="Preview" className="w-full h-full object-cover" />
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
