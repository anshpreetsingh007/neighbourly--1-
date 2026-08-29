import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlassCard, Button } from '../../components/UI';
import { ChevronLeft, Bell, MessageSquare, Briefcase, Loader2, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../hooks/useSocket';
import axios from 'axios';

const ICONS: Record<string, React.ElementType> = {
  MESSAGE: MessageSquare,
  APPLICATION: Briefcase,
};

export const Notifications: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const socket = useSocket('notifications');

  const fetchNotifications = async () => {
    if (!user) return;
    setIsLoading(true);
    setLoadError(false);
    try {
      const { data } = await axios.get('/api/notifications');
      setNotifications(data);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [user]);

  useEffect(() => {
    // The server joins this socket to its own notification room automatically
    // once the connection is authenticated, so there's nothing to emit here.
    if (!socket) return;

    socket.on('notification', (notification: any) => {
      setNotifications(prev => [notification, ...prev]);
    });

    return () => {
      socket.off('notification');
    };
  }, [socket]);

  const handleClick = async (notification: any) => {
    if (!notification.read_at) {
      setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n));
      axios.post(`/api/notifications/${notification.id}/read`).catch(err => console.error('Failed to mark read:', err));
    }
    try {
      const data = notification.data ? JSON.parse(notification.data) : null;
      if (data?.conversation_id) navigate(`/chat/${data.conversation_id}`);
    } catch (err) {
      console.error('Failed to parse notification data:', err);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center gap-4">
        <button onClick={() => navigate('/account')} className="p-2 glass rounded-xl">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-3xl font-display font-bold">Notifications</h1>
      </header>

      <div className="space-y-3">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
            <Loader2 className="w-8 h-8 text-amber-accent animate-spin" />
            <p className="text-sm font-bold uppercase tracking-widest">Loading...</p>
          </div>
        ) : loadError ? (
          <div className="text-center py-20 glass rounded-3xl border border-dashed border-rose-status/30 space-y-4">
            <AlertTriangle className="w-8 h-8 text-rose-status mx-auto" />
            <p className="text-white/40 font-bold uppercase tracking-widest text-sm">Couldn't load notifications</p>
            <Button variant="secondary" size="sm" onClick={fetchNotifications}>Retry</Button>
          </div>
        ) : notifications.length > 0 ? (
          notifications.map((notification) => {
            const Icon = ICONS[notification.type] || Bell;
            return (
              <GlassCard
                key={notification.id}
                hover
                className="p-4 flex items-start gap-4 cursor-pointer border border-white/5"
              >
                <button
                  type="button"
                  onClick={() => handleClick(notification)}
                  className="w-full flex items-start gap-4 text-left focus:outline-none"
                >
                  <div className="bg-amber-accent/10 p-3 rounded-xl shrink-0">
                    <Icon className="w-5 h-5 text-amber-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-bold truncate">{notification.title}</h4>
                      {!notification.read_at && (
                        <div className="w-2 h-2 bg-amber-accent rounded-full shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-white/50 mt-1">{notification.body}</p>
                    <p className="text-[10px] text-white/30 font-bold uppercase tracking-tighter mt-2">
                      {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </button>
              </GlassCard>
            );
          })
        ) : (
          <div className="text-center py-20 glass rounded-3xl border border-dashed border-white/10">
            <div className="bg-white/5 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Bell className="w-8 h-8 text-white/20" />
            </div>
            <p className="text-white/30 font-bold uppercase tracking-widest text-sm">No Notifications Yet</p>
            <p className="text-[10px] text-white/10 mt-1 uppercase tracking-tight">We'll let you know when something happens</p>
          </div>
        )}
      </div>
    </div>
  );
};
