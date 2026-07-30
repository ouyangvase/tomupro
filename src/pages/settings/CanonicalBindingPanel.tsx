import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUsers } from '@/hooks/useUsers';
import {
  useAddManagerSalespersonBindings,
  useAddRunnerDriverBindings,
  useManagerSalespersonBindingRows,
  useRemoveManagerSalespersonBinding,
  useRemoveRunnerDriverBinding,
  useRunnerDriverBindingRows,
} from '@/hooks/useSystemBindings';
import { indexBindingPairs, matchesBindingCount, pluralizeBinding, type BindingPair } from '@/lib/systemBindings';
import type { Profile } from '@/types/database';

type BindingMode = 'salesperson' | 'driver';

interface CanonicalBindingPanelProps {
  mode: BindingMode;
}

interface RemoveTarget {
  bindingId: string;
  ownerName: string;
  subjectName: string;
}

const VISIBLE_BINDINGS = 5;

function userLabel(user?: Profile) {
  return user?.display_name || user?.email || 'Unknown user';
}

function includesSearch(user: Profile | undefined, search: string) {
  if (!user) return false;
  const value = `${user.display_name || ''} ${user.email || ''}`.toLowerCase();
  return value.includes(search);
}

export default function CanonicalBindingPanel({ mode }: CanonicalBindingPanelProps) {
  const isSalespersonMode = mode === 'salesperson';
  const { data: users = [], isLoading: usersLoading } = useUsers();
  const managerRows = useManagerSalespersonBindingRows();
  const runnerRows = useRunnerDriverBindingRows();
  const addSalespersons = useAddManagerSalespersonBindings();
  const removeSalesperson = useRemoveManagerSalespersonBinding();
  const addDrivers = useAddRunnerDriverBindings();
  const removeDriver = useRemoveRunnerDriverBinding();

  const [search, setSearch] = useState('');
  const [boundFilter, setBoundFilter] = useState('all');
  const [countFilter, setCountFilter] = useState('all');
  const [runnerFilter, setRunnerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOwner, setDialogOwner] = useState<Profile | null>(null);
  const [dialogSearch, setDialogSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);
  const [expandedOwners, setExpandedOwners] = useState<Set<string>>(new Set());

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const owners = useMemo(
    () => users.filter((user) => user.role === (isSalespersonMode ? 'manager' : 'runner') && user.is_active),
    [isSalespersonMode, users],
  );
  const subjects = useMemo(
    () => users.filter((user) => user.role === (isSalespersonMode ? 'salesperson' : 'driver')),
    [isSalespersonMode, users],
  );

  const pairs = useMemo<BindingPair[]>(() => {
    if (isSalespersonMode) {
      return (managerRows.data || []).map((row) => ({
        id: row.id,
        ownerId: row.manager_id,
        subjectId: row.salesperson_id,
      }));
    }

    return (runnerRows.data || []).map((row) => ({
      id: row.id,
      ownerId: row.runner_id,
      subjectId: row.driver_id,
    }));
  }, [isSalespersonMode, managerRows.data, runnerRows.data]);

  const bindingIndex = useMemo(() => indexBindingPairs(pairs), [pairs]);
  const normalizedSearch = search.trim().toLowerCase();

  const filteredOwners = useMemo(() => owners.filter((owner) => {
    if (mode === 'driver' && runnerFilter !== 'all' && owner.id !== runnerFilter) return false;

    const ownerPairs = bindingIndex.byOwner.get(owner.id) || [];
    const count = ownerPairs.length;
    if (boundFilter === 'bound' && count === 0) return false;
    if (boundFilter === 'unbound' && count > 0) return false;
    if (!matchesBindingCount(count, countFilter)) return false;

    if (!normalizedSearch) return true;
    if (includesSearch(owner, normalizedSearch)) return true;
    return ownerPairs.some((pair) => includesSearch(usersById.get(pair.subjectId), normalizedSearch));
  }), [bindingIndex.byOwner, boundFilter, countFilter, mode, normalizedSearch, owners, runnerFilter, usersById]);

  const dialogBoundIds = useMemo(
    () =>
      new Set(
        (dialogOwner ? bindingIndex.byOwner.get(dialogOwner.id) || [] : []).map(
          (pair) => pair.subjectId,
        ),
      ),
    [bindingIndex.byOwner, dialogOwner],
  );

  const dialogSubjects = useMemo(() => {
    const value = dialogSearch.trim().toLowerCase();
    return subjects.filter((subject) => {
      if (mode === 'driver' && statusFilter === 'active' && !subject.is_active) return false;
      if (mode === 'driver' && statusFilter === 'inactive' && subject.is_active) return false;
      return !value || includesSearch(subject, value);
    });
  }, [dialogSearch, mode, statusFilter, subjects]);

  const isLoading = usersLoading || managerRows.isLoading || runnerRows.isLoading;
  const addPending = addSalespersons.isPending || addDrivers.isPending;
  const removePending = removeSalesperson.isPending || removeDriver.isPending;

  const ownerSingular = isSalespersonMode ? 'manager' : 'runner';
  const subjectSingular = isSalespersonMode ? 'salesperson' : 'driver';
  const subjectPlural = isSalespersonMode ? 'salespersons' : 'drivers';

  const openAddDialog = (owner: Profile) => {
    setDialogOwner(owner);
    setDialogSearch('');
    setStatusFilter('all');
    setSelectedIds([]);
  };

  const closeAddDialog = () => {
    setDialogOwner(null);
    setSelectedIds([]);
  };

  const toggleSubject = (subject: Profile) => {
    if (dialogBoundIds.has(subject.id) || !subject.is_active) return;
    setSelectedIds((current) => current.includes(subject.id)
      ? current.filter((id) => id !== subject.id)
      : [...current, subject.id]);
  };

  const saveBindings = async () => {
    if (!dialogOwner || selectedIds.length === 0) return;

    if (isSalespersonMode) {
      await addSalespersons.mutateAsync({ managerId: dialogOwner.id, salespersonIds: selectedIds });
    } else {
      await addDrivers.mutateAsync({ runnerId: dialogOwner.id, driverIds: selectedIds });
    }
    closeAddDialog();
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    if (isSalespersonMode) {
      await removeSalesperson.mutateAsync(removeTarget.bindingId);
    } else {
      await removeDriver.mutateAsync(removeTarget.bindingId);
    }
    setRemoveTarget(null);
  };

  const toggleExpanded = (ownerId: string) => {
    setExpandedOwners((current) => {
      const next = new Set(current);
      if (next.has(ownerId)) next.delete(ownerId);
      else next.add(ownerId);
      return next;
    });
  };

  return (
    <div className="space-y-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, email, or username..."
            className="pl-10"
          />
        </div>
        <Select value={boundFilter} onValueChange={setBoundFilter}>
          <SelectTrigger aria-label="Binding status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All binding statuses</SelectItem>
            <SelectItem value="bound">Bound</SelectItem>
            <SelectItem value="unbound">Unbound</SelectItem>
          </SelectContent>
        </Select>
        <Select value={countFilter} onValueChange={setCountFilter}>
          <SelectTrigger aria-label="Binding count filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any binding count</SelectItem>
            <SelectItem value="none">0 bindings</SelectItem>
            <SelectItem value="one">1 binding</SelectItem>
            <SelectItem value="two-three">2-3 bindings</SelectItem>
            <SelectItem value="four-plus">4+ bindings</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {mode === 'driver' && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Select value={runnerFilter} onValueChange={setRunnerFilter}>
            <SelectTrigger aria-label="Runner filter">
              <SelectValue placeholder="All runners" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All runners</SelectItem>
              {owners.map((runner) => (
                <SelectItem key={runner.id} value={runner.id}>{userLabel(runner)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="flex items-center text-sm text-muted-foreground">
            Driver status is available in the Add Drivers list.
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground">Loading bindings...</div>
      ) : filteredOwners.length === 0 ? (
        <div className="py-16 text-center">
          <Users className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
          <p className="font-medium">No matching users found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filteredOwners.map((owner) => {
            const ownerPairs = bindingIndex.byOwner.get(owner.id) || [];
            const expanded = expandedOwners.has(owner.id);
            const visiblePairs = expanded ? ownerPairs : ownerPairs.slice(0, VISIBLE_BINDINGS);

            return (
              <Card key={owner.id} className="overflow-hidden rounded-lg">
                <CardHeader className="space-y-3 border-b p-4">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="break-words text-lg">{userLabel(owner)}</CardTitle>
                      <p className="break-all text-sm text-muted-foreground">{owner.email || 'No email'}</p>
                      <p className="mt-1 text-sm font-medium text-primary">
                        {pluralizeBinding(ownerPairs.length, subjectSingular, subjectPlural)}
                      </p>
                    </div>
                    <Button className="shrink-0" size="sm" onClick={() => openAddDialog(owner)}>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Add {isSalespersonMode ? 'Salespersons' : 'Drivers'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {ownerPairs.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                      {isSalespersonMode
                        ? 'No salespersons are currently bound to this manager.'
                        : 'No drivers are currently bound to this runner.'}
                    </p>
                  ) : (
                    <div className="divide-y">
                      {visiblePairs.map((pair) => {
                        const subject = usersById.get(pair.subjectId);
                        return (
                          <div key={pair.id} className="flex items-center justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                              <p className="break-words font-medium">{userLabel(subject)}</p>
                              <p className="break-all text-sm text-muted-foreground">{subject?.email || 'No email'}</p>
                              {mode === 'driver' && !subject?.is_active && (
                                <p className="mt-1 text-xs font-medium text-destructive">Inactive driver</p>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="shrink-0 text-destructive hover:text-destructive"
                              onClick={() => setRemoveTarget({
                                bindingId: pair.id,
                                ownerName: userLabel(owner),
                                subjectName: userLabel(subject),
                              })}
                            >
                              <Trash2 className="mr-1 h-4 w-4" />
                              Remove
                            </Button>
                          </div>
                        );
                      })}
                      {ownerPairs.length > VISIBLE_BINDINGS && (
                        <Button
                          variant="ghost"
                          className="h-11 w-full rounded-none"
                          onClick={() => toggleExpanded(owner.id)}
                        >
                          {expanded ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
                          {expanded ? 'Show less' : `Show all ${subjectPlural}`}
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(dialogOwner)} onOpenChange={(open) => !open && closeAddDialog()}>
        <DialogContent className="max-h-[88dvh] max-w-xl overflow-hidden p-0">
          <DialogHeader className="border-b px-5 pb-4 pt-5">
            <DialogTitle>Add {isSalespersonMode ? 'Salespersons' : 'Drivers'}</DialogTitle>
            <DialogDescription>
              Add to {userLabel(dialogOwner)}. Existing bindings with other {ownerSingular}s remain unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto px-5 py-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={dialogSearch}
                onChange={(event) => setDialogSearch(event.target.value)}
                placeholder={`Search ${subjectPlural}...`}
                className="pl-10"
              />
            </div>
            {mode === 'driver' && (
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger aria-label="Driver status filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All driver statuses</SelectItem>
                  <SelectItem value="active">Active drivers</SelectItem>
                  <SelectItem value="inactive">Inactive drivers</SelectItem>
                </SelectContent>
              </Select>
            )}
            <div className="divide-y rounded-lg border">
              {dialogSubjects.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">No matching users found.</p>
              ) : dialogSubjects.map((subject) => {
                const alreadyAdded = dialogBoundIds.has(subject.id);
                const subjectPairs = bindingIndex.bySubject.get(subject.id) || [];
                const ownerNames = subjectPairs
                  .map((pair) => userLabel(usersById.get(pair.ownerId)))
                  .join(', ');
                const disabled = alreadyAdded || !subject.is_active;

                return (
                  <label
                    key={subject.id}
                    className={`flex gap-3 px-4 py-3 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-muted/40'}`}
                  >
                    <Checkbox
                      checked={alreadyAdded || selectedIds.includes(subject.id)}
                      disabled={disabled}
                      onCheckedChange={() => toggleSubject(subject)}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="break-words font-medium">{userLabel(subject)}</p>
                        {alreadyAdded && <span className="text-xs font-semibold text-primary">Already Added</span>}
                        {!subject.is_active && <span className="text-xs font-semibold text-destructive">Inactive</span>}
                      </div>
                      <p className="break-all text-sm text-muted-foreground">{subject.email || 'No email'}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Bound to {pluralizeBinding(subjectPairs.length, ownerSingular)}
                        {ownerNames ? `: ${ownerNames}` : ''}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
          <DialogFooter className="border-t px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
            <Button variant="outline" onClick={closeAddDialog}>Cancel</Button>
            <Button disabled={selectedIds.length === 0 || addPending} onClick={saveBindings}>
              {addPending ? 'Adding...' : `Add ${selectedIds.length || ''} ${selectedIds.length === 1 ? subjectSingular : subjectPlural}`.trim()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(removeTarget)} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove binding?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget && (isSalespersonMode
                ? `Remove ${removeTarget.subjectName} from ${removeTarget.ownerName}'s team?`
                : `Remove ${removeTarget.subjectName} from ${removeTarget.ownerName}'s runner team?`)}
              {' '}Other bindings, accounts, orders, and delivery history will remain unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={removePending} onClick={confirmRemove}>
              {removePending ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
