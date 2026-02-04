import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Loader2, LogOut, RefreshCw, UserX, ShieldAlert } from "lucide-react";
import ForcePasswordChange from "@/pages/auth/ForcePasswordChange";

/**
 * Profile loading states - strict state machine.
 * Each state has clear meaning and required actions.
 * 
 * States:
 * - 'idle': Initial state, waiting for auth to resolve
 * - 'loading': Actively fetching profile from database
 * - 'ready': Profile loaded successfully, role verified
 * - 'error': Profile fetch failed (network/database error)
 * - 'missing': No profile row exists for authenticated user
 * - 'password_reset_required': User must change password before continuing
 */
export type ProfileStatus = 'idle' | 'loading' | 'ready' | 'error' | 'missing' | 'password_reset_required';

interface ProfileGateProps {
  profileStatus: ProfileStatus;
  profileError: string | null;
  onRetry: () => void;
  onResetSession: () => void;
  onPasswordChanged?: () => void;
  children: React.ReactNode;
}

/**
 * ProfileGate - Strict state machine for profile resolution.
 * 
 * CRITICAL RULES:
 * 1. NEVER render app routes until profileStatus === 'ready'
 * 2. NEVER guess or default roles
 * 3. ALWAYS show actionable UI (Retry/Sign Out) for error states
 * 4. NEVER show indefinite loading - states are terminal or progressing
 * 
 * This component gates ALL protected routes to ensure:
 * - Users see correct role-based UI
 * - No unauthorized access due to profile failures
 * - Clear recovery paths for all failure modes
 */
export function ProfileGate({ 
  profileStatus, 
  profileError, 
  onRetry, 
  onResetSession, 
  onPasswordChanged,
  children 
}: ProfileGateProps) {
  // PASSWORD RESET REQUIRED: User must change password first
  if (profileStatus === 'password_reset_required') {
    return <ForcePasswordChange onComplete={onPasswordChanged || onRetry} />;
  }

  // SUCCESS: Profile is ready - render app
  if (profileStatus === 'ready') {
    return <>{children}</>;
  }

  // LOADING: Auth resolving or profile fetching
  if (profileStatus === 'loading' || profileStatus === 'idle') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground text-lg">
            {profileStatus === 'idle' ? 'Checking session...' : 'Loading your profile...'}
          </p>
          <p className="text-xs text-muted-foreground/70">
            This should only take a moment
          </p>
        </div>
      </div>
    );
  }

  // ERROR: Profile fetch failed (network/database error)
  if (profileStatus === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-xl">Failed to Load Profile</CardTitle>
            <CardDescription className="text-base">
              {profileError || "We couldn't load your account information. This might be a temporary issue."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button onClick={onRetry} className="w-full gap-2">
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
            <Button variant="outline" onClick={onResetSession} className="w-full gap-2">
              <LogOut className="h-4 w-4" />
              Sign Out & Start Fresh
            </Button>
            <p className="text-xs text-center text-muted-foreground mt-2">
              If this problem persists, please contact your administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // MISSING: Profile row doesn't exist in database
  if (profileStatus === 'missing') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
              <ShieldAlert className="h-8 w-8 text-amber-500" />
            </div>
            <CardTitle className="text-xl">Profile Not Initialized</CardTitle>
            <CardDescription className="text-base space-y-2">
              <p>Your account exists but your profile hasn't been set up yet.</p>
              <p className="font-medium">Please contact your administrator to complete your account setup.</p>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button onClick={onRetry} variant="outline" className="w-full gap-2">
              <RefreshCw className="h-4 w-4" />
              Check Again
            </Button>
            <Button variant="destructive" onClick={onResetSession} className="w-full gap-2">
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground text-center">
                <strong>For Administrators:</strong> Create a profile row for this user in the profiles table with the appropriate role (admin, manager, salesperson, runner, or driver).
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fallback - should never reach here due to exhaustive state handling
  console.error('[ProfileGate] Unknown profileStatus:', profileStatus);
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <UserX className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-xl">Unexpected Error</CardTitle>
          <CardDescription>Something went wrong with your session.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button variant="destructive" onClick={onResetSession} className="w-full gap-2">
            <LogOut className="h-4 w-4" />
            Sign Out & Try Again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
