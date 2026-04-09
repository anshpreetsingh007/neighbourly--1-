import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { GlassCard } from '../../components/UI';
import { Search, ChevronRight, Loader2, MessageSquare } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';

export const ChatList: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchConversations = async () => {
      if (!user) return;
      try {
        const { data } = await axios.get('/api/conversations', {
          headers: { 'x-supabase-uid': user.id }
        });
        setConversations(data);
      } catch (err) {
        console.error('Failed to fetch conversations:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchConversations();
  }, [user]);

  const filteredConversations = conversations.filter(conv => 
    conv.otherUser?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.job?.title?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-display font-bold">Messages</h1>
      </header>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search conversations..."
          className="w-full glass rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-amber-accent/50 transition-all font-medium"
        />
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
            <Loader2 className="w-8 h-8 text-amber-accent animate-spin" />
            <p className="text-sm font-bold uppercase tracking-widest">Loading Chats...</p>
          </div>
        ) : filteredConversations.length > 0 ? (
          filteredConversations.map((chat) => {
            try {
              const lastMessage = chat.messages?.[0];
              const timeStr = lastMessage?.created_at 
                ? formatDistanceToNow(new Date(lastMessage.created_at), { addSuffix: true }) 
                : '';

              return (
                <Link 
                  to={`/chat/${chat.id}`}
                  key={chat.id} 
                  className="block group no-underline"
                  onClick={() => console.log('Navigating to chat:', chat.id)}
                >
                  <GlassCard 
                    hover 
                    className="p-4 flex items-center gap-4 cursor-pointer border border-white/5 active:scale-98 transition-all group-hover:bg-white/5"
                  >
                    <div className="relative">
                      <img 
                        src={chat.otherUser?.avatar_url || `https://picsum.photos/seed/${chat.id}/100/100`} 
                        alt={chat.otherUser?.name} 
                        className="w-14 h-14 rounded-2xl object-cover ring-2 ring-white/5"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-status border-2 border-[#080a12] rounded-full shadow-lg" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <h4 className="font-bold truncate text-lg group-hover:text-amber-accent transition-colors">{chat.otherUser?.name || 'Anonymous User'}</h4>
                        <span className="text-[10px] text-white/30 font-bold uppercase tracking-tighter">
                          {timeStr}
                        </span>
                      </div>
                      <p className="text-sm text-white/50 truncate pr-4 font-medium italic">
                        {lastMessage?.body || 'No messages yet... Start the conversation!'}
                      </p>
                      {chat.job && (
                        <div className="mt-2 flex items-center gap-1.5 opacity-40">
                          <div className="w-1 h-1 bg-amber-accent rounded-full" />
                          <span className="text-[10px] font-bold uppercase truncate">{chat.job.title}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <ChevronRight className="w-5 h-5 text-white/20 group-hover:text-amber-accent transition-all group-hover:translate-x-1" />
                    </div>
                  </GlassCard>
                </Link>
              );
            } catch (err) {
              console.error('Error rendering chat item:', err);
              return null;
            }
          })
        ) : (
          <div className="text-center py-20 glass rounded-3xl border border-dashed border-white/10">
            <div className="bg-white/5 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-8 h-8 text-white/20" />
            </div>
            <p className="text-white/30 font-bold uppercase tracking-widest text-sm">No Conversations Yet</p>
            <p className="text-[10px] text-white/10 mt-1 uppercase tracking-tight">Contact a helper to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
};
