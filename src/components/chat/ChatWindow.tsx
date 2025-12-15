import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, ArrowLeft } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
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

  // Mark messages as read
  const markMessagesAsRead = async () => {
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
  };

  useEffect(() => {
    fetchMessages();
    markMessagesAsRead();
  }, [user, partnerId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Real-time subscription
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
  }, [user, partnerId]);

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
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
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
        <div>
          <h2 className="font-semibold text-foreground">{partnerUsername}</h2>
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center mb-4">
              {partnerImage ? (
                <img
                  src={partnerImage}
                  alt={partnerUsername}
                  className="w-full h-full object-cover rounded-lg"
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
            const showTime = index === 0 || 
              new Date(message.created_at).getTime() - new Date(messages[index - 1].created_at).getTime() > 60000;

            return (
              <div key={message.id}>
                {showTime && (
                  <div className="text-center mb-2">
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
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
                      "max-w-[75%] px-4 py-2 rounded-lg",
                      isOwn
                        ? "gradient-amber text-primary-foreground"
                        : "bg-muted text-foreground"
                    )}
                  >
                    <p className="text-sm break-words">{message.content}</p>
                  </div>
                </div>
              </div>
            );
          })
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
            onChange={(e) => setNewMessage(e.target.value)}
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
