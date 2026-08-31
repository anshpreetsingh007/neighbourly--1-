import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { GlassCard, Button } from '../../components/UI';
import { ChevronLeft, User, MapPin, Camera, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/Toast';
import axios from 'axios';
import { optimizedImage } from '../../lib/images';

export const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [neighbourhood, setNeighbourhood] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      try {
        const { data } = await axios.get('/api/users/me');
        setFirstName(data?.first_name || '');
        setLastName(data?.last_name || '');
        setNeighbourhood(data?.neighbourhood || '');
        setBio(data?.bio || '');
        setAvatarUrl(data?.avatar_url || '');
      } catch (err) {
        console.error('Failed to fetch profile:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProfile();
  }, [user]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const { data: signData } = await axios.post('/api/uploads/sign', { folder: 'neighbourly_avatars' });
      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', signData.api_key);
      formData.append('timestamp', signData.timestamp);
      formData.append('signature', signData.signature);
      formData.append('folder', signData.folder);

      const { data: uploadData } = await axios.post(
        `https://api.cloudinary.com/v1_1/${signData.cloud_name}/image/upload`,
        formData
      );

      setAvatarUrl(uploadData.secure_url);
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
    if (!firstName.trim()) {
      setError('First name is required.');
      return;
    }
    if (!neighbourhood.trim()) {
      setError('Neighbourhood is required.');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await axios.post('/api/users/profile', {
        first_name: firstName,
        last_name: lastName,
        neighbourhood,
        bio,
        avatar_url: avatarUrl
      });
      showToast('Profile updated.', 'success');
      navigate('/account');
    } catch (err) {
      console.error('Failed to save settings:', err);
      setError('Failed to save your changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-10 h-10 text-amber-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 min-h-screen">
      <header className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/account')} aria-label="Back to account" className="p-2 glass rounded-xl">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-3xl font-display font-bold">Settings</h1>
      </header>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md mx-auto">
        <GlassCard className="p-8">
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

          {error && (
            <div className="bg-rose-status/20 border border-rose-status/50 text-rose-status p-3 rounded-xl mb-6 text-sm">
              {error}
            </div>
          )}

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
                />
              </div>
              <p className="text-[11px] text-faint ml-1">
                The general area only — not your street address.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-body ml-1">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full glass rounded-xl py-3 px-4 h-24 focus:outline-none focus:ring-2 focus:ring-amber-accent/50 transition-all"
                placeholder="Tell your neighbours a bit about yourself"
              />
            </div>

            <div className="pt-4">
              <Button type="submit" className="w-full" isLoading={isSaving}>
                Save Changes
              </Button>
            </div>
          </form>
        </GlassCard>
      </motion.div>
    </div>
  );
};
