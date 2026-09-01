import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ErrorBoundary } from './ErrorBoundary';
import { Avatar } from './Avatar';
import { Skeleton } from './Skeleton';
import { Home, Map, PlusCircle, MessageSquare, User } from 'lucide-react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../hooks/useSocket';

function cn(...inputs: any[]) {
    return clsx(inputs);
}

export const Layout: React.FC = () => {
  const location = useLocation();

  // A single conversation is a place you are in, not a tab you are browsing, so
  // it takes the whole screen and the bar goes away - the back arrow in the
  // header is the way out. Matches /chat/<id> only; the /chat list keeps its
  // navigation, and Post Job keeps it too now that the draft is autosaved.
  const isImmersive = /^\/chat\/[^/]+$/.test(location.pathname);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  // The card falls back to 'Your Account' and an initials avatar while the
  // profile is in flight, so without this it paints a stranger's placeholder
  // for a moment on every load.
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const socket = useSocket('notifications');

  useEffect(() => {
    if (!user) return;
    axios
      .get('/api/users/me')
      .then(({ data }) => setProfile(data))
      .catch(() => {})
      .finally(() => setIsLoadingProfile(false));
    axios.get('/api/notifications').then(({ data }) => setNotifications(data)).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!socket) return;
    socket.on('notification', (notification: any) => {
      setNotifications(prev => [notification, ...prev]);
      // A message that arrives while you are looking at something else lights
      // the dot immediately, without waiting for the next refetch.
      if (notification?.type === 'MESSAGE') setUnreadMessages(prev => prev + 1);
    });
    return () => { socket.off('notification'); };
  }, [socket]);

  /**
   * The chat dot used to read `notifications.some(n => n.type === 'MESSAGE')`,
   * which never cleared: opening a thread marks the *messages* read, and the
   * notification row stays unread forever. Count the messages themselves.
   *
   * Refetched on every navigation, which is what clears the dot on the way out
   * of a thread - ChatThread emits mark_read on open, so by the time you are
   * back on another screen the server count has already dropped.
   */
  useEffect(() => {
    if (!user) return;
    axios
      .get('/api/messages/unread-count')
      .then(({ data }) => setUnreadMessages(data.count ?? 0))
      .catch(() => {});
  }, [user, location.pathname]);

  const hasUnreadMessages = unreadMessages > 0;
  const hasUnreadOther = notifications.some(n => n.type !== 'MESSAGE' && !n.read_at);

  const navItems = [
    { icon: Home, label: 'Home', path: '/', dot: false },
    { icon: Map, label: 'Map', path: '/map', dot: false },
    { icon: PlusCircle, label: 'Post Job', path: '/post-job', isAction: true, dot: false },
    { icon: MessageSquare, label: 'Chat', path: '/chat', dot: hasUnreadMessages },
    { icon: User, label: 'Account', path: '/account', dot: hasUnreadOther },
  ];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Background blobs for premium feel */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full" />
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-72 h-screen glass border-r border-hairline sticky top-0 p-6 z-50">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-10 h-10 bg-amber-accent rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
            <PlusCircle className="text-slate-900 w-6 h-6" />
          </div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Neighbourly</h1>
        </div>

        <nav className="flex-1 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => cn(
                "flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 group",
                isActive
                  ? "bg-surface-2 text-amber-accent shadow-inner border border-hairline"
                  : "text-muted hover:text-body hover:bg-surface-1"
              )}
            >
              <item.icon className={cn(
                "w-5 h-5 transition-transform group-hover:scale-110",
                item.isAction && "text-amber-accent"
              )} />
              <span className="font-bold text-sm tracking-wide">{item.label}</span>
              {item.dot && (
                <div className="ml-auto w-2 h-2 bg-amber-accent rounded-full animate-pulse" />
              )}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={() => navigate('/account')}
          className="mt-auto glass p-4 rounded-2xl border border-hairline hover:bg-surface-2 transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-accent/50"
        >
          {isLoadingProfile ? (
            <div className="flex items-center gap-3">
              <Skeleton className="w-11 h-11 rounded-2xl shrink-0" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <Skeleton className="h-3.5 w-24 rounded" />
                <Skeleton className="h-2.5 w-16 rounded" />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Avatar
                name={profile?.name || user?.user_metadata?.full_name}
                avatarUrl={profile?.avatar_url || user?.user_metadata?.avatar_url}
                seed={user?.id}
                size="md"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{profile?.name || user?.user_metadata?.full_name || 'Your Account'}</p>
                <p className="text-[10px] text-muted truncate">{profile?.neighbourhood || 'View profile'}</p>
              </div>
            </div>
          )}
        </button>
      </aside>

      {/* Main Content */}
      <main className={clsx("flex-1 relative z-10 lg:pb-0", !isImmersive && "pb-28")}>
        <div className="max-w-6xl mx-auto">
          {/* Keyed on the path so the boundary resets when you navigate away,
              rather than trapping the user on the error screen. */}
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      {!isImmersive && (
      <nav className="lg:hidden fixed bottom-6 left-4 right-4 sm:left-6 sm:right-6 h-[68px] glass rounded-full flex items-center justify-around px-3 z-50 border border-hairline shadow-2xl">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            // Icon-only, so the label has to reach screen readers some other way.
            aria-label={item.label}
            title={item.label}
            className={({ isActive }) => clsx(
              "relative flex items-center justify-center transition-colors duration-300",
              // A circle inside the bar rather than a large square breaking out
              // of it: still the most prominent control, but it no longer
              // overlaps the content behind the nav.
              item.isAction
                ? "w-11 h-11 rounded-full bg-amber-accent shadow-lg shadow-amber-500/25"
                : "px-5 py-2.5 rounded-full",
              isActive && !item.isAction ? "text-amber-accent" : "text-muted"
            )}
          >
            {({ isActive }) => (
              <>
                {/* A capsule behind the active icon rather than a dot beneath
                    it: the dot was one 4px pixel of feedback on a 68px bar.
                    layoutId makes it slide between tabs instead of blinking. */}
                {isActive && !item.isAction && (
                  <motion.span
                    layoutId="nav-pill"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    className="absolute inset-0 rounded-full bg-surface-2"
                  />
                )}
                <span className="relative z-10">
                  <item.icon className={clsx(item.isAction ? "text-slate-900 w-5 h-5" : "w-6 h-6")} />
                  {item.dot && !item.isAction && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-accent rounded-full shadow-[0_0_6px_rgba(245,166,35,0.8)]" />
                  )}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      )}
    </div>
  );
};
