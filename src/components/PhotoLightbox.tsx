import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { optimizedImage } from '../lib/images';

interface Props {
  photos: string[];
  /** Which photo to open on - the one the person actually tapped. */
  startIndex?: number;
  onClose: () => void;
}

/**
 * Full-screen photo viewer: one image at a time, moved with arrows, keys or a
 * swipe. Portalled to <body> because screens render inside a `relative z-10`
 * main element, which is its own stacking context - anything left in the tree
 * paints under the bottom nav no matter what z-index it carries.
 */
export const PhotoLightbox: React.FC<Props> = ({ photos, startIndex = 0, onClose }) => {
  const [index, setIndex] = useState(startIndex);
  const [direction, setDirection] = useState(0);

  const go = useCallback(
    (delta: number) => {
      setDirection(delta);
      // Wrap around, so the last photo is one step from the first.
      setIndex(prev => (prev + delta + photos.length) % photos.length);
    },
    [photos.length]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [go, onClose]);

  if (!photos.length) return null;

  const canPage = photos.length > 1;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] bg-black/95 flex flex-col"
      onClick={onClose}
    >
      <div className="flex items-center justify-between p-4 shrink-0">
        <span className="text-white/70 text-xs font-black uppercase tracking-widest">
          {index + 1} / {photos.length}
        </span>
        <button
          onClick={onClose}
          aria-label="Close photos"
          className="p-2 rounded-xl text-white/80 hover:bg-white/10 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.img
            key={index}
            custom={direction}
            src={optimizedImage(photos[index], { width: 1200 })}
            alt={`Photo ${index + 1} of ${photos.length}`}
            referrerPolicy="no-referrer"
            initial={{ opacity: 0, x: direction > 0 ? 60 : direction < 0 ? -60 : 0 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            // Swipe is how this gets used on a phone; the buttons are for
            // desktop and for anyone who cannot drag.
            drag={canPage ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={(_, info) => {
              if (info.offset.x < -60) go(1);
              else if (info.offset.x > 60) go(-1);
            }}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full object-contain select-none"
          />
        </AnimatePresence>

        {canPage && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); go(-1); }}
              aria-label="Previous photo"
              className="absolute left-3 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); go(1); }}
              aria-label="Next photo"
              className="absolute right-3 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </div>

      {canPage && (
        <div className="flex gap-2 justify-center p-4 shrink-0 overflow-x-auto no-scrollbar">
          {photos.map((photo, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setDirection(i > index ? 1 : -1); setIndex(i); }}
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === index}
              className={
                'w-12 h-12 rounded-xl overflow-hidden shrink-0 border-2 transition-all ' +
                (i === index ? 'border-amber-accent' : 'border-transparent opacity-50 hover:opacity-100')
              }
            >
              <img
                src={optimizedImage(photo, { width: 48, height: 48 })}
                alt=""
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </button>
          ))}
        </div>
      )}
    </motion.div>,
    document.body
  );
};
