import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard, Button } from '../../components/UI';
import { MapPin, Search, Filter, Navigation, X, Loader2, MessageSquare, Clock } from 'lucide-react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';

const CATEGORY_ICONS: Record<string, string> = {
  snow: '❄️',
  plumbing: '🚰',
  electrical: '⚡',
  cleaning: '🧹',
  moving: '📦',
  painting: '🎨',
  landscaping: '🌿',
  oddjobs: '🛠️',
};

// Custom Marker Component
const JobMarker = ({ job, isSelected, onClick }: { job: any, isSelected: boolean, onClick: () => void, key?: any }) => {
  const icon = L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div class="flex items-center gap-2 glass p-2 rounded-2xl border ${isSelected ? 'border-amber-accent ring-4 ring-amber-accent/20' : 'border-white/20'} transition-all shadow-2xl">
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
const MapCenterer = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, map.getZoom(), { animate: true, duration: 1.5 });
  }, [center[0], center[1]]); // Specific dependencies
  return null;
};

export const MapView: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([40.7128, -74.0060]);

  const fetchJobs = async () => {
    try {
      const { data } = await axios.get('/api/jobs');
      setJobs(data);
      if (data.length > 0 && !selectedJob) {
          setMapCenter([data[0].lat || 40.7128, data[0].lng || -74.0060]);
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const handleStartChat = async (job: any) => {
    console.log('handleStartChat called from MapView for job:', job.id);
    if (!user) {
        alert('Please sign in to message users');
        return;
    }

    try {
        const { data: me } = await axios.get('/api/users/me', {
            headers: { 'x-supabase-uid': user.id }
        });
        console.log('Current user record (Map):', me);

        if (!me || !me.id) {
            alert('Your profile is not fully set up. Please go to Account.');
            return;
        }

        if (me.id === job.poster_id) {
            alert('This is your own job!');
            return;
        }

        const { data: conversation } = await axios.post('/api/conversations', {
            job_id: job.id,
            participant_ids: [me.id, job.poster_id]
        });
        console.log('Conversation ready (Map):', conversation.id);
        navigate(`/chat/${conversation.id}`);
    } catch (err) {
        console.error('Failed to start chat from Map:', err);
        alert('Failed to start chat. Check console.');
    }
  };

  const locateUser = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setMapCenter([pos.coords.latitude, pos.coords.longitude]);
      }, (err) => {
        console.warn('Geolocation failed:', err);
        alert('Could not get your location. Please check browser permissions.');
      });
    }
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
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png"
          />
          <MapCenterer center={mapCenter} />
          
          {!isLoading && jobs.map((job) => (
            <JobMarker 
              key={job.id} 
              job={job} 
              isSelected={selectedJob?.id === job.id}
              onClick={() => {
                setSelectedJob(job);
                setMapCenter([job.lat || 40.7128, job.lng || -74.0060]);
              }}
            />
          ))}
        </MapContainer>
      </div>

      {/* Header Overlays */}
      <div className="absolute top-8 left-6 right-6 flex gap-4 z-10 pointer-events-none">
        <div className="relative flex-1 pointer-events-auto group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20 group-focus-within:text-amber-accent transition-colors" />
          <input
            type="text"
            placeholder="Search local jobs..."
            className="w-full glass rounded-3xl py-5 pl-14 pr-6 focus:outline-none focus:ring-2 focus:ring-amber-accent/30 transition-all font-medium text-white"
          />
        </div>
        <div className="pointer-events-auto">
            <Button variant="secondary" className="p-5 rounded-3xl border border-white/5 bg-[#080a12]/80">
            <Filter className="w-6 h-6" />
            </Button>
        </div>
      </div>

      {/* Locate Button */}
      <div className="absolute right-6 bottom-32 flex flex-col gap-3 z-10">
        <button 
            onClick={locateUser}
            className="p-5 glass rounded-2xl shadow-2xl border border-white/5 bg-white/5 active:scale-90 transition-all hover:bg-white/10"
        >
          <Navigation className="w-6 h-6 text-amber-accent" />
        </button>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-[#080a12]/60 backdrop-blur-sm z-50 flex items-center justify-center">
             <div className="p-8 glass rounded-[3rem] flex flex-col items-center gap-4 border border-white/5">
                <Loader2 className="w-12 h-12 text-amber-accent animate-spin" />
                <p className="text-[10px] font-black tracking-[0.2em] uppercase text-white/60">Scanning Area...</p>
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
            <GlassCard className="p-8 relative shadow-[0_0_100px_rgba(0,0,0,0.6)] border border-white/10 bg-[#080a12]/90">
              <button 
                onClick={() => setSelectedJob(null)}
                className="absolute top-6 right-6 p-2.5 hover:bg-white/10 rounded-2xl transition-all active:scale-90 border border-white/5 bg-white/5"
              >
                <X className="w-5 h-5 text-white/50" />
              </button>

              <div className="flex gap-6">
                <div className="w-24 h-24 glass rounded-[2rem] flex items-center justify-center text-5xl shadow-inner border border-white/10 bg-white/[0.05]">
                  {CATEGORY_ICONS[selectedJob.category] || '🛠️'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-2xl font-display font-bold truncate pr-8 text-white">{selectedJob.title}</h3>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-white/40 font-black uppercase tracking-widest mt-1">
                    <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-amber-accent" />
                        {selectedJob.address.split(',')[0]}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {selectedJob.created_at ? formatDistanceToNow(new Date(selectedJob.created_at), { addSuffix: true }) : 'Recently'}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                     <span className="text-3xl font-display font-bold text-amber-accent">${selectedJob.budget_min}</span>
                     <span className="text-white/20 font-bold">—</span>
                     <span className="text-3xl font-display font-bold text-amber-accent">${selectedJob.budget_max}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 mt-8">
                <button 
                    className="flex-1 py-4 glass rounded-2xl border border-white/5 text-xs font-black uppercase tracking-widest text-white hover:bg-white/10 transition-all active:scale-95" 
                    onClick={() => setSelectedJob(null)}
                >
                    Close
                </button>
                <button 
                    className="flex-[2] py-4 bg-amber-accent text-slate-900 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-amber-500/20 hover:scale-[1.02] transition-all active:scale-95 flex items-center justify-center gap-2" 
                    onClick={() => handleStartChat(selectedJob)}
                >
                    <MessageSquare className="w-4 h-4" />
                    Quick Chat
                </button>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
