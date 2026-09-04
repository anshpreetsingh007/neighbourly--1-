import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Star, X } from 'lucide-react';
import { clsx } from 'clsx';
import axios from 'axios';
import { Button } from './UI';
import { Avatar } from './Avatar';

/** Matches REVIEW_MAX in api/index.ts, which is what actually enforces it. */
const REVIEW_MAX = 600;

const RATING_WORDS: Record<number, string> = {
  1: 'Poor',
  2: 'Not great',
  3: 'Fine',
  4: 'Good',
  5: 'Excellent',
};

interface Props {
  jobId: string;
  jobTitle: string;
  /** The person being reviewed - shown so nobody rates the wrong neighbour. */
  about: { id?: string; name?: string | null; avatar_url?: string | null };
  onClose: () => void;
  onSubmitted: (review: any) => void;
}

/**
 * Leaving a review on a finished job. Portalled to <body> for the same reason
 * as every other overlay here: screens render inside a `relative z-10` main
 * element, so anything left in the tree paints under the bottom nav.
 */
export const ReviewModal: React.FC<Props> = ({ jobId, jobTitle, about, onClose, onSubmitted }) => {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!rating) {
      setError('Pick a star rating first.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const { data } = await axios.post(`/api/jobs/${jobId}/reviews`, {
        rating,
        body: body.trim() || undefined,
      });
      onSubmitted(data.review);
    } catch (err: any) {
      console.error('Failed to submit review:', err);
      setError(err.response?.data?.error || 'Could not save your review. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Hover previews a rating without committing it, so the stars light up as
  // you move across them but fall back to the real choice on mouse out.
  const shown = hovered || rating;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-xl md:p-6"
      onClick={onClose}
    >
      <motion.form
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full md:max-w-md max-h-[88vh] overflow-y-auto glass backdrop-blur-3xl rounded-t-3xl md:rounded-3xl border border-hairline p-6 pb-8 space-y-5 shadow-2xl bg-panel"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-display font-bold">Rate your experience</h2>
            <p className="text-muted text-sm truncate">{jobTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-xl hover:bg-surface-2 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-2xl bg-surface-1 border border-hairline">
          <Avatar name={about.name} avatarUrl={about.avatar_url} seed={about.id} />
          <p className="font-bold truncate">{about.name || 'Neighbour'}</p>
        </div>

        <div className="space-y-2">
          <div className="flex justify-center gap-2" onMouseLeave={() => setHovered(0)}>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRating(value)}
                onMouseEnter={() => setHovered(value)}
                aria-label={`${value} star${value === 1 ? '' : 's'}`}
                aria-pressed={rating === value}
                className="p-1 transition-transform hover:scale-110 active:scale-95"
              >
                <Star
                  className={clsx(
                    'w-9 h-9 transition-colors',
                    value <= shown ? 'fill-amber-accent text-amber-accent' : 'text-faint'
                  )}
                />
              </button>
            ))}
          </div>
          <p className="text-center text-xs font-black uppercase tracking-widest text-muted h-4">
            {shown ? RATING_WORDS[shown] : ''}
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="review-body" className="text-sm font-medium text-body ml-1">
            Anything to add? <span className="text-faint font-normal">(optional)</span>
          </label>
          <textarea
            id="review-body"
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, REVIEW_MAX))}
            rows={4}
            placeholder="Were they on time? Was the work what you expected?"
            className="w-full glass rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-amber-accent/50 transition-all resize-none"
          />
          <p className="text-[10px] text-faint text-right">
            {body.length}/{REVIEW_MAX}
          </p>
        </div>

        {error && (
          <div className="bg-rose-status/15 border border-rose-status/40 text-rose-status p-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        <p className="text-[11px] text-faint leading-relaxed">
          Your review is public on their profile and cannot be edited afterwards.
        </p>

        <div className="flex gap-3">
          <Button type="button" variant="secondary" className="flex-1 rounded-xl" onClick={onClose}>
            Not now
          </Button>
          <Button type="submit" className="flex-1 rounded-xl" isLoading={isSubmitting}>
            Submit review
          </Button>
        </div>
      </motion.form>
    </motion.div>,
    document.body
  );
};
