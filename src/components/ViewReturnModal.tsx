import React, { useState } from 'react';
import { X, Package, Calendar, Info, MapPin, Clock, ExternalLink, QrCode, Eye, Trash2, Printer } from 'lucide-react';
import { ReturnItem } from '../types';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { parseISO } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ConfirmModal } from './ConfirmModal';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ViewReturnModalProps {
  item: ReturnItem | null;
  onClose: () => void;
  onStatusChange: (id: string, status: 'pending' | 'completed') => void;
  onDelete: (id: string) => void;
}

export const ViewReturnModal: React.FC<ViewReturnModalProps> = ({ item, onClose, onStatusChange, onDelete }) => {
  const [showCode, setShowCode] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  if (!item) return null;

  const deadlineDate = parseISO(item.deadline);
  const isValidDate = !isNaN(deadlineDate.getTime());

  const googleMapsUrl = item.storeAddress 
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.storeAddress)}`
    : null;

  const handleToggleStatus = () => {
    const newStatus = item.status === 'pending' ? 'completed' : 'pending';
    onStatusChange(item.id, newStatus);
    onClose();
  };

  const handleDelete = () => {
    onDelete(item.id);
    onClose();
  };

  const handlePrint = () => {
    if (!item.imageUrl) return;
    const printWindow = window.open(item.imageUrl, '_blank');
    if (printWindow) {
      printWindow.focus();
      // For PDFs, the browser's viewer will handle it. 
      // For images, we might need to trigger print.
      if (item.mimeType !== 'application/pdf') {
        printWindow.print();
      }
    }
  };

  return (
    <AnimatePresence>
      {item && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-zinc-950/98 backdrop-blur-xl z-[100] flex flex-col"
        >
          {/* Top Bar */}
          <motion.div 
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="p-6 flex items-center justify-between text-app-text-main absolute top-0 left-0 right-0 z-20"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-zinc-800/50 backdrop-blur-md rounded-xl flex items-center justify-center border border-zinc-700/50 shadow-lg">
                <Package size={20} strokeWidth={1.5} />
              </div>
              <div>
                <h2 className="font-bold text-lg tracking-tight leading-none mb-1">{item.itemName}</h2>
                <div className="flex items-center gap-1.5 text-app-text-muted">
                  <Calendar size={12} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">
                    {isValidDate ? `Due ${item.deadline}` : 'No Deadline'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsDeleteConfirmOpen(true)}
                className="w-10 h-10 bg-red-500/10 backdrop-blur-md rounded-xl flex items-center justify-center text-red-500 hover:bg-red-500/20 transition-all border border-red-500/20 shadow-lg"
              >
                <Trash2 size={20} strokeWidth={2} />
              </button>
              <button 
                onClick={onClose}
                className="w-10 h-10 bg-zinc-800/50 backdrop-blur-md rounded-xl flex items-center justify-center hover:bg-zinc-700 transition-all border border-zinc-700/50 shadow-lg"
              >
                <X size={20} strokeWidth={2} />
              </button>
            </div>
          </motion.div>

          <ConfirmModal
            isOpen={isDeleteConfirmOpen}
            title="Delete Record"
            message={`Are you sure you want to delete the return record for "${item.itemName}"? This action cannot be undone.`}
            confirmLabel="Delete"
            isDanger={true}
            onConfirm={handleDelete}
            onCancel={() => setIsDeleteConfirmOpen(false)}
          />

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col md:flex-row items-stretch justify-center p-6 pt-24 pb-12 gap-6 overflow-hidden">
            {/* Visual Section */}
            <div className="flex-1 flex items-center justify-center relative min-h-[300px]">
              <AnimatePresence mode="wait">
                {!showCode ? (
                  <motion.div 
                    key="info"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="w-full max-w-md bg-app-surface rounded-3xl p-8 shadow-2xl space-y-8 border border-app-border"
                  >
                    <div className="space-y-6">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-emerald-500/10 text-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
                          <MapPin size={20} />
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-app-text-muted uppercase tracking-widest">Store Location</p>
                          <p className="text-app-text-main font-bold text-base leading-tight">{item.storeName || 'Unknown Store'}</p>
                          {item.storeAddress && (
                            <a 
                              href={googleMapsUrl!} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-emerald-500 text-sm font-medium flex items-center gap-1 hover:underline"
                            >
                              {item.storeAddress}
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-blue-500/10 text-blue-400 rounded-xl flex items-center justify-center flex-shrink-0">
                          <Clock size={20} />
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-app-text-muted uppercase tracking-widest">Store Hours</p>
                          <p className="text-app-text-main font-medium text-sm">{item.storeHours || 'Hours not available'}</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-amber-500/10 text-amber-400 rounded-xl flex items-center justify-center flex-shrink-0">
                          <Info size={20} />
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-app-text-muted uppercase tracking-widest">Return Policy</p>
                          <div className="text-app-text-muted text-sm font-medium leading-relaxed">
                            <ReactMarkdown>{item.packagingRules || "No specific instructions provided."}</ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <motion.button 
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setShowCode(true)}
                        className="flex-1 py-4 bg-zinc-800 text-white rounded-2xl font-bold text-base flex items-center justify-center gap-2 hover:bg-zinc-700 transition-all shadow-xl border border-zinc-700"
                      >
                        <QrCode size={20} />
                        View Document
                      </motion.button>
                      <motion.button 
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleToggleStatus}
                        className={cn(
                          "flex-1 py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all shadow-xl",
                          item.status === 'pending' 
                            ? "bg-emerald-600 text-white hover:bg-emerald-700" 
                            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-zinc-700"
                        )}
                      >
                        {item.status === 'pending' ? 'Returned' : 'Re-open'}
                      </motion.button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="code"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="w-full max-w-md flex flex-col items-center gap-6"
                  >
                    <div className="w-full aspect-square bg-zinc-900 rounded-3xl p-4 shadow-2xl flex items-center justify-center overflow-hidden border-4 border-zinc-800 relative group/doc">
                      {item.imageUrl ? (
                        item.mimeType === 'application/pdf' ? (
                          <iframe 
                            src={`${item.imageUrl}#toolbar=0`} 
                            className="w-full h-full rounded-xl border-none bg-white"
                            title="PDF Viewer"
                          />
                        ) : (
                          <motion.img 
                            initial={{ scale: 1.1, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            src={item.imageUrl} 
                            alt="Return Document" 
                            className="w-full h-full object-contain rounded-xl"
                            referrerPolicy="no-referrer"
                          />
                        )
                      ) : (
                        <div className="text-zinc-800 flex flex-col items-center gap-4">
                          <motion.div
                            animate={{ 
                              scale: [1, 1.1, 1],
                              opacity: [0.5, 1, 0.5]
                            }}
                            transition={{ duration: 3, repeat: Infinity }}
                          >
                            <QrCode size={64} strokeWidth={1} />
                          </motion.div>
                          <p className="text-sm font-bold tracking-tight">No document saved</p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <motion.button 
                        whileHover={{ x: -4 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setShowCode(false)}
                        className="px-8 py-3 bg-zinc-800/50 backdrop-blur-md text-app-text-main rounded-full font-bold text-sm flex items-center justify-center gap-2 hover:bg-zinc-700 transition-all border border-zinc-700/50 shadow-lg"
                      >
                        <Eye size={18} />
                        Back
                      </motion.button>
                      {item.imageUrl && (
                        <motion.button 
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={handlePrint}
                          className="px-8 py-3 bg-emerald-600 text-white rounded-full font-bold text-sm flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-lg"
                        >
                          <Printer size={18} />
                          Print
                        </motion.button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
