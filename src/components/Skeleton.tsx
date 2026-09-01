import React from 'react';
import { clsx } from 'clsx';

/**
 * A shimmering placeholder block. Give it the size and radius of the thing it
 * stands in for - the point is that the page does not move when the real
 * content replaces it.
 */
export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={clsx('skeleton rounded-xl', className)} aria-hidden="true" />
);

/**
 * The shape of a feed card: a 96px thumbnail, a two-line title with the budget
 * beside it, the location/time row, two lines of description, and the button
 * row under a divider. Matched to the real card so the feed does not resize
 * when the jobs arrive.
 */
export const JobCardSkeleton: React.FC = () => (
  <div className="glass rounded-[2rem] border border-hairline bg-surface-1 p-5 flex flex-col gap-5">
    <div className="flex gap-4">
      <Skeleton className="w-24 h-24 rounded-2xl shrink-0" />

      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-3 w-14 rounded shrink-0" />
        </div>

        <div className="flex items-center gap-4">
          <Skeleton className="h-2.5 w-24 rounded" />
          <Skeleton className="h-2.5 w-20 rounded" />
        </div>

        <div className="space-y-1.5">
          <Skeleton className="h-3 w-full rounded" />
          <Skeleton className="h-3 w-4/5 rounded" />
        </div>
      </div>
    </div>

    <div className="flex gap-3 pt-2 border-t border-hairline">
      <Skeleton className="h-11 flex-1 rounded-xl" />
      <Skeleton className="h-11 flex-1 rounded-xl" />
    </div>
  </div>
);

/** Repeats a skeleton so a list looks like a list, not a single stray card. */
export const SkeletonList: React.FC<{ count?: number; children: React.ReactNode }> = ({
  count = 3,
  children,
}) => (
  // Same breakpoint as the real feed - a single column of placeholders
  // followed by a two-column list is a visible jump.
  <div className="grid xl:grid-cols-2 gap-6">
    {Array.from({ length: count }, (_, i) => (
      <React.Fragment key={i}>{children}</React.Fragment>
    ))}
  </div>
);
