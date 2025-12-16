import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, ArrowLeft, Image, X, Check, CheckCheck, Smile, Play } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  media_url: string | null;
  media_type: string;
}

interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
}

interface ChatWindowProps {
  partnerId: string;
  partnerUsername: string;
  partnerImage: string | null;
  onBack: () => void;
}

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png'];
const ALLOWED_VIDEO_TYPES = ['video/mp4'];

export default function ChatWindow({ partnerId, partnerUsername, partnerImage, onBack }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isPartnerOnline, setIsPartnerOnline] = useState(false);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

      // Fetch reactions for these messages
      if (data && data.length > 0) {
        const messageIds = data.map(m => m.id);
        const { data: reactionsData } = await supabase
          .from('message_reactions')
          .select('*')
          .in('message_id', messageIds);

        if (reactionsData) {
          const grouped = reactionsData.reduce((acc, r) => {
            if (!acc[r.message_id]) acc[r.message_id] = [];
            acc[r.message_id].push(r);
            return acc;
          }, {} as Record<string, Reaction[]>);
          setReactions(grouped);
        }
      }
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
          event: '*',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
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
          } else if (payload.eventType === 'UPDATE') {
            const updatedMsg = payload.new as Message;
            setMessages((prev) =>
              prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, partnerId, markMessagesAsRead]);

  // Real-time subscription for reactions
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`reactions-${partnerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newReaction = payload.new as Reaction;
            setReactions((prev) => ({
              ...prev,
              [newReaction.message_id]: [
                ...(prev[newReaction.message_id] || []),
                newReaction,
              ],
            }));
          } else if (payload.eventType === 'DELETE') {
            const oldReaction = payload.old as Reaction;
            setReactions((prev) => ({
              ...prev,
              [oldReaction.message_id]: (prev[oldReaction.message_id] || []).filter(
                (r) => r.id !== oldReaction.id
              ),
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, partnerId]);

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File size must be less than 10MB');
      return;
    }

    // Validate file type
    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
    const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);

    if (!isImage && !isVideo) {
      toast.error('Only JPG, PNG images and MP4 videos are allowed');
      return;
    }

    setSelectedFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setFilePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadFile = async (file: File): Promise<{ url: string; type: string }> => {
    if (!user) throw new Error('Not authenticated');

    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
    const mediaType = isImage ? 'image' : 'video';
    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('chat-media')
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('chat-media')
      .getPublicUrl(fileName);

    return { url: urlData.publicUrl, type: mediaType };
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !selectedFile) || !user || isSending) return;

    const messageContent = newMessage.trim();
    setNewMessage('');
    setIsSending(true);
    setIsUploading(!!selectedFile);

    try {
      let mediaUrl: string | null = null;
      let mediaType = 'text';

      if (selectedFile) {
        const uploadResult = await uploadFile(selectedFile);
        mediaUrl = uploadResult.url;
        mediaType = uploadResult.type;
        clearSelectedFile();
      }

      const { error } = await supabase.from('messages').insert({
        sender_id: user.id,
        receiver_id: partnerId,
        content: messageContent,
        media_url: mediaUrl,
        media_type: mediaType,
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
      setNewMessage(messageContent);
    } finally {
      setIsSending(false);
      setIsUploading(false);
    }
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;

    const existingReaction = reactions[messageId]?.find(
      (r) => r.user_id === user.id && r.emoji === emoji
    );

    try {
      if (existingReaction) {
        await supabase
          .from('message_reactions')
          .delete()
          .eq('id', existingReaction.id);
      } else {
        await supabase.from('message_reactions').insert({
          message_id: messageId,
          user_id: user.id,
          emoji,
        });
      }
    } catch (error) {
      console.error('Error toggling reaction:', error);
      toast.error('Failed to add reaction');
    }
  };

  const groupedReactions = (messageId: string) => {
    const msgReactions = reactions[messageId] || [];
    const grouped: Record<string, { count: number; hasUserReacted: boolean }> = {};
    
    msgReactions.forEach((r) => {
      if (!grouped[r.emoji]) {
        grouped[r.emoji] = { count: 0, hasUserReacted: false };
      }
      grouped[r.emoji].count++;
      if (r.user_id === user?.id) {
        grouped[r.emoji].hasUserReacted = true;
      }
    });

    return grouped;
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
            const msgReactions = groupedReactions(message.id);

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
                    "flex group",
                    isOwn ? "justify-end" : "justify-start"
                  )}
                >
                  <div className="relative max-w-[75%]">
                    <div
                      className={cn(
                        "px-4 py-2.5 rounded-md shadow-sm",
                        isOwn
                          ? "bg-primary/20 text-foreground border border-primary/30"
                          : "bg-muted text-foreground"
                      )}
                    >
                      {/* Media content */}
                      {message.media_url && message.media_type === 'image' && (
                        <img
                          src={message.media_url}
                          alt="Shared image"
                          className="rounded-md max-w-full mb-2 cursor-pointer"
                          onClick={() => window.open(message.media_url!, '_blank')}
                        />
                      )}
                      {message.media_url && message.media_type === 'video' && (
                        <video
                          src={message.media_url}
                          controls
                          className="rounded-md max-w-full mb-2"
                        />
                      )}

                      {/* Text content */}
                      {message.content && (
                        <p className="text-sm break-words leading-relaxed">{message.content}</p>
                      )}

                      {/* Timestamp and read receipt */}
                      <div className={cn(
                        "flex items-center gap-1 mt-1",
                        isOwn ? "justify-end" : "justify-start"
                      )}>
                        <span className={cn(
                          "text-[10px]",
                          isOwn ? "text-primary/70" : "text-muted-foreground"
                        )}>
                          {format(new Date(message.created_at), 'h:mm a')}
                        </span>
                        {isOwn && (
                          <span className={cn(
                            "text-xs",
                            message.is_read ? "text-primary" : "text-muted-foreground"
                          )}>
                            {message.is_read ? (
                              <CheckCheck className="w-3.5 h-3.5" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Reactions display */}
                    {Object.keys(msgReactions).length > 0 && (
                      <div className={cn(
                        "flex gap-1 mt-1",
                        isOwn ? "justify-end" : "justify-start"
                      )}>
                        {Object.entries(msgReactions).map(([emoji, data]) => (
                          <button
                            key={emoji}
                            onClick={() => toggleReaction(message.id, emoji)}
                            className={cn(
                              "flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs",
                              data.hasUserReacted
                                ? "bg-primary/20 border border-primary/30"
                                : "bg-muted hover:bg-muted/80"
                            )}
                          >
                            <span>{emoji}</span>
                            <span className="text-muted-foreground">{data.count}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Reaction picker */}
                    <div className={cn(
                      "absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity",
                      isOwn ? "-left-8" : "-right-8"
                    )}>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="p-1 rounded-full bg-muted hover:bg-muted/80">
                            <Smile className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-2" side={isOwn ? "left" : "right"}>
                          <div className="flex gap-1">
                            {REACTION_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                onClick={() => toggleReaction(message.id, emoji)}
                                className="text-lg hover:scale-125 transition-transform p-1"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        
        {/* Typing indicator */}
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

      {/* File Preview */}
      {filePreview && (
        <div className="px-4 py-2 border-t border-border">
          <div className="relative inline-block">
            {selectedFile?.type.startsWith('image/') ? (
              <img
                src={filePreview}
                alt="Preview"
                className="h-20 rounded-md object-cover"
              />
            ) : (
              <div className="h-20 w-32 bg-muted rounded-md flex items-center justify-center">
                <Play className="w-8 h-8 text-muted-foreground" />
              </div>
            )}
            <button
              onClick={clearSelectedFile}
              className="absolute -top-2 -right-2 p-1 bg-destructive text-destructive-foreground rounded-full"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1 truncate max-w-[200px]">
            {selectedFile?.name}
          </p>
        </div>
      )}

      {/* Message Input */}
      <form onSubmit={sendMessage} className="p-4 border-t border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,video/mp4"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            <Image className="w-5 h-5 text-muted-foreground" />
          </Button>
          <Input
            type="text"
            placeholder={`Message ${partnerUsername}...`}
            value={newMessage}
            onChange={handleInputChange}
            className="flex-1"
            maxLength={2000}
            disabled={isUploading}
          />
          <Button 
            type="submit" 
            variant="amber" 
            size="icon"
            disabled={(!newMessage.trim() && !selectedFile) || isSending}
          >
            {isUploading ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}