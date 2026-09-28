import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  AlertCircle,
  Check,
  Copy,
  Gift,
  Link2,
  Loader2,
  RefreshCw,
  Users,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useReferralRewards } from '@/hooks/useReferralRewards';
import {
  buildReferralUrl,
  getCurrentMonthRebate,
  getReferralProgress,
  isReferralEligibleRole,
} from '@/lib/referralRewards';
import { useToast } from '@/hooks/use-toast';

function formatPoints(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatJoinedDate(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kuala_Lumpur',
  }).format(date);
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Copy is not available on this device');
}

function ReferralPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <Skeleton className="h-20 w-full" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
      <Skeleton className="h-32" />
      <Skeleton className="h-28" />
      <Skeleton className="h-52" />
    </div>
  );
}

const ReferralRewardsPage = () => {
  const { role } = useAuth();
  const query = useReferralRewards();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  if (!isReferralEligibleRole(role)) {
    return <Navigate to="/" replace />;
  }

  const copyReferralLink = async () => {
    if (!query.data?.referralCode) return;
    try {
      const origin = typeof window === 'undefined' ? 'https://www.tomu.my' : window.location.origin;
      await copyText(buildReferralUrl(query.data.referralCode, origin));
      setCopied(true);
      toast({ title: 'Referral link copied' });
      window.setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      toast({
        title: 'Could not copy referral link',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-2xl space-y-4 pb-6">
        <header className="flex items-center gap-3 px-1 py-2">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Gift className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Rewards</p>
            <h1 className="text-2xl font-bold tracking-tight">Referral Rewards</h1>
          </div>
        </header>

        {query.isLoading && <ReferralPageSkeleton />}

        {query.isError && (
          <Card className="border-destructive/30">
            <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <div>
                <p className="font-semibold">Referral Rewards could not load</p>
                <p className="mt-1 text-sm text-muted-foreground">Please try again in a moment.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
                {query.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Try again
              </Button>
            </CardContent>
          </Card>
        )}

        {query.data && (() => {
          const rewards = query.data;
          const progress = getReferralProgress(rewards.currentPoints, rewards.tiers);
          const currentRebate = getCurrentMonthRebate(rewards.currentRebatePercent);
          const referralUrl = buildReferralUrl(
            rewards.referralCode,
            typeof window === 'undefined' ? 'https://www.tomu.my' : window.location.origin,
          );

          return (
            <>
              <Card className="border-primary/25 bg-primary/[0.04]">
                <CardHeader className="pb-3">
                  <CardDescription className="font-semibold uppercase tracking-[0.16em] text-primary">
                    Current month rebate
                  </CardDescription>
                  <CardTitle className="text-4xl tracking-tight">{currentRebate}% OFF</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Earned from last month&apos;s Referral Points.
                  </p>
                </CardHeader>
              </Card>

              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription className="font-semibold uppercase tracking-[0.12em]">
                      This month referral points
                    </CardDescription>
                    <CardTitle className="text-3xl tracking-tight">{formatPoints(rewards.currentPoints)} pts</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      This month&apos;s points determine next month&apos;s rebate.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription className="font-semibold uppercase tracking-[0.12em]">
                      Progress / next target
                    </CardDescription>
                    <CardTitle className="text-xl tracking-tight">
                      {progress.isMaximum
                        ? `${formatPoints(progress.points)} pts`
                        : `${formatPoints(progress.points)} / ${formatPoints(progress.targetPoints || 0)} pts`}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-2 overflow-hidden rounded-full bg-secondary" aria-label="Referral progress">
                      <div
                        className="h-full rounded-full bg-primary transition-[width]"
                        style={{ width: `${progress.progressPercent}%` }}
                      />
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {progress.isMaximum
                        ? 'Maximum reward reached for next month.'
                        : `${formatPoints(progress.pointsRemaining)} more points to unlock ${progress.nextRebatePercent}% rebate next month.`}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardDescription className="font-semibold uppercase tracking-[0.16em]">
                    Your referral link
                  </CardDescription>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Link2 className="h-5 w-5 text-primary" />
                    Share directly with a new user
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2">
                      <p className="truncate text-sm text-muted-foreground">{referralUrl}</p>
                    </div>
                    <Button onClick={copyReferralLink} className="shrink-0" disabled={!rewards.referralCode}>
                      {copied ? <Check /> : <Copy />}
                      {copied ? 'Copied' : 'Copy link'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardDescription className="font-semibold uppercase tracking-[0.16em]">
                    My direct referrals
                  </CardDescription>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Users className="h-5 w-5 text-primary" />
                    {rewards.directReferrals.length} Direct Referrals
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {rewards.directReferrals.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/70 px-4 py-6 text-center">
                      <p className="font-medium">No referrals yet.</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Share your referral link to start earning Referral Points.
                      </p>
                      <Button variant="outline" size="sm" className="mt-4" onClick={copyReferralLink}>
                        {copied ? <Check /> : <Copy />}
                        {copied ? 'Copied' : 'Copy referral link'}
                      </Button>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/50">
                      {rewards.directReferrals.map((referral, index) => (
                        <div
                          key={`${referral.displayName}-${referral.joinedAt}-${index}`}
                          className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">{referral.displayName}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatJoinedDate(referral.joinedAt)}
                              {formatJoinedDate(referral.joinedAt) && ' · '}
                              {referral.status.toLowerCase() === 'active' ? 'Active' : 'Pending'}
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-semibold text-primary">
                            {formatPoints(referral.contributedPoints)} pts
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          );
        })()}
      </div>
    </AppLayout>
  );
};

export default ReferralRewardsPage;
