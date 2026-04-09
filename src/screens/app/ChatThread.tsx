import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard, Button } from '../../components/UI';
import { ChevronLeft, Send, Camera, MoreVertical, Phone, Check, CheckCheck, Loader2, MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';
import { useSocket } from '../../hooks/useSocket';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { format } from 'date-fns';

export const ChatThread: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const socket = useSocket('chat');

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const { data } = await axios.get(`/api/conversations/${id}/messages`);
        setMessages(data);
      } catch (err) {
        console.error('Failed to fetch messages:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMessages();
  }, [id]);

  useEffect(() => {
    if (socket && id) {
      socket.emit('join_room', id);

      socket.on('receive_message', (message: any) => {
        console.log('Received message via socket:', message);
        setMessages(prev => [...prev, message]);
      });

      return () => {
        socket.off('receive_message');
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

    socket.emit('send_message', {
      conversation_id: id,
      sender_id: user.id,
      body: newMessage
    });

    setNewMessage('');
  };

  const otherParticipant = messages.find(m => m.sender?.supabase_uid !== user?.id)?.sender;

  return (
    <div className="h-screen flex flex-col bg-[#0f172a]/50 relative">
      {/* Header */}
      <header className="p-4 md:p-6 glass-light backdrop-blur-3xl flex items-center justify-between z-10 border-b border-white/10 sticky top-0 shadow-2xl">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/chat')} className="p-2.5 hover:bg-black/5 rounded-2xl transition-all active:scale-90 bg-white/5 border border-white/5">
            <ChevronLeft className="w-6 h-6 text-slate-900" />
          </button>
          <div className="flex items-center gap-3">
            <div className="relative">
                <img 
                    src={otherParticipant?.avatar_url || `https://picsum.photos/seed/${id}/100/100`} 
                    alt="Participant" 
                    className="w-11 h-11 rounded-2xl object-cover ring-2 ring-amber-accent/20"
                    referrerPolicy="no-referrer"
                />
                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-status border-2 border-white rounded-full shadow-sm" />
            </div>
            <div>
              <h3 className="font-bold leading-tight text-slate-900">{otherParticipant?.name || 'Neighbour'}</h3>
              <span className="text-[10px] text-emerald-status font-black uppercase tracking-widest flex items-center gap-1">
                <span className="w-1 h-1 bg-emerald-status rounded-full animate-ping" />
                Online
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-3 hover:bg-black/5 rounded-2xl transition-colors text-slate-500">
            <Phone className="w-5 h-5" />
          </button>
          <button className="p-3 hover:bg-black/5 rounded-2xl transition-colors text-slate-500">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar pb-32">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 text-amber-accent animate-spin" />
          </div>
        ) : messages.length > 0 ? (
          messages.map((msg, idx) => {
            const isMe = msg.sender?.supabase_uid === user?.id || msg.sender_id === user?.id; // Allow internal ID too just in case
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
                <div className={clsx(
                    "p-4 rounded-2xl text-sm shadow-sm relative group",
                    isMe 
                      ? "bg-amber-accent text-slate-900 font-bold rounded-tr-none shadow-amber-500/10" 
                      : "glass text-white rounded-tl-none border border-white/5"
                )}>
                    {msg.body}
                </div>
                <div className="flex items-center gap-1.5 mt-1 px-1">
                  <span className="text-[10px] text-white/30 font-black uppercase tracking-tighter">
                    {(() => {
                        try {
                            return msg.created_at ? format(new Date(msg.created_at), 'h:mm a') : 'Now';
                        } catch (e) {
                            return 'Now';
                        }
                    })()}
                  </span>
                  {isMe && (
                    <CheckCheck className="w-3 h-3 text-sky-status" />
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
        <div className="max-w-4xl mx-auto glass backdrop-blur-2xl rounded-3xl p-3 border border-white/10 shadow-2xl pointer-events-auto flex gap-3 items-center">
          <button className="p-4 glass hover:bg-white/10 rounded-2xl transition-all active:scale-95 group">
            <Camera className="w-6 h-6 text-white/40 group-hover:text-amber-accent" />
          </button>
          <div className="flex-1 relative">
            <input
              type="text"
              value={newMessage}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 px-6 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-amber-accent/30 transition-all font-medium"
            />
          </div>
          <button 
            onClick={handleSendMessage}
            disabled={!newMessage.trim()}
            className="p-4 bg-amber-accent text-slate-900 rounded-2xl shadow-xl shadow-amber-500/30 active:scale-90 enabled:hover:scale-105 transition-all disabled:opacity-50 disabled:grayscale"
          >
            <Send className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};
