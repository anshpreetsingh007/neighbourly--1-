import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Button, GlassCard } from '../../components/UI';
import { User, MapPin, Camera, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/Toast';
import axios from 'axios';
import { uploadImage } from '../../lib/upload';
import { optimizedImage } from '../../lib/images';

export const ProfileSetup: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [firstName, setFirstName] = useState(
    user?.user_metadata?.first_name || (user?.user_metadata?.full_name || '').split(' ')[0] || ''
  );
  const [lastName, setLastName] = useState(
    user?.user_metadata?.last_name ||
      (user?.user_metadata?.full_name || '').split(' ').slice(1).join(' ') ||
      ''
  );
  const [neighbourhood, setNeighbourhood] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(user?.user_metadata?.avatar_url || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      setAvatarUrl(await uploadImage(file, 'neighbourly_avatars'));
    } catch (err) {
      console.error('Avatar upload failed:', err);
      showToast('Could not upload that photo. Please try again.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsLoading(true);
    try {
      await axios.post('/api/users/profile', {
        first_name: firstName,
        last_name: lastName,
        neighbourhood,
        avatar_url: avatarUrl
      });
      navigate('/');
    } catch (err) {
      console.error('Profile update failed:', err);
      showToast('Could not save your profile. Please try again.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full"
      >
        <GlassCard className="p-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-display font-bold mb-2">Complete Profile</h2>
            <p className="text-muted">Just a few more details to get started</p>
          </div>

          <div className="flex justify-center mb-8">
            <div className="relative">
              <div className="w-24 h-24 bg-surface-1 rounded-3xl flex items-center justify-center border-2 border-dashed border-hairline overflow-hidden">
                {avatarUrl ? (
                  <img src={optimizedImage(avatarUrl, { width: 96, height: 96 })} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <User className="w-10 h-10 text-faint" />
                )}
              </div>
              <label className="absolute -bottom-2 -right-2 bg-amber-accent p-2 rounded-xl shadow-lg cursor-pointer hover:scale-110 transition-transform">
                <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={isUploading} />
                {isUploading ? (
                  <Loader2 className="w-4 h-4 text-slate-900 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4 text-slate-900" />
                )}
              </label>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-body ml-1">First Name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-faint" />
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full glass rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-amber-accent/50 transition-all"
                  placeholder="Karan"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-body ml-1">
                Last Name <span className="text-faint font-normal">(optional)</span>
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-faint" />
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full glass rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-amber-accent/50 transition-all"
                  placeholder="Pabla"
                />
              </div>
              <p className="text-xs text-muted ml-1">
                Neighbours see "{firstName.trim() || 'Karan'}
                {lastName.trim() ? ` ${lastName.trim().charAt(0).toUpperCase()}.` : ''}" - your full
                surname is never shown publicly.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-body ml-1">Neighbourhood</label>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-faint" />
                <input
                  type="text"
                  value={neighbourhood}
                  onChange={(e) => setNeighbourhood(e.target.value)}
                  className="w-full glass rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-amber-accent/50 transition-all"
                  placeholder="e.g. Cornerstone, Calgary"
                  required
                />
              </div>
              {/* People were typing their street address here, and it used to be
                  published on every job they posted. Say what this is for. */}
              <p className="text-[11px] text-faint ml-1">
                The general area only — not your street address.
              </p>
            </div>

            <div className="pt-4">
              <Button type="submit" className="w-full" isLoading={isLoading}>
                Finish Setup
              </Button>
            </div>
          </form>
        </GlassCard>
      </motion.div>
    </div>
  );
};
