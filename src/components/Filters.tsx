import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown, X } from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from './UI';
import { CATEGORIES } from '../lib/categories';
import { BUDGET_MAX } from '../lib/money';
import { distanceKm, type LatLng } from '../lib/distance';

export const URGENCY_OPTIONS = ['FLEXIBLE', 'THIS WEEK', 'ASAP'];

/** Slider stops. Not a range: the gaps that matter are not evenly spaced. */
const RADIUS_STOPS = [2, 25, 50, Infinity];
const KM_PER_MILE = 1.609344;

export interface JobFilters {
  urgency: string | null;
  /** Empty means every category, so "All" needs no special value. */
  categories: string[];
  /** 0 means "any" - the field is left blank rather than showing $0. */
  minBudget: number;
  /** Index into RADIUS_STOPS. The last stop is unlimited. */
  radiusStop: number;
  unit: 'km' | 'mi';
}

export const EMPTY_FILTERS: JobFilters = {
  urgency: null,
  categories: [],
  minBudget: 0,
  radiusStop: RADIUS_STOPS.length - 1,
  unit: 'km',
};

const radiusKm = (f: JobFilters) => RADIUS_STOPS[f.radiusStop];

/** "Within 25 km" / "100+ km", in whichever unit is selected. */
export function radiusLabel(f: JobFilters) {
  const km = radiusKm(f);
  const value = f.unit === 'mi' ? km / KM_PER_MILE : km;
  return Number.isFinite(km) ? `Within ${Math.round(value)} ${f.unit}` : 'Any distance';
}

/** How many filters are actually narrowing the feed, for the badge. */
export function countActiveFilters(f: JobFilters) {
  return (
    (f.urgency ? 1 : 0) +
    f.categories.length +
    (f.minBudget > 0 ? 1 : 0) +
    (Number.isFinite(radiusKm(f)) ? 1 : 0)
  );
}

/**
 * Kept next to the controls that set it, so the meaning of a filter and the UI
 * for it can never drift apart. `from` is the viewer's position, or null when
 * they have not granted location - distance then filters nothing.
 */
export function matchesFilters(job: any, f: JobFilters, from: LatLng | null = null) {
  const matchesCategory =
    f.categories.length === 0 || f.categories.includes(job.category);
  const matchesUrgency = !f.urgency || job.urgency === f.urgency;
  // Matched against the top of the range: a "$50 - $400" job still shows up for
  // someone filtering at $100, because it can pay that.
  const matchesBudget = !f.minBudget || (job.budget_max ?? 0) >= f.minBudget;

  const limit = radiusKm(f);
  const matchesRadius =
    !Number.isFinite(limit) ||
    !from ||
    typeof job.lat !== 'number' ||
    typeof job.lng !== 'number' ||
    distanceKm(from, [job.lat, job.lng]) <= limit;

  return matchesCategory && matchesUrgency && matchesBudget && matchesRadius;
}

interface FilterSheetProps {
  open: boolean;
  value: JobFilters;
  onChange: (next: JobFilters) => void;
  onClose: () => void;
  /** Hides the distance section when we do not know where the viewer is. */
  hasLocation?: boolean;
}

export const FilterSheet: React.FC<FilterSheetProps> = ({
  open,
  value,
  onChange,
  onClose,
  hasLocation = false,
}) => {
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const set = (patch: Partial<JobFilters>) => onChange({ ...value, ...patch });
  const activeCount = countActiveFilters(value);

  const toggleCategory = (id: string) =>
    set({
      categories: value.categories.includes(id)
        ? value.categories.filter(c => c !== id)
        : [...value.categories, id],
    });

  // "Snow Removal, Electrical +1" - two names then a count, so the field never
  // outgrows its row.
  const names = value.categories
    .map(id => CATEGORIES.find(c => c.id === id)?.name)
    .filter(Boolean) as string[];
  const summary =
    names.length === 0
      ? 'All categories'
      : names.length <= 2
        ? names.join(', ')
        : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;

  // Portalled to <body>: screens render inside a `relative z-10` main element,
  // which is its own stacking context, so a sheet left in the tree cannot paint
  // above the z-50 bottom nav whatever z-index it uses.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-end md:items-center justify-center p-0 md:p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            // Opaque, not `glass`: a translucent sheet over a dimmed page is
            // grey in light mode and muddy in dark. bg-panel is white / deep
            // indigo, both matching their own theme.
            className="w-full md:max-w-md max-h-[88vh] overflow-y-auto bg-panel rounded-t-[2.5rem] md:rounded-[2rem] p-6 border border-hairline shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-display font-bold">Filters</h3>
                {activeCount > 0 && (
                  <span className="bg-amber-accent/15 text-amber-accent text-[11px] font-black px-2.5 py-1 rounded-full">
                    Active: {activeCount}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="Close filters"
                className="p-2 rounded-full bg-surface-1 hover:bg-surface-2 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-black text-muted tracking-widest">Urgency</span>
                {/* One segmented control rather than three chips: the options
                    are mutually exclusive, and a joined track says so. */}
                <div className="flex p-1 rounded-2xl bg-surface-1 border border-hairline">
                  {URGENCY_OPTIONS.map(u => (
                    <button
                      key={u}
                      onClick={() => set({ urgency: value.urgency === u ? null : u })}
                      className={clsx(
                        'flex-1 py-2.5 rounded-xl text-xs font-bold capitalize transition-all',
                        value.urgency === u
                          ? 'bg-panel shadow text-strong'
                          : 'text-muted hover:text-body'
                      )}
                    >
                      {u.toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-black text-muted tracking-widest">Category</span>
                  {value.categories.length > 0 && (
                    <span className="bg-amber-accent/15 text-amber-accent text-[10px] font-black px-2 py-0.5 rounded-full">
                      {value.categories.length} Selected
                    </span>
                  )}
                </div>

                {/* Collapsed by default: nine chips pushed everything below the
                    fold, and most people change one thing and leave. */}
                <button
                  type="button"
                  onClick={() => setCategoriesOpen(o => !o)}
                  aria-expanded={categoriesOpen}
                  className={clsx(
                    'w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all',
                    categoriesOpen ? 'border-amber-accent' : 'border-hairline',
                    'bg-surface-1'
                  )}
                >
                  <span className="truncate flex-1 text-left font-bold text-sm">{summary}</span>
                  <ChevronDown
                    className={clsx('w-4 h-4 shrink-0 transition-transform', categoriesOpen && 'rotate-180')}
                  />
                </button>

                {categoriesOpen && (
                  <div className="rounded-2xl border border-hairline overflow-hidden">
                    {CATEGORIES.map(cat => {
                      const selected = value.categories.includes(cat.id);
                      return (
                        <button
                          key={cat.id}
                          onClick={() => toggleCategory(cat.id)}
                          aria-pressed={selected}
                          className={clsx(
                            'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                            selected ? 'bg-amber-accent/10' : 'hover:bg-surface-1'
                          )}
                        >
                          <span aria-hidden="true">{cat.icon}</span>
                          <span className="flex-1 text-sm font-medium">{cat.name}</span>
                          {selected && <Check className="w-4 h-4 text-amber-accent shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {hasLocation && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] uppercase font-black text-muted tracking-widest">
                      Distance radius
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="flex p-0.5 rounded-lg bg-surface-1 border border-hairline">
                        {(['mi', 'km'] as const).map(u => (
                          <button
                            key={u}
                            onClick={() => set({ unit: u })}
                            className={clsx(
                              'px-2 py-0.5 rounded-md text-[11px] font-bold transition-all',
                              value.unit === u ? 'bg-panel shadow text-strong' : 'text-muted'
                            )}
                          >
                            {u}
                          </button>
                        ))}
                      </div>
                      <span className="bg-amber-accent/15 text-amber-accent text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap">
                        {radiusLabel(value)}
                      </span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={RADIUS_STOPS.length - 1}
                    step={1}
                    value={value.radiusStop}
                    onChange={(e) => set({ radiusStop: Number(e.target.value) })}
                    aria-label="Distance radius"
                    className="w-full accent-amber-accent"
                  />
                  <div className="flex justify-between text-[10px] font-bold text-faint">
                    {RADIUS_STOPS.map(km => (
                      <span key={String(km)}>
                        {Number.isFinite(km)
                          ? `${Math.round(value.unit === 'mi' ? km / KM_PER_MILE : km)} ${value.unit}`
                          : 'Any'}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
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
                    className="w-full bg-surface-1 border border-hairline rounded-2xl py-3 pl-8 pr-4 font-bold focus:outline-none focus:ring-2 focus:ring-amber-accent/50"
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
