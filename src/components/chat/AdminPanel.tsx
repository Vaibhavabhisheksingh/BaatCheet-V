import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Shield, Trash2, Ban, CheckCircle2, Send, X, Search, Users } from 'lucide-react';
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

interface AdminPanelProps {
  open: boolean;
  onClose: () => void;
}

interface ProfileRow {
  user_id: string;
  username: string;
  email: string;
  is_blocked: boolean;
  profile_image: string | null;
  created_at: string;
}

export default function AdminPanel({ open, onClose }: AdminPanelProps) {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [broadcast, setBroadcast] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ProfileRow | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const fetchProfiles = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, username, email, is_blocked, profile_image, created_at')
      .neq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    else setProfiles(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (open) {
      fetchProfiles();
      setSelectedIds(new Set());
      setBroadcast('');
      setSearch('');
    }
  }, [open, fetchProfiles]);

  if (!open) return null;

  const filtered = profiles.filter((p) =>
    p.username.toLowerCase().includes(search.toLowerCase()) ||
    p.email.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((p) => p.user_id)));
  };

  const toggleBlock = async (p: ProfileRow) => {
    setBusyUserId(p.user_id);
    const { error } = await supabase
      .from('profiles')
      .update({ is_blocked: !p.is_blocked })
      .eq('user_id', p.user_id);
    if (error) toast.error(error.message);
    else {
      toast.success(p.is_blocked ? `Unblocked ${p.username}` : `Blocked ${p.username}`);
      setProfiles((prev) =>
        prev.map((x) => (x.user_id === p.user_id ? { ...x, is_blocked: !x.is_blocked } : x))
      );
    }
    setBusyUserId(null);
  };

  const deleteUser = async (p: ProfileRow) => {
    setBusyUserId(p.user_id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: { targetUserId: p.user_id },
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Deleted ${p.username}`);
      setProfiles((prev) => prev.filter((x) => x.user_id !== p.user_id));
      setConfirmDelete(null);
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    } finally {
      setBusyUserId(null);
    }
  };

  const sendBroadcast = async () => {
    if (!user || !broadcast.trim() || selectedIds.size === 0) {
      toast.error('Select recipients and write a message');
      return;
    }
    setSending(true);
    try {
      const rows = Array.from(selectedIds).map((rid) => ({
        sender_id: user.id,
        receiver_id: rid,
        content: broadcast.trim(),
        media_type: 'text',
      }));
      const { error } = await supabase.from('messages').insert(rows);
      if (error) throw error;
      toast.success(`Message sent to ${selectedIds.size} user${selectedIds.size > 1 ? 's' : ''}`);
      setBroadcast('');
      setSelectedIds(new Set());
    } catch (e: any) {
      toast.error(e.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col shadow-soft">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md gradient-amber flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Admin Panel</h2>
              <p className="text-xs text-muted-foreground">BaatCheet administrator controls</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Broadcast */}
        <div className="p-5 border-b border-border space-y-3">
          <label className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Send className="w-4 h-4 text-primary" />
            Broadcast message ({selectedIds.size} selected)
          </label>
          <Textarea
            placeholder="Write a message to selected users…"
            value={broadcast}
            onChange={(e) => setBroadcast(e.target.value)}
            maxLength={2000}
            rows={3}
          />
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" size="sm" onClick={selectAll} disabled={filtered.length === 0}>
              <Users className="w-4 h-4 mr-1" />
              {allSelected ? 'Deselect all' : 'Select all'}
            </Button>
            <Button
              variant="amber"
              onClick={sendBroadcast}
              disabled={sending || !broadcast.trim() || selectedIds.size === 0}
            >
              {sending ? 'Sending…' : `Send to ${selectedIds.size} user${selectedIds.size === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search users…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="p-6 text-center text-muted-foreground text-sm">Loading users…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">No users found</div>
          ) : (
            <div className="space-y-1">
              {filtered.map((p) => (
                <div
                  key={p.user_id}
                  className="flex items-center gap-3 p-3 rounded-md hover:bg-muted transition-colors"
                >
                  <Checkbox
                    checked={selectedIds.has(p.user_id)}
                    onCheckedChange={() => toggleSelect(p.user_id)}
                  />
                  <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                    {p.profile_image ? (
                      <img src={p.profile_image} alt={p.username} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-primary font-semibold">{p.username[0]?.toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{p.username}</p>
                      {p.is_blocked && (
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-semibold">
                          Blocked
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busyUserId === p.user_id}
                    onClick={() => toggleBlock(p)}
                    className={p.is_blocked ? 'text-green-500 hover:text-green-500' : 'text-destructive hover:text-destructive'}
                    title={p.is_blocked ? 'Unblock' : 'Block'}
                  >
                    {p.is_blocked ? <CheckCircle2 className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busyUserId === p.user_id}
                    onClick={() => setConfirmDelete(p)}
                    className="text-destructive hover:text-destructive"
                    title="Delete account"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmDelete?.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the account, all messages, requests, and themes. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmDelete) deleteUser(confirmDelete);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
