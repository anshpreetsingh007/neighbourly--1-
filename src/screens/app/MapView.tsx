import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import { basemapFor } from '../../lib/basemap';
import { useTheme } from '../../contexts/ThemeContext';
import L from 'leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../../components/UI';
import { MapPin, Search, Filter, Navigation, X, Loader2, MessageSquare, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';
import { clsx } from 'clsx';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/Toast';
import { ApplyModal } from '../../components/ApplyModal';
import { CATEGORY_ICONS, categoryIcon } from '../../lib/categories';

/**
 * CARTO's raster basemaps now watermark every unauthenticated tile with
 * "API KEY REQUIRED", so their dark style is used only when a key is present.
 * Without one we fall back to OpenStreetMap, which needs no key - a light map
 * is a lot better than a map covered in watermarks.
 *
 * Free key (5M tiles/month): https://carto.com/basemaps/apikey
 */


// Custom Marker Component
const JobMarker = ({ job, isSelected, onClick }: { job: any, isSelected: boolean, onClick: () => void, key?: any }) => {
  const icon = L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div class="flex items-center gap-2 glass p-2 rounded-2xl border ${isSelected ? 'border-amber-accent ring-4 ring-amber-accent/20' : 'border-hairline'} transition-all shadow-2xl">
        <span class="text-xl">${CATEGORY_ICONS[job.category] || '🛠️'}</span>
        <span class="font-bold text-xs text-amber-accent">$${job.budget_min}</span>
      </div>
    `,
    iconSize: [80, 40],
    iconAnchor: [40, 20],
  });

  return (
    <Marker 
      position={[job.lat || 40.7128, job.lng || -74.0060]} 
      icon={icon}
      eventHandlers={{ click: onClick }}
    />
  );
};

// Component to handle map center changes
/**
 * `token` exists so that asking to recentre on the SAME coordinates still moves
 * the map. These dependencies are primitives, so after panning away and pressing
 * locate again the lat/lng are identical, the effect never re-runs, and the map
 * stays where it was dragged to. Bumping the token forces the fly-to.
 */
const MapCenterer = ({
  center,
  zoom,
  token,
}: {
  center: [number, number];
  zoom?: number;
  token: number;
}) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom ?? map.getZoom(), { animate: true, duration: 1.5 });
  }, [center[0], center[1], zoom, token]);
  return null;
};

export const MapView: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { theme } = useTheme();
  const basemap = basemapFor(theme);
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([40.7128, -74.0060]);
  const [mapZoom, setMapZoom] = useState<number | undefined>(undefined);
  const [centerToken, setCenterToken] = useState(0);
  const [isLocating, setIsLocating] = useState(false);
  const [userPosition, setUserPosition] = useState<[number, number] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [applyingTo, setApplyingTo] = useState<any | null>(null);
  /** True once we have placed the user, so job loading stops overriding it. */
  const didAutoCenter = useRef(false);

  const fetchJobs = async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const { data } = await axios.get('/api/jobs');
      setJobs(data);
      // Falling back to the newest job only matters when we could not place the
      // user. Without this guard the two would race and whichever resolved last
      // would win, so the map would sometimes jump off your location.
      if (data.length > 0 && !selectedJob && !didAutoCenter.current) {
          recenter([data[0].lat || 40.7128, data[0].lng || -74.0060]);
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const visibleJobs = jobs.filter(job => {
    const matchesSearch = job.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !activeCategory || job.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  useEffect(() => {
    fetchJobs();
  }, []);

  /**
   * Centre on the user as soon as the Map opens - a hyperlocal map that opens
   * on someone else's job is not much use.
   *
   * Failures are deliberately silent here. Anyone who has declined the
   * permission would otherwise get an error toast every single time they opened
   * this screen, which is nagging; the locate button still explains what went
   * wrong when they ask for it explicitly. Lower accuracy and a longer cache
   * window than the button, because this only needs to pick the right
   * neighbourhood and should not cost a GPS fix on open.
   */
  useEffect(() => {
    if (!navigator.geolocation || didAutoCenter.current) return;
    // A ref, not state: StrictMode runs this twice in dev and we only want one
    // position request.
    didAutoCenter.current = true;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserPosition(here);
        recenter(here, 14);
      },
      () => {
        // Denied or unavailable: leave the map wherever it was going to land.
        didAutoCenter.current = false;
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }, []);

  const handleStartChat = async (job: any) => {
    if (!user) {
        showToast('Please sign in to message your neighbours.');
        return;
    }

    try {
        const { data: me } = await axios.get('/api/users/me');

        if (!me || !me.id) {
            showToast('Your profile is not set up yet. Finish it from Account.');
            return;
        }

        if (me.id === job.poster_id) {
            showToast("That's your own job - see who applied under Your Listings.");
            return;
        }

        const { data: conversation } = await axios.post('/api/conversations', {
            job_id: job.id,
            participant_ids: [me.id, job.poster_id]
        });
        navigate(`/chat/${conversation.id}`);
    } catch (err) {
        console.error('Failed to start chat from Map:', err);
        showToast('Could not open that chat. Please try again.', 'error');
    }
  };

  /** Moves the map, and works even when the target has not changed. */
  const recenter = (next: [number, number], zoom?: number) => {
    setMapCenter(next);
    if (zoom !== undefined) setMapZoom(zoom);
    setCenterToken(t => t + 1);
  };

  const locateUser = () => {
    // Previously this failed silently when geolocation was unavailable, gave no
    // sign it was working during the wait (which can be many seconds), and kept
    // the current zoom - so landing a few hundred metres away looked like
    // nothing had happened at all.
    if (!navigator.geolocation) {
      showToast('This browser cannot share your location.', 'error');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        // No success toast: the map flying to a fresh blue dot already says it
        // worked. Only failures need explaining.
        setUserPosition(here);
        recenter(here, 15);
        setIsLocating(false);
      },
      (err) => {
        setIsLocating(false);
        console.warn('Geolocation failed:', err);
        const message =
          err.code === err.PERMISSION_DENIED
            ? 'Location is blocked. Allow it in your browser settings for this site.'
            : err.code === err.POSITION_UNAVAILABLE
              ? 'Your location is not available right now.'
              : 'Finding your location took too long. Please try again.';
        showToast(message, 'error');
      },
      // Without a timeout this can hang indefinitely with the button spinning.
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#080a12]">
      {/* Real Leaflet Map */}
      <div className="absolute inset-0 z-0">
        <MapContainer 
          center={mapCenter} 
          zoom={13} 
          style={{ height: '100%', width: '100%', background: '#080a12' }}
          zoomControl={false}
        >
          <TileLayer
            key={theme}
            attribution={basemap.attribution}
            url={basemap.url}
          />
          <MapCenterer center={mapCenter} zoom={mapZoom} token={centerToken} />

          {/* Shows where "here" actually is, so a small move is still visible. */}
          {userPosition && (
            <Marker
              position={userPosition}
              icon={L.divIcon({
                className: "",
                html: '<div style="width:16px;height:16px;border-radius:9999px;background:#0ea5e9;border:3px solid #fff;box-shadow:0 0 0 4px rgba(14,165,233,0.3)"></div>',
                iconSize: [16, 16],
                iconAnchor: [8, 8],
              })}
            />
          )}
          
          {!isLoading && visibleJobs.map((job) => (
            <JobMarker 
              key={job.id} 
              job={job} 
              isSelected={selectedJob?.id === job.id}
              onClick={() => {
                setSelectedJob(job);
                recenter([job.lat || 40.7128, job.lng || -74.0060]);
              }}
            />
          ))}
        </MapContainer>
      </div>

      {/* Header Overlays */}
      <div className="absolute top-8 left-6 right-6 flex gap-4 z-10 pointer-events-none">
        <div className="relative flex-1 pointer-events-auto group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-faint group-focus-within:text-amber-accent transition-colors" />
          <input
            type="text"
            placeholder="Search local jobs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full glass rounded-3xl py-5 pl-14 pr-6 focus:outline-none focus:ring-2 focus:ring-amber-accent/30 transition-all font-medium text-strong"
          />
        </div>
        <div className="pointer-events-auto">
            <Button
              variant="secondary"
              aria-label="Filter by category"
              className="p-5 rounded-3xl border border-hairline bg-panel relative"
              onClick={() => setShowFilters(true)}
            >
            <Filter className="w-6 h-6" />
            {activeCategory && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-accent text-slate-900 text-[10px] font-black rounded-full flex items-center justify-center">1</span>
            )}
            </Button>
        </div>
      </div>

      {/* Filter Panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end md:items-center justify-center"
            onClick={() => setShowFilters(false)}
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
                <h3 className="text-xl font-display font-bold">Filter by Category</h3>
                <button onClick={() => setShowFilters(false)} aria-label="Close filters" className="p-2 hover:bg-surface-2 rounded-xl transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {Object.entries(CATEGORY_ICONS).map(([id, icon]) => (
                  <button
                    key={id}
                    onClick={() => setActiveCategory(activeCategory === id ? null : id)}
                    className={clsx(
                      "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all",
                      activeCategory === id ? "bg-amber-accent text-slate-900" : "glass text-muted hover:text-body"
                    )}
                  >
                    <span>{icon}</span>
                    <span className="capitalize">{id}</span>
                  </button>
                ))}
              </div>

              <div className="flex gap-4 mt-8">
                <Button variant="secondary" className="flex-1" onClick={() => setActiveCategory(null)}>Clear</Button>
                <Button className="flex-1" onClick={() => setShowFilters(false)}>Show Results</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Locate Button */}
      <div className="absolute right-6 bottom-32 flex flex-col gap-3 z-10">
        <button
            onClick={locateUser}
            disabled={isLocating}
            aria-label="Centre map on my location"
            className="p-5 glass rounded-2xl shadow-2xl border border-hairline bg-surface-1 active:scale-90 transition-all hover:bg-surface-2 disabled:opacity-60"
        >
          {isLocating ? (
            <Loader2 className="w-6 h-6 text-amber-accent animate-spin" />
          ) : (
            <Navigation className="w-6 h-6 text-amber-accent" />
          )}
        </button>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-panel backdrop-blur-sm z-50 flex items-center justify-center">
             <div className="p-8 glass rounded-[3rem] flex flex-col items-center gap-4 border border-hairline">
                <Loader2 className="w-12 h-12 text-amber-accent animate-spin" />
                <p className="text-[10px] font-black tracking-[0.2em] uppercase text-body">Scanning Area...</p>
             </div>
        </div>
      )}

      {/* Error Overlay */}
      {!isLoading && loadError && (
        <div className="absolute inset-0 bg-panel backdrop-blur-sm z-50 flex items-center justify-center">
             <div className="p-8 glass rounded-[3rem] flex flex-col items-center gap-4 border border-rose-status/20 text-center">
                <AlertTriangle className="w-12 h-12 text-rose-status" />
                <p className="text-[10px] font-black tracking-[0.2em] uppercase text-body">Couldn't load jobs</p>
                <Button variant="secondary" size="sm" onClick={fetchJobs}>Retry</Button>
             </div>
        </div>
      )}

      {/* Job Preview Drawer */}
      <AnimatePresence>
        {selectedJob && (
          <motion.div
            initial={{ y: '120%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '120%', opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 150 }}
            className="absolute bottom-28 left-6 right-6 z-20 md:max-w-xl md:left-1/2 md:-translate-x-1/2"
          >
            <div className="p-8 relative rounded-3xl backdrop-blur-2xl shadow-[0_0_100px_rgba(0,0,0,0.6)] border border-hairline bg-panel">
              <button
                onClick={() => setSelectedJob(null)}
                aria-label="Close job details"
                className="absolute top-6 right-6 p-2.5 hover:bg-surface-2 rounded-2xl transition-all active:scale-90 border border-hairline bg-surface-1"
              >
                <X className="w-5 h-5 text-muted" />
              </button>

              <div className="flex gap-6">
                <div className="w-24 h-24 rounded-[2rem] flex items-center justify-center text-5xl shadow-inner border border-hairline bg-surface-1">
                  {categoryIcon(selectedJob.category)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-2xl font-display font-bold truncate pr-8 text-strong">{selectedJob.title}</h3>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-muted font-black uppercase tracking-widest mt-1">
                    <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-amber-accent" />
                        {selectedJob.address?.split(',')[0] || 'Approximate area'}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {selectedJob.created_at ? formatDistanceToNow(new Date(selectedJob.created_at), { addSuffix: true }) : 'Recently'}
                    </div>
                  </div>
                  {selectedJob.location_precision === 'approximate' && (
                    <div className="flex items-center gap-1.5 mt-2 text-[10px] text-sky-status font-bold uppercase tracking-widest">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Exact address shown once you're hired
                    </div>
                  )}
                  <div className="mt-4 flex items-center gap-2">
                     <span className="text-3xl font-display font-bold text-amber-accent">${selectedJob.budget_min}</span>
                     <span className="text-faint font-bold">—</span>
                     <span className="text-3xl font-display font-bold text-amber-accent">${selectedJob.budget_max}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                    className="p-4 glass rounded-2xl border border-hairline text-strong hover:bg-surface-2 transition-all active:scale-95"
                    onClick={() => handleStartChat(selectedJob)}
                    aria-label="Message"
                >
                    <MessageSquare className="w-5 h-5" />
                </button>
                {(selectedJob.applications || []).length > 0 ? (
                  <div className="flex-1 flex items-center justify-center gap-2 text-emerald-status text-xs font-black uppercase tracking-widest glass rounded-2xl border border-emerald-status/20">
                    Applied · ${selectedJob.applications[0].proposed_price}
                  </div>
                ) : (
                  <button
                      className="flex-1 py-4 bg-amber-accent text-slate-900 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-amber-500/20 hover:scale-[1.02] transition-all active:scale-95"
                      onClick={() => setApplyingTo(selectedJob)}
                  >
                      Apply Now
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {applyingTo && (
        <ApplyModal
          job={applyingTo}
          onClose={() => setApplyingTo(null)}
          onApplied={(application) => {
            setJobs(prev => prev.map(j => (j.id === applyingTo.id ? { ...j, applications: [application] } : j)));
            setSelectedJob((prev: any) => (prev?.id === applyingTo.id ? { ...prev, applications: [application] } : prev));
            setApplyingTo(null);
            showToast('Application sent. You can follow it up in Chat.', 'success');
          }}
        />
      )}
    </div>
  );
};
