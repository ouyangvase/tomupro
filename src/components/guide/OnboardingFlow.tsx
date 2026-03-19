import { useState, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboardingSession, useCreateOnboardingSession } from '@/hooks/useGuideCenter';
import { onboardingFlows, type GuideRole } from '@/data/guideContent';
import { ChevronRight, ChevronLeft, Sparkles, CheckCircle } from 'lucide-react';

// Public routes where onboarding must never appear
const PUBLIC_ROUTES = ['/auth', '/reset-password', '/force-password-change'];

// Only auto-show for accounts created within the last 7 days
const NEW_USER_THRESHOLD_DAYS = 7;

export function OnboardingFlow() {
  const { user, profile } = useAuth();
  const location = useLocation();
  const { data: session, isLoading } = useOnboardingSession();
  const createSession = useCreateOnboardingSession();
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [delayPassed, setDelayPassed] = useState(false);

  const role = (profile?.role as GuideRole) || 'salesperson';
  const onboarding = onboardingFlows.find(o => o.role === role);

  // Add a short delay after login before showing onboarding
  useEffect(() => {
    if (!user || !profile) {
      setDelayPassed(false);
      return;
    }
    const timer = setTimeout(() => setDelayPassed(true), 1500);
    return () => clearTimeout(timer);
  }, [user, profile]);

  // Check if user is on a public route
  const isPublicRoute = PUBLIC_ROUTES.some(r => location.pathname.startsWith(r));

  // Check if user is "new" enough for auto-onboarding
  const isNewUser = (() => {
    if (!profile?.created_at) return false;
    const created = new Date(profile.created_at);
    const now = new Date();
    const diffDays = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= NEW_USER_THRESHOLD_DAYS;
  })();

  // Determine if onboarding was already completed or skipped
  const isCompletedOrSkipped = session && (
    session.status === 'completed' || session.status === 'skipped'
  );

  // Show onboarding only when ALL conditions are met:
  // 1. User is authenticated with a profile
  // 2. Not on a public route
  // 3. Delay has passed (post-login feel)
  // 4. Not loading session data
  // 5. No completed/skipped session exists
  // 6. User is new (created recently) — old users won't get auto-popup
  // 7. Not dismissed this browser session
  // 8. Onboarding content exists for this role
  const shouldShow =
    !!user &&
    !!profile &&
    !isPublicRoute &&
    delayPassed &&
    !isLoading &&
    !isCompletedOrSkipped &&
    isNewUser &&
    !dismissed &&
    !!onboarding;

  const totalSteps = onboarding ? onboarding.steps.length + 2 : 0;

  const handleStart = useCallback(() => {
    createSession.mutate('start');
  }, [createSession]);

  const handleSkip = useCallback(() => {
    createSession.mutate('skip');
    setDismissed(true);
  }, [createSession]);

  const handleFinish = useCallback(() => {
    createSession.mutate('finish');
    setDismissed(true);
  }, [createSession]);

  const handleNext = () => {
    if (step === totalSteps - 1) {
      handleFinish();
    } else {
      setStep(s => s + 1);
    }
  };

  const handleBack = () => setStep(s => Math.max(0, s - 1));

  if (!shouldShow || !onboarding) return null;

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden [&>button]:hidden" onPointerDownOutside={(e) => e.preventDefault()}>
        {/* Progress bar */}
        <div className="h-1 bg-secondary">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
          />
        </div>

        <div className="p-6">
          {/* Welcome screen */}
          {step === 0 && (
            <div className="text-center space-y-4">
              <img src={onboarding.image} alt={role} className="h-28 mx-auto object-contain" />
              <div>
                <h2 className="text-xl font-bold">{onboarding.welcome}</h2>
                <p className="text-sm text-muted-foreground mt-1">{onboarding.subtitle}</p>
              </div>
              <Badge variant="outline" className="capitalize">{role}</Badge>
            </div>
          )}

          {/* What you do screen */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold">What You Do</h2>
              </div>
              <p className="text-sm text-muted-foreground">{onboarding.whatYouDo}</p>
              <div className="space-y-2 mt-4">
                <p className="text-sm font-semibold">Your first 3 actions:</p>
                {onboarding.firstActions.map((action, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                    <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <p className="text-sm">{action}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step screens */}
          {step >= 2 && onboarding.steps[step - 2] && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[10px]">
                  Step {step - 1} of {onboarding.steps.length}
                </Badge>
              </div>
              <h2 className="text-lg font-bold">{onboarding.steps[step - 2].title}</h2>
              <p className="text-sm text-muted-foreground">{onboarding.steps[step - 2].description}</p>
              {onboarding.steps[step - 2].actions && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Key actions</p>
                  {onboarding.steps[step - 2].actions!.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-3.5 w-3.5 text-[hsl(var(--status-success))]" />
                      {a}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 pb-5">
          <Button variant="ghost" size="sm" onClick={handleSkip} className="text-xs text-muted-foreground">
            Skip onboarding
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={handleBack}>
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Back
              </Button>
            )}
            <Button size="sm" onClick={step === 0 ? () => { handleStart(); handleNext(); } : handleNext}>
              {step === totalSteps - 1 ? (
                <>
                  <CheckCircle className="h-3.5 w-3.5 mr-1" />
                  Get Started
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
