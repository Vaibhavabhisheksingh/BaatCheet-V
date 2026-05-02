import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Lock, Eye, EyeOff, Loader2, MessageSquare } from 'lucide-react';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const navigate = useNavigate();

  const [exchangeError, setExchangeError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setHasRecoverySession(true);
      }
    });

    (async () => {
      // 1) PKCE flow: ?code=... in the query string
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!mounted) return;
        if (error) {
          setExchangeError(error.message);
        } else {
          setHasRecoverySession(true);
          // Clean URL
          window.history.replaceState({}, '', '/reset-password');
        }
        return;
      }

      // 2) Hash flow: #access_token=...&type=recovery (legacy / implicit)
      if (window.location.hash.includes('access_token')) {
        // Supabase client picks this up automatically; just wait for the event
        return;
      }

      // 3) Already-active session (e.g., user clicked "change password" while logged in)
      const { data: { session } } = await supabase.auth.getSession();
      if (mounted && session) setHasRecoverySession(true);
    })();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setIsLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Password updated. Please sign in.');
    await supabase.auth.signOut();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-lg gradient-amber mb-6">
            <MessageSquare className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Reset Password</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {hasRecoverySession ? 'Choose a new password' : 'Verifying reset link…'}
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-8 shadow-soft">
          {!hasRecoverySession ? (
            <p className="text-sm text-muted-foreground text-center">
              If you arrived here from the password reset email, please wait a moment…
              If nothing happens, request a new reset link from the sign-in page.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">New password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    placeholder="At least 6 characters"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Confirm password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              <Button type="submit" variant="amber" size="lg" className="w-full" disabled={isLoading}>
                {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Updating…</> : 'Update password'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
