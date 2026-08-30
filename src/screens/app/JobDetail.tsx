import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapContainer, TileLayer, Circle } from 'react-leaflet';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { clsx } from 'clsx';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Clock,
  Loader2,
  MapPin,
  MessageSquare,
  Pencil,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Button } from '../../components/UI';
import { Avatar } from '../../components/Avatar';
import { JobThumbnail } from '../../components/JobThumbnail';
import { ApplyModal } from '../../components/ApplyModal';
import { useToast } from '../../components/Toast';
import { useTheme } from '../../contexts/ThemeContext';
import { basemapFor } from '../../lib/basemap';
import { categoryIcon, categoryName } from '../../lib/categories';
import { travelLabelBetween } from '../../lib/distance';
import { useUserLocation } from '../../hooks/useUserLocation';

/** date-fns throws on an invalid date, and a throw during render blanks the app. */
const relativeTime = (value: unknown) => {
  try {
    if (!value) return 'recently';
    const date = new Date(value as string);
    if (Number.isNaN(date.getTime())) return 'recently';
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return 'recently';
  }
};

export const JobDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { theme } = useTheme();
  const basemap = basemapFor(theme);
  const userPosition = useUserLocation();

  const [job, setJob] = useState<any | null>(null);
  const [me, setMe] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const loadJob = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [jobRes, meRes] = await Promise.all([
        axios.get(`/api/jobs/${id}`),
        axios.get('/api/users/me'),
      ]);
      setJob(jobRes.data);
      setMe(meRes.data);
    } catch (err: any) {
      console.error('Failed to load job:', err);
      setLoadError(
        err.response?.status === 404
          ? 'That job no longer exists.'
          : 'Could not load this job. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadJob();
  }, [loadJob]);

  const startChat = async () => {
    if (!job || !me) return;
    try {
      const { data: conversation } = await axios.post('/api/conversations', {
        job_id: job.id,
        participant_ids: [me.id, job.poster_id],
      });
      navigate(`/chat/${conversation.id}`);
    } catch (err) {
      console.error('Failed to start chat:', err);
      showToast('Could not open that chat. Please try again.', 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4 opacity-50">
        <Loader2 className="w-8 h-8 text-amber-accent animate-spin" />
        <p className="text-sm font-bold uppercase tracking-widest">Loading job…</p>
      </div>
    );
  }

  if (loadError || !job) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[70vh] gap-4 text-center">
        <AlertTriangle className="w-12 h-12 text-rose-status" />
        <p className="font-bold">{loadError}</p>
        <div className="flex gap-3">
          <Button variant="secondary" className="rounded-full px-6" onClick={() => navigate('/')}>
            Back home
          </Button>
          <Button className="rounded-full px-6" onClick={loadJob}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const myApplication = (job.applications || [])[0];
  const isMine = me && job.poster_id === me.id;
  const isOpen = job.status === 'OPEN';
  // Non-hired viewers get a coarse area and a blurred pin from the API, so the
  // map deliberately shows a radius rather than a point.
  const isApproximate = job.location_precision === 'approximate';

  return (
    <div className="pb-8">
      <header className="sticky top-0 z-20 glass backdrop-blur-2xl border-b border-hairline px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="p-2.5 rounded-2xl bg-surface-1 border border-hairline hover:bg-surface-2 transition-all active:scale-90"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="font-display font-bold text-lg truncate">{job.title}</h1>
      </header>

      <div className="p-6 space-y-6 max-w-2xl mx-auto">
        <JobThumbnail
          photoUrl={job.photos?.[0]?.url}
          category={job.category}
          alt={job.title}
          className="w-full h-56 rounded-3xl border border-hairline"
        />

        {job.photos?.length > 1 && (
          <div className="flex gap-3 overflow-x-auto no-scrollbar">
            {job.photos.slice(1).map((photo: any) => (
              <img
                key={photo.id}
                src={photo.url}
                alt=""
                className="w-24 h-24 rounded-2xl object-cover border border-hairline shrink-0"
                referrerPolicy="no-referrer"
              />
            ))}
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-3xl font-display font-bold leading-tight">{job.title}</h2>
            <span className="shrink-0 bg-amber-accent/15 border border-amber-accent/30 text-amber-accent font-display font-bold px-4 py-2 rounded-2xl">
              ${job.budget_min}–${job.budget_max}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="glass border border-hairline text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full">
              {categoryIcon(job.category)} {categoryName(job.category)}
            </span>
            {job.urgency === 'ASAP' && (
              <span className="bg-rose-status/15 border border-rose-status/40 text-rose-status text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full">
                ASAP
              </span>
            )}
            {!isOpen && (
              <span className="bg-emerald-status/15 border border-emerald-status/40 text-emerald-status text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full">
                {job.status}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 text-muted text-xs font-bold uppercase tracking-widest">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-accent" />
              {travelLabelBetween(userPosition, [job.lat, job.lng]) || job.address || 'Nearby'}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {relativeTime(job.created_at)}
            </span>
            {typeof job.application_count === 'number' && (
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                {job.application_count} applicant{job.application_count === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>

        {job.description && (
          <div className="glass rounded-3xl border border-hairline p-5">
            <p className="text-body leading-relaxed whitespace-pre-wrap">{job.description}</p>
          </div>
        )}

        <div className="glass rounded-3xl border border-hairline p-5 flex items-center gap-4">
          <Avatar
            name={job.poster?.name}
            avatarUrl={job.poster?.avatar_url}
            seed={job.poster?.id}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <p className="font-bold truncate">{job.poster?.name || 'Neighbour'}</p>
            <p className="text-muted text-xs font-medium truncate">
              {job.poster?.neighbourhood || 'Neighbourhood not set'}
            </p>
          </div>
          {job.poster?.is_id_verified && (
            <span className="flex items-center gap-1.5 text-emerald-status text-[10px] font-black uppercase tracking-widest shrink-0">
              <ShieldCheck className="w-4 h-4" /> Verified
            </span>
          )}
        </div>

        {typeof job.lat === 'number' && typeof job.lng === 'number' && (
          <div className="space-y-2">
            <div className="h-48 rounded-3xl overflow-hidden border border-hairline">
              <MapContainer
                center={[job.lat, job.lng]}
                zoom={14}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
                dragging={false}
                scrollWheelZoom={false}
                doubleClickZoom={false}
              >
                <TileLayer key={theme} url={basemap.url} attribution={basemap.attribution} />
                <Circle
                  center={[job.lat, job.lng]}
                  radius={isApproximate ? 450 : 60}
                  pathOptions={{ color: '#F5A623', fillColor: '#F5A623', fillOpacity: 0.15 }}
                />
              </MapContainer>
            </div>
            <p className="text-faint text-[10px] font-bold uppercase tracking-widest text-center">
              {isApproximate
                ? 'Approximate area — the exact address is shared once you are hired'
                : 'Exact location'}
            </p>
          </div>
        )}
      </div>

      {/* Your own job: manage it rather than apply to it. */}
      {isMine && (
        <div className="sticky bottom-0 z-20 glass backdrop-blur-2xl border-t border-hairline p-4">
          <div className="max-w-2xl mx-auto flex gap-3">
            <Button
              variant="secondary"
              className="flex-1 rounded-full"
              onClick={() => navigate(`/jobs/${job.id}/edit`)}
            >
              <Pencil className="w-4 h-4 mr-2" /> Edit
            </Button>
            <Button className="flex-1 rounded-full" onClick={() => navigate('/my-jobs')}>
              <Users className="w-4 h-4 mr-2" />
              {job.application_count ? `${job.application_count} applicant${job.application_count === 1 ? '' : 's'}` : 'Applicants'}
            </Button>
          </div>
        </div>
      )}

      {!isMine && (
        <div className="sticky bottom-0 z-20 glass backdrop-blur-2xl border-t border-hairline p-4">
          <div className="max-w-2xl mx-auto flex gap-3">
            <Button
              variant="secondary"
              className="flex-1 rounded-full"
              onClick={startChat}
            >
              <MessageSquare className="w-4 h-4 mr-2" /> Message
            </Button>
            {myApplication ? (
              <div className="flex-1 flex items-center justify-center gap-2 text-emerald-status text-xs font-black uppercase tracking-widest">
                <Check className="w-4 h-4" />
                Applied · ${myApplication.proposed_price}
              </div>
            ) : (
              <Button
                className={clsx('flex-1 rounded-full', !isOpen && 'opacity-50')}
                disabled={!isOpen}
                onClick={() => setIsApplying(true)}
              >
                {isOpen ? 'Apply now' : 'Already assigned'}
              </Button>
            )}
          </div>
        </div>
      )}

      {isApplying && (
        <ApplyModal
          job={job}
          onClose={() => setIsApplying(false)}
          onApplied={(application) => {
            setJob((prev: any) => ({ ...prev, applications: [application] }));
            setIsApplying(false);
            showToast('Application sent. Follow it up in Chat.', 'success');
          }}
        />
      )}
    </div>
  );
};
