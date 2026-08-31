import React from 'react';
import { clsx } from 'clsx';
import { optimizedImage } from '../lib/images';
import { categoryIcon } from '../lib/categories';

interface Props {
  photoUrl?: string | null;
  category?: string | null;
  alt: string;
  className?: string;
  /** Rendered size in CSS pixels, so Cloudinary can send a matching file. */
  width: number;
  height?: number;
  /**
   * 'cover' crops the photo to fill the box - right for small square tiles.
   * 'contain' shows the whole photo letterboxed, which is what you want when
   * the image is the point of the screen rather than a marker in a list.
   */
  fit?: 'cover' | 'contain';
}

/**
 * A real uploaded photo when one exists, otherwise the job's category icon on
 * a plain gradient tile - never a random stock photo standing in for a job
 * nobody actually took a picture of.
 */
export const JobThumbnail: React.FC<Props> = ({ photoUrl, category, alt, className, width, height, fit = 'cover' }) => {
  if (photoUrl) {
    return (
      <img
        // Only pass a height when we actually want a crop: with both set,
        // Cloudinary fills the box and cuts off whatever does not fit.
        src={optimizedImage(photoUrl, { width, height: fit === 'cover' ? height : undefined })}
        alt={alt}
        referrerPolicy="no-referrer"
        className={clsx(
          'shrink-0',
          fit === 'cover' ? 'object-cover' : 'object-contain bg-surface-1',
          className
        )}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={alt}
      className={clsx(
        'flex items-center justify-center text-4xl shrink-0 bg-gradient-to-br from-white/10 to-white/[0.02]',
        className
      )}
    >
      {categoryIcon(category)}
    </div>
  );
};
