import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Loader2, LogOut, RefreshCw, UserX } from "lucide-react";

export type ProfileStatus = 'idle' | 'loading' | 'ready' | 'error' | 'missing';

interface ProfileGateProps {
  profileStatus: ProfileStatus;
  profileError: string | null;
  onRetry: () => void;
  onResetSession: () => void;
  children: React.ReactNode;
}

export function ProfileGate({ 
  profileStatus, 
  profileError, 
  onRetry, 
  onResetSession, 
  children 
}: ProfileGateProps) {
  // Show children when profile is ready
  if (profileStatus === 'ready') {
    return <>{children}</>;
  }

  // Loading state
  if (profileStatus === 'loading' || profileStatus === 'idle') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground text-lg">Loading your profile...</p>
        </div>
      </div>
    );
  }

  // Error state - profile fetch failed
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

  // Missing state - no profile row exists
  if (profileStatus === 'missing') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warning/10">
              <UserX className="h-8 w-8 text-[hsl(var(--status-warning))]" />
            </div>
            <CardTitle className="text-xl">Account Setup Incomplete</CardTitle>
            <CardDescription className="text-base">
              Your account exists but your profile hasn't been set up yet. 
              Please contact an administrator to complete your account setup.
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
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fallback - should never reach here
  return null;
}
