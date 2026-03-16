import React, { useState, useEffect } from 'react';
import { X, Upload, Loader2, Camera, Package, FileText, MapPin, Clock, Search } from 'lucide-react';
import { extractReturnInfo, lookupStoreHours } from '../services/gemini';
import { GeminiResponse } from '../types';
import { storage, db, auth, handleFirestoreError, OperationType } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';

interface AddReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  sharedFile?: { url: string; mimeType: string };
  isGuest?: boolean;
  onAddGuest?: (item: any) => void;
}

export const AddReturnModal: React.FC<AddReturnModalProps> = ({ isOpen, onClose, sharedFile, isGuest, onAddGuest }) => {
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [formData, setFormData] = useState<GeminiResponse>({
    itemName: '',
    deadline: '',
    packagingRules: '',
    storeName: '',
    storeHours: '',
    storeAddress: '',
  });
  const [lookupLoading, setLookupLoading] = useState(false);

  useEffect(() => {
    if (sharedFile && isOpen) {
      handleSharedFile(sharedFile.url, sharedFile.mimeType);
    }
  }, [sharedFile, isOpen]);

  const normalizeDate = (dateStr: string) => {
    if (!dateStr) return '';
    // If it's already YYYY-MM-DD, return it
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    } catch (e) {
      console.error('Date normalization failed:', e);
    }
    return '';
  };

  const handleLookupHours = async (nameOverride?: string) => {
    const name = nameOverride || formData.storeName;
    if (!name) return;

    setLookupLoading(true);
    setLoadingStep('Looking up store location & hours...');
    try {
      let location: { latitude: number, longitude: number } | undefined;
      
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        location = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude
        };
      } catch (geoErr) {
        console.warn('Geolocation failed, looking up without location:', geoErr);
      }

      const info = await lookupStoreHours(name, location);
      setFormData(prev => ({
        ...prev,
        storeHours: info.storeHours || prev.storeHours,
        storeAddress: info.storeAddress || prev.storeAddress
      }));
    } catch (err) {
      console.error('Lookup hours error:', err);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSharedFile = async (url: string, mimeType: string) => {
    setLoading(true);
    setLoadingStep('Downloading shared file...');
    setError(null);
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      setMimeType(mimeType);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        setPreview(reader.result as string);
        try {
          setLoadingStep('AI Analyzing receipt details...');
          const aiData = await extractReturnInfo(base64, mimeType);
          setFormData({
            itemName: aiData.itemName || '',
            deadline: normalizeDate(aiData.deadline || ''),
            packagingRules: aiData.packagingRules || '',
            storeName: aiData.storeName || '',
            storeHours: aiData.storeHours || '',
            storeAddress: aiData.storeAddress || '',
          });
          
          if (aiData.storeName) {
            await handleLookupHours(aiData.storeName);
          }
        } catch (err: any) {
          setError(err.message);
        } finally {
          setLoading(false);
          setLoadingStep('');
        }
      };
      reader.readAsDataURL(blob);
    } catch (err: any) {
      console.error('Error processing shared file:', err);
      setError('Failed to process shared file.');
      setLoading(false);
      setLoadingStep('');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setLoadingStep('Reading file...');
    setError(null);
    setMimeType(file.type);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(',')[1];
      setPreview(reader.result as string);
      
      try {
        setLoadingStep('AI Analyzing receipt details...');
        const aiData = await extractReturnInfo(base64, file.type);
        setFormData({
          itemName: aiData.itemName || '',
          deadline: normalizeDate(aiData.deadline || ''),
          packagingRules: aiData.packagingRules || '',
          storeName: aiData.storeName || '',
          storeHours: aiData.storeHours || '',
          storeAddress: aiData.storeAddress || '',
        });

        if (aiData.storeName) {
          await handleLookupHours(aiData.storeName);
        }
      } catch (err: any) {
        console.error('AI Processing error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
        setLoadingStep('');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser && !isGuest) return;

    setLoading(true);
    try {
      let imageUrl = preview || '';
      
      if (!isGuest && preview && auth.currentUser) {
        const response = await fetch(preview);
        const blob = await response.blob();
        const storageRef = ref(storage, `returns/${auth.currentUser.uid}/${Date.now()}`);
        await uploadBytes(storageRef, blob, { contentType: mimeType || 'image/png' });
        imageUrl = await getDownloadURL(storageRef);
      }

      const returnData = {
        ...formData,
        imageUrl,
        mimeType: mimeType || 'image/png',
        userId: auth.currentUser?.uid || 'guest',
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      if (isGuest) {
        onAddGuest?.({ ...returnData, id: Date.now().toString() });
      } else {
        const path = 'returns';
        try {
          await addDoc(collection(db, path), returnData);
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, path);
        }
      }

      onClose();
      setPreview(null);
      setMimeType(null);
      setFormData({ 
        itemName: '', 
        deadline: '', 
        packagingRules: '',
        storeName: '',
        storeHours: '',
        storeAddress: '',
      });
    } catch (error) {
      console.error('Error saving return:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            className="bg-app-surface w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl border border-app-border"
          >
            <div className="px-6 py-4 flex items-center justify-between border-b border-app-border">
              <h2 className="text-lg font-bold text-app-text-main tracking-tight">Add Return Record</h2>
              <button 
                onClick={onClose} 
                title="Close"
                aria-label="Close"
                className="w-8 h-8 bg-zinc-800 rounded-lg flex items-center justify-center text-app-text-muted hover:text-app-text-main transition-all border border-app-border"
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>

            <div className="max-h-[80vh] overflow-y-auto">
              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div className="space-y-2.5">
                  <label className="text-[10px] font-bold text-app-text-muted uppercase tracking-widest ml-1">Receipt or QR Code</label>
                  <div className="relative group">
                    {preview ? (
                      <div className="relative aspect-video rounded-2xl overflow-hidden border border-emerald-500/50 shadow-sm bg-zinc-900 flex flex-col items-center justify-center gap-3 text-emerald-500/80">
                        <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
                          {mimeType === 'application/pdf' ? (
                            <FileText size={32} strokeWidth={1.5} />
                          ) : (
                            <Camera size={32} strokeWidth={1.5} />
                          )}
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-bold uppercase tracking-widest">
                            {mimeType === 'application/pdf' ? 'PDF Document Loaded' : 'Image Captured'}
                          </p>
                          <p className="text-[10px] text-emerald-500/40 font-medium mt-1">AI has extracted the return details</p>
                        </div>
                        <button 
                          type="button"
                          onClick={() => {
                            setPreview(null);
                            setMimeType(null);
                            setError(null);
                          }}
                          title="Remove document"
                          aria-label="Remove document"
                          className="absolute top-3 right-3 w-8 h-8 bg-zinc-800/80 backdrop-blur-md text-white rounded-lg flex items-center justify-center hover:bg-zinc-700 transition-all shadow-md border border-white/5"
                        >
                          <X size={16} strokeWidth={2} />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center aspect-video bg-zinc-900 border-2 border-dashed border-app-border rounded-2xl cursor-pointer hover:border-emerald-500 hover:bg-emerald-500/5 transition-all group">
                        <div className="flex flex-col items-center gap-3 text-zinc-500 group-hover:text-emerald-500 transition-all">
                          <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center border border-app-border group-hover:border-emerald-500/30 transition-all shadow-sm">
                            <Camera size={24} strokeWidth={1.5} />
                          </div>
                          <span className="text-sm font-bold tracking-tight">Scan receipt with AI</span>
                        </div>
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/*,application/pdf" 
                          onChange={handleFileUpload} 
                          aria-label="Upload receipt or PDF"
                        />
                      </label>
                    )}
                    {loading && (
                      <div className="absolute inset-0 bg-app-surface/95 backdrop-blur-sm flex flex-col items-center justify-center rounded-2xl z-10 p-6 text-center">
                        <div className="relative mb-6">
                          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" strokeWidth={1.5} />
                          <motion.div 
                            animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.5, 0.2] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="absolute inset-0 bg-emerald-500 rounded-full blur-xl -z-10"
                          />
                        </div>
                        <div className="space-y-2">
                          <p className="text-emerald-500 font-bold text-base tracking-tight">AI is working</p>
                          <AnimatePresence mode="wait">
                            <motion.p 
                              key={loadingStep}
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -5 }}
                              className="text-app-text-muted text-xs font-medium min-h-[1rem]"
                            >
                              {loadingStep}
                            </motion.p>
                          </AnimatePresence>
                        </div>
                      </div>
                    )}
                  </div>
                  {error && (
                    <motion.p 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-[11px] font-bold text-red-400 bg-red-500/10 p-3 rounded-lg border border-red-500/20"
                    >
                      {error}
                    </motion.p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[10px] font-bold text-app-text-muted uppercase tracking-widest block ml-1">Product Name</label>
                    <input 
                      required
                      value={formData.itemName}
                      onChange={e => setFormData({...formData, itemName: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-900 border border-app-border rounded-xl focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 transition-all text-sm font-medium text-app-text-main placeholder:text-zinc-600 shadow-sm"
                      placeholder="e.g. Wireless Headphones"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-app-text-muted uppercase tracking-widest block ml-1">Return Deadline</label>
                    <input 
                      required
                      type="date"
                      value={formData.deadline}
                      onChange={e => setFormData({...formData, deadline: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-900 border border-app-border rounded-xl focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 transition-all text-sm font-medium text-app-text-main shadow-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-app-text-muted uppercase tracking-widest block ml-1">Store Name</label>
                    <div className="relative">
                      <input 
                        value={formData.storeName}
                        onChange={e => setFormData({...formData, storeName: e.target.value})}
                        className="w-full px-4 py-2.5 bg-zinc-900 border border-app-border rounded-xl focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 transition-all text-sm font-medium text-app-text-main placeholder:text-zinc-600 shadow-sm pr-10"
                        placeholder="e.g. Zara"
                      />
                      <button
                        type="button"
                        onClick={() => handleLookupHours()}
                        disabled={lookupLoading || !formData.storeName}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-emerald-600/10 text-emerald-500 rounded-lg flex items-center justify-center hover:bg-emerald-600/20 transition-all disabled:opacity-50"
                        title="Lookup store info"
                      >
                        {lookupLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[10px] font-bold text-app-text-muted uppercase tracking-widest block ml-1">Store Address</label>
                    <input 
                      value={formData.storeAddress}
                      onChange={e => setFormData({...formData, storeAddress: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-900 border border-app-border rounded-xl focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 transition-all text-sm font-medium text-app-text-main placeholder:text-zinc-600 shadow-sm"
                      placeholder="e.g. 123 Fashion St, New York, NY"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-app-text-muted uppercase tracking-widest block ml-1">Store Hours</label>
                    <input 
                      value={formData.storeHours}
                      onChange={e => setFormData({...formData, storeHours: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-900 border border-app-border rounded-xl focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 transition-all text-sm font-medium text-app-text-main placeholder:text-zinc-600 shadow-sm"
                      placeholder="e.g. 10AM - 9PM"
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[10px] font-bold text-app-text-muted uppercase tracking-widest block ml-1">Packaging & Rules</label>
                    <textarea 
                      value={formData.packagingRules}
                      onChange={e => setFormData({...formData, packagingRules: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-900 border border-app-border rounded-xl focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 transition-all text-sm font-medium text-app-text-main placeholder:text-zinc-600 min-h-[80px] resize-none shadow-sm"
                      placeholder="e.g. Original box required, tags must be attached."
                    />
                  </div>
                </div>

                <button 
                  disabled={loading || !formData.itemName}
                  className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold text-base shadow-lg hover:bg-emerald-700 disabled:opacity-50 transition-all active:scale-[0.98] relative overflow-hidden group/btn"
                >
                  <span className="relative z-10">{loading ? 'Processing...' : 'Save Return Record'}</span>
                  {!loading && formData.itemName && (
                    <motion.div 
                      initial={{ x: '-100%' }}
                      animate={{ x: '100%' }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "linear", repeatDelay: 3 }}
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 z-0"
                    />
                  )}
                </button>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
