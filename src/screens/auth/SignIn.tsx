import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Button, GlassCard } from '../../components/UI';
import { useToast } from '../../components/Toast';
import { Mail, Lock, Chrome, Facebook, Apple } from 'lucide-react';

export const SignIn: React.FC = () => {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { showToast } = useToast();

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        navigate('/');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Lands in user_metadata, which getOrCreateDbUser() reads on the
          // server to build the profile - no extra request needed.
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          },
        },
      });
      if (error) {
        setError(error.message);
        setIsLoading(false);
      } else {
        // Supabase might require email confirmation
        setSentTo(email);
        setIsLoading(false);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
        setIsLoading(false);
      } else {
        navigate('/');
      }
    }
  };

  const handleOAuthSignIn = async (provider: 'google' | 'facebook' | 'apple') => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        skipBrowserRedirect: true,
      }
    });
    
    if (error) {
      setError(error.message);
      return;
    }

    if (data?.url) {
      const authWindow = window.open(data.url, 'oauth_popup', 'width=600,height=700');
      if (!authWindow) {
        showToast('Please allow popups to sign in with Google.');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full"
      >
        <GlassCard className="p-8">
          <h2 className="text-3xl font-display font-bold mb-2">
            {isSignUp ? 'Create Account' : 'Welcome Back'}
          </h2>
          <p className="text-muted mb-8">
            {isSignUp ? 'Join the Neighbourly community' : 'Sign in to continue to Neighbourly'}
          </p>

          {/* Persistent rather than a toast: the user has to leave the app,
              open their inbox and come back, so this must still be here when
              they return. */}
          {sentTo && (
            <div className="bg-emerald-status/15 border border-emerald-status/40 text-emerald-status p-4 rounded-xl mb-6 text-sm space-y-1">
              <p className="font-bold">Check your inbox</p>
              <p className="opacity-80 leading-relaxed">
                We sent a confirmation link to <span className="font-bold">{sentTo}</span>. Click it
                to finish setting up your account.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-rose-status/20 border border-rose-status/50 text-rose-status p-3 rounded-xl mb-6 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            {isSignUp && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-body ml-1">First Name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full bg-surface-1 border border-hairline rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-amber-accent/50 transition-all"
                    placeholder="Karan"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-body ml-1">
                    Last Name <span className="text-faint font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full bg-surface-1 border border-hairline rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-amber-accent/50 transition-all"
                    placeholder="Pabla"
                  />
                </div>
              </div>
            )}

            {isSignUp && (
              <p className="text-xs text-muted ml-1 -mt-1">
                Neighbours will see you as "{firstName.trim() || 'Karan'}
                {lastName.trim() ? ` ${lastName.trim().charAt(0).toUpperCase()}.` : ''}"
              </p>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-body ml-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-faint" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setSentTo(null); }}
                  className="w-full bg-surface-1 border border-hairline rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-amber-accent/50 transition-all"
                  placeholder="name@example.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-body ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-faint" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-surface-1 border border-hairline rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-amber-accent/50 transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full" isLoading={isLoading}>
              {isSignUp ? 'Sign Up' : 'Sign In'}
            </Button>
          </form>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-hairline"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-panel px-2 text-faint">Or continue with</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Button variant="secondary" className="p-3" onClick={() => handleOAuthSignIn('google')}>
              <Chrome className="w-5 h-5" />
            </Button>
            <Button variant="secondary" className="p-3" onClick={() => handleOAuthSignIn('facebook')}>
              <Facebook className="w-5 h-5" />
            </Button>
            <Button variant="secondary" className="p-3" onClick={() => handleOAuthSignIn('apple')}>
              <Apple className="w-5 h-5" />
            </Button>
          </div>

          <p className="mt-8 text-center text-sm text-muted">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button 
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-amber-accent font-bold hover:underline"
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        </GlassCard>
      </motion.div>
    </div>
  );
};
