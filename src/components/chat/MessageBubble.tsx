import { useState, useRef, useEffect } from 'react';
import { Check, CheckCheck, Smile, Trash2, MoreVertical, Play, Pause, Pencil, X } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface MessageBubbleProps {
  message: {
    id: string;
    sender_id: string;
    content: string;
    is_read: boolean;
    created_at: string;
    media_url: string | null;
    media_type: string;
    edited_at?: string | null;
  };
  isOwn: boolean;
  reactions: Record<string, { count: number; hasUserReacted: boolean }>;
  onToggleReaction: (emoji: string) => void;
  onDelete?: () => void;
  onEdit?: (newContent: string) => Promise<void> | void;
  reactionEmojis: string[];
}

export default function MessageBubble({
  message,
  isOwn,
  reactions,
  onToggleReaction,
  onDelete,
  onEdit,
  reactionEmojis,
}: MessageBubbleProps) {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing) {
      editRef.current?.focus();
      editRef.current?.setSelectionRange(editValue.length, editValue.length);
    }
  }, [isEditing]);

  const handleAudioPlayPause = () => {
    if (!audioElement) {
      const audio = new Audio(message.media_url!);
      audio.onended = () => setIsPlayingAudio(false);
      setAudioElement(audio);
      audio.play();
      setIsPlayingAudio(true);
    } else if (isPlayingAudio) {
      audioElement.pause();
      setIsPlayingAudio(false);
    } else {
      audioElement.play();
      setIsPlayingAudio(true);
    }
  };

  const handleSaveEdit = async () => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === message.content || !onEdit) {
      setIsEditing(false);
      setEditValue(message.content);
      return;
    }
    setIsSavingEdit(true);
    try {
      await onEdit(trimmed);
      setIsEditing(false);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const isTextOnly = !message.media_url;
  const canEdit = isOwn && isTextOnly && !!onEdit;

  return (
    <>
      <div className={cn("flex group", isOwn ? "justify-end" : "justify-start")}>
        <div className="relative max-w-[75%]">
          {/* Message Actions Dropdown */}
          {isOwn && (onDelete || canEdit) && !isEditing && (
            <div className={cn(
              "absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10",
              "-left-10"
            )}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-1 rounded-full bg-muted hover:bg-muted/80 shadow-sm border border-border">
                    <MoreVertical className="w-4 h-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[140px]">
                  {canEdit && (
                    <DropdownMenuItem onClick={() => { setEditValue(message.content); setIsEditing(true); }}>
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem
                      onClick={() => setConfirmDeleteOpen(true)}
                      className="text-destructive focus:text-destructive focus:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          <div
            className={cn(
              "px-4 py-2.5 rounded-md shadow-sm transition-all",
              isOwn
                ? "bg-primary/20 text-foreground border border-primary/30"
                : "bg-muted text-foreground"
            )}
          >
            {/* Image content */}
            {message.media_url && message.media_type === 'image' && (
              <img
                src={message.media_url}
                alt="Shared image"
                className="rounded-md max-w-full mb-2 cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => window.open(message.media_url!, '_blank')}
              />
            )}

            {/* Video content */}
            {message.media_url && message.media_type === 'video' && (
              <video
                src={message.media_url}
                controls
                className="rounded-md max-w-full mb-2"
              />
            )}

            {/* Audio/Voice content */}
            {message.media_url && message.media_type === 'audio' && (
              <div className="flex items-center gap-3 min-w-[200px]">
                <button
                  onClick={handleAudioPlayPause}
                  className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center hover:bg-primary/30 transition-colors"
                >
                  {isPlayingAudio ? (
                    <Pause className="w-5 h-5 text-primary" />
                  ) : (
                    <Play className="w-5 h-5 text-primary ml-0.5" />
                  )}
                </button>
                <div className="flex-1">
                  <div className="h-1 bg-muted-foreground/30 rounded-full overflow-hidden">
                    <div className={cn("h-full bg-primary transition-all", isPlayingAudio ? "w-full" : "w-0")} />
                  </div>
                  <span className="text-xs text-muted-foreground mt-1">Voice message</span>
                </div>
              </div>
            )}

            {/* Text content / Edit mode */}
            {isEditing ? (
              <div className="flex flex-col gap-2 min-w-[220px]">
                <Textarea
                  ref={editRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSaveEdit();
                    } else if (e.key === 'Escape') {
                      setIsEditing(false);
                      setEditValue(message.content);
                    }
                  }}
                  maxLength={2000}
                  rows={2}
                  className="text-sm bg-background/60 resize-none"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => { setIsEditing(false); setEditValue(message.content); }}
                    disabled={isSavingEdit}
                  >
                    <X className="w-3.5 h-3.5 mr-1" /> Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="amber"
                    onClick={handleSaveEdit}
                    disabled={isSavingEdit || !editValue.trim() || editValue.trim() === message.content}
                  >
                    {isSavingEdit ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </div>
            ) : (
              message.content && (
                <p className="text-sm break-words leading-relaxed whitespace-pre-wrap">{message.content}</p>
              )
            )}

            {/* Timestamp and read receipt */}
            {!isEditing && (
              <div className={cn(
                "flex items-center gap-1 mt-1",
                isOwn ? "justify-end" : "justify-start"
              )}>
                {message.edited_at && (
                  <span className="text-[10px] italic text-muted-foreground">edited</span>
                )}
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
            )}
          </div>

          {/* Reactions display */}
          {Object.keys(reactions).length > 0 && (
            <div className={cn(
              "flex gap-1 mt-1",
              isOwn ? "justify-end" : "justify-start"
            )}>
              {Object.entries(reactions).map(([emoji, data]) => (
                <button
                  key={emoji}
                  onClick={() => onToggleReaction(emoji)}
                  className={cn(
                    "flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition-colors",
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
          {!isEditing && (
            <div className={cn(
              "absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity",
              isOwn ? "-left-16" : "-right-8"
            )}>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="p-1 rounded-full bg-muted hover:bg-muted/80 shadow-sm border border-border">
                    <Smile className="w-4 h-4 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2" side={isOwn ? "left" : "right"}>
                  <div className="flex gap-1">
                    {reactionEmojis.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => onToggleReaction(emoji)}
                        className="text-lg hover:scale-125 transition-transform p-1"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center">
                <Trash2 className="w-4 h-4 text-destructive" />
              </span>
              Delete this message?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This message will be permanently removed for everyone in the conversation. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setConfirmDeleteOpen(false); onDelete?.(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
