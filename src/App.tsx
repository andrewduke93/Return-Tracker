import React, { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { collection, query, where, onSnapshot, orderBy, deleteDoc, doc, updateDoc, getDoc, addDoc, writeBatch } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { storage } from './firebase';
import { Plus, LogOut, Package, Search, Filter, Download, Loader2, CheckCircle2, AlertCircle, Info, Bell } from 'lucide-react';
import confetti from 'canvas-confetti';
import { ReturnItem } from './types';
import { ReturnCard } from './components/ReturnCard';
import { AddReturnModal } from './components/AddReturnModal';
import { ViewReturnModal } from './components/ViewReturnModal';
import { ConfirmModal } from './components/ConfirmModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [returns, setReturns] = useState<ReturnItem[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<ReturnItem | null>(null);
  const [returnToDelete, setReturnToDelete] = useState<string | null>(null);
  const [isImportConfirmOpen, setIsImportConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sharedFile, setSharedFile] = useState<{ url: string; mimeType: string } | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'critical'>('all');
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'info' }[]>([]);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = (window.scrollY / totalHeight) * 100;
      setScrollProgress(progress);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  useEffect(() => {
    const criticalCount = returns.filter(r => {
      const days = Math.ceil((new Date(r.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      return r.status === 'pending' && days >= 0 && days <= 7;
    }).length;

    if (criticalCount > 0) {
      document.title = `(${criticalCount}) Return Tracker`;
    } else {
      document.title = 'Return Tracker';
    }
  }, [returns]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        setIsGuestMode(false);
      } else {
        setIsGuestMode(true);
        const saved = localStorage.getItem('guest_returns');
        if (saved) {
          setReturns(JSON.parse(saved));
        }
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isGuestMode && !user) {
      const saved = localStorage.getItem('guest_returns');
      if (saved) {
        setReturns(JSON.parse(saved));
      }
      setLoading(false);
      return;
    }

    if (!user) {
      setReturns([]);
      return;
    }

    setLoading(true);
    const path = 'returns';
    const q = query(
      collection(db, path),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ReturnItem[];
      
      const sortedItems = [...items].sort((a, b) => {
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      });
      
      setReturns(sortedItems);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, isGuestMode]);

  useEffect(() => {
    if (isGuestMode) {
      localStorage.setItem('guest_returns', JSON.stringify(returns));
    }
  }, [returns, isGuestMode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedFileId = params.get('sharedFileId');
    const mimeType = params.get('mimeType');
    
    if (sharedFileId && mimeType) {
      setSharedFile({
        url: `/api/shared-file/${sharedFileId}`,
        mimeType: mimeType
      });
      setIsAddModalOpen(true);
      // Clean up URL
      window.history.replaceState({}, document.title, "/");
    }
  }, []);

  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoginError(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.code === 'auth/popup-closed-by-user') {
        setLoginError('Login popup was closed. Please try again.');
      } else if (error.code === 'auth/blocked-at-popup-manager') {
        setLoginError('Login popup was blocked by your browser. Please allow popups for this site.');
      } else {
        setLoginError('An error occurred during login. Please try again.');
      }
    }
  };

  const handleSkipLogin = () => {
    setIsGuestMode(true);
  };

  const handleImportGuestData = async () => {
    if (!user) return;
    const saved = localStorage.getItem('guest_returns');
    if (!saved) return;
    
    const guestItems = JSON.parse(saved) as ReturnItem[];
    if (guestItems.length === 0) return;

    setLoading(true);
    try {
      const batch = writeBatch(db);
      for (const item of guestItems) {
        const { id, ...data } = item;
        const newDocRef = doc(collection(db, 'returns'));
        batch.set(newDocRef, {
          ...data,
          userId: user.uid,
          createdAt: new Date().toISOString()
        });
      }
      await batch.commit();
      localStorage.removeItem('guest_returns');
      setIsImportConfirmOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'returns');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (isGuestMode) {
      setReturns(returns.filter(r => r.id !== id));
      setReturnToDelete(null);
      return;
    }

    const path = `returns/${id}`;
    try {
      // 1. Get the document to find the imageUrl
      const docRef = doc(db, 'returns', id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        const imageUrl = data.imageUrl;
        
        // 2. If it's a Firebase Storage URL, delete the object
        if (imageUrl && imageUrl.includes('firebasestorage.googleapis.com')) {
          try {
            const storageRef = ref(storage, imageUrl);
            await deleteObject(storageRef);
          } catch (storageErr) {
            console.error('Error deleting storage object:', storageErr);
            // Continue with document deletion even if storage deletion fails
          }
        }
      }

      // 3. Delete the Firestore document
      await deleteDoc(docRef);
      setReturnToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleStatusChange = async (id: string, status: 'pending' | 'completed') => {
    if (status === 'completed') {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10b981', '#34d399', '#059669']
      });
      addToast('Marked as returned! Great job.', 'success');
    }

    if (isGuestMode) {
      setReturns(returns.map(r => r.id === id ? { ...r, status } : r));
      return;
    }
    const path = `returns/${id}`;
    try {
      await updateDoc(doc(db, 'returns', id), { status });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const filteredReturns = returns.filter(item => {
    const matchesSearch = item.itemName.toLowerCase().includes(searchQuery.toLowerCase());
    if (filter === 'critical') {
      const days = Math.ceil((new Date(item.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      return matchesSearch && days >= 0 && days <= 7;
    }
    return matchesSearch;
  });

  const ReturnCardSkeleton = () => (
    <div className="bg-app-surface rounded-xl p-3 border border-app-border flex items-center gap-4 animate-pulse">
      <div className="w-12 h-12 bg-zinc-800 rounded-lg" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-32 bg-zinc-800 rounded" />
        <div className="h-3 w-24 bg-zinc-800/50 rounded" />
      </div>
      <div className="w-8 h-8 bg-zinc-800/50 rounded-lg" />
    </div>
  );

  if (loading) {
    return (
      <div className="fixed inset-0 bg-app-bg flex flex-col items-center justify-center z-[200]">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex flex-col items-center"
        >
          <div className="w-24 h-24 bg-emerald-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-emerald-500/20 mb-10 relative">
            <Package className="text-white w-12 h-12" strokeWidth={1.5} />
            <motion.div 
              animate={{ 
                scale: [1, 1.3, 1],
                opacity: [0.2, 0.4, 0.2]
              }}
              transition={{ 
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="absolute inset-0 bg-emerald-400 rounded-[2.5rem] -z-10 blur-xl"
            />
          </div>
          <h1 className="text-3xl font-extrabold text-app-text-main tracking-tight mb-3">Return Tracker AI</h1>
          <div className="flex items-center gap-3 text-app-text-muted text-sm font-semibold">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
            <span className="tracking-wide uppercase text-[10px]">Initializing Secure Session</span>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!user && !isGuestMode) {
    return (
      <div className="min-h-screen bg-app-bg flex flex-col items-center justify-center p-6 text-app-text-main">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-10 max-w-sm w-full"
        >
          <div className="w-20 h-20 bg-emerald-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-lg">
            <Package size={40} strokeWidth={1.5} />
          </div>
          <div className="space-y-3">
            <h1 className="text-4xl font-extrabold tracking-tight text-app-text-main">Return Tracker</h1>
            <p className="text-app-text-muted text-base font-medium">
              Professional management for your product returns.
            </p>
          </div>
          
          <div className="space-y-3 w-full">
            <button 
              onClick={handleLogin}
              className="w-full py-4 bg-emerald-600 text-white rounded-xl font-semibold text-lg shadow-sm hover:bg-emerald-700 transition-all active:scale-[0.98]"
            >
              Sign in with Google
            </button>

            <button 
              onClick={handleSkipLogin}
              className="w-full py-3.5 bg-app-surface text-app-text-muted rounded-xl font-semibold text-base border border-app-border hover:bg-zinc-800 transition-all"
            >
              Continue as Guest
            </button>
            
            {loginError && (
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-sm font-medium text-red-600 bg-red-50 py-3 px-4 rounded-xl border border-red-100"
              >
                {loginError}
              </motion.p>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app-bg pb-24 font-sans selection:bg-emerald-100 selection:text-emerald-900">
      {/* Header */}
      <header className="bg-app-surface/90 backdrop-blur-md border-b border-app-border sticky top-0 z-30 px-6 py-3.5 shadow-sm">
        <div className="absolute top-0 left-0 h-[2px] bg-emerald-500 transition-all duration-100 ease-out" style={{ width: `${scrollProgress}%` }} />
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3"
          >
            <div className="w-9 h-9 bg-emerald-600 text-white rounded-lg flex items-center justify-center shadow-md">
              <Package size={18} strokeWidth={2} />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight text-app-text-main leading-none">
                {user ? `${getGreeting()}, ${user.displayName?.split(' ')[0]}` : 'Return Tracker'}
              </h1>
              {isGuestMode && (
                <span className="text-[9px] font-bold text-app-text-muted uppercase tracking-widest mt-0.5 block">Local Mode</span>
              )}
            </div>
          </motion.div>
          <div className="flex items-center gap-2">
            {!isGuestMode && user && localStorage.getItem('guest_returns') && (
              <motion.button
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={() => setIsImportConfirmOpen(true)}
                title="Sync Guest Data"
                aria-label="Sync Guest Data"
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600/10 text-emerald-500 rounded-lg text-[11px] font-bold border border-emerald-500/20 hover:bg-emerald-600/20 transition-all"
              >
                <Download size={14} />
                Sync Guest Data
              </motion.button>
            )}
            <motion.button 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="Logout"
              aria-label="Logout"
              onClick={() => {
                if (isGuestMode) {
                  setIsGuestMode(false);
                } else {
                  handleLogout();
                }
              }}
              className="w-9 h-9 rounded-lg bg-app-surface flex items-center justify-center text-app-text-muted hover:text-red-500 hover:bg-red-500/10 transition-all border border-app-border shadow-sm"
            >
              <LogOut size={16} />
            </motion.button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 pt-10">
        {/* Hero Stats */}
        <div className="grid grid-cols-2 gap-4 mb-10">
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-app-surface rounded-xl p-6 border border-app-border shadow-sm flex flex-col justify-between hover:border-zinc-700 transition-colors"
          >
            <p className="text-app-text-muted text-[10px] font-bold uppercase tracking-widest mb-1">Active Returns</p>
            <h2 className="text-4xl font-bold text-app-text-main tracking-tight">{returns.length}</h2>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-red-500/5 rounded-xl p-6 border border-red-500/10 shadow-sm flex flex-col justify-between hover:bg-red-500/10 transition-colors"
          >
            <p className="text-red-400 text-[10px] font-bold uppercase tracking-widest mb-1">Critical</p>
            <h2 className="text-4xl font-bold text-red-500 tracking-tight">
              {returns.filter(r => {
                const days = Math.ceil((new Date(r.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                return days >= 0 && days <= 7;
              }).length}
            </h2>
          </motion.div>
        </div>

        {/* Section Header */}
        <div className="space-y-4 mb-8">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-bold text-app-text-muted uppercase tracking-widest">Inventory</h3>
            <div className="flex gap-1 bg-app-surface p-1 rounded-lg border border-app-border">
              <button 
                onClick={() => setFilter('all')}
                className={cn(
                  "px-4 py-1.5 text-[11px] font-bold rounded-md transition-all",
                  filter === 'all' ? "bg-zinc-800 text-app-text-main shadow-sm" : "text-app-text-muted hover:text-app-text-main"
                )}
              >
                All
              </button>
              <button 
                onClick={() => setFilter('critical')}
                className={cn(
                  "px-4 py-1.5 text-[11px] font-bold rounded-md transition-all",
                  filter === 'critical' ? "bg-zinc-800 text-red-500 shadow-sm" : "text-app-text-muted hover:text-app-text-main"
                )}
              >
                Critical
              </button>
            </div>
          </div>

          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-app-text-muted group-focus-within:text-emerald-500 transition-all pointer-events-none" size={16} />
            <input 
              type="text"
              placeholder="Filter inventory..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-app-surface rounded-xl border border-app-border focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 transition-all text-sm font-medium text-app-text-main placeholder:text-zinc-600 shadow-sm"
            />
          </div>
        </div>

        {/* Returns List */}
        <div className="space-y-2.5">
          {filteredReturns.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20 bg-app-surface rounded-2xl border border-dashed border-app-border"
            >
              <motion.div 
                animate={{ 
                  y: [0, -10, 0],
                  rotate: [0, 5, 0, -5, 0]
                }}
                transition={{ 
                  duration: 4, 
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="w-14 h-14 bg-zinc-800 rounded-xl flex items-center justify-center mx-auto mb-4 text-zinc-600"
              >
                <Package size={28} strokeWidth={1.5} />
              </motion.div>
              <h3 className="text-app-text-main font-bold text-lg">
                {searchQuery ? "No matching items" : "Inventory Empty"}
              </h3>
              <p className="text-app-text-muted text-sm mt-1 mb-6">
                {searchQuery ? "Try adjusting your search query." : "You have no active returns to track."}
              </p>
              {!searchQuery && (
                <button 
                  onClick={() => setIsAddModalOpen(true)}
                  className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold text-sm hover:bg-emerald-700 transition-all shadow-md"
                >
                  Add New Item
                </button>
              )}
            </motion.div>
          ) : (
            <AnimatePresence mode="popLayout">
              {filteredReturns.map((item, index) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ 
                    type: "spring",
                    stiffness: 600,
                    damping: 45,
                    delay: index * 0.01 
                  }}
                >
                  <ReturnCard 
                    item={item} 
                    onClick={() => setSelectedReturn(item)} 
                    onDelete={() => setReturnToDelete(item.id)}
                    onStatusChange={(status) => handleStatusChange(item.id, status)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </main>

      {/* Floating Action Button */}
      <motion.button 
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileHover={{ scale: 1.05, y: -2 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => {
          setSharedFile(undefined);
          setIsAddModalOpen(true);
        }}
        className="fixed bottom-8 right-8 w-14 h-14 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-lg z-40 hover:bg-emerald-700 transition-all"
      >
        <Plus size={28} strokeWidth={2.5} />
      </motion.button>

      {/* Modals */}
      <AddReturnModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        sharedFile={sharedFile}
        isGuest={isGuestMode}
        onAddGuest={(item) => setReturns([item, ...returns])}
      />
      <ViewReturnModal 
        item={selectedReturn} 
        onClose={() => setSelectedReturn(null)} 
        onStatusChange={handleStatusChange}
        onDelete={handleDelete}
      />

      <ConfirmModal
        isOpen={!!returnToDelete}
        title="Delete Record"
        message="Are you sure you want to delete this return record? This will also remove any associated documents."
        confirmLabel="Delete"
        isDanger={true}
        onConfirm={() => returnToDelete && handleDelete(returnToDelete)}
        onCancel={() => setReturnToDelete(null)}
      />

      <ConfirmModal
        isOpen={isImportConfirmOpen}
        title="Sync Data"
        message="Would you like to import your guest session returns into your account? This will make them available across all your devices."
        confirmLabel="Sync Now"
        onConfirm={handleImportGuestData}
        onCancel={() => setIsImportConfirmOpen(false)}
      />

      {/* Toast Notifications */}
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 w-full max-w-[320px] px-4">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border backdrop-blur-xl",
                toast.type === 'success' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                toast.type === 'error' ? "bg-red-500/10 border-red-500/20 text-red-400" :
                "bg-blue-500/10 border-blue-500/20 text-blue-400"
              )}
            >
              {toast.type === 'success' && <CheckCircle2 size={18} />}
              {toast.type === 'error' && <AlertCircle size={18} />}
              {toast.type === 'info' && <Info size={18} />}
              <span className="text-sm font-bold tracking-tight">{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Subtle Background Glow */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <motion.div 
          animate={{ 
            scale: [1, 1.1, 1],
            opacity: [0.03, 0.05, 0.03]
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-emerald-500 rounded-full blur-[120px]"
        />
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.02, 0.04, 0.02]
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] bg-blue-500 rounded-full blur-[100px]"
        />
      </div>
    </div>
  );
}
