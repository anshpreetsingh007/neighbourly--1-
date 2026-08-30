import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from './UI';
import { CATEGORIES } from '../lib/categories';
import { BUDGET_MAX } from '../lib/money';

export const URGENCY_OPTIONS = ['FLEXIBLE', 'THIS WEEK', 'ASAP'];

export interface JobFilters {
  urgency: string | null;
  category: string;
  /** 0 means "any" - the field is left blank rather than showing $0. */
  minBudget: number;
}

export const EMPTY_FILTERS: JobFilters = { urgency: null, category: 'All', minBudget: 0 };

/** How many filters are actually narrowing the feed, for the badge on the button. */
export function countActiveFilters(f: JobFilters) {
  return (f.urgency ? 1 : 0) + (f.category !== 'All' ? 1 : 0) + (f.minBudget > 0 ? 1 : 0);
}

/**
 * Kept next to the controls that set it, so the meaning of a filter and the UI
 * for it can never drift apart.
 */
export function matchesFilters(job: any, f: JobFilters) {
  const matchesCategory =
    f.category === 'All' || job.category?.toLowerCase() === f.category.toLowerCase();
  const matchesUrgency = !f.urgency || job.urgency === f.urgency;
  // Matched against the top of the range: a "$50 - $400" job still shows up for
  // someone filtering at $100, because it can pay that. Matching the job's own
  // minimum would hide most of the board, since posters set a low floor and
  // negotiate up.
  const matchesBudget = !f.minBudget || (job.budget_max ?? 0) >= f.minBudget;
  return matchesCategory && matchesUrgency && matchesBudget;
}

const chip = (selected: boolean) =>
  clsx(
    'px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all',
    selected ? 'bg-amber-accent text-slate-900' : 'glass text-muted hover:text-body'
  );

interface FilterSheetProps {
  open: boolean;
  value: JobFilters;
  onChange: (next: JobFilters) => void;
  onClose: () => void;
}

export const FilterSheet: React.FC<FilterSheetProps> = ({ open, value, onChange, onClose }) => {
  const set = (patch: Partial<JobFilters>) => onChange({ ...value, ...patch });

  // Portalled to <body>: screens render inside a `relative z-10` main element,
  // which is its own stacking context, so a sheet left in the tree cannot paint
  // above the z-50 bottom nav whatever z-index it uses - the nav was covering
  // Clear and Show Results.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end md:items-center justify-center p-0 md:p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-full md:max-w-md glass rounded-t-[2.5rem] md:rounded-[2rem] p-8 border border-hairline bg-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-display font-bold">Filters</h3>
              <button
                onClick={onClose}
                aria-label="Close filters"
                className="p-2 hover:bg-surface-2 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="space-y-3">
                <span className="text-[10px] uppercase font-black text-muted tracking-widest">Urgency</span>
                <div className="flex flex-wrap gap-2">
                  {URGENCY_OPTIONS.map(u => (
                    <button
                      key={u}
                      onClick={() => set({ urgency: value.urgency === u ? null : u })}
                      className={chip(value.urgency === u)}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category lived in a scrolling strip on the page itself, which
                  cost a whole row above the feed to show two and a half chips.
                  It is a filter, so it belongs with the filters. */}
              <div className="space-y-3">
                <span className="text-[10px] uppercase font-black text-muted tracking-widest">Category</span>
                <div className="flex flex-wrap gap-2">
                  {[{ id: 'All', name: 'All' }, ...CATEGORIES].map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => set({ category: cat.id })}
                      className={chip(value.category === cat.id)}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <span className="text-[10px] uppercase font-black text-muted tracking-widest">Set budget</span>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted font-bold">$</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={BUDGET_MAX}
                    step={10}
                    value={value.minBudget || ''}
                    placeholder="Any"
                    onChange={(e) => {
                      const typed = parseInt(e.target.value);
                      set({
                        minBudget: Number.isFinite(typed)
                          ? Math.min(Math.max(typed, 0), BUDGET_MAX)
                          : 0,
                      });
                    }}
                    className="w-full glass rounded-xl py-3 pl-8 pr-4 font-bold focus:outline-none focus:ring-2 focus:ring-amber-accent/50"
                  />
                </div>
                <p className="text-[10px] text-faint">
                  Only shows jobs that can pay at least this much.
                </p>
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <Button variant="secondary" className="flex-1" onClick={() => onChange(EMPTY_FILTERS)}>
                Clear
              </Button>
              <Button className="flex-1" onClick={onClose}>
                Show Results
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};
