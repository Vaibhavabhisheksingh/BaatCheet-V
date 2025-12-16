import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

interface ChatWindowProps {
  partnerId: string;
  partnerUsername: string;
  partnerImage: string | null;
  onBack: () => void;
}

export default function ChatWindow({ partnerId, partnerUsername, partnerImage, onBack }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isPartnerOnline, setIsPartnerOnline] = useState(false);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { user } = useAuth();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${user.id})`)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const markMessagesAsRead = useCallback(async () => {
    if (!user) return;

    try {
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('sender_id', partnerId)
        .eq('receiver_id', user.id)
        .eq('is_read', false);
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }, [user, partnerId]);

  useEffect(() => {
    fetchMessages();
    markMessagesAsRead();
  }, [user, partnerId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Real-time subscription for messages
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`chat-${partnerId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const newMsg = payload.new as Message;
          if (
            (newMsg.sender_id === user.id && newMsg.receiver_id === partnerId) ||
            (newMsg.sender_id === partnerId && newMsg.receiver_id === user.id)
          ) {
            setMessages((prev) => [...prev, newMsg]);
            if (newMsg.sender_id === partnerId) {
              markMessagesAsRead();
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, partnerId, markMessagesAsRead]);

  // Presence and typing channel
  useEffect(() => {
    if (!user) return;

    const roomId = [user.id, partnerId].sort().join('-');
    const presenceChannel = supabase.channel(`presence-${roomId}`, {
      config: { presence: { key: user.id } },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const partnerPresence = state[partnerId];
        setIsPartnerOnline(!!partnerPresence && partnerPresence.length > 0);
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        if (key === partnerId) {
          setIsPartnerOnline(true);
        }
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (key === partnerId) {
          setIsPartnerOnline(false);
        }
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId === partnerId) {
          setIsPartnerTyping(true);
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
          }
          typingTimeoutRef.current = setTimeout(() => {
            setIsPartnerTyping(false);
          }, 2000);
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      supabase.removeChannel(presenceChannel);
    };
  }, [user, partnerId]);

  // Send typing indicator
  const sendTypingIndicator = useCallback(() => {
    if (!user) return;

    const roomId = [user.id, partnerId].sort().join('-');
    supabase.channel(`presence-${roomId}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: user.id },
    });
  }, [user, partnerId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    sendTypingIndicator();
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || isSending) return;

    const messageContent = newMessage.trim();
    setNewMessage('');
    setIsSending(true);

    try {
      const { error } = await supabase.from('messages').insert({
        sender_id: user.id,
        receiver_id: partnerId,
        content: messageContent,
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
      setNewMessage(messageContent);
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Chat Header */}
      <header className="h-16 px-4 flex items-center gap-3 border-b border-border flex-shrink-0">
        <button
          onClick={onBack}
          className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted md:hidden"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="relative">
          <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center overflow-hidden">
            {partnerImage ? (
              <img
                src={partnerImage}
                alt={partnerUsername}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-primary font-semibold">
                {partnerUsername[0]?.toUpperCase()}
              </span>
            )}
          </div>
          {/* Online indicator */}
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background transition-colors",
              isPartnerOnline ? "bg-green-500" : "bg-muted-foreground"
            )}
          />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-foreground truncate">{partnerUsername}</h2>
          <p className="text-xs text-muted-foreground">
            {isPartnerTyping ? (
              <span className="text-primary animate-pulse">typing...</span>
            ) : isPartnerOnline ? (
              <span className="text-green-500">online</span>
            ) : (
              'offline'
            )}
          </p>
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-md bg-muted flex items-center justify-center mb-4">
              {partnerImage ? (
                <img
                  src={partnerImage}
                  alt={partnerUsername}
                  className="w-full h-full object-cover rounded-md"
                />
              ) : (
                <span className="text-2xl font-bold text-primary">
                  {partnerUsername[0]?.toUpperCase()}
                </span>
              )}
            </div>
            <h3 className="text-lg font-medium text-foreground mb-1">
              {partnerUsername}
            </h3>
            <p className="text-sm text-muted-foreground">
              Send a message to start the conversation
            </p>
          </div>
        ) : (
          messages.map((message, index) => {
            const isOwn = message.sender_id === user?.id;
            const prevMessage = messages[index - 1];
            const showTime = index === 0 || 
              new Date(message.created_at).getTime() - new Date(prevMessage.created_at).getTime() > 300000;

            return (
              <div key={message.id}>
                {showTime && (
                  <div className="text-center my-4">
                    <span className="text-xs text-muted-foreground bg-background/50 px-2 py-1 rounded">
                      {format(new Date(message.created_at), 'MMM d, h:mm a')}
                    </span>
                  </div>
                )}
                <div
                  className={cn(
                    "flex",
                    isOwn ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[75%] px-4 py-2.5 rounded-md shadow-sm",
                      isOwn
                        ? "bg-primary/20 text-foreground border border-primary/30"
                        : "bg-muted text-foreground"
                    )}
                  >
                    <p className="text-sm break-words leading-relaxed">{message.content}</p>
                    <p className={cn(
                      "text-[10px] mt-1",
                      isOwn ? "text-primary/70" : "text-muted-foreground"
                    )}>
                      {format(new Date(message.created_at), 'h:mm a')}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
        
        {/* Typing indicator in chat */}
        {isPartnerTyping && (
          <div className="flex justify-start">
            <div className="bg-muted px-4 py-2.5 rounded-md">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <form onSubmit={sendMessage} className="p-4 border-t border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <Input
            type="text"
            placeholder={`Message ${partnerUsername}...`}
            value={newMessage}
            onChange={handleInputChange}
            className="flex-1"
            maxLength={2000}
          />
          <Button 
            type="submit" 
            variant="amber" 
            size="icon"
            disabled={!newMessage.trim() || isSending}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}