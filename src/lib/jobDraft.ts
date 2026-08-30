/**
 * Local autosave for the Post a Job form.
 *
 * The bottom nav stays visible during the flow, so people can wander off
 * mid-form - but the commoner ways to lose work are a phone call evicting the
 * tab, an accidental refresh, or the Android back gesture. This guards all of
 * them.
 *
 * Deliberately device-local: syncing drafts to the database would need a table,
 * endpoints and conflict handling to solve "start on my phone, finish on my
 * laptop", which almost nobody does for a ninety-second form.
 */

const STORAGE_KEY = 'neighbourly-job-draft';

/** Older than this and the draft is more confusing than useful. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface JobDraft {
  step: number;
  coords: [number, number];
  /**
   * Whether the saved location text was actually resolved to these coordinates.
   * Stored explicitly because "there is text in the field" says nothing about
   * whether it geocoded - assuming it did let unconfirmed addresses through
   * simply by leaving the form and coming back.
   */
  locationConfirmed?: boolean;
  formData: {
    title: string;
    category: string;
    description: string;
    urgency: string;
    photos: string[];
    location: string;
    budget: number[];
  };
}

interface StoredDraft extends JobDraft {
  savedAt: number;
}

/** True when the draft holds something worth restoring. */
const isWorthKeeping = (draft: JobDraft) => {
  const { title, category, description, location, photos } = draft.formData;
  return Boolean(
    title.trim() || category || description.trim() || location.trim() || photos.length
  );
};

export const saveJobDraft = (draft: JobDraft) => {
  try {
    if (!isWorthKeeping(draft)) {
      clearJobDraft();
      return;
    }
    const payload: StoredDraft = { ...draft, savedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Private browsing and blocked site-data both throw. Autosave is a
    // convenience - never let it break posting a job.
  }
};

export const loadJobDraft = (): JobDraft | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const stored = JSON.parse(raw) as StoredDraft;
    if (!stored?.formData || typeof stored.savedAt !== 'number') {
      clearJobDraft();
      return null;
    }

    if (Date.now() - stored.savedAt > MAX_AGE_MS) {
      clearJobDraft();
      return null;
    }

    const { savedAt, ...draft } = stored;
    // The success screen is not a resumable state.
    return { ...draft, step: Math.min(Math.max(draft.step ?? 1, 1), 3) };
  } catch {
    clearJobDraft();
    return null;
  }
};

export const clearJobDraft = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing useful to do if storage is unavailable.
  }
};
