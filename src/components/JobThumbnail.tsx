import React from 'react';
import { clsx } from 'clsx';
import { categoryIcon } from '../lib/categories';

interface Props {
  photoUrl?: string | null;
  category?: string | null;
  alt: string;
  className?: string;
}

/**
 * A real uploaded photo when one exists, otherwise the job's category icon on
 * a plain gradient tile - never a random stock photo standing in for a job
 * nobody actually took a picture of.
 */
export const JobThumbnail: React.FC<Props> = ({ photoUrl, category, alt, className }) => {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={alt}
        referrerPolicy="no-referrer"
        className={clsx('object-cover shrink-0', className)}
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
