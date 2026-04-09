import React from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { GlassCard, Button } from '../../components/UI';
import axios from 'axios';
import { 
  Settings, 
  Bell, 
  CreditCard, 
  ShieldCheck, 
  LogOut, 
  ChevronRight, 
  Star, 
  Briefcase,
  Smartphone
} from 'lucide-react';

export const Account: React.FC = () => {
  const { user, signOut } = useAuth();
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

  const menuItems = [
    { icon: Settings, label: 'Settings', color: 'text-white/50' },
    { icon: Bell, label: 'Notifications', color: 'text-sky-status' },
    { icon: CreditCard, label: 'Payments & Payouts', color: 'text-amber-accent' },
    { icon: ShieldCheck, label: 'ID Verification', color: 'text-emerald-status' },
    { icon: Smartphone, label: 'Connected Devices', color: 'text-white/50' },
  ];

  return (
    <div className="p-6 space-y-8">
      {/* Profile Header */}
      <section className="flex flex-col items-center text-center space-y-4">
        <div className="relative">
          <div className="w-32 h-32 rounded-[40px] overflow-hidden border-4 border-white/10 shadow-2xl">
            <img 
              src={user?.user_metadata?.avatar_url || "https://picsum.photos/seed/user/200/200"} 
              alt="Profile" 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          {profile?.is_id_verified && (
            <div className="absolute -bottom-2 -right-2 bg-emerald-status p-2 rounded-2xl shadow-lg border-4 border-[#1a1a2e]">
              <ShieldCheck className="w-5 h-5 text-slate-900" />
            </div>
          )}
        </div>
        
        <div>
          <h1 className="text-3xl font-display font-bold">{user?.user_metadata?.full_name || 'Anshpreet Singh'}</h1>
          <p className="text-white/50 font-medium">
            {profile?.neighbourhood || 'Downtown, Brooklyn'} • Member since {new Date(user?.created_at || Date.now()).getFullYear()}
          </p>
        </div>

        <div className="flex gap-4 w-full">
          <GlassCard className="flex-1 p-4 flex flex-col items-center gap-1">
            <span className="text-2xl font-display font-bold text-amber-accent">4.9</span>
            <div className="flex gap-0.5">
              {[1,2,3,4,5].map(i => <Star key={i} className="w-3 h-3 fill-amber-accent text-amber-accent" />)}
            </div>
            <span className="text-[10px] font-bold text-white/30 uppercase">Rating</span>
          </GlassCard>
          <GlassCard className="flex-1 p-4 flex flex-col items-center gap-1">
            <span className="text-2xl font-display font-bold text-sky-status">24</span>
            <Briefcase className="w-4 h-4 text-sky-status" />
            <span className="text-[10px] font-bold text-white/30 uppercase">Jobs Done</span>
          </GlassCard>
        </div>
      </section>

      {/* Menu */}
      <section className="space-y-3">
        {menuItems.map((item) => (
          <GlassCard key={item.label} hover className="p-4 flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-4">
              <div className={clsx("p-3 rounded-xl bg-white/5", item.color)}>
                <item.icon className="w-6 h-6" />
              </div>
              <span className="font-bold">{item.label}</span>
            </div>
            <ChevronRight className="w-5 h-5 text-white/20" />
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
        <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Neighbourly v1.0.4</p>
        <p className="text-[10px] font-bold text-white/10 uppercase tracking-widest">Made with ❤️ for the community</p>
      </div>
    </div>
  );
};

import { clsx } from 'clsx';
