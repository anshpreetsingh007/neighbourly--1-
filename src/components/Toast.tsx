import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Check, Info, X } from 'lucide-react';
import { clsx } from 'clsx';

type Tone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  text: string;
  tone: Tone;
}

interface ToastApi {
  /** Shows a transient message. Defaults to `info`. */
  showToast: (text: string, tone?: Tone) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONES: Record<Tone, { cls: string; Icon: React.ElementType }> = {
  success: {
    cls: 'bg-emerald-status/15 border-emerald-status/40 text-emerald-status',
    Icon: Check,
  },
  error: {
    cls: 'bg-rose-status/15 border-rose-status/40 text-rose-status',
    Icon: AlertTriangle,
  },
  info: {
    cls: 'bg-amber-accent/15 border-amber-accent/40 text-amber-accent',
    Icon: Info,
  },
};

/**
 * App-wide replacement for alert(), which blocks the page, cannot be styled,
 * and reads to users like a browser scam popup.
 */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback(
    (text: string, tone: Tone = 'info') => {
      const id = nextId.current++;
      setToasts(prev => [...prev, { id, text, tone }]);
      // Errors linger a little longer - people need time to read what broke.
      window.setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 5000);
    },
    [dismiss]
  );

  const api = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        // Above modals (z-100) so a failure inside a dialog is still visible.
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[110] w-full max-w-md px-4 space-y-2 pointer-events-none">
          <AnimatePresence initial={false}>
            {toasts.map(toast => {
              const { cls, Icon } = TONES[toast.tone];
              return (
                <motion.div
                  key={toast.id}
                  initial={{ opacity: 0, y: -16, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -16, scale: 0.96 }}
                  transition={{ type: 'spring', damping: 26, stiffness: 340 }}
                  className={clsx(
                    'glass backdrop-blur-2xl border rounded-2xl p-4 shadow-2xl flex items-start gap-3 pointer-events-auto',
                    cls
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="flex-1 text-sm font-bold leading-snug">{toast.text}</p>
                  <button
                    type="button"
                    onClick={() => dismiss(toast.id)}
                    aria-label="Dismiss"
                    className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastApi => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
