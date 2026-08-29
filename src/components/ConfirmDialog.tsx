import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

interface Props {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for destructive actions. */
  destructive?: boolean;
  onCancel: () => void;
  /** May be async - the button shows a spinner until it settles. */
  onConfirm: () => void | Promise<void>;
}

/**
 * Replaces window.confirm, which blocks the page, ignores our styling and
 * reads to users like a browser scam popup.
 *
 * Portalled to <body> for the same reason ApplyModal is: screens render inside
 * a `relative z-10` main element, so anything left in the tree cannot paint
 * above the bottom nav.
 */
export const ConfirmDialog: React.FC<Props> = ({
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onCancel,
  onConfirm,
}) => {
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isWorking) onCancel();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onCancel, isWorking]);

  const handleConfirm = async () => {
    setIsWorking(true);
    try {
      await onConfirm();
    } finally {
      setIsWorking(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xl p-6"
        onClick={() => !isWorking && onCancel()}
      >
        <motion.div
          initial={{ y: 20, opacity: 0, scale: 0.97 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          role="alertdialog"
          aria-modal="true"
          className="glass backdrop-blur-3xl w-full max-w-sm rounded-3xl border border-white/15 p-6 space-y-5 shadow-2xl"
        >
          <div className="flex items-start gap-4">
            <div
              className={clsx(
                'w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border',
                destructive
                  ? 'bg-rose-status/15 border-rose-status/30 text-rose-status'
                  : 'bg-amber-accent/15 border-amber-accent/30 text-amber-accent'
              )}
            >
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="min-w-0 space-y-1">
              <h2 className="text-lg font-display font-bold leading-snug">{title}</h2>
              {body && <p className="text-white/50 text-sm leading-relaxed">{body}</p>}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isWorking}
              className="flex-1 glass hover:bg-white/10 rounded-2xl py-3.5 font-bold text-sm transition-all active:scale-95 disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isWorking}
              className={clsx(
                'flex-1 rounded-2xl py-3.5 font-bold text-sm transition-all active:scale-95 flex items-center justify-center disabled:opacity-70',
                destructive
                  ? 'bg-rose-status text-white hover:bg-rose-600'
                  : 'bg-amber-accent text-slate-900 hover:bg-amber-400'
              )}
            >
              {isWorking ? <Loader2 className="w-5 h-5 animate-spin" /> : confirmLabel}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};
