import React, { useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Welcome } from './screens/auth/Welcome';
import { SignIn } from './screens/auth/SignIn';
import { Home } from './screens/app/Home';
import { MapView } from './screens/app/MapView';
import { PostJob } from './screens/app/PostJob';
import { ChatList } from './screens/app/ChatList';
import { ChatThread } from './screens/app/ChatThread';
import { Account } from './screens/app/Account';
import { Settings } from './screens/app/Settings';
import { Notifications } from './screens/app/Notifications';
import { MyJobs } from './screens/app/MyJobs';
import { ProfileSetup } from './screens/auth/ProfileSetup';
import { AuthCallback } from './screens/auth/AuthCallback';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { ThemeProvider } from './contexts/ThemeContext';
import { NotFound } from './screens/NotFound';

const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { session, user, isLoading } = useAuth();
  const location = useLocation();
  const [isCheckingProfile, setIsCheckingProfile] = useState(true);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const hasCheckedOnce = useRef(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setIsCheckingProfile(true);
    axios.get('/api/users/me')
      .then(({ data }) => {
        // Only a missing name blocks entry. Location is asked for later, at the
        // point it actually buys the user something (posting or applying) -
        // demanding it up front is friction before they have seen a single job.
        if (!cancelled) setNeedsProfileSetup(!data?.first_name);
      })
      .catch(() => {
        if (!cancelled) setNeedsProfileSetup(false);
      })
      .finally(() => {
        if (cancelled) return;
        hasCheckedOnce.current = true;
        setIsCheckingProfile(false);
      });
    return () => { cancelled = true; };
    // Re-check on every route change so the flag cannot go stale.
  }, [user, location.pathname]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-12 h-12 border-4 border-amber-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/welcome" replace />;
  }

  // First check of the session: wait for the answer rather than flashing the app.
  if (isCheckingProfile && !hasCheckedOnce.current) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-12 h-12 border-4 border-amber-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Only redirect on a settled answer. Acting while a re-check is in flight
  // bounced users straight back here after saving - the flag still said
  // "incomplete" because the fetch had not returned yet.
  if (!isCheckingProfile && needsProfileSetup && location.pathname !== '/profile-setup') {
    return <Navigate to="/profile-setup" replace />;
  }

  return <>{children}</>;
};

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
        <AuthProvider>
        <Router>
        <Routes>
          {/* Auth Routes */}
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Protected Routes */}
          <Route path="/" element={
            <AuthGuard>
              <Layout />
            </AuthGuard>
          }>
            <Route index element={<Home />} />
            <Route path="map" element={<MapView />} />
            <Route path="post-job" element={<PostJob />} />
            <Route path="chat" element={<ChatList />} />
            <Route path="chat/:id" element={<ChatThread />} />
            <Route path="account" element={<Account />} />
            <Route path="account/settings" element={<Settings />} />
            <Route path="account/notifications" element={<Notifications />} />
            <Route path="my-jobs" element={<MyJobs />} />
            <Route path="profile-setup" element={<ProfileSetup />} />
            {/* Add more routes here */}
          </Route>


          {/* Catch all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Router>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
