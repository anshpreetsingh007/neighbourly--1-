import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProfileProvider, useProfile } from './contexts/ProfileContext';
import { Welcome } from './screens/auth/Welcome';
import { SignIn } from './screens/auth/SignIn';
import { AuthCallback } from './screens/auth/AuthCallback';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { ThemeProvider } from './contexts/ThemeContext';
import { NotFound } from './screens/NotFound';

// Code-split everything behind the auth wall. Map and Post Job alone pull in
// react-leaflet, which used to ship to every visitor on first load whether or
// not they ever opened the map - lazy() means the browser only fetches a
// screen's JS the first time someone actually navigates to it.
const Home = lazy(() => import('./screens/app/Home').then(m => ({ default: m.Home })));
const MapView = lazy(() => import('./screens/app/MapView').then(m => ({ default: m.MapView })));
const PostJob = lazy(() => import('./screens/app/PostJob').then(m => ({ default: m.PostJob })));
const ChatList = lazy(() => import('./screens/app/ChatList').then(m => ({ default: m.ChatList })));
const ChatThread = lazy(() => import('./screens/app/ChatThread').then(m => ({ default: m.ChatThread })));
const Account = lazy(() => import('./screens/app/Account').then(m => ({ default: m.Account })));
const Settings = lazy(() => import('./screens/app/Settings').then(m => ({ default: m.Settings })));
const Notifications = lazy(() => import('./screens/app/Notifications').then(m => ({ default: m.Notifications })));
const MyJobs = lazy(() => import('./screens/app/MyJobs').then(m => ({ default: m.MyJobs })));
const JobDetail = lazy(() => import('./screens/app/JobDetail').then(m => ({ default: m.JobDetail })));
const ProfileSetup = lazy(() => import('./screens/auth/ProfileSetup').then(m => ({ default: m.ProfileSetup })));

const RouteFallback = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="w-10 h-10 border-4 border-amber-accent border-t-transparent rounded-full animate-spin" />
  </div>
);

const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { session, isLoading } = useAuth();
  const { profile, isLoading: isProfileLoading } = useProfile();
  const location = useLocation();

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

  // Wait for the one profile fetch ProfileProvider already kicked off rather
  // than firing a second request of our own on every route change - refetch()
  // (called by ProfileSetup/Settings right after they save) is what keeps
  // this from ever going stale, not re-checking on navigation.
  if (isProfileLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-12 h-12 border-4 border-amber-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Only a missing name blocks entry. Location is asked for later, at the
  // point it actually buys the user something (posting or applying) -
  // demanding it up front is friction before they have seen a single job.
  const needsProfileSetup = !profile?.first_name;
  if (needsProfileSetup && location.pathname !== '/profile-setup') {
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
        <ProfileProvider>
        <Router>
        <Suspense fallback={<RouteFallback />}>
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
            <Route path="jobs/:id" element={<JobDetail />} />
            <Route path="jobs/:id/edit" element={<PostJob />} />
            <Route path="profile-setup" element={<ProfileSetup />} />
            {/* Add more routes here */}
          </Route>


          {/* Catch all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        </Router>
        </ProfileProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
