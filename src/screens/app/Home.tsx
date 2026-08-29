import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { GlassCard, Button } from '../../components/UI';
import { ApplyModal } from '../../components/ApplyModal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Avatar } from '../../components/Avatar';
import { JobThumbnail } from '../../components/JobThumbnail';
import { Search, Filter, Star, MapPin, Clock, Loader2, MessageSquare, AlertTriangle, Check, Users, Trash2, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { CATEGORIES } from '../../lib/categories';

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

const URGENCY_OPTIONS = ['FLEXIBLE', 'THIS WEEK', 'ASAP'];

function timeOfDayGreeting() {
  const hour = new Date().getHours();
  if (hour < 5) return 'Good Night';
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

export const Home: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [greeting] = useState(timeOfDayGreeting);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [jobs, setJobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<'nearby' | 'mine'>('nearby');
  const [myJobs, setMyJobs] = useState<any[] | null>(null);
  const [isLoadingMine, setIsLoadingMine] = useState(false);
  const [applyingTo, setApplyingTo] = useState<any | null>(null);
  const [deletingJob, setDeletingJob] = useState<any | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'success' | 'warn' } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [urgencyFilter, setUrgencyFilter] = useState<string | null>(null);
  const [maxBudget, setMaxBudget] = useState(1000);

  const fetchJobs = async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const { data } = await axios.get('/api/jobs');
      setJobs(data);
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  // Ensure user is synced with local DB
  useEffect(() => {
    if (user) {
        axios.get('/api/users/me').catch(err => console.error('Auto-sync failed:', err));
    }
  }, [user]);

  const handleStartChat = async (job: any) => {
    if (!user) {
        showNotice('Please sign in to message your neighbours.');
        return;
    }

    try {
        // Find our user record first to get the internal ID
        const { data: me } = await axios.get('/api/users/me');

        if (!me || !me.id) {
            showNotice('Your profile is not set up yet. Finish it from Account.');
            return;
        }

        if (me.id === job.poster_id) {
            showNotice("That's your own job - check Account > Your Jobs to see who applied.");
            return;
        }

        const { data: conversation } = await axios.post('/api/conversations', {
            job_id: job.id,
            participant_ids: [me.id, job.poster_id]
        });
        navigate(`/chat/${conversation.id}`);
    } catch (err) {
        console.error('Failed to start chat:', err);
        showNotice('Could not open that chat. Please try again.');
    }
  };

  // Fetched only when the tab is first opened - most visits never need it.
  useEffect(() => {
    if (tab !== 'mine' || myJobs !== null || isLoadingMine) return;
    setIsLoadingMine(true);
    axios
      .get('/api/jobs/mine')
      .then(({ data }) => setMyJobs(data))
      .catch(err => {
        console.error('Failed to load your listings:', err);
        setMyJobs([]);
      })
      .finally(() => setIsLoadingMine(false));
  }, [tab, myJobs, isLoadingMine]);

  const handleDeleteJob = async (job: any) => {
    try {
      const { data } = await axios.delete(`/api/jobs/${job.id}`);
      setMyJobs(prev => (prev || []).filter(j => j.id !== job.id));
      setDeletingJob(null);
      showNotice(
        data.cancelled
          ? 'Job cancelled. Anyone who applied can still see your conversation.'
          : 'Job deleted.',
        'success'
      );
    } catch (err: any) {
      console.error('Failed to delete job:', err);
      setDeletingJob(null);
      showNotice(err.response?.data?.error || 'Could not delete that job.');
    }
  };

  const showNotice = (text: string, tone: 'success' | 'warn' = 'warn') => {
    setNotice({ text, tone });
    window.setTimeout(() => setNotice(null), 5000);
  };

  // The API returns only *your* application on each job, so this is enough to
  // know whether you have already applied and at what price.
  const myApplication = (job: any) => (job.applications || [])[0];

  const handleApplied = (jobId: string, application: any) => {
    setJobs(prev =>
      prev.map(job => (job.id === jobId ? { ...job, applications: [application] } : job))
    );
    setApplyingTo(null);
    showNotice('Application sent. You can follow it up in Chat.', 'success');
  };

  const filteredJobs = jobs.filter(job => {
    const matchesSearch = job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         job.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'All' || job.category.toLowerCase() === activeCategory.toLowerCase();
    const matchesUrgency = !urgencyFilter || job.urgency === urgencyFilter;
    const matchesBudget = (job.budget_min ?? 0) <= maxBudget;
    return matchesSearch && matchesCategory && matchesUrgency && matchesBudget;
  });

  const activeFilterCount = (urgencyFilter ? 1 : 0) + (maxBudget < 1000 ? 1 : 0);

  const clearFilters = () => {
    setUrgencyFilter(null);
    setMaxBudget(1000);
  };

  // Matches what PostJob actually writes (FLEXIBLE / THIS WEEK / ASAP) - not
  // URGENT/EMERGENCY, which nothing in this app ever produces.
  const urgentJobs = jobs.filter(job => job.urgency === 'ASAP');

  return (
    <div className="p-6 md:p-10 space-y-10">
      {notice && (
        <div
          className={clsx(
            'p-4 rounded-2xl text-sm font-bold flex items-center gap-2 border',
            notice.tone === 'success'
              ? 'bg-emerald-status/15 border-emerald-status/40 text-emerald-status'
              : 'bg-amber-accent/15 border-amber-accent/40 text-amber-accent'
          )}
        >
          {notice.tone === 'success' ? (
            <Check className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          {notice.text}
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em] mb-1">{greeting}</h2>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-white tracking-tight">
            {user?.user_metadata?.full_name?.split(' ')[0] || 'Neighbour'}
          </h1>
        </div>
        <button
          onClick={() => navigate('/account')}
          className="rounded-2xl border-2 border-white/10 shadow-2xl transition-transform hover:scale-110 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-accent/50"
          aria-label="Go to account"
        >
          <Avatar
            name={user?.user_metadata?.full_name}
            avatarUrl={user?.user_metadata?.avatar_url}
            seed={user?.id}
            size="lg"
          />
        </button>
      </header>

      {/* Search & Filter */}
      <div className="flex gap-4">
        <div className="relative flex-1 group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20 group-focus-within:text-amber-accent transition-colors" />
          <input
            type="text"
            placeholder="Search for local help..."
            className="w-full glass rounded-2xl py-5 pl-14 pr-6 focus:outline-none focus:ring-2 focus:ring-amber-accent/30 transition-all font-medium placeholder:text-white/10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          aria-label="Filters"
          className="p-5 rounded-2xl border border-white/5 relative"
          onClick={() => setShowFilters(true)}
        >
          <Filter className="w-6 h-6" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-accent text-slate-900 text-[10px] font-black rounded-full flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {/* Filter Panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end md:items-center justify-center p-0 md:p-6"
            onClick={() => setShowFilters(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full md:max-w-md glass rounded-t-[2.5rem] md:rounded-[2rem] p-8 border border-white/10 bg-[#0f1119]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-display font-bold">Filters</h3>
                <button onClick={() => setShowFilters(false)} aria-label="Close filters" className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <span className="text-[10px] uppercase font-black text-white/40 tracking-widest">Urgency</span>
                  <div className="flex flex-wrap gap-2">
                    {URGENCY_OPTIONS.map(u => (
                      <button
                        key={u}
                        onClick={() => setUrgencyFilter(urgencyFilter === u ? null : u)}
                        className={clsx(
                          "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all",
                          urgencyFilter === u ? "bg-amber-accent text-slate-900" : "glass text-white/50 hover:text-white/80"
                        )}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-black text-white/40 tracking-widest">Max Budget</span>
                    <span className="text-amber-accent font-bold">${maxBudget}</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="1000"
                    step="10"
                    value={maxBudget}
                    onChange={(e) => setMaxBudget(parseInt(e.target.value))}
                    className="w-full accent-amber-accent"
                  />
                </div>
              </div>

              <div className="flex gap-4 mt-8">
                <Button variant="secondary" className="flex-1" onClick={clearFilters}>Clear</Button>
                <Button className="flex-1" onClick={() => setShowFilters(false)}>Show Results</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Categories */}
      <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
        <button
          onClick={() => setActiveCategory('All')}
          className={clsx(
            "px-8 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all",
            activeCategory === 'All' ? "bg-amber-accent text-slate-900 shadow-xl shadow-amber-500/20" : "glass text-white/40 hover:text-white/80 hover:bg-white/10"
          )}
        >
          All
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={clsx(
              "px-8 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
              activeCategory === cat.id ? "bg-amber-accent text-slate-900 shadow-xl shadow-amber-500/20" : "glass text-white/40 hover:text-white/80 hover:bg-white/10"
            )}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Jobs Feed */}
      <section className="space-y-6">
        <div className="flex items-center gap-6 px-2 border-b border-white/5">
          {([
            ['nearby', 'Nearby Jobs'],
            ['mine', 'Your Listings'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={clsx(
                'relative pb-3 text-2xl font-display font-bold tracking-tight transition-colors',
                tab === key ? 'text-white' : 'text-white/25 hover:text-white/50'
              )}
            >
              {label}
              {tab === key && (
                <motion.div
                  layoutId="home-tab-indicator"
                  className="absolute -bottom-px left-0 right-0 h-0.5 bg-amber-accent rounded-full"
                />
              )}
            </button>
          ))}
        </div>

        {tab === 'mine' ? (
          isLoadingMine || myJobs === null ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
              <Loader2 className="w-10 h-10 text-amber-accent animate-spin" />
              <p className="text-[10px] font-black tracking-[0.2em] uppercase">Loading your listings...</p>
            </div>
          ) : myJobs.length === 0 ? (
            <div className="text-center py-20 glass rounded-[2.5rem] border border-dashed border-white/10 space-y-4">
              <p className="text-white/20 font-black tracking-widest uppercase text-sm">You haven't posted anything</p>
              <Button size="sm" onClick={() => navigate('/post-job')}>Post a job</Button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              {myJobs.map((job: any) => {
                const count = (job.applications || []).length;
                const hired = (job.applications || []).find((a: any) => a.status === 'ACCEPTED');
                return (
                  <GlassCard key={job.id} hover className="p-5 space-y-4 border border-white/5 bg-white/[0.03]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="font-display font-bold text-lg truncate">{job.title}</h4>
                        <p className="text-white/30 text-[11px] font-bold uppercase tracking-widest mt-1">
                          {relativeTime(job.created_at)}
                        </p>
                      </div>
                      <span
                        className={clsx(
                          'shrink-0 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border',
                          job.status === 'OPEN'
                            ? 'bg-sky-status/15 text-sky-status border-sky-status/30'
                            : 'bg-emerald-status/20 text-emerald-status border-emerald-status/30'
                        )}
                      >
                        {job.status}
                      </span>
                    </div>

                    <p className="text-xs text-white/30 line-clamp-2 leading-relaxed">{job.description}</p>

                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/5">
                      <span className="text-xs font-bold uppercase tracking-widest text-white/40 flex items-center gap-2">
                        <Users className="w-3.5 h-3.5" />
                        {hired
                          ? `Hired ${hired.helper?.name || 'someone'}`
                          : count === 0
                          ? 'No applicants yet'
                          : `${count} applicant${count === 1 ? '' : 's'}`}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant={count > 0 && !hired ? 'primary' : 'secondary'}
                          className="text-xs rounded-xl"
                          onClick={() => navigate('/my-jobs')}
                        >
                          {count > 0 && !hired ? 'Review' : 'Manage'}
                        </Button>
                        <button
                          type="button"
                          onClick={() => setDeletingJob(job)}
                          aria-label={`Delete ${job.title}`}
                          className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-white/40 hover:text-rose-status hover:bg-rose-status/10 hover:border-rose-status/30 transition-all active:scale-90"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          )
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
            <Loader2 className="w-10 h-10 text-amber-accent animate-spin" />
            <p className="text-[10px] font-black tracking-[0.2em] uppercase">Finding Gigs...</p>
          </div>
        ) : loadError ? (
          <div className="text-center py-20 glass rounded-[2.5rem] border border-dashed border-rose-status/30 space-y-4">
            <AlertTriangle className="w-10 h-10 text-rose-status mx-auto" />
            <p className="text-white/40 font-black tracking-widest uppercase text-sm">Couldn't load jobs</p>
            <p className="text-[10px] text-white/20 uppercase tracking-tight">Check your connection and try again</p>
            <Button variant="secondary" size="sm" onClick={fetchJobs}>Retry</Button>
          </div>
        ) : filteredJobs.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-6">
            {filteredJobs.map((job) => (
              <GlassCard key={job.id} hover className="p-5 flex flex-col gap-5 border border-white/5 bg-white/[0.03]">
                <div className="flex gap-4">
                    <div className="relative shrink-0">
                        <JobThumbnail
                            photoUrl={job.photos?.[0]?.url}
                            category={job.category}
                            alt={job.title}
                            className="w-24 h-24 rounded-2xl ring-2 ring-white/5 shadow-2xl"
                        />
                        {job.urgency === 'ASAP' && (
                            <div className="absolute -top-1 -right-1 w-5 h-5 bg-rose-status border-4 border-[#080a12] rounded-full shadow-lg" />
                        )}
                    </div>

                    <div className="flex-1 space-y-2">
                        <div className="flex items-start justify-between">
                            <h4 className="font-bold text-xl leading-tight tracking-tight">{job.title}</h4>
                            <span className="text-amber-accent font-black text-xs bg-amber-accent/10 px-2 py-1 rounded-lg tracking-tighter">
                                ${job.budget_min} - ${job.budget_max}
                            </span>
                        </div>

                        <div className="flex items-center gap-4 text-[10px] text-white/40 font-bold uppercase tracking-wider">
                            <div className="flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-amber-accent" />
                                {job.address?.split(',')[0] || 'Nearby'}
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" />
                                {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                            </div>
                        </div>

                        <p className="text-xs text-white/30 line-clamp-2 leading-relaxed">{job.description}</p>
                    </div>
                </div>

                <div className="flex gap-3 pt-2 border-t border-white/5">
                    <Button variant="secondary" className="flex-1 text-xs py-3.5 rounded-xl border border-white/5" onClick={() => handleStartChat(job)}>
                         <MessageSquare className="w-4 h-4 mr-2" /> Message
                    </Button>
                    {myApplication(job) ? (
                      <div className="flex-1 flex items-center justify-center gap-2 text-emerald-status text-[11px] font-black uppercase tracking-widest">
                        <Check className="w-4 h-4" />
                        Applied · ${myApplication(job).proposed_price}
                      </div>
                    ) : (
                      <Button className="flex-1 text-xs py-3.5 rounded-xl" onClick={() => setApplyingTo(job)}>
                        Apply Now
                      </Button>
                    )}
                </div>
              </GlassCard>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 glass rounded-[2.5rem] border border-dashed border-white/10">
            <p className="text-white/20 font-black tracking-widest uppercase text-sm">No local gigs found</p>
            <p className="text-[10px] text-white/10 mt-2 uppercase tracking-tight">Try a different category or area</p>
          </div>
        )}
      </section>

      {/* Urgent Jobs Section Refined */}
      {tab === 'nearby' && urgentJobs.length > 0 && (
        <section className="space-y-6">
          <h3 className="text-2xl font-display font-bold tracking-tight px-2">Urgent Gigs</h3>
          <div className="grid md:grid-cols-2 gap-6">
            {urgentJobs.map(job => (
                <GlassCard key={job.id} className="bg-rose-status/[0.07] border-rose-status/20 p-8 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-rose-status/10 blur-[60px] rounded-full pointer-events-none group-hover:bg-rose-status/20 transition-all" />
                  <div className="flex justify-between items-start mb-6">
                    <span className="bg-rose-status text-white text-[9px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest shadow-lg shadow-rose-500/20">Emergency</span>
                    <span className="text-3xl font-display font-bold text-amber-accent tracking-tighter">${job.budget_min}+</span>
                  </div>
                  <h4 className="text-2xl font-bold mb-3 tracking-tight">{job.title}</h4>
                  <p className="text-white/50 text-sm mb-8 leading-relaxed line-clamp-2">{job.description}</p>
                  <div className="flex gap-4">
                    <Button variant="secondary" className="p-4 rounded-xl flex-1 bg-white/5 border border-white/5" onClick={() => handleStartChat(job)}>
                        <MessageSquare className="w-5 h-5" />
                    </Button>
                    {myApplication(job) ? (
                      <div className="flex-[3] flex items-center justify-center gap-2 text-emerald-status text-xs font-black uppercase tracking-widest">
                        <Check className="w-4 h-4" />
                        Applied · ${myApplication(job).proposed_price}
                      </div>
                    ) : (
                      <Button className="flex-[3] bg-rose-status hover:bg-rose-600 shadow-xl shadow-rose-500/20 rounded-xl font-black uppercase tracking-widest text-xs py-4" onClick={() => setApplyingTo(job)}>
                          Instant Apply
                      </Button>
                    )}
                  </div>
                </GlassCard>
            ))}
          </div>
        </section>
      )}

      {deletingJob && (
        <ConfirmDialog
          destructive
          title={`Delete "${deletingJob.title}"?`}
          body={
            (deletingJob.applications || []).length > 0
              ? `${(deletingJob.applications || []).length} neighbour(s) already applied. The job will be cancelled and removed from your listings, but their conversation with you stays.`
              : 'This removes the job for good. It cannot be undone.'
          }
          confirmLabel="Delete job"
          onCancel={() => setDeletingJob(null)}
          onConfirm={() => handleDeleteJob(deletingJob)}
        />
      )}

      {applyingTo && (
        <ApplyModal
          job={applyingTo}
          onClose={() => setApplyingTo(null)}
          onApplied={(application) => handleApplied(applyingTo.id, application)}
        />
      )}
    </div>
  );
};
