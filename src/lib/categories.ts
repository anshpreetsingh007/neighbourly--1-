export interface JobCategory {
  id: string;
  name: string;
  icon: string;
}

// Single source of truth for job categories - used by PostJob, Home, and
// MapView. Keeping one list means a new category never drifts out of sync
// between where jobs are created and where they're browsed.
export const CATEGORIES: JobCategory[] = [
  { id: 'snow', name: 'Snow Removal', icon: '❄️' },
  { id: 'plumbing', name: 'Plumbing', icon: '🚰' },
  { id: 'electrical', name: 'Electrical', icon: '⚡' },
  { id: 'cleaning', name: 'Cleaning', icon: '🧹' },
  { id: 'moving', name: 'Moving', icon: '📦' },
  { id: 'painting', name: 'Painting', icon: '🎨' },
  { id: 'landscaping', name: 'Landscaping', icon: '🌿' },
  { id: 'oddjobs', name: 'Odd Jobs', icon: '🛠️' },
];

export const CATEGORY_ICONS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map(c => [c.id, c.icon])
);

export const categoryIcon = (id?: string | null) => (id && CATEGORY_ICONS[id]) || '🛠️';

export const categoryName = (id?: string | null) =>
  CATEGORIES.find(c => c.id === id)?.name || 'Odd Jobs';
