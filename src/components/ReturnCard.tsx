import React from 'react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { Package, Calendar, ChevronRight, Trash2, MapPin, Clock, CheckCircle2, FileText } from 'lucide-react';
import { ReturnItem } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion } from 'motion/react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ReturnCardProps {
  item: ReturnItem;
  onClick: () => void;
  onDelete: () => void;
  onStatusChange: (status: 'pending' | 'completed') => void;
}

export const ReturnCard: React.FC<ReturnCardProps> = ({ item, onClick, onDelete, onStatusChange }) => {
  const deadlineDate = parseISO(item.deadline);
  const now = new Date();
  const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 });
  const cardRef = React.useRef<HTMLDivElement>(null);
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  const isValidDate = !isNaN(deadlineDate.getTime());
  const daysRemaining = isValidDate ? differenceInDays(deadlineDate, now) : 0;
  const isExpired = isValidDate && daysRemaining < 0;
  const isCritical = isValidDate && daysRemaining >= 0 && daysRemaining <= 7;

  const getStatusStyles = () => {
    if (!isValidDate) return {
      bg: 'bg-slate-50',
      text: 'text-slate-500',
      border: 'border-slate-100',
      indicator: 'bg-slate-300',
      label: 'Invalid Date'
    };
    if (isExpired) return {
      bg: 'bg-red-50',
      text: 'text-red-700',
      border: 'border-red-100',
      indicator: 'bg-red-500',
      label: 'Expired'
    };

    let label = `${daysRemaining}d left`;
    if (daysRemaining === 0) label = 'Due Today';
    if (daysRemaining === 1) label = 'Due Tomorrow';

    if (isCritical) return {
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      border: 'border-amber-100',
      indicator: 'bg-amber-500',
      label
    };
    return {
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      border: 'border-emerald-100',
      indicator: 'bg-emerald-500',
      label
    };
  };

  const styles = getStatusStyles();

  return (
    <motion.div 
      ref={cardRef}
      id={`return-card-${item.id}`}
      whileHover={{ y: -4, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      onMouseMove={handleMouseMove}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      onClick={onClick}
      className="relative bg-app-surface rounded-2xl p-5 shadow-lg border border-app-border hover:border-emerald-500/50 hover:shadow-[0_12px_30px_rgba(16,185,129,0.1)] transition-all cursor-pointer group overflow-hidden"
    >
      {/* Interactive Glow */}
      <div 
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          background: `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, rgba(16, 185, 129, 0.06), transparent 40%)`
        }}
      />

      <div className="flex items-start gap-5 relative z-10">
        <div className={cn("absolute top-0 left-0 w-1.5 h-full rounded-l-2xl", styles.indicator)} />

        {/* Content */}
        <div className="flex-1 min-w-0 py-0.5 pl-2">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="font-bold text-app-text-main text-base truncate tracking-tight mb-0.5">{item.itemName}</h3>
              <div className="flex items-center gap-1.5 text-app-text-muted">
                <motion.div whileHover={{ rotate: 15 }}>
                  <MapPin size={12} />
                </motion.div>
                <span className="text-[11px] font-bold uppercase tracking-wider truncate max-w-[120px]">
                  {item.storeName || 'Unknown Store'}
                </span>
              </div>
            </div>
            <div className={cn(
              "px-2.5 py-1 rounded-full text-[10px] font-black border shadow-sm tracking-widest uppercase",
              styles.bg === 'bg-slate-50' ? 'bg-zinc-800 text-zinc-400 border-zinc-700' : 
              styles.bg === 'bg-red-50' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
              styles.bg === 'bg-amber-50' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
              'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            )}>
              {styles.label}
            </div>
          </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-app-text-muted">
                <motion.div whileHover={{ scale: 1.2 }}>
                  <Calendar size={13} strokeWidth={2} />
                </motion.div>
                <span className="text-xs font-semibold">
                  {isValidDate ? format(deadlineDate, 'MMM d') : 'N/A'}
                </span>
              </div>
              {item.storeHours && (
              <div className="flex items-center gap-1.5 text-app-text-muted">
                <motion.div whileHover={{ scale: 1.2 }}>
                  <Clock size={13} strokeWidth={2} />
                </motion.div>
                <span className="text-[11px] font-medium truncate max-w-[100px]">{item.storeHours}</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Column */}
        <div className="flex flex-col items-center justify-between self-stretch">
          <div className="flex flex-col gap-1">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-600 hover:text-red-500 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
              title="Delete"
              aria-label="Delete return record"
            >
              <Trash2 size={16} />
            </button>
            {item.status === 'pending' && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusChange('completed');
                }}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-600 hover:text-emerald-500 hover:bg-emerald-500/10 transition-all opacity-0 group-hover:opacity-100"
                title="Mark as Returned"
                aria-label="Mark as returned"
              >
                <CheckCircle2 size={16} />
              </button>
            )}
          </div>
          <motion.div 
            whileHover={{ x: 4 }}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-600 group-hover:text-emerald-500 group-hover:bg-emerald-500/10 transition-all"
          >
            <ChevronRight size={20} strokeWidth={2.5} />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};
