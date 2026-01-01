import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useUsers } from '@/hooks/useUsers';
import {
  useBindings,
  useCreateBindings,
  useUpdateBinding,
} from '@/hooks/useBindings';
import { Link2, Link2Off, Search, Users, UserCheck, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import type { Profile } from '@/types/database';
import { cn } from '@/lib/utils';

export default function BindingsSettings() {
  const { profile, role } = useAuth();
  const isAdmin = role === 'admin';
  const isSalesperson = role === 'salesperson';

  const { data: users = [], isLoading: usersLoading } = useUsers();
  const createBindings = useCreateBindings();
  const updateBinding = useUpdateBinding();

  // Salesperson or selected salesperson
  const [selectedSalesperson, setSelectedSalesperson] = useState<Profile | null>(null);
  const [salespersonSearch, setSelespersonSearch] = useState('');
  const [runnerSearch, setRunnerSearch] = useState('');

  // Bind dialog state
  const [bindDialogOpen, setBindDialogOpen] = useState(false);
  const [selectedRunners, setSelectedRunners] = useState<string[]>([]);

  // Filter users by role
  const salespersons = useMemo(
    () => users.filter((u) => u.role === 'salesperson'),
    [users]
  );
  const runners = useMemo(() => users.filter((u) => u.role === 'runner'), [users]);

  // For salesperson view, auto-select themselves
  const effectiveSalesperson = isSalesperson
    ? users.find((u) => u.id === profile?.id) || null
    : selectedSalesperson;

  // Fetch bindings for selected salesperson
  const { data: bindings = [], isLoading: bindingsLoading } = useBindings(
    effectiveSalesperson
      ? { salespersonId: effectiveSalesperson.id, includeInactive: true }
      : undefined
  );

  // Filtered salespersons
  const filteredSalespersons = useMemo(() => {
    const searchLower = salespersonSearch.toLowerCase();
    return salespersons.filter(
      (s) =>
        !salespersonSearch ||
        s.display_name.toLowerCase().includes(searchLower) ||
        s.email.toLowerCase().includes(searchLower)
    );
  }, [salespersons, salespersonSearch]);

  // Available runners (not already bound)
  const boundRunnerIds = useMemo(
    () => new Set(bindings.filter((b) => b.active).map((b) => b.runner_id)),
    [bindings]
  );

  const availableRunners = useMemo(() => {
    const searchLower = runnerSearch.toLowerCase();
    return runners.filter(
      (r) =>
        !boundRunnerIds.has(r.id) &&
        (!runnerSearch ||
          r.display_name.toLowerCase().includes(searchLower) ||
          r.email.toLowerCase().includes(searchLower))
    );
  }, [runners, boundRunnerIds, runnerSearch]);

  const handleSelectSalesperson = (sp: Profile) => {
    setSelectedSalesperson(sp);
    setSelectedRunners([]);
  };

  const handleOpenBindDialog = () => {
    setSelectedRunners([]);
    setRunnerSearch('');
    setBindDialogOpen(true);
  };

  const handleBindRunners = async () => {
    if (!effectiveSalesperson || selectedRunners.length === 0) return;

    await createBindings.mutateAsync({
      salesperson_id: effectiveSalesperson.id,
      runner_ids: selectedRunners,
    });

    setBindDialogOpen(false);
    setSelectedRunners([]);
  };

  const handleToggleBinding = async (bindingId: string, currentActive: boolean) => {
    await updateBinding.mutateAsync({
      id: bindingId,
      active: !currentActive,
    });
  };

  const toggleRunnerSelection = (runnerId: string) => {
    setSelectedRunners((prev) =>
      prev.includes(runnerId)
        ? prev.filter((id) => id !== runnerId)
        : [...prev, runnerId]
    );
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link2 className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">
              {isSalesperson ? 'My Bindings' : 'Binding Management'}
            </h1>
            <p className="text-muted-foreground">
              {isSalesperson
                ? 'View runners assigned to your account'
                : 'Manage salesperson-runner bindings'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Panel: Salesperson List (Admin/Manager only) */}
          {!isSalesperson && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Salespersons
                </CardTitle>
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search salespersons..."
                    value={salespersonSearch}
                    onChange={(e) => setSelespersonSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[400px]">
                  {usersLoading ? (
                    <div className="p-4 text-center text-muted-foreground">
                      Loading...
                    </div>
                  ) : filteredSalespersons.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      No salespersons found
                    </div>
                  ) : (
                    <div className="divide-y">
                      {filteredSalespersons.map((sp) => {
                        const isSelected = selectedSalesperson?.id === sp.id;
                        const spBindings = bindings.filter(
                          (b) => b.salesperson_id === sp.id && b.active
                        );
                        return (
                          <button
                            key={sp.id}
                            onClick={() => handleSelectSalesperson(sp)}
                            className={cn(
                              'w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors flex items-center justify-between',
                              isSelected && 'bg-primary/10'
                            )}
                          >
                            <div>
                              <p className="font-medium">{sp.display_name}</p>
                              <p className="text-sm text-muted-foreground">
                                {sp.email}
                              </p>
                            </div>
                            <Badge variant="secondary">
                              {spBindings.length} runner{spBindings.length !== 1 ? 's' : ''}
                            </Badge>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Right Panel: Bound Runners */}
          <Card className={isSalesperson ? 'lg:col-span-2' : ''}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <UserCheck className="h-5 w-5" />
                  {effectiveSalesperson
                    ? `Runners for ${effectiveSalesperson.display_name}`
                    : 'Select a Salesperson'}
                </CardTitle>
                {isAdmin && effectiveSalesperson && (
                  <Button size="sm" onClick={handleOpenBindDialog}>
                    <Link2 className="h-4 w-4 mr-2" />
                    Bind Runners
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                {!effectiveSalesperson ? (
                  <div className="p-8 text-center text-muted-foreground">
                    Select a salesperson to view their bindings
                  </div>
                ) : bindingsLoading ? (
                  <div className="p-4 text-center text-muted-foreground">
                    Loading...
                  </div>
                ) : bindings.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    No runners bound to this salesperson
                  </div>
                ) : (
                  <div className="divide-y">
                    {bindings.map((binding) => (
                      <div
                        key={binding.id}
                        className={cn(
                          'px-4 py-3 flex items-center justify-between',
                          !binding.active && 'opacity-50 bg-muted/30'
                        )}
                      >
                        <div>
                          <p className="font-medium">
                            {binding.runner?.display_name || 'Unknown'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {binding.runner?.email}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Bound {format(new Date(binding.created_at), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={binding.active ? 'default' : 'secondary'}>
                            {binding.active ? 'Active' : 'Inactive'}
                          </Badge>
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant={binding.active ? 'destructive' : 'outline'}
                              onClick={() =>
                                handleToggleBinding(binding.id, binding.active)
                              }
                              disabled={updateBinding.isPending}
                            >
                              {binding.active ? (
                                <>
                                  <Link2Off className="h-4 w-4 mr-1" />
                                  Unbind
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="h-4 w-4 mr-1" />
                                  Re-enable
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bind Runners Dialog */}
      <Dialog open={bindDialogOpen} onOpenChange={setBindDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bind Runners to {effectiveSalesperson?.display_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search runners..."
                value={runnerSearch}
                onChange={(e) => setRunnerSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <ScrollArea className="h-[300px] border rounded-md">
              {availableRunners.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  No available runners to bind
                </div>
              ) : (
                <div className="divide-y">
                  {availableRunners.map((runner) => (
                    <label
                      key={runner.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedRunners.includes(runner.id)}
                        onCheckedChange={() => toggleRunnerSelection(runner.id)}
                      />
                      <div>
                        <p className="font-medium">{runner.display_name}</p>
                        <p className="text-sm text-muted-foreground">{runner.email}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </ScrollArea>
            {selectedRunners.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {selectedRunners.length} runner{selectedRunners.length !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBindDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleBindRunners}
              disabled={selectedRunners.length === 0 || createBindings.isPending}
            >
              {createBindings.isPending
                ? 'Binding...'
                : `Bind ${selectedRunners.length} Runner${selectedRunners.length !== 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
