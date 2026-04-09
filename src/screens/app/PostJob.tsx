import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { GlassCard, Button } from '../../components/UI';
import { Camera, MapPin, ChevronRight, ChevronLeft, CheckCircle2, X as CloseIcon, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { clsx } from 'clsx';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';

const CATEGORIES = [
  { id: 'snow', name: 'Snow Removal', icon: '❄️' },
  { id: 'plumbing', name: 'Plumbing', icon: '🚰' },
  { id: 'electrical', name: 'Electrical', icon: '⚡' },
  { id: 'cleaning', name: 'Cleaning', icon: '🧹' },
  { id: 'moving', name: 'Moving', icon: '📦' },
  { id: 'painting', name: 'Painting', icon: '🎨' },
  { id: 'landscaping', name: 'Landscaping', icon: '🌿' },
  { id: 'oddjobs', name: 'Odd Jobs', icon: '🛠️' },
];

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
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [coords, setCoords] = useState<[number, number]>([40.7128, -74.0060]);
  const [formData, setFormData] = useState({
    title: '',
    category: '',
    description: '',
    urgency: 'Flexible',
    photos: [] as string[],
    location: '',
    budget: [50, 200],
  });

  const [isUploading, setIsUploading] = useState(false);

  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

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
      const { data: signData } = await axios.post('/api/uploads/sign');
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);
      formDataUpload.append('api_key', signData.api_key);
      formDataUpload.append('timestamp', signData.timestamp);
      formDataUpload.append('signature', signData.signature);
      formDataUpload.append('folder', 'neighbourly_jobs');

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
      alert('Failed to upload image.');
    } finally {
      setIsUploading(false);
    }
  };

  const nextStep = async () => {
    if (step === 3) {
      if (!user) {
        alert('You must be signed in to post a job.');
        return;
      }
      
      setIsSubmitting(true);
      try {
        const res = await axios.post('/api/jobs', {
          poster_id: user.id,
          poster_email: user.email,
          poster_name: user.user_metadata?.full_name || 'Anonymous',
          title: formData.title,
          category: formData.category,
          description: formData.description,
          urgency: formData.urgency.toUpperCase(),
          lat: coords[0],
          lng: coords[1],
          address: formData.location,
          budget_min: formData.budget[0],
          budget_max: formData.budget[1],
          photos: formData.photos
        });
        
        console.log('Job posted successfully:', res.data);
        setStep(4);
      } catch (err) {
        console.error('Failed to post job:', err);
        const errorMsg = axios.isAxiosError(err) ? err.response?.data?.error : 'Unknown error';
        alert(`Failed to post job: ${errorMsg}. Please check console.`);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      setStep(s => s + 1);
    }
  };
  const prevStep = () => setStep(s => s - 1);

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
              <label className="text-sm font-bold text-white/70 uppercase tracking-wider">Job Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                className="w-full glass rounded-xl py-4 px-4 focus:outline-none focus:ring-2 focus:ring-amber-accent/50 text-white"
                placeholder="What do you need help with?"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-white/70 uppercase tracking-wider">Category</label>
              <div className="grid grid-cols-4 gap-3">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setFormData({ ...formData, category: cat.id })}
                    className={clsx(
                      "flex flex-col items-center gap-2 p-3 rounded-xl transition-all",
                      formData.category === cat.id ? "bg-amber-accent text-slate-900" : "glass hover:bg-white/10"
                    )}
                  >
                    <span className="text-2xl">{cat.icon}</span>
                    <span className="text-[10px] font-bold text-center leading-tight">{cat.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-white/70 uppercase tracking-wider">Urgency</label>
              <div className="flex gap-3">
                {['Flexible', 'This Week', 'ASAP'].map(u => (
                  <button
                    key={u}
                    onClick={() => setFormData({ ...formData, urgency: u })}
                    className={clsx(
                      "flex-1 py-3 rounded-xl text-sm font-bold transition-all",
                      formData.urgency === u ? "bg-amber-accent text-slate-900" : "glass hover:bg-white/10"
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
              <label className="text-sm font-bold text-white/70 uppercase tracking-wider">Description</label>
              <textarea
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                className="w-full glass rounded-xl py-4 px-4 h-32 focus:outline-none focus:ring-2 focus:ring-amber-accent/50 text-white"
                placeholder="Describe the job in detail..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-white/70 uppercase tracking-wider">Photos</label>
              <div className="grid grid-cols-3 gap-3">
                {formData.photos.map((url, index) => (
                  <div key={index} className="relative aspect-square rounded-xl overflow-hidden border border-white/10">
                    <img src={url} alt="Job" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    <button 
                      onClick={() => setFormData(prev => ({ ...prev, photos: prev.photos.filter((_, i) => i !== index) }))}
                      className="absolute top-1 right-1 bg-rose-status p-1 rounded-lg shadow-lg"
                    >
                      <CloseIcon className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
                
                {formData.photos.length < 6 && (
                  <label className="aspect-square glass rounded-xl flex flex-col items-center justify-center gap-2 border-2 border-dashed border-white/10 hover:border-amber-accent/50 transition-all cursor-pointer">
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={isUploading} />
                    {isUploading ? (
                      <div className="w-6 h-6 border-2 border-amber-accent border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Camera className="w-6 h-6 text-white/30" />
                        <span className="text-[10px] font-bold text-white/30 uppercase">Add Photo</span>
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
              <label className="text-sm font-bold text-white/70 uppercase tracking-wider">Location</label>
              <div className="relative">
                <MapPin className={clsx("absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors", isGeocoding ? "text-amber-accent animate-pulse" : "text-white/30")} />
                <input
                  type="text"
                  value={formData.location}
                  onChange={e => {
                    setFormData({ ...formData, location: e.target.value });
                    setShowSuggestions(true);
                  }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  className="w-full glass rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-amber-accent/50 text-white"
                  placeholder="Street address or neighbourhood"
                />
              </div>

              {/* Suggestions Dropdown */}
              <AnimatePresence>
                {showSuggestions && suggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute z-[100] w-full mt-2 glass rounded-xl overflow-hidden shadow-2xl border border-white/10"
                  >
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => handleSelectSuggestion(s)}
                        className="w-full text-left p-4 hover:bg-white/10 transition-colors border-b border-white/5 last:border-0 text-sm"
                      >
                        <p className="font-bold text-white truncate">{s.display_name}</p>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="h-48 rounded-2xl overflow-hidden border border-white/10 glass">
                <MapContainer 
                  center={coords} 
                  zoom={15} 
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={false}
                >
                  <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                  <Marker position={coords} icon={L.divIcon({ className: 'p-2 bg-amber-accent rounded-full border-4 border-slate-900', iconSize: [12, 12] })} />
                  <MapPreview center={coords} />
                </MapContainer>
              </div>
              <p className="text-[10px] text-white/30 font-bold uppercase text-center tracking-widest">Pin shows the exact location that will be posted</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-white/70 uppercase tracking-wider">Budget Range</label>
              <div className="glass p-6 rounded-xl space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-2xl font-display font-bold text-amber-accent">${formData.budget[0]}</span>
                  <span className="text-white/30">—</span>
                  <span className="text-2xl font-display font-bold text-amber-accent">${formData.budget[1]}</span>
                </div>
                <div className="space-y-6">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] uppercase font-black text-white/20 tracking-widest">Maximum Budget</span>
                    <input 
                      type="range" 
                      className="w-full accent-amber-accent"
                      min="10"
                      max="1000"
                      step="10"
                      value={formData.budget[1]}
                      onChange={(e) => setFormData({ ...formData, budget: [formData.budget[0], parseInt(e.target.value)] })}
                    />
                  </div>
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
            <p className="text-white/50">Your job is now visible to helpers in your area. We'll notify you when you get applicants.</p>
            <Button className="w-full" onClick={() => navigate('/')}>View Your Job</Button>
          </motion.div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-6 min-h-screen flex flex-col">
      <header className="flex items-center justify-between mb-8">
        <button onClick={() => navigate(-1)} className="p-2 glass rounded-xl">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-display font-bold">Post a Job</h1>
        <div className="w-10" /> {/* Spacer */}
      </header>

      {step < 4 && (
        <div className="flex gap-2 mb-8">
          {[1, 2, 3].map(s => (
            <div 
              key={s} 
              className={clsx(
                "h-1.5 flex-1 rounded-full transition-all duration-500",
                s <= step ? "bg-amber-accent" : "bg-white/10"
              )} 
            />
          ))}
        </div>
      )}

      <div className="flex-1">
        <AnimatePresence mode="wait">
          {renderStep()}
        </AnimatePresence>
      </div>

      {step < 4 && (
        <div className="mt-8 flex gap-4">
          {step > 1 && (
            <Button variant="secondary" className="flex-1" onClick={prevStep}>
              Back
            </Button>
          )}
          <Button className="flex-1" onClick={nextStep} isLoading={isSubmitting}>
            {step === 3 ? 'Post Job' : 'Continue'}
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      )}
    </div>
  );
};
