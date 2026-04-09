import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { GlassCard, Button } from '../../components/UI';
import { Search, Filter, Star, MapPin, Clock, Loader2, MessageSquare } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';

const CATEGORIES = [
  { id: 'snow', name: 'Snow Removal' },
  { id: 'plumbing', name: 'Plumbing' },
  { id: 'electrical', name: 'Electrical' },
  { id: 'cleaning', name: 'Cleaning' },
  { id: 'moving', name: 'Moving' },
  { id: 'painting', name: 'Painting' },
  { id: 'landscaping', name: 'Landscaping' },
  { id: 'oddjobs', name: 'Odd Jobs' },
];

export const Home: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [jobs, setJobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const { data } = await axios.get('/api/jobs');
        setJobs(data);
      } catch (err) {
        console.error('Failed to fetch jobs:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchJobs();
  }, []);

  // Ensure user is synced with local DB
  useEffect(() => {
    if (user) {
        axios.get('/api/users/me').catch(err => console.error('Auto-sync failed:', err));
    }
  }, [user]);

  const handleStartChat = async (job: any) => {
    console.log('handleStartChat called for job:', job.id);
    if (!user) {
        alert('Please sign in to message users');
        return;
    }

    try {
        // Find our user record first to get the internal ID
        const { data: me } = await axios.get('/api/users/me', {
            headers: { 'x-supabase-uid': user.id }
        });
        console.log('Current user record:', me);

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
        console.log('Conversation ready:', conversation.id);
        navigate(`/chat/${conversation.id}`);
    } catch (err) {
        console.error('Failed to start chat:', err);
        alert('Failed to start chat. Check console.');
    }
  };

  const handleApplyNow = async (job: any) => {
    console.log('handleApplyNow called for job:', job.id);
    if (!user) {
        alert('Please sign in to apply for jobs');
        return;
    }

    try {
        const { data: res } = await axios.post(`/api/jobs/${job.id}/apply`, {
            helper_supabase_uid: user.id,
            proposed_price: job.budget_min
        });
        console.log('Application response:', res);
        
        alert('Job application sent! Opening chat...');
        navigate(`/chat/${res.conversation_id}`);
    } catch (err: any) {
        console.error('Failed to apply:', err);
        const errorMsg = err.response?.data?.error || err.message || 'Unknown error';
        alert(`Failed to apply: ${errorMsg}`);
    }
  };

  const filteredJobs = jobs.filter(job => {
    const matchesSearch = job.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         job.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'All' || job.category.toLowerCase() === activeCategory.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  const urgentJobs = jobs.filter(job => job.urgency === 'URGENT' || job.urgency === 'EMERGENCY');

  return (
    <div className="p-6 md:p-10 space-y-10">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Good Morning</h2>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-white tracking-tight">
            {user?.user_metadata?.full_name?.split(' ')[0] || 'Neighbour'}
          </h1>
        </div>
        <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-white/10 shadow-2xl transition-transform hover:scale-110 cursor-pointer">
          <img 
            src={user?.user_metadata?.avatar_url || "https://picsum.photos/seed/user/100/100"} 
            alt="Avatar" 
            referrerPolicy="no-referrer" 
            className="w-full h-full object-cover"
          />
        </div>
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
        <Button variant="secondary" className="p-5 rounded-2xl border border-white/5">
          <Filter className="w-6 h-6" />
        </Button>
      </div>

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
        <div className="flex items-center justify-between px-2">
          <h3 className="text-2xl font-display font-bold tracking-tight">Nearby Jobs</h3>
          <button className="text-amber-accent text-xs font-black uppercase tracking-widest hover:opacity-70 transition-opacity">See All</button>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
            <Loader2 className="w-10 h-10 text-amber-accent animate-spin" />
            <p className="text-[10px] font-black tracking-[0.2em] uppercase">Finding Gigs...</p>
          </div>
        ) : filteredJobs.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-6">
            {filteredJobs.map((job) => (
              <GlassCard key={job.id} hover className="p-5 flex flex-col gap-5 border border-white/5 bg-white/[0.03]">
                <div className="flex gap-4">
                    <div className="relative shrink-0">
                        <img 
                            src={job.photos?.[0]?.url || `https://picsum.photos/seed/${job.id}/200/200`} 
                            alt={job.title} 
                            className="w-24 h-24 rounded-2xl object-cover ring-2 ring-white/5 shadow-2xl"
                            referrerPolicy="no-referrer"
                        />
                        {job.urgency === 'URGENT' && (
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
                                {job.address.split(',')[0]}
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
                    <Button className="flex-1 text-xs py-3.5 rounded-xl" onClick={() => handleApplyNow(job)}>Apply Now</Button>
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
      {urgentJobs.length > 0 && (
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
                    <Button className="flex-[3] bg-rose-status hover:bg-rose-600 shadow-xl shadow-rose-500/20 rounded-xl font-black uppercase tracking-widest text-xs py-4" onClick={() => handleApplyNow(job)}>
                        Instant Apply
                    </Button>
                  </div>
                </GlassCard>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};


