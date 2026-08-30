import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { BUDGET_MAX, formatRange } from '../lib/money';
import { Loader2, Send, X } from 'lucide-react';
import { Button } from './UI';

interface Props {
  job: any;
  onClose: () => void;
  /** Called with the created application so the caller can update its list. */
  onApplied: (application: any, conversationId?: string) => void;
}

export const ApplyModal: React.FC<Props> = ({ job, onClose, onApplied }) => {
  // Seeded with the poster's minimum, but the whole point is that the helper
  // can change it - otherwise every applicant bids the same number and the
  // poster has nothing to choose between.
  const [price, setPrice] = useState(String(job.budget_min ?? ''));
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape, and stop the page behind from scrolling while open.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(price);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a price greater than zero.');
      return;
    }
    if (amount > BUDGET_MAX) {
      setError(`A price cannot be more than $${BUDGET_MAX.toLocaleString('en-US')}.`);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const { data } = await axios.post(`/api/jobs/${job.id}/apply`, {
        proposed_price: amount,
        message: message.trim() || undefined,
      });
      onApplied(data.application, data.conversation_id);
    } catch (err: any) {
      console.error('Failed to apply:', err);
      setError(err.response?.data?.error || 'Could not send your application. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Portalled to <body>. The app shell puts screens inside a `relative z-10`
  // main element, which creates a stacking context - a modal rendered in there
  // can never paint above the z-50 bottom nav, whatever z-index it uses.
  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-xl md:p-6"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 40, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          className="w-full md:max-w-md max-h-[88vh] overflow-y-auto glass backdrop-blur-3xl rounded-t-3xl md:rounded-3xl border border-hairline p-6 pb-8 space-y-5 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-display font-bold">Apply for this job</h2>
              <p className="text-muted text-sm font-medium truncate">{job.title}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-surface-1 hover:bg-surface-2 transition-all active:scale-90 shrink-0"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="text-xs font-bold uppercase tracking-widest text-faint">
            Their budget: {formatRange(job.budget_min, job.budget_max)}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-body ml-1">Your price</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted font-bold">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="1"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full bg-surface-1 border border-hairline rounded-xl py-3 pl-9 pr-4 font-bold focus:outline-none focus:ring-2 focus:ring-amber-accent/50 transition-all"
                  placeholder="65"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-body ml-1">
                Message <span className="text-faint font-normal">(optional)</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={500}
                className="w-full bg-surface-1 border border-hairline rounded-xl py-3 px-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-accent/50 transition-all"
                placeholder="Tell them why you're a good fit, and when you could come."
              />
            </div>

            {error && (
              <div className="bg-rose-status/15 border border-rose-status/40 text-rose-status p-3 rounded-xl text-sm font-medium">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full py-4 rounded-2xl" isLoading={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" /> Send application
                </>
              )}
            </Button>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};
