import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Button, GlassCard } from '../../components/UI';
import { User, MapPin, Camera, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';

export const ProfileSetup: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [name, setName] = useState(user?.user_metadata?.full_name || '');
  const [neighbourhood, setNeighbourhood] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(user?.user_metadata?.avatar_url || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const { data: signData } = await axios.post('/api/uploads/sign');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', signData.api_key);
      formData.append('timestamp', signData.timestamp);
      formData.append('signature', signData.signature);
      formData.append('folder', 'neighbourly_avatars');

      const { data: uploadData } = await axios.post(
        `https://api.cloudinary.com/v1_1/${signData.cloud_name}/image/upload`,
        formData
      );

      setAvatarUrl(uploadData.secure_url);
    } catch (err) {
      console.error('Avatar upload failed:', err);
      alert('Failed to upload avatar.');
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
        supabase_uid: user.id,
        email: user.email,
        name,
        neighbourhood,
        avatar_url: avatarUrl
      });
      navigate('/');
    } catch (err) {
      console.error('Profile update failed:', err);
      alert('Failed to save profile. Please try again.');
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
            <p className="text-white/50">Just a few more details to get started</p>
          </div>

          <div className="flex justify-center mb-8">
            <div className="relative">
              <div className="w-24 h-24 bg-white/5 rounded-3xl flex items-center justify-center border-2 border-dashed border-white/20 overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <User className="w-10 h-10 text-white/20" />
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
              <label className="text-sm font-medium text-white/70 ml-1">Full Name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full glass rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-amber-accent/50 transition-all"
                  placeholder="John Doe"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-white/70 ml-1">Neighbourhood</label>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                <input
                  type="text"
                  value={neighbourhood}
                  onChange={(e) => setNeighbourhood(e.target.value)}
                  className="w-full glass rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-amber-accent/50 transition-all"
                  placeholder="e.g. Downtown, Brooklyn"
                  required
                />
              </div>
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
