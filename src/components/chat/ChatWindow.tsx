import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, ArrowLeft, Image, X, Mic, MoreVertical, Trash2 } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import MessageBubble from './MessageBubble';
import VoiceRecorder from './VoiceRecorder';
import ProfileView from './ProfileView';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  media_url: string | null;
  media_type: string;
  edited_at?: string | null;
}

interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
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
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png'];
const ALLOWED_VIDEO_TYPES = ['video/mp4'];
const ALLOWED_AUDIO_TYPES = ['audio/webm', 'audio/mp4', 'audio/mpeg'];

export default function ChatWindow({ partnerId, partnerUsername, partnerImage, onBack }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isPartnerOnline, setIsPartnerOnline] = useState(false);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [partnerLastSeen, setPartnerLastSeen] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [showPartnerProfile, setShowPartnerProfile] = useState(false);
  const [partnerProfile, setPartnerProfile] = useState<any>(null);
  const [confirmDeleteChatOpen, setConfirmDeleteChatOpen] = useState(false);
  const [isDeletingChat, setIsDeletingChat] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { user } = useAuth();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchPartnerProfile = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', partnerId)
      .single();
    
    if (data) {
      setPartnerProfile(data);
      setPartnerLastSeen(data.last_seen);
    }
  };

  const updateLastSeen = useCallback(async () => {
    if (!user) return;
    await supabase.rpc('update_last_seen');
  }, [user]);

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
    fetchPartnerProfile();
    markMessagesAsRead();
    updateLastSeen();

    const interval = setInterval(updateLastSeen, 60000);
    return () => clearInterval(interval);
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
          } else if (payload.eventType === 'DELETE') {
            const deletedMsg = payload.old as { id: string };
            setMessages((prev) => prev.filter((m) => m.id !== deletedMsg.id));
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
          fetchPartnerProfile(); // Refresh last seen
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

    if (file.size > MAX_FILE_SIZE) {
      toast.error('File size must be less than 10MB');
      return;
    }

    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
    const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);

    if (!isImage && !isVideo) {
      toast.error('Only JPG, PNG images and MP4 videos are allowed');
      return;
    }

    setSelectedFile(file);

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

  const uploadFile = async (file: File, mediaType: string): Promise<{ url: string; type: string }> => {
    if (!user) throw new Error('Not authenticated');

    const fileExt = file.name.split('.').pop() || (mediaType === 'audio' ? 'webm' : 'bin');
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
        const isImage = ALLOWED_IMAGE_TYPES.includes(selectedFile.type);
        const uploadType = isImage ? 'image' : 'video';
        const uploadResult = await uploadFile(selectedFile, uploadType);
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

  const sendVoiceMessage = async (blob: Blob, duration: number) => {
    if (!user) return;

    setIsUploading(true);
    try {
      const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
      const uploadResult = await uploadFile(file, 'audio');

      const { error } = await supabase.from('messages').insert({
        sender_id: user.id,
        receiver_id: partnerId,
        content: `Voice message (${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')})`,
        media_url: uploadResult.url,
        media_type: 'audio',
      });

      if (error) throw error;
      setShowVoiceRecorder(false);
    } catch (error: any) {
      console.error('Error sending voice message:', error);
      const msg = error?.message || error?.error_description || 'Failed to send voice message';
      toast.error(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const deleteMessage = async (messageId: string) => {
    try {
      const message = messages.find((m) => m.id === messageId);
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId);

      if (error) throw error;

      // Best-effort: clean up associated media file from storage
      if (message?.media_url) {
        try {
          const url = new URL(message.media_url);
          const marker = '/chat-media/';
          const idx = url.pathname.indexOf(marker);
          if (idx !== -1) {
            const path = url.pathname.slice(idx + marker.length);
            await supabase.storage.from('chat-media').remove([path]);
          }
        } catch (storageErr) {
          console.warn('Failed to remove media file:', storageErr);
        }
      }

      toast.success('Message deleted');
    } catch (error) {
      console.error('Error deleting message:', error);
      toast.error('Failed to delete message');
    }
  };

  const editMessage = async (messageId: string, newContent: string) => {
    try {
      const { error } = await supabase
        .from('messages')
        .update({ content: newContent, edited_at: new Date().toISOString() })
        .eq('id', messageId);
      if (error) throw error;
      toast.success('Message updated');
    } catch (error) {
      console.error('Error editing message:', error);
      toast.error('Failed to edit message');
      throw error;
    }
  };

  const deleteMyChat = async () => {
    if (!user) return;
    setIsDeletingChat(true);
    try {
      // RLS only allows deleting messages where auth.uid() = sender_id
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('sender_id', user.id)
        .eq('receiver_id', partnerId);
      if (error) throw error;
      setMessages((prev) => prev.filter((m) => m.sender_id !== user.id));
      toast.success('Your messages in this chat were deleted');
      setConfirmDeleteChatOpen(false);
    } catch (error) {
      console.error('Error deleting chat:', error);
      toast.error('Failed to delete chat');
    } finally {
      setIsDeletingChat(false);
    }
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;

    const userReactions = reactions[messageId]?.filter((r) => r.user_id === user.id) || [];
    const existingSameEmoji = userReactions.find((r) => r.emoji === emoji);

    try {
      if (existingSameEmoji) {
        await supabase
          .from('message_reactions')
          .delete()
          .eq('id', existingSameEmoji.id);
      } else {
        if (userReactions.length > 0) {
          await supabase
            .from('message_reactions')
            .delete()
            .eq('message_id', messageId)
            .eq('user_id', user.id);
        }
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

  const getStatusText = () => {
    if (isPartnerTyping) return <span className="text-primary animate-pulse">typing...</span>;
    if (isPartnerOnline) return <span className="text-green-500">online</span>;
    if (partnerLastSeen) {
      const lastSeen = new Date(partnerLastSeen);
      const diffMinutes = (new Date().getTime() - lastSeen.getTime()) / (1000 * 60);
      if (diffMinutes < 5) return <span className="text-green-500">online</span>;
      return `last seen ${formatDistanceToNow(lastSeen, { addSuffix: true })}`;
    }
    return 'offline';
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
        <button 
          className="relative"
          onClick={() => setShowPartnerProfile(true)}
        >
          <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center overflow-hidden hover:opacity-80 transition-opacity">
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
        </button>
        <button 
          className="flex-1 min-w-0 text-left"
          onClick={() => setShowPartnerProfile(true)}
        >
          <h2 className="font-semibold text-foreground truncate hover:text-primary transition-colors">
            {partnerUsername}
          </h2>
          <p className="text-xs text-muted-foreground">
            {getStatusText()}
          </p>
        </button>
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
                <MessageBubble
                  message={message}
                  isOwn={isOwn}
                  reactions={groupedReactions(message.id)}
                  onToggleReaction={(emoji) => toggleReaction(message.id, emoji)}
                  onDelete={isOwn ? () => deleteMessage(message.id) : undefined}
                  reactionEmojis={REACTION_EMOJIS}
                />
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
                <span className="text-xs text-muted-foreground">Video</span>
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

      {/* Voice Recorder */}
      {showVoiceRecorder && (
        <div className="px-4 py-2 border-t border-border">
          <VoiceRecorder
            onSend={sendVoiceMessage}
            onCancel={() => setShowVoiceRecorder(false)}
            isUploading={isUploading}
          />
        </div>
      )}

      {/* Message Input */}
      {!showVoiceRecorder && (
        <form onSubmit={sendMessage} className="p-4 border-t border-border flex-shrink-0">
          <div className="flex items-center gap-2">
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
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowVoiceRecorder(true)}
              disabled={isUploading}
            >
              <Mic className="w-5 h-5 text-muted-foreground" />
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
      )}

      {/* Partner Profile Modal */}
      {showPartnerProfile && partnerProfile && (
        <ProfileView
          profile={partnerProfile}
          isOwnProfile={false}
          onClose={() => setShowPartnerProfile(false)}
        />
      )}
    </div>
  );
}
