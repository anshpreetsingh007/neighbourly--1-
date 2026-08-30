import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { Home, Map, PlusCircle, MessageSquare, User } from 'lucide-react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';

export const Layout: React.FC = () => {
  const location = useLocation();

  // A single conversation is a place you are in, not a tab you are browsing -
  // so it takes the whole screen and the bar goes away, the way every
  // messaging app does it. The back arrow in the header is the way out.
  // Note this matches /chat/<id> only; the /chat list keeps its navigation.
  // Post Job deliberately keeps the bar: leaving mid-form is safe now that the
  // draft is saved, so letting someone check the map and come back is a feature.
  const isImmersive = /^\/chat\/[^/]+$/.test(location.pathname);

  const navItems = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: Map, label: 'Map', path: '/map' },
    { icon: PlusCircle, label: 'Post Job', path: '/post-job', isAction: true },
    { icon: MessageSquare, label: 'Chat', path: '/chat' },
    { icon: User, label: 'Account', path: '/account' },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Background blobs for premium feel */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full" />
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-72 h-screen glass border-r border-hairline sticky top-0 p-6 z-50">
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
              {item.path === '/chat' && (
                <div className="ml-auto w-2 h-2 bg-amber-accent rounded-full animate-pulse" />
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto glass p-4 rounded-2xl border border-hairline">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">Premium Plan</p>
              <p className="text-[10px] text-muted">Unlock all features</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={clsx("flex-1 relative z-10 md:pb-0", !isImmersive && "pb-28")}>
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
      <nav className="md:hidden fixed bottom-6 left-6 right-6 h-[72px] glass rounded-3xl flex items-center justify-around px-4 z-50 border border-hairline shadow-2xl">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            // Icon-only, so the label has to reach screen readers some other way.
            aria-label={item.label}
            title={item.label}
            className={({ isActive }) => clsx(
              "relative flex flex-col items-center gap-1 transition-all duration-300",
              // A circle that sits inside the bar rather than a large square
              // breaking out of it: still the most prominent control, but it
              // no longer overlaps the content behind the nav.
              item.isAction
                ? "w-11 h-11 rounded-full bg-amber-accent items-center justify-center shadow-lg shadow-amber-500/25"
                : "p-2",
              isActive && !item.isAction ? "text-amber-accent" : "text-muted"
            )}
          >
            {({ isActive }) => (
              <>
                <item.icon className={clsx(
                  item.isAction ? "text-slate-900 w-5 h-5" : "w-6 h-6",
                  isActive && !item.isAction && "scale-110"
                )} />
                {isActive && !item.isAction && (
                  <motion.div
                    layoutId="nav-indicator-mobile"
                    className="absolute -bottom-1 w-1 h-1 bg-amber-accent rounded-full shadow-[0_0_8px_rgba(245,166,35,0.8)]"
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      )}
    </div>
  );
};

function cn(...inputs: any[]) {
    return clsx(inputs);
}
