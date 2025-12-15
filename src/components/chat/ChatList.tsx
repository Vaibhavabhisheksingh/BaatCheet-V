import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import { MessageSquare, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Conversation {
  partner_id: string;
  partner_username: string;
  partner_email: string;
  partner_bio: string | null;
  partner_image: string | null;
  last_message: string;
  last_message_time: string;
  last_message_sender: string;
  unread_count: number;
}

interface ChatListProps {
  onSelectConversation: (partnerId: string, partnerUsername: string, partnerImage: string | null) => void;
  selectedPartnerId: string | null;
}

export default function ChatList({ onSelectConversation, selectedPartnerId }: ChatListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  const fetchConversations = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase.rpc('get_conversations', {
        user_uuid: user.id
      });

      if (error) throw error;
      setConversations(data || []);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, [user]);

  // Real-time subscription for new messages
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('chat-list-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          console.log('Message update:', payload);
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (isLoading) {
    return (
      <div className="p-6 text-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="p-6 text-center">
        <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center mx-auto mb-4">
          <Users className="w-7 h-7 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">
          No conversations yet
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Search for users to start chatting
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {conversations.map((conversation) => (
        <button
          key={conversation.partner_id}
          onClick={() => onSelectConversation(
            conversation.partner_id,
            conversation.partner_username,
            conversation.partner_image
          )}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all text-left",
            selectedPartnerId === conversation.partner_id
              ? "bg-sidebar-accent"
              : "hover:bg-sidebar-accent/50"
          )}
        >
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
              {conversation.partner_image ? (
                <img
                  src={conversation.partner_image}
                  alt={conversation.partner_username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-primary font-semibold">
                  {conversation.partner_username[0]?.toUpperCase()}
                </span>
              )}
            </div>
            {conversation.unread_count > 0 && (
              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full gradient-amber flex items-center justify-center">
                <span className="text-xs font-bold text-primary-foreground">
                  {conversation.unread_count > 9 ? '9+' : conversation.unread_count}
                </span>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className={cn(
                "font-medium truncate",
                conversation.unread_count > 0 ? "text-foreground" : "text-foreground"
              )}>
                {conversation.partner_username}
              </span>
              <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                {formatDistanceToNow(new Date(conversation.last_message_time), { addSuffix: false })}
              </span>
            </div>
            <p className={cn(
              "text-sm truncate",
              conversation.unread_count > 0 
                ? "text-foreground font-medium" 
                : "text-muted-foreground"
            )}>
              {conversation.last_message_sender === user?.id && (
                <span className="text-muted-foreground">You: </span>
              )}
              {conversation.last_message}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
