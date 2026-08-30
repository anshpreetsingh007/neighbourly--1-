import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard, Button } from '../../components/UI';
import { Avatar } from '../../components/Avatar';
import { useToast } from '../../components/Toast';
import {
  ChevronLeft,
  Send,
  Camera,
  MoreVertical,
  Flag,
  Check,
  CheckCheck,
  Loader2,
  MessageSquare,
  AlertTriangle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useSocket } from '../../hooks/useSocket';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { format } from 'date-fns';

const ReportDialog: React.FC<{ targetName: string; onCancel: () => void; onSubmit: (reason: string) => Promise<void> }> = ({
  targetName,
  onCancel,
  onSubmit,
}) => {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit(reason.trim());
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xl p-6"
      onClick={() => !isSubmitting && onCancel()}
    >
      <motion.div
        initial={{ y: 20, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="glass backdrop-blur-3xl w-full max-w-sm rounded-3xl border border-hairline p-6 space-y-4 shadow-2xl"
      >
        <div>
          <h2 className="text-lg font-display font-bold">Report {targetName}</h2>
          <p className="text-muted text-sm mt-1">
            Tell us what happened. This goes to our moderation queue, not to them.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            maxLength={1000}
            required
            autoFocus
            placeholder="What went wrong?"
            className="w-full bg-surface-1 border border-hairline rounded-xl py-3 px-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-accent/50 transition-all"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="flex-1 glass hover:bg-surface-2 rounded-2xl py-3 font-bold text-sm transition-all active:scale-95 disabled:opacity-50"
            >
              Cancel
            </button>
            <Button type="submit" className="flex-1" isLoading={isSubmitting} disabled={!reason.trim()}>
              Submit report
            </Button>
          </div>
        </form>
      </motion.div>
    </div>,
    document.body
  );
};

export const ChatThread: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [messages, setMessages] = useState<any[]>([]);
  // Our internal DB id. Messages carry sender_id (a User.id), and the sender
  // object no longer exposes supabase_uid, so this is what we compare against.
  const [meId, setMeId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const socket = useSocket('chat');

  const fetchMessages = async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const { data } = await axios.get(`/api/conversations/${id}/messages`);
      setMessages(data);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [id]);

  useEffect(() => {
    if (!user) return;
    axios.get('/api/users/me')
      .then(({ data }) => setMeId(data?.id ?? null))
      .catch(err => console.error('Failed to resolve current user:', err));
  }, [user]);

  useEffect(() => {
    if (socket && id) {
      socket.emit('join_room', id);
      // Tell the server we've seen everything so far - it flips the sender's
      // checkmarks to "read" and broadcasts that back to the room.
      socket.emit('mark_read', id);

      socket.on('receive_message', (message: any) => {
        setMessages(prev => [...prev, message]);
        socket.emit('mark_read', id);
      });

      socket.on('messages_read', ({ reader_id }: { conversation_id: string; reader_id: string }) => {
        setMeId(current => {
          // Only the other participant reading flips our sent messages to "read".
          if (reader_id !== current) {
            setMessages(prev =>
              prev.map(m => (m.sender_id === current && !m.read_at ? { ...m, read_at: new Date().toISOString() } : m))
            );
          }
          return current;
        });
      });

      socket.on('room_error', (message: string) => {
        showToast(message, 'error');
      });

      return () => {
        socket.off('receive_message');
        socket.off('messages_read');
        socket.off('room_error');
      };
    }
  }, [socket, id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = () => {
    if (!newMessage.trim() || !socket || !user) return;

    // No sender_id: the server attributes the message to the authenticated
    // socket, so anything we sent here would be ignored anyway.
    socket.emit('send_message', {
      conversation_id: id,
      body: newMessage
    });

    setNewMessage('');
  };

  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !socket) return;

    setIsUploadingPhoto(true);
    try {
      const { data: signData } = await axios.post('/api/uploads/sign', { folder: 'neighbourly_chat' });
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

      socket.emit('send_message', {
        conversation_id: id,
        body: '',
        photo_url: uploadData.secure_url,
      });
    } catch (err) {
      console.error('Photo upload failed:', err);
      showToast('Could not send that photo. Please try again.', 'error');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleReport = async (reason: string) => {
    if (!otherParticipant?.id) return;
    try {
      await axios.post('/api/reports', {
        target_type: 'USER',
        target_id: otherParticipant.id,
        reason,
      });
      showToast('Report submitted. Our team will review it.', 'success');
      setShowReport(false);
    } catch (err) {
      console.error('Failed to submit report:', err);
      showToast('Could not submit your report. Please try again.', 'error');
    }
  };

  const otherParticipant = messages.find(m => m.sender_id !== meId)?.sender;

  return (
    <div className="h-screen flex flex-col relative">
      {/* Header */}
      <header className="p-4 md:p-6 glass backdrop-blur-3xl flex items-center justify-between z-10 border-b border-hairline sticky top-0 shadow-2xl">
        <div className="flex items-center gap-4 min-w-0">
          <button onClick={() => navigate('/chat')} aria-label="Back to messages" className="p-2.5 hover:bg-surface-2 rounded-2xl transition-all active:scale-90 bg-surface-1 border border-hairline shrink-0">
            <ChevronLeft className="w-6 h-6 text-strong" />
          </button>
          <div className="flex items-center gap-3 min-w-0">
            <Avatar
              name={otherParticipant?.name}
              avatarUrl={otherParticipant?.avatar_url}
              seed={otherParticipant?.id || id}
            />
            <h3 className="font-bold leading-tight text-strong truncate">{otherParticipant?.name || 'Neighbour'}</h3>
          </div>
        </div>
        <div className="relative shrink-0">
          <button
            onClick={() => setShowMenu(s => !s)}
            className="p-3 hover:bg-surface-2 rounded-2xl transition-colors text-muted"
            aria-label="More options"
            aria-expanded={showMenu}
          >
            <MoreVertical className="w-5 h-5" />
          </button>
          <AnimatePresence>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowMenu(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }}
                  className="absolute right-0 top-full mt-2 w-52 glass backdrop-blur-2xl rounded-2xl border border-hairline shadow-2xl overflow-hidden z-30"
                >
                  <button
                    onClick={() => { setShowMenu(false); setShowReport(true); }}
                    disabled={!otherParticipant}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-bold text-rose-status hover:bg-rose-status/10 transition-colors disabled:opacity-40"
                  >
                    <Flag className="w-4 h-4" /> Report {otherParticipant?.name || 'this person'}
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar pb-32">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 text-amber-accent animate-spin" />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <AlertTriangle className="w-12 h-12 text-rose-status" />
            <p className="font-bold uppercase tracking-widest text-sm text-muted">Couldn't load messages</p>
            <Button variant="secondary" size="sm" onClick={fetchMessages}>Retry</Button>
          </div>
        ) : messages.length > 0 ? (
          messages.map((msg, idx) => {
            const isMe = msg.sender_id === meId;
            return (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                key={msg.id || idx}
                className={clsx(
                  "flex flex-col max-w-[85%] md:max-w-[70%]",
                  isMe ? "ml-auto items-end" : "items-start"
                )}
              >
                {msg.type === 'IMAGE' && msg.photo_url ? (
                  <a href={msg.photo_url} target="_blank" rel="noreferrer" className="block rounded-2xl overflow-hidden border border-hairline shadow-lg">
                    <img src={msg.photo_url} alt="Shared photo" className="max-w-[240px] max-h-[320px] object-cover" referrerPolicy="no-referrer" />
                  </a>
                ) : (
                  <div className={clsx(
                      "p-4 rounded-2xl text-sm shadow-sm relative group",
                      isMe
                        ? "bg-amber-accent text-strong font-bold rounded-tr-none shadow-amber-500/10"
                        : "glass text-strong rounded-tl-none border border-hairline"
                  )}>
                      {msg.body}
                  </div>
                )}
                <div className="flex items-center gap-1.5 mt-1 px-1">
                  <span className="text-[10px] text-faint font-black uppercase tracking-tighter">
                    {(() => {
                        try {
                            return msg.created_at ? format(new Date(msg.created_at), 'h:mm a') : 'Now';
                        } catch (e) {
                            return 'Now';
                        }
                    })()}
                  </span>
                  {isMe && (
                    msg.read_at
                      ? <CheckCheck className="w-3 h-3 text-sky-status" />
                      : <Check className="w-3 h-3 text-faint" />
                  )}
                </div>
              </motion.div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center h-full opacity-20">
            <MessageSquare className="w-16 h-16 mb-4" />
            <p className="font-bold uppercase tracking-widest text-sm">No messages yet</p>
          </div>
        )}
      </div>

      {/* Input - Floating Style */}
      <div className="p-6 md:p-8 absolute bottom-0 left-0 right-0 z-20 pointer-events-none">
        <div className="max-w-4xl mx-auto glass backdrop-blur-2xl rounded-3xl p-3 border border-hairline shadow-2xl pointer-events-auto flex gap-3 items-center">
          <input type="file" accept="image/*" ref={fileInputRef} onChange={handlePhotoSelected} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingPhoto}
            className="p-4 glass hover:bg-surface-2 rounded-2xl transition-all active:scale-95 group disabled:opacity-50"
            aria-label="Send a photo"
          >
            {isUploadingPhoto ? (
              <Loader2 className="w-6 h-6 text-amber-accent animate-spin" />
            ) : (
              <Camera className="w-6 h-6 text-muted group-hover:text-amber-accent" />
            )}
          </button>
          <div className="flex-1 relative">
            <input
              type="text"
              value={newMessage}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              className="w-full bg-surface-1 border border-hairline rounded-2xl py-4 px-6 text-strong placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-amber-accent/30 transition-all font-medium"
            />
          </div>
          <button
            onClick={handleSendMessage}
            disabled={!newMessage.trim()}
            className="p-4 bg-amber-accent text-strong rounded-2xl shadow-xl shadow-amber-500/30 active:scale-90 enabled:hover:scale-105 transition-all disabled:opacity-50 disabled:grayscale"
          >
            <Send className="w-6 h-6" />
          </button>
        </div>
      </div>

      {showReport && otherParticipant && (
        <ReportDialog
          targetName={otherParticipant.name || 'this person'}
          onCancel={() => setShowReport(false)}
          onSubmit={handleReport}
        />
      )}
    </div>
  );
};
