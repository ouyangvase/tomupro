import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { AppLogo } from '@/components/brand/AppLogo';
import { AppName } from '@/components/brand/AppName';
import { KeyRound, Eye, EyeOff, Lock, CheckCircle2, ArrowLeft } from 'lucide-react';
import { z } from 'zod';

const passwordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState(false);

  // When user clicks the reset link in email, Supabase redirects here with
  // a hash fragment containing the access_token. The supabase client will
  // automatically pick it up and establish a session.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true);
      } else if (event === 'SIGNED_IN') {
        // Also treat SIGNED_IN as ready — the recovery token creates a session
        setSessionReady(true);
      }
    });

    // Check if session already exists (e.g. page reload after token was consumed)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });

    // Timeout — if no session after 5s, show error
    const timeout = setTimeout(() => {
      setSessionReady((ready) => {
        if (!ready) setSessionError(true);
        return ready;
      });
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = passwordSchema.safeParse({ password, confirmPassword });
    if (!result.success) {
      const fieldErrors: { password?: string; confirmPassword?: string } = {};
      result.error.errors.forEach((err) => {
        if (err.path[0] === 'password') fieldErrors.password = err.message;
        if (err.path[0] === 'confirmPassword') fieldErrors.confirmPassword = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      toast.success('Password updated successfully!');
      // Sign out after password change so user logs in fresh
      await supabase.auth.signOut();
      setTimeout(() => navigate('/auth'), 2500);
    } catch (error: any) {
      console.error('[ResetPassword] error:', error);
      toast.error('Failed to update password', { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  if (sessionError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9] p-4">
        <Card className="w-full max-w-md shadow-xl border-[#E2E8F0]">
          <CardHeader className="text-center pt-8">
            <AppLogo size="md" className="h-12 w-12 mx-auto mb-3" />
            <CardTitle className="text-xl text-[#0F172A]">Link Expired or Invalid</CardTitle>
            <CardDescription className="mt-2">
              This password reset link has expired or is invalid. Please request a new one.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-8">
            <Button onClick={() => navigate('/auth')} className="w-full h-11 rounded-xl bg-[#0F172A] hover:bg-[#1E293B]">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9] p-4">
        <Card className="w-full max-w-md shadow-xl border-[#E2E8F0]">
          <CardHeader className="text-center pt-8">
            <div className="mx-auto mb-4 p-3 bg-[#22C55E]/10 rounded-full">
              <CheckCircle2 className="h-8 w-8 text-[#22C55E]" />
            </div>
            <CardTitle className="text-xl text-[#0F172A]">Password Updated</CardTitle>
            <CardDescription className="mt-2">
              Your password has been changed successfully. Redirecting to login...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9] p-4">
        <div className="text-center">
          <div className="h-8 w-8 border-2 border-[#B8860B] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-[#64748B]">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9] p-4">
      <Card className="w-full max-w-md shadow-xl border-[#E2E8F0]">
        <CardHeader className="text-center pt-8 pb-4">
          <AppLogo size="md" className="h-12 w-12 mx-auto mb-3" />
          <div className="mx-auto mb-4 p-3 bg-[#B8860B]/10 rounded-full">
            <KeyRound className="h-8 w-8 text-[#B8860B]" />
          </div>
          <CardTitle className="text-xl text-[#0F172A]">Set New Password</CardTitle>
          <CardDescription className="mt-2">
            Enter your new password below.
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="rp-new-pw" className="text-xs font-medium text-[#475569]">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
                <Input
                  id="rp-new-pw"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={`h-11 pl-10 pr-10 bg-[#FAFAF9] border-[#E2E8F0] focus:border-[#B8860B] focus:ring-[#B8860B]/20 rounded-xl text-sm ${errors.password ? 'border-red-400' : ''}`}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#0F172A]">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rp-confirm-pw" className="text-xs font-medium text-[#475569]">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
                <Input
                  id="rp-confirm-pw"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className={`h-11 pl-10 pr-10 bg-[#FAFAF9] border-[#E2E8F0] focus:border-[#B8860B] focus:ring-[#B8860B]/20 rounded-xl text-sm ${errors.confirmPassword ? 'border-red-400' : ''}`}
                />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#0F172A]">
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword}</p>}
            </div>
            <Button type="submit" className="w-full h-11 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] text-white font-medium" disabled={loading}>
              {loading ? 'Updating...' : 'Update Password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
