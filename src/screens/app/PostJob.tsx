import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { GlassCard, Button } from '../../components/UI';
import { Camera, MapPin, ChevronRight, ChevronLeft, CheckCircle2, X as CloseIcon, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/Toast';
import axios from 'axios';
import { clsx } from 'clsx';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import { basemapFor } from '../../lib/basemap';
import { useTheme } from '../../contexts/ThemeContext';
import { saveJobDraft, loadJobDraft, clearJobDraft } from '../../lib/jobDraft';
import L from 'leaflet';
import { CATEGORIES } from '../../lib/categories';

/** Stored form -> the labels the urgency buttons render and compare against. */
const URGENCY_FROM_API: Record<string, string> = {
  FLEXIBLE: 'Flexible',
  'THIS WEEK': 'This Week',
  ASAP: 'ASAP',
};

const MapPreview = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 15, { animate: true });
  }, [center]);
  return null;
};

export const PostJob: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { theme } = useTheme();
  const basemap = basemapFor(theme);

  // Same screen serves both /post-job and /jobs/:id/edit. Editing an existing
  // job must never touch the new-post draft, so drafts are skipped entirely in
  // edit mode - otherwise editing would clobber a half-written new job.
  const { id: editingId } = useParams();
  const isEditing = Boolean(editingId);

  const [restoredDraft] = useState(() => (editingId ? null : loadJobDraft()));
  const [isLoadingJob, setIsLoadingJob] = useState(Boolean(editingId));
  const [loadFailed, setLoadFailed] = useState(false);
  /** Applications lock the budget and location - see PATCH /api/jobs/:id. */
  const [fieldsLocked, setFieldsLocked] = useState(false);
  const [wasRestored, setWasRestored] = useState(false);
  const [step, setStep] = useState(() => restoredDraft?.step ?? 1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [coords, setCoords] = useState<[number, number]>(
    restoredDraft?.coords ?? [40.7128, -74.0060]
  );
  const [formData, setFormData] = useState(
    restoredDraft?.formData ?? {
      title: '',
      category: '',
      description: '',
      urgency: 'Flexible',
      photos: [] as string[],
      location: '',
      budget: [50, 200],
    }
  );

  const [isUploading, setIsUploading] = useState(false);

  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  /**
   * True only once the typed text has been resolved to real coordinates, either
   * by picking a suggestion or by a successful lookup. Free text used to be
   * accepted as-is and silently kept the default New York coordinates, which is
   * why old test jobs sit in NY and Normandy - and on a distance-based board a
   * job in the wrong place is worse than no job at all.
   *
   * Restored from the draft rather than inferred from the text: an address that
   * never geocoded has to come back unconfirmed, or leaving the form and coming
   * back would launder it into a valid one.
   */
  const [locationConfirmed, setLocationConfirmed] = useState(
    Boolean(restoredDraft?.locationConfirmed)
  );

  // A ref, not state: React StrictMode runs effects twice on mount in dev, and
  // the second run closes over the pre-update state, so a state flag fires the
  // toast twice. A ref mutates immediately and is seen by both runs.
  const announcedRestore = useRef(false);
  useEffect(() => {
    if (restoredDraft && !isEditing && !announcedRestore.current) {
      announcedRestore.current = true;
      setWasRestored(true);
      showToast('Picked up where you left off.');
    }
  }, [restoredDraft, showToast]);

  // Autosave. Step 4 is the success screen, which is not resumable.
  useEffect(() => {
    if (step >= 4 || isEditing) return;
    saveJobDraft({ step, coords, formData, locationConfirmed });
  }, [step, coords, formData, locationConfirmed, isEditing]);

  const handleStartOver = () => {
    clearJobDraft();
    setFormData({
      title: '',
      category: '',
      description: '',
      urgency: 'Flexible',
      photos: [],
      location: '',
      budget: [50, 200],
    });
    setCoords([40.7128, -74.0060]);
    setLocationConfirmed(false);
    setStep(1);
    setStepError(null);
    setWasRestored(false);
    showToast('Started a new job post.');
  };

  useEffect(() => {
    if (!editingId) return;
    let cancelled = false;
    axios
      .get(`/api/jobs/${editingId}`)
      .then(({ data }) => {
        if (cancelled) return;
        setFormData({
          title: data.title ?? '',
          category: data.category ?? '',
          description: data.description ?? '',
          // The database stores FLEXIBLE / THIS WEEK / ASAP, but the buttons
          // compare against their own casing, so an unmapped value would leave
          // none of them highlighted while editing.
          urgency: URGENCY_FROM_API[data.urgency] ?? 'Flexible',
          photos: (data.photos ?? []).map((p: any) => p.url),
          location: data.address ?? '',
          budget: [data.budget_min ?? 50, data.budget_max ?? 200],
        });
        setCoords([data.lat, data.lng]);
        // It came from the database, so it was geocoded when it was posted.
        setLocationConfirmed(true);
        setFieldsLocked((data.application_count ?? 0) > 0);
      })
      .catch(err => {
        console.error('Failed to load job for editing:', err);
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingJob(false);
      });
    return () => { cancelled = true; };
  }, [editingId]);

  const fetchSuggestions = async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`, {
        headers: { 'User-Agent': 'NeighbourlyApp/1.0' }
      });
      setSuggestions(res.data);
      setShowSuggestions(true);
    } catch (err) {
      console.error('Failed to fetch suggestions:', err);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (formData.location && !isGeocoding) {
        fetchSuggestions(formData.location);
      }
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [formData.location]);

  const handleSelectSuggestion = (suggestion: any) => {
    setLocationConfirmed(true);
    const newCoords: [number, number] = [parseFloat(suggestion.lat), parseFloat(suggestion.lon)];
    setCoords(newCoords);
    setFormData(prev => ({ ...prev, location: suggestion.display_name }));
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleGeocode = async () => {
    if (!formData.location) return;
    setIsGeocoding(true);
    try {
      const geoRes = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(formData.location)}&limit=1`, {
        headers: { 'User-Agent': 'NeighbourlyApp/1.0' }
      });
      if (geoRes.data && geoRes.data.length > 0) {
        const newCoords: [number, number] = [parseFloat(geoRes.data[0].lat), parseFloat(geoRes.data[0].lon)];
        setCoords(newCoords);
        // Use the name the geocoder recognised, not the user's spelling, so the
        // stored address always matches the pin.
        setFormData(prev => ({ ...prev, location: geoRes.data[0].display_name }));
        setLocationConfirmed(true);
      } else {
        setLocationConfirmed(false);
      }
    } catch (err) {
      console.error('Geocoding failed:', err);
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const { data: signData } = await axios.post('/api/uploads/sign', { folder: 'neighbourly_jobs' });
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);
      formDataUpload.append('api_key', signData.api_key);
      formDataUpload.append('timestamp', signData.timestamp);
      formDataUpload.append('signature', signData.signature);
      formDataUpload.append('folder', signData.folder);

      const { data: uploadData } = await axios.post(
        `https://api.cloudinary.com/v1_1/${signData.cloud_name}/image/upload`,
        formDataUpload
      );

      setFormData(prev => ({
        ...prev,
        photos: [...prev.photos, uploadData.secure_url]
      }));
    } catch (err) {
      console.error('Upload failed:', err);
      showToast('Could not upload that image. Please try again.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const validateStep = (): string | null => {
    if (step === 1) {
      if (!formData.title.trim()) return 'Give the job a title.';
      if (!formData.category) return 'Pick a category.';
    }
    if (step === 2) {
      if (!formData.description.trim()) return 'Add a description so helpers know what to expect.';
    }
    if (step === 3) {
      if (!formData.location.trim()) return 'Enter a location for the job.';
      if (!locationConfirmed) {
        return 'Pick the address from the list so neighbours can find it.';
      }
    }
    return null;
  };

  const nextStep = async () => {
    const error = validateStep();
    if (error) {
      setStepError(error);
      return;
    }
    setStepError(null);

    if (step === 3) {
      if (!user) {
        showToast('Please sign in to post a job.');
        return;
      }

      setIsSubmitting(true);
      try {
        const payload: Record<string, unknown> = {
          title: formData.title,
          category: formData.category,
          description: formData.description,
          urgency: formData.urgency.toUpperCase(),
          photos: formData.photos,
        };

        // Once someone has applied the server refuses budget or location
        // changes, so do not send them at all - otherwise saving a typo fix
        // would be rejected for touching fields the user never edited.
        if (!fieldsLocked) {
          payload.lat = coords[0];
          payload.lng = coords[1];
          payload.address = formData.location;
          payload.budget_min = formData.budget[0];
          payload.budget_max = formData.budget[1];
        }

        if (isEditing) {
          await axios.patch(`/api/jobs/${editingId}`, payload);
          showToast('Changes saved.', 'success');
          navigate(`/jobs/${editingId}`);
          return;
        }

        await axios.post('/api/jobs', payload);

        clearJobDraft();
        setWasRestored(false);
        setStep(4);
      } catch (err) {
        console.error('Failed to post job:', err);
        const errorMsg = axios.isAxiosError(err) ? err.response?.data?.error : 'Unknown error';
        showToast(
          errorMsg || (isEditing ? 'Could not save your changes. Please try again.' : 'Could not post your job. Please try again.'),
          'error'
        );
      } finally {
        setIsSubmitting(false);
      }
    } else {
      setStep(s => s + 1);
    }
  };
  const prevStep = () => {
    setStepError(null);
    setStep(s => s - 1);
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="space-y-2">
              <label className="text-sm font-bold text-body uppercase tracking-wider">Job Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                className="w-full glass rounded-xl py-4 px-4 focus:outline-none focus:ring-2 focus:ring-amber-accent/50 text-strong"
                placeholder="What do you need help with?"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-body uppercase tracking-wider">Category</label>
              <div className="grid grid-cols-4 gap-3">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setFormData({ ...formData, category: cat.id })}
                    className={clsx(
                      "flex flex-col items-center gap-2 p-3 rounded-xl transition-all",
                      formData.category === cat.id ? "bg-amber-accent text-slate-900" : "glass hover:bg-surface-2"
                    )}
                  >
                    <span className="text-2xl">{cat.icon}</span>
                    <span className="text-[10px] font-bold text-center leading-tight">{cat.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-body uppercase tracking-wider">Urgency</label>
              <div className="flex gap-3">
                {['Flexible', 'This Week', 'ASAP'].map(u => (
                  <button
                    key={u}
                    onClick={() => setFormData({ ...formData, urgency: u })}
                    className={clsx(
                      "flex-1 py-3 rounded-xl text-sm font-bold transition-all",
                      formData.urgency === u ? "bg-amber-accent text-slate-900" : "glass hover:bg-surface-2"
                    )}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        );
      case 2:
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="space-y-2">
              <label className="text-sm font-bold text-body uppercase tracking-wider">Description</label>
              <textarea
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                className="w-full glass rounded-xl py-4 px-4 h-32 focus:outline-none focus:ring-2 focus:ring-amber-accent/50 text-strong"
                placeholder="Describe the job in detail..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-body uppercase tracking-wider">Photos</label>
              <div className="grid grid-cols-3 gap-3">
                {formData.photos.map((url, index) => (
                  <div key={index} className="relative aspect-square rounded-xl overflow-hidden border border-hairline">
                    <img src={url} alt="Job" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    <button 
                      onClick={() => setFormData(prev => ({ ...prev, photos: prev.photos.filter((_, i) => i !== index) }))}
                      className="absolute top-1 right-1 bg-rose-status p-1 rounded-lg shadow-lg"
                    >
                      <CloseIcon className="w-3 h-3 text-strong" />
                    </button>
                  </div>
                ))}
                
                {formData.photos.length < 6 && (
                  <label className="aspect-square glass rounded-xl flex flex-col items-center justify-center gap-2 border-2 border-dashed border-hairline hover:border-amber-accent/50 transition-all cursor-pointer">
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={isUploading} />
                    {isUploading ? (
                      <div className="w-6 h-6 border-2 border-amber-accent border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Camera className="w-6 h-6 text-faint" />
                        <span className="text-[10px] font-bold text-faint uppercase">Add Photo</span>
                      </>
                    )}
                  </label>
                )}
              </div>
            </div>

          </motion.div>
        );
      case 3:
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="space-y-2 relative">
              <label className="text-sm font-bold text-body uppercase tracking-wider">Location</label>
              <div className="relative">
                <MapPin className={clsx("absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors", isGeocoding ? "text-amber-accent animate-pulse" : "text-faint")} />
                <input
                  type="text"
                  value={formData.location}
                  onChange={e => {
                    setFormData({ ...formData, location: e.target.value });
                    setShowSuggestions(true);
                    // Editing the text breaks the tie to the resolved pin.
                    setLocationConfirmed(false);
                  }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  className={clsx(
                    "w-full glass rounded-xl py-4 pl-12 pr-11 focus:outline-none focus:ring-2 transition-all text-strong",
                    locationConfirmed
                      ? "ring-2 ring-emerald-status/40 focus:ring-emerald-status/50"
                      : "focus:ring-amber-accent/50"
                  )}
                  placeholder="Street address or neighbourhood"
                />
                {locationConfirmed && (
                  <CheckCircle2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-status" />
                )}
              </div>

              {/* Says plainly whether the pin below is real yet. */}
              <p
                className={clsx(
                  'text-[11px] font-bold uppercase tracking-widest ml-1',
                  locationConfirmed ? 'text-emerald-status' : 'text-faint'
                )}
              >
                {locationConfirmed
                  ? 'Address confirmed'
                  : 'Start typing, then pick your address from the list'}
              </p>

              {/* Suggestions Dropdown */}
              <AnimatePresence>
                {showSuggestions && suggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute z-[100] w-full mt-2 glass rounded-xl overflow-hidden shadow-2xl border border-hairline"
                  >
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => handleSelectSuggestion(s)}
                        className="w-full text-left p-4 hover:bg-surface-2 transition-colors border-b border-hairline last:border-0 text-sm"
                      >
                        <p className="font-bold text-strong truncate">{s.display_name}</p>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="h-48 rounded-2xl overflow-hidden border border-hairline glass">
                <MapContainer 
                  center={coords} 
                  zoom={15} 
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={false}
                >
                  <TileLayer key={theme} url={basemap.url} attribution={basemap.attribution} />
                  <Marker position={coords} icon={L.divIcon({ className: 'p-2 bg-amber-accent rounded-full border-4 border-slate-900', iconSize: [12, 12] })} />
                  <MapPreview center={coords} />
                </MapContainer>
              </div>
              <p className="text-[10px] text-faint font-bold uppercase text-center tracking-widest">Pin shows the exact location that will be posted</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-body uppercase tracking-wider">Budget Range</label>
              <div className="glass p-6 rounded-xl space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] uppercase font-black text-faint tracking-widest">Minimum ($)</span>
                    <input
                      type="number"
                      min={0}
                      max={formData.budget[1]}
                      step={5}
                      value={formData.budget[0]}
                      onChange={(e) => {
                        const value = Math.max(0, Math.min(parseInt(e.target.value) || 0, formData.budget[1]));
                        setFormData({ ...formData, budget: [value, formData.budget[1]] });
                      }}
                      className="w-full glass rounded-xl py-3 px-4 text-2xl font-display font-bold text-amber-accent focus:outline-none focus:ring-2 focus:ring-amber-accent/50"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] uppercase font-black text-faint tracking-widest">Maximum ($)</span>
                    <input
                      type="number"
                      min={formData.budget[0]}
                      max={5000}
                      step={5}
                      value={formData.budget[1]}
                      onChange={(e) => {
                        const value = Math.max(formData.budget[0], parseInt(e.target.value) || formData.budget[0]);
                        setFormData({ ...formData, budget: [formData.budget[0], value] });
                      }}
                      className="w-full glass rounded-xl py-3 px-4 text-2xl font-display font-bold text-amber-accent focus:outline-none focus:ring-2 focus:ring-amber-accent/50"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] uppercase font-black text-faint tracking-widest">Maximum Budget</span>
                  <input
                    type="range"
                    className="w-full accent-amber-accent"
                    min="10"
                    max="1000"
                    step="10"
                    value={formData.budget[1]}
                    onChange={(e) => {
                      const value = Math.max(formData.budget[0], parseInt(e.target.value));
                      setFormData({ ...formData, budget: [formData.budget[0], value] });
                    }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        );
      case 4:
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-12 space-y-6"
          >
            <div className="flex justify-center">
              <div className="w-24 h-24 bg-emerald-status rounded-full flex items-center justify-center shadow-2xl shadow-emerald-500/40">
                <CheckCircle2 className="w-12 h-12 text-slate-900" />
              </div>
            </div>
            <h2 className="text-3xl font-display font-bold">Job Posted!</h2>
            <p className="text-muted">Your job is now visible to helpers in your area. We'll notify you when you get applicants.</p>
            <Button className="w-full" onClick={() => navigate('/my-jobs')}>View Your Job</Button>
          </motion.div>
        );
      default:
        return null;
    }
  };

  if (isLoadingJob) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4 opacity-50">
        <Loader2 className="w-8 h-8 text-amber-accent animate-spin" />
        <p className="text-sm font-bold uppercase tracking-widest">Loading job…</p>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[70vh] gap-4 text-center">
        <AlertCircle className="w-12 h-12 text-rose-status" />
        <p className="font-bold">Could not load that job for editing.</p>
        <Button variant="secondary" className="rounded-full px-6" onClick={() => navigate('/')}>
          Back home
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-screen flex flex-col">
      <header className="flex items-center justify-between mb-8">
        <button
          onClick={() => (isEditing ? navigate(`/jobs/${editingId}`) : navigate(-1))}
          aria-label="Go back"
          className="p-2 glass rounded-xl"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-display font-bold">{isEditing ? 'Edit Job' : 'Post a Job'}</h1>
        <div className="w-10" /> {/* Spacer */}
      </header>

      {/* Only shown when a draft was actually restored - without an escape
          hatch, someone coming back to post a different job is stuck deleting
          the old one field by field. */}
      {wasRestored && step < 4 && (
        <button
          onClick={handleStartOver}
          className="self-end -mt-4 mb-4 text-xs font-bold uppercase tracking-widest text-muted hover:text-strong transition-colors"
        >
          Start over
        </button>
      )}

      {step < 4 && (
        <div className="flex gap-2 mb-8">
          {[1, 2, 3].map(s => (
            <div 
              key={s} 
              className={clsx(
                "h-1.5 flex-1 rounded-full transition-all duration-500",
                s <= step ? "bg-amber-accent" : "bg-surface-2"
              )} 
            />
          ))}
        </div>
      )}

      {/* Not flex-1: that stretched this wrapper to fill the screen and pinned
          the step buttons to the bottom, leaving a dead gap on the short steps.
          Sizing to content keeps Continue just below the fields. */}
      <div>
        <AnimatePresence mode="wait">
          {renderStep()}
        </AnimatePresence>
      </div>

      {step < 4 && (
        <>
          {/* A hint about the next tap, not an alarm - so it reads as a line of
              text beside the buttons rather than a filled warning panel. */}
          {stepError && (
            <p
              role="alert"
              className="mt-6 flex items-start gap-2 text-rose-status text-sm font-medium"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {stepError}
            </p>
          )}
          <div className="mt-8 flex gap-3 justify-end">
            {step > 1 && (
              <Button
                variant="secondary"
                className="rounded-full px-6 text-muted"
                onClick={prevStep}
              >
                Back
              </Button>
            )}
            {/* Glass pill rather than a solid amber block: amber already means
                "selected" on this form (category, urgency), so a filled amber
                button read as another chosen chip instead of an action. */}
            <Button
              variant="secondary"
              className="rounded-full px-7 font-bold"
              onClick={nextStep}
              isLoading={isSubmitting}
            >
              {step === 3 ? (isEditing ? 'Save Changes' : 'Post Job') : 'Continue'}
              <ChevronRight className="w-5 h-5 text-amber-accent" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
