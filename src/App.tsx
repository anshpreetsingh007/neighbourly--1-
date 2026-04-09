import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Welcome } from './screens/auth/Welcome';
import { SignIn } from './screens/auth/SignIn';
import { Home } from './screens/app/Home';
import { MapView } from './screens/app/MapView';
import { PostJob } from './screens/app/PostJob';
import { ChatList } from './screens/app/ChatList';
import { ChatThread } from './screens/app/ChatThread';
import { Account } from './screens/app/Account';
import { ProfileSetup } from './screens/auth/ProfileSetup';
import { AuthCallback } from './screens/auth/AuthCallback';
import { Layout } from './components/Layout';

const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { session, isLoading } = useAuth();

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

  return <>{children}</>;
};

export default function App() {
  return (
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
            <Route path="profile-setup" element={<ProfileSetup />} />
            {/* Add more routes here */}
          </Route>


          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

