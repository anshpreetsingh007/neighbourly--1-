import React from 'react';
import { clsx } from 'clsx';

interface Props {
  name?: string | null;
  avatarUrl?: string | null;
  /** Anything stable and unique to the person - used only to pick a colour. */
  seed?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'profile';
  className?: string;
}

const SIZES: Record<NonNullable<Props['size']>, string> = {
  sm: 'w-9 h-9 text-xs rounded-xl',
  md: 'w-11 h-11 text-sm rounded-2xl',
  lg: 'w-14 h-14 text-base rounded-2xl',
  xl: 'w-24 h-24 text-3xl rounded-3xl',
  profile: 'w-32 h-32 text-4xl rounded-[40px]',
};

// A fixed palette rather than arbitrary hues, so every initials avatar still
// reads as part of the same amber/glass design language.
const PALETTE = [
  'from-amber-500 to-orange-600',
  'from-sky-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-violet-500 to-purple-600',
  'from-cyan-500 to-sky-600',
];

function hash(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (Math.imul(h, 31) + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initials(name?: string | null) {
  const trimmed = (name || '').trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  const first = parts[0]?.[0] || '';
  const second = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + second).toUpperCase() || '?';
}

/**
 * A real photo when one exists, otherwise deterministic initials on a
 * coloured gradient - never a stock photo of a stranger standing in for a
 * real person.
 */
export const Avatar: React.FC<Props> = ({ name, avatarUrl, seed, size = 'md', className }) => {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name || 'Avatar'}
        referrerPolicy="no-referrer"
        className={clsx('object-cover ring-2 ring-white/10 shrink-0', SIZES[size], className)}
      />
    );
  }

  const gradient = PALETTE[hash(seed || name || 'neighbour') % PALETTE.length];

  return (
    <div
      role="img"
      aria-label={name || 'Neighbour'}
      className={clsx(
        'flex items-center justify-center font-black text-white shrink-0 bg-gradient-to-br ring-2 ring-white/10',
        gradient,
        SIZES[size],
        className
      )}
    >
      {initials(name)}
    </div>
  );
};
