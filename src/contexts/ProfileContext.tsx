import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';

interface ProfileContextType {
  /** null while loading, once signed out, or if the fetch failed. */
  profile: any | null;
  isLoading: boolean;
  /**
   * True when the last attempt failed. Callers must not read a null profile as
   * "this account has no profile" - see AuthGuard, which would otherwise send
   * someone with a perfectly complete profile to the setup screen the moment
   * one request lost the network.
   */
  loadFailed: boolean;
  /** Re-fetches and returns the fresh profile - call after any write (Settings,
   *  ProfileSetup, a quick avatar change) so every screen using this context
   *  updates immediately instead of showing stale data until next reload. */
  refetch: () => Promise<any | null>;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

/**
 * A single cached copy of "who am I" for the whole app.
 *
 * Before this, half a dozen screens each called GET /api/users/me
 * independently - once per mount, and once per navigation from the auth
 * guard - which meant every route change did a real DB round trip just to
 * re-confirm the same identity that was already known. This fetches it once
 * per session and shares it, and callers that just changed the profile
 * (Settings, ProfileSetup, an avatar swap) call refetch() to push the update
 * out everywhere at once.
 */
export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const refetch = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoadFailed(false);
      setIsLoading(false);
      return null;
    }
    try {
      const { data } = await axios.get('/api/users/me');
      setProfile(data);
      setLoadFailed(false);
      return data;
    } catch (err) {
      console.error('Failed to load profile:', err);
      setLoadFailed(true);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setIsLoading(true);
    refetch();
    // Only the identity should trigger a refetch here - refetch() itself is
    // recreated whenever `user` changes, which would otherwise loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return (
    <ProfileContext.Provider value={{ profile, isLoading, loadFailed, refetch }}>
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
};
