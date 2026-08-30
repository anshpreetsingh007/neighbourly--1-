import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/Toast';
import { useTheme, type ThemePreference } from '../../contexts/ThemeContext';
import { GlassCard, Button } from '../../components/UI';
import { Avatar } from '../../components/Avatar';
import axios from 'axios';
import { clsx } from 'clsx';
import {
  Settings,
  Bell,
  CreditCard,
  ShieldCheck,
  LogOut,
  ChevronRight,
  Star,
  Briefcase,
  Sun,
  Moon,
  Monitor
} from 'lucide-react';

export const Account: React.FC = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { preference, setPreference } = useTheme();
  const [profile, setProfile] = React.useState<any>(null);

  React.useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      try {
        const { data } = await axios.get(`/api/users/me`);
        setProfile(data);
      } catch (err) {
        console.error('Failed to fetch profile:', err);
      }
    };
    fetchProfile();
  }, [user]);

  // Settings and Notifications are real pages. Payments and ID Verification
  // are real roadmap items (the schema already has stripe_customer_id and
  // is_id_verified) but need a Stripe/KYC vendor wired up before they can do
  // anything - so they say so honestly instead of pretending to work.
  const menuItems = [
    { icon: Settings, label: 'Settings', color: 'text-muted', path: '/account/settings' },
    { icon: Bell, label: 'Notifications', color: 'text-sky-status', path: '/account/notifications' },
    { icon: CreditCard, label: 'Payments & Payouts', color: 'text-amber-accent', path: null },
    { icon: ShieldCheck, label: 'ID Verification', color: 'text-emerald-status', path: null },
  ];

  const handleMenuClick = (item: (typeof menuItems)[number]) => {
    if (item.path) {
      navigate(item.path);
    } else {
      showToast(`${item.label} isn't available yet - coming soon.`);
    }
  };

  return (
    <div className="p-6 space-y-8">
      {/* Profile Header */}
      <section className="flex flex-col items-center text-center space-y-4">
        <div className="relative">
          <div className="border-4 border-hairline shadow-2xl rounded-[40px]">
            <Avatar
              name={profile?.name || user?.user_metadata?.full_name}
              avatarUrl={profile?.avatar_url || user?.user_metadata?.avatar_url}
              seed={user?.id}
              size="profile"
            />
          </div>
          {profile?.is_id_verified && (
            <div className="absolute -bottom-2 -right-2 bg-emerald-status p-2 rounded-2xl shadow-lg border-4 border-panel">
              <ShieldCheck className="w-5 h-5 text-slate-900" />
            </div>
          )}
        </div>

        <div>
          <h1 className="text-3xl font-display font-bold">{profile?.name || user?.user_metadata?.full_name || 'Neighbour'}</h1>
          <p className="text-muted font-medium">
            {profile?.neighbourhood || 'Neighbourhood not set'} • Member since {new Date(user?.created_at || Date.now()).getFullYear()}
          </p>
        </div>

        <div className="flex gap-4 w-full">
          <GlassCard className="flex-1 p-4 flex flex-col items-center gap-1">
            <span className="text-2xl font-display font-bold text-amber-accent">
              {profile?.avg_rating ? profile.avg_rating.toFixed(1) : '—'}
            </span>
            <div className="flex gap-0.5">
              {[1,2,3,4,5].map(i => <Star key={i} className="w-3 h-3 fill-amber-accent text-amber-accent" />)}
            </div>
            <span className="text-[10px] font-bold text-faint uppercase">
              {profile?.reviews_count ? `${profile.reviews_count} Reviews` : 'No Ratings Yet'}
            </span>
          </GlassCard>
          <GlassCard className="flex-1 p-4 flex flex-col items-center gap-1">
            <span className="text-2xl font-display font-bold text-sky-status">{profile?.jobs_posted_count ?? 0}</span>
            <Briefcase className="w-4 h-4 text-sky-status" />
            <span className="text-[10px] font-bold text-faint uppercase">Jobs Posted</span>
          </GlassCard>
        </div>
      </section>

      {/* Appearance */}
      <section className="space-y-3">
        <GlassCard className="p-4 space-y-3">
          <p className="font-bold text-sm">Appearance</p>
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: 'light', label: 'Light', Icon: Sun },
              { value: 'dark', label: 'Dark', Icon: Moon },
              { value: 'system', label: 'System', Icon: Monitor },
            ] as { value: ThemePreference; label: string; Icon: React.ElementType }[]).map(
              ({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPreference(value)}
                  aria-pressed={preference === value}
                  className={clsx(
                    'flex flex-col items-center gap-2 py-4 rounded-2xl border transition-all active:scale-95',
                    preference === value
                      ? 'bg-amber-accent text-slate-900 border-amber-accent font-bold'
                      : 'glass text-muted hover:text-strong'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[11px] font-black uppercase tracking-widest">{label}</span>
                </button>
              )
            )}
          </div>
        </GlassCard>
      </section>

      {/* Menu */}
      <section className="space-y-3">
        <GlassCard hover className="p-4 flex items-center justify-between cursor-pointer">
          <button
            type="button"
            onClick={() => navigate('/my-jobs')}
            className="flex-1 flex items-center justify-between text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-accent/50 rounded-xl"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-surface-1 text-amber-accent">
                <Briefcase className="w-6 h-6" />
              </div>
              <span className="font-bold">Your Jobs &amp; Applicants</span>
            </div>
            <ChevronRight className="w-5 h-5 text-faint" />
          </button>
        </GlassCard>

        {menuItems.map((item) => (
          <GlassCard
            key={item.label}
            hover
            className="p-4 flex items-center justify-between cursor-pointer"
          >
            <button
              type="button"
              onClick={() => handleMenuClick(item)}
              className="flex-1 flex items-center justify-between text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-accent/50 rounded-xl"
            >
              <div className="flex items-center gap-4">
                <div className={clsx("p-3 rounded-xl bg-surface-1", item.color)}>
                  <item.icon className="w-6 h-6" />
                </div>
                <span className="font-bold">{item.label}</span>
              </div>
              <ChevronRight className="w-5 h-5 text-faint" />
            </button>
          </GlassCard>
        ))}
      </section>

      {/* Logout */}
      <Button
        variant="danger"
        className="w-full py-4 rounded-2xl gap-3"
        onClick={signOut}
      >
        <LogOut className="w-5 h-5" />
        Sign Out
      </Button>

      <div className="text-center space-y-1">
        <p className="text-[10px] font-bold text-faint uppercase tracking-widest">Neighbourly</p>
        <p className="text-[10px] font-bold text-faint uppercase tracking-widest">Made with ❤️ for the community</p>
      </div>
    </div>
  );
};
