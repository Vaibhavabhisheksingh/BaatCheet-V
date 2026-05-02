import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { toast } from 'sonner';
import { MessageSquare, Eye, EyeOff, Loader2, User, Mail, Lock, ArrowLeft } from 'lucide-react';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const signupSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  username: z.string().min(3, 'Username must be at least 3 characters').max(30, 'Username too long'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  bio: z.string().max(200, 'Bio must be under 200 characters').optional(),
});

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  // OTP verification step (after signup)
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [pendingSignup, setPendingSignup] = useState<{ email: string; username: string; bio?: string } | null>(null);

  const { signIn, signUp, verifySignupOtp, resendSignupOtp, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  useEffect(() => {
    if (user) {
      navigate('/chat');
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isLogin) {
        const validation = loginSchema.safeParse({ email, password });
        if (!validation.success) {
          toast.error(validation.error.errors[0].message);
          setIsLoading(false);
          return;
        }

        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            toast.error('Invalid email or password');
          } else {
            toast.error(error.message);
          }
        } else {
          toast.success('Welcome back!');
          navigate('/chat');
        }
      } else {
        const validation = signupSchema.safeParse({ email, username, password, bio });
        if (!validation.success) {
          toast.error(validation.error.errors[0].message);
          setIsLoading(false);
          return;
        }

        const { error, needsOtp } = await signUp(email, password, username, bio);
        if (error) {
          const msg = error.message || '';
          if (msg.includes('already registered') || msg.toLowerCase().includes('user already')) {
            toast.error('This email is already registered');
          } else if (msg.toLowerCase().includes('reserved') && msg.toLowerCase().includes('admin')) {
            toast.error('Usernames starting with "admin" are reserved');
          } else if (msg.includes('BaatCheet')) {
            toast.error('The username "BaatCheet" is reserved');
          } else if (msg.toLowerCase().includes('username') && msg.toLowerCase().includes('taken')) {
            toast.error('This username is already taken');
          } else if (msg.includes('duplicate key') && msg.includes('username')) {
            toast.error('This username is already taken');
          } else {
            toast.error(msg);
          }
        } else if (needsOtp) {
          setPendingSignup({ email, username, bio });
          setOtpStep(true);
          setResendCooldown(30);
          toast.success('We sent a 6-digit code to your email');
        } else {
          toast.success('Account created successfully!');
          navigate('/chat');
        }
      }
    } catch (err) {
      toast.error('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const emailSchema = z.string().email('Please enter a valid email');
    const v = emailSchema.safeParse(forgotEmail);
    if (!v.success) {
      toast.error(v.error.errors[0].message);
      return;
    }
    setForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setForgotLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('If an account exists, a reset link has been sent to your email.');
    setForgotOpen(false);
    setForgotEmail('');
  };

  const handleVerifyOtp = async () => {
    if (!pendingSignup) return;
    if (otpCode.length !== 6) {
      toast.error('Enter the 6-digit code');
      return;
    }
    setOtpLoading(true);
    const { error } = await verifySignupOtp(pendingSignup.email, otpCode, {
      username: pendingSignup.username,
      bio: pendingSignup.bio,
    });
    setOtpLoading(false);
    if (error) {
      const m = (error.message || '').toLowerCase();
      if (m.includes('expired')) toast.error('Code expired. Please resend.');
      else if (m.includes('invalid') || m.includes('token')) toast.error('Invalid code. Please try again.');
      else toast.error(error.message);
      return;
    }
    toast.success('Email verified! Welcome to BaatCheet.');
    navigate('/chat');
  };

  const handleResendOtp = async () => {
    if (!pendingSignup || resendCooldown > 0) return;
    const { error } = await resendSignupOtp(pendingSignup.email);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('A new code has been sent');
    setResendCooldown(30);
  };

  const handleBackFromOtp = () => {
    setOtpStep(false);
    setOtpCode('');
    setPendingSignup(null);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-primary/3 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-10 animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-lg gradient-amber mb-6">
            <MessageSquare className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-4xl font-bold text-foreground tracking-tight">BAATCHEET</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {otpStep ? 'Verify your email' : isLogin ? 'Welcome back' : 'Create your account'}
          </p>
        </div>

        {/* Auth Form */}
        <div className="bg-card border border-border rounded-lg p-8 shadow-soft animate-slide-up">
          {otpStep ? (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <p className="text-sm text-foreground font-medium">Enter the 6-digit code</p>
                <p className="text-xs text-muted-foreground">
                  We sent it to <span className="text-foreground">{pendingSignup?.email}</span>
                </p>
              </div>
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <Button
                variant="amber"
                size="lg"
                className="w-full"
                onClick={handleVerifyOtp}
                disabled={otpLoading || otpCode.length !== 6}
              >
                {otpLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</> : 'Verify & continue'}
              </Button>
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={handleBackFromOtp}
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="w-3 h-3" /> Back
                </button>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0}
                  className="text-muted-foreground hover:text-primary disabled:opacity-50 transition-colors"
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground text-center">
                Didn't get the email? Check your spam folder.
              </p>
            </div>
          ) : (
          <>
          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Choose a unique username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-10"
                    required={!isLogin}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {!isLogin && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Bio (optional)</label>
                <Input
                  type="text"
                  placeholder="Tell us about yourself"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={200}
                />
              </div>
            )}

            {isLogin && (
              <div className="text-right -mt-2">
                <button
                  type="button"
                  onClick={() => { setForgotEmail(email); setForgotOpen(true); }}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <Button
              type="submit"
              variant="amber"
              size="lg"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isLogin ? 'Signing in...' : 'Creating account...'}
                </>
              ) : (
                isLogin ? 'Sign In' : 'Create Account'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setEmail('');
                setPassword('');
                setUsername('');
                setBio('');
              }}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <span className="text-primary font-medium">
                {isLogin ? 'Sign up' : 'Sign in'}
              </span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-8">
          Premium real-time communication
        </p>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>
              Enter the email associated with your account. We'll send you a secure link to choose a new password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                className="pl-10"
                placeholder="you@example.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setForgotOpen(false)} disabled={forgotLoading}>
              Cancel
            </Button>
            <Button variant="amber" onClick={handleForgotPassword} disabled={forgotLoading}>
              {forgotLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : 'Send reset link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
