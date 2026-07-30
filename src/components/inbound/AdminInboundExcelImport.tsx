import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { UserRound } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRunnerBoundUsers } from '@/hooks/useRunnerBoundUsers';
import { useUsers } from '@/hooks/useUsers';

const InboundExcelImport = lazy(() => import('@/components/inbound/InboundExcelImport')
  .then((module) => ({ default: module.InboundExcelImport })));

export function AdminInboundExcelImport() {
  const { data: users = [], isLoading: usersLoading } = useUsers();
  const runners = useMemo(
    () => users.filter((user) => user.role === 'runner' && user.is_active),
    [users],
  );
  const [runnerId, setRunnerId] = useState('');
  const { data: boundUsers = [], isLoading: boundUsersLoading } = useRunnerBoundUsers(runnerId);

  useEffect(() => {
    if (!runnerId && runners.length > 0) {
      setRunnerId(runners[0].id);
    } else if (runnerId && !runners.some((runner) => runner.id === runnerId)) {
      setRunnerId(runners[0]?.id || '');
    }
  }, [runnerId, runners]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-lg border bg-card px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-2 sm:w-56">
          <UserRound className="h-4 w-4 shrink-0 text-primary" />
          <Label htmlFor="admin-inbound-runner" className="whitespace-nowrap">Import for runner</Label>
        </div>
        <Select value={runnerId} onValueChange={setRunnerId} disabled={usersLoading || runners.length === 0}>
          <SelectTrigger id="admin-inbound-runner" className="w-full sm:max-w-sm">
            <SelectValue placeholder={usersLoading ? 'Loading runners...' : 'Select runner'} />
          </SelectTrigger>
          <SelectContent>
            {runners.map((runner) => (
              <SelectItem key={runner.id} value={runner.id}>
                {runner.display_name || runner.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!usersLoading && runners.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active runner is available.</p>
        ) : null}
      </div>

      {runnerId ? (
        <Suspense fallback={<div className="h-16 animate-pulse rounded-lg border bg-muted/30" />}>
          <InboundExcelImport
            runnerId={runnerId}
            boundUsers={boundUsers}
            disabled={boundUsersLoading || boundUsers.length === 0}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
