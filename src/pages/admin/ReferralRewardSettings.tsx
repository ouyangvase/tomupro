import { useEffect, useState } from 'react';
import { AlertCircle, Gift, History, Plus, Save, Search, ShieldCheck, Trash2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import {
  useReferralAdminOverview,
  useReferralAdminSettings,
  useSaveReferralAdminSettings,
} from '@/hooks/useReferralAdminSettings';
import { validateReferralTiers } from '@/lib/referralAdminSettings';
import type { ReferralTier } from '@/lib/referralRewards';
import { useToast } from '@/hooks/use-toast';

type View = 'settings' | 'overview';

function formatMonth(value: string): string {
  if (!/^\d{4}-\d{2}/.test(value)) return value || '—';
  const date = new Date(`${value.slice(0, 7)}-01T00:00:00`);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date);
}

function formatDate(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kuala_Lumpur',
  }).format(date);
}

function formatPoints(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function tierKey(tier: ReferralTier, index: number): string {
  return `${tier.min_points}-${tier.rebate_percent}-${index}`;
}

function tiersMatch(left: ReferralTier[], right: ReferralTier[]): boolean {
  return left.length === right.length && left.every((tier, index) => (
    tier.min_points === right[index]?.min_points && tier.rebate_percent === right[index]?.rebate_percent
  ));
}

function TierEditor({ tiers, onChange }: { tiers: ReferralTier[]; onChange: (tiers: ReferralTier[]) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-3 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <span>Minimum points</span>
        <span>Rebate %</span>
        <span className="sr-only">Actions</span>
      </div>
      {tiers.map((tier, index) => (
        <div key={tierKey(tier, index)} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
          <div>
            <Label htmlFor={`referral-min-${index}`} className="sr-only">Minimum points</Label>
            <Input
              id={`referral-min-${index}`}
              type="number"
              min="0"
              step="1"
              value={tier.min_points}
              onChange={(event) => {
                const next = [...tiers];
                next[index] = { ...tier, min_points: Number(event.target.value) };
                onChange(next);
              }}
            />
          </div>
          <div>
            <Label htmlFor={`referral-rebate-${index}`} className="sr-only">Rebate percent</Label>
            <Input
              id={`referral-rebate-${index}`}
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={tier.rebate_percent}
              onChange={(event) => {
                const next = [...tiers];
                next[index] = { ...tier, rebate_percent: Number(event.target.value) };
                onChange(next);
              }}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-destructive"
            aria-label={`Remove tier ${index + 1}`}
            onClick={() => onChange(tiers.filter((_, itemIndex) => itemIndex !== index))}
            disabled={tiers.length === 1}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2"
        onClick={() => onChange([...tiers, { min_points: 0, rebate_percent: 0 }])}
      >
        <Plus className="mr-2 h-4 w-4" />
        Add tier
      </Button>
    </div>
  );
}

function SettingsView() {
  const { data, isLoading, isError, refetch } = useReferralAdminSettings();
  const saveSettings = useSaveReferralAdminSettings();
  const { toast } = useToast();
  const [tiers, setTiers] = useState<ReferralTier[]>([]);

  useEffect(() => {
    if (data?.next.tiers) setTiers(data.next.tiers);
  }, [data?.next.tiers]);

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-72 w-full" /></div>;
  }

  if (isError || !data) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="font-semibold">Referral settings could not load</p>
          <Button variant="outline" onClick={() => refetch()}>Try again</Button>
        </CardContent>
      </Card>
    );
  }

  const validationError = validateReferralTiers(tiers);
  const hasChanges = !tiersMatch(tiers, data.next.tiers);

  const handleSave = async () => {
    if (validationError) {
      toast({ title: 'Check referral tiers', description: validationError, variant: 'destructive' });
      return;
    }
    try {
      await saveSettings.mutateAsync(tiers);
      toast({ title: 'Referral settings saved', description: `New rules will apply from ${formatMonth(data.next_effective_month)}.` });
    } catch (error) {
      toast({
        title: 'Could not save referral settings',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="uppercase tracking-[0.14em]">Current month</CardDescription>
            <CardTitle className="text-xl">{formatMonth(data.current_month)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Version {data.current.version} is locked for this earning month.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.current.tiers.map((tier) => <Badge key={tierKey(tier, tier.min_points)} variant="secondary">{formatPoints(tier.min_points)} pts → {tier.rebate_percent}%</Badge>)}
            </div>
          </CardContent>
        </Card>
        <Card className="border-primary/25 bg-primary/[0.03]">
          <CardHeader className="pb-3">
            <CardDescription className="uppercase tracking-[0.14em] text-primary">Next effective rules</CardDescription>
            <CardTitle className="text-xl">{formatMonth(data.next_effective_month)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Edits made now do not change the current month or closed history.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.next.tiers.map((tier) => <Badge key={tierKey(tier, tier.min_points)}>{formatPoints(tier.min_points)} pts → {tier.rebate_percent}%</Badge>)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <CardTitle>Referral reward tiers</CardTitle>
              <CardDescription className="mt-1">Configure the rebate earned by next month&apos;s direct-referral points.</CardDescription>
            </div>
            <Button onClick={handleSave} disabled={saveSettings.isPending || !hasChanges}>
              <Save className="mr-2 h-4 w-4" />
              {saveSettings.isPending ? 'Saving…' : 'Save tiers'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <TierEditor tiers={tiers} onChange={setTiers} />
          {validationError && <p className="mt-3 flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{validationError}</p>}
          <p className="mt-4 text-xs text-muted-foreground">The database enforces whole-number thresholds, a 0-point baseline, unique ascending thresholds, and a 0–100% rebate range.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><History className="h-5 w-5 text-primary" />Change history</CardTitle>
          <CardDescription>Every saved version is kept with the Admin, timestamp, and effective month.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.history.length === 0 ? <p className="text-sm text-muted-foreground">No changes recorded yet.</p> : (
            <div className="space-y-3">
              {data.history.map((item) => (
                <div key={item.id} className="rounded-xl border border-border/60 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">Version {item.new_rule_version} · effective {formatMonth(item.effective_month)}</span>
                    <span className="text-xs text-muted-foreground">{item.admin_name} · {formatDate(item.changed_at)}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{item.old_tiers.map((tier) => `${tier.min_points} pts → ${tier.rebate_percent}%`).join(' · ') || 'No prior tiers'} → {item.new_tiers.map((tier) => `${tier.min_points} pts → ${tier.rebate_percent}%`).join(' · ')}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OverviewView() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, refetch } = useReferralAdminOverview(search);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" />Referral overview</CardTitle>
        <CardDescription>Direct-only aggregates. No orders, customer details, Team data, or nested referral network is exposed.</CardDescription>
        <form className="flex flex-col gap-2 pt-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput); }}>
          <Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search name, user ID, or referral code" />
          <Button type="submit" variant="outline" className="shrink-0"><Search className="mr-2 h-4 w-4" />Search</Button>
        </form>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-48 w-full" /> : isError ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center"><AlertCircle className="h-8 w-8 text-destructive" /><p className="font-semibold">Overview could not load</p><Button variant="outline" onClick={() => refetch()}>Try again</Button></div>
        ) : data?.rows.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Referral code</TableHead><TableHead>Direct referrals</TableHead><TableHead>Current points</TableHead><TableHead>Current rebate</TableHead><TableHead>Next target</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.user_id}>
                    <TableCell><div className="font-medium">{row.display_name}</div><div className="font-mono text-[11px] text-muted-foreground">{row.user_id}</div></TableCell>
                    <TableCell className="font-mono text-xs">{row.referral_code || '—'}</TableCell>
                    <TableCell>{formatPoints(row.direct_referral_count)}</TableCell>
                    <TableCell>{formatPoints(row.current_points)} pts</TableCell>
                    <TableCell>{row.current_rebate_percent}%</TableCell>
                    <TableCell>{row.next_target_points === null ? 'Maximum' : `${formatPoints(row.next_target_points)} pts`}</TableCell>
                    <TableCell><Badge variant={row.relationship_status === 'ACTIVE' ? 'default' : 'secondary'}>{row.relationship_status.replaceAll('_', ' ')}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : <p className="py-8 text-center text-sm text-muted-foreground">No eligible users match this search.</p>}
      </CardContent>
    </Card>
  );
}

export default function ReferralRewardSettings() {
  const { role } = useAuth();
  const [view, setView] = useState<View>('settings');

  if (role !== 'admin') {
    return <Card><CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground"><ShieldCheck className="h-5 w-5 text-destructive" />Admin permission is required to manage Referral Rewards.</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Gift className="h-5 w-5" /></div>
        <div><h2 className="text-2xl font-bold">Referral Rewards</h2><p className="text-sm text-muted-foreground">Manage versioned direct-referral reward rules and safe aggregate oversight.</p></div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Button type="button" variant={view === 'settings' ? 'default' : 'outline'} onClick={() => setView('settings')}><Gift className="mr-2 h-4 w-4" />Settings</Button>
        <Button type="button" variant={view === 'overview' ? 'default' : 'outline'} onClick={() => setView('overview')}><Users className="mr-2 h-4 w-4" />Overview</Button>
      </div>
      {view === 'settings' ? <SettingsView /> : <OverviewView />}
    </div>
  );
}
