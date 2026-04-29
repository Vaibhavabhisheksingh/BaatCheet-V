import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Inbox, Check, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface RequestRow {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: 'pending' | 'accepted' | 'ignored';
  created_at: string;
  requester?: {
    username: string;
    profile_image: string | null;
    bio: string | null;
  };
  preview?: string | null;
}

interface MessageRequestsProps {
  onOpenChat: (
    partnerId: string,
    partnerUsername: string,
    partnerImage: string | null
  ) => void;
}

export default function MessageRequests({ onOpenChat }: MessageRequestsProps) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await (supabase as any)
        .from('message_requests')
        .select('*')
        .eq('recipient_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const rows: RequestRow[] = data || [];

      if (rows.length > 0) {
        const ids = rows.map((r) => r.requester_id);
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, username, profile_image, bio')
          .in('user_id', ids);

        const profMap = new Map(
          (profs || []).map((p: any) => [p.user_id, p])
        );

        // Fetch preview message (first message from requester)
        const { data: msgs } = await supabase
          .from('messages')
          .select('sender_id, content, created_at')
          .eq('receiver_id', user.id)
          .in('sender_id', ids)
          .order('created_at', { ascending: true });

        const previewMap = new Map<string, string>();
        (msgs || []).forEach((m: any) => {
          if (!previewMap.has(m.sender_id)) {
            previewMap.set(m.sender_id, m.content);
          }
        });

        rows.forEach((r) => {
          const p = profMap.get(r.requester_id) as any;
          r.requester = p
            ? { username: p.username, profile_image: p.profile_image, bio: p.bio }
            : undefined;
          r.preview = previewMap.get(r.requester_id) || null;
        });
      }

      setRequests(rows);
    } catch (err) {
      console.error('Failed to load requests', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('message-requests-inbox')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_requests' },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, load]);

  const respond = async (
    req: RequestRow,
    status: 'accepted' | 'ignored'
  ) => {
    setBusyId(req.id);
    try {
      const { error } = await (supabase as any)
        .from('message_requests')
        .update({ status, responded_at: new Date().toISOString() })
        .eq('id', req.id);
      if (error) throw error;
      toast.success(
        status === 'accepted' ? 'Request accepted' : 'Request ignored'
      );
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
      if (status === 'accepted' && req.requester) {
        onOpenChat(
          req.requester_id,
          req.requester.username,
          req.requester.profile_image
        );
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Failed to update request');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-muted-foreground">
        No pending requests
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {requests.map((req) => (
        <div
          key={req.id}
          className={cn(
            'px-3 py-3 rounded-lg bg-sidebar-accent/40 hover:bg-sidebar-accent transition-colors'
          )}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
              {req.requester?.profile_image ? (
                <img
                  src={req.requester.profile_image}
                  alt={req.requester.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-primary font-semibold">
                  {req.requester?.username?.[0]?.toUpperCase() || '?'}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm text-foreground truncate">
                  {req.requester?.username || 'Unknown user'}
                </p>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">
                  {formatDistanceToNow(new Date(req.created_at), {
                    addSuffix: true,
                  })}
                </span>
              </div>
              {req.preview && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {req.preview}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => respond(req, 'accepted')}
                  disabled={busyId === req.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md gradient-amber text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-60"
                >
                  <Check className="w-3 h-3" />
                  Accept
                </button>
                <button
                  onClick={() => respond(req, 'ignored')}
                  disabled={busyId === req.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 hover:text-foreground disabled:opacity-60"
                >
                  <X className="w-3 h-3" />
                  Ignore
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RequestsHeader({ count }: { count: number }) {
  return (
    <div className="flex items-center justify-between px-4 mb-2 mt-2">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <Inbox className="w-3 h-3" />
        Requests
      </span>
      {count > 0 && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full gradient-amber text-primary-foreground">
          {count}
        </span>
      )}
    </div>
  );
}
