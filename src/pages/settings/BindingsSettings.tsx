import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useUsers } from '@/hooks/useUsers';
import {
  useBindings,
  useCreateBindings,
  useUpdateBinding,
} from '@/hooks/useBindings';
import {
  useManagerGroups,
  useGroupMembers,
  useCreateManagerGroup,
  useAddGroupMember,
  useRemoveGroupMember,
} from '@/hooks/useStockVisibility';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { Link2, Link2Off, Search, Users, UserCheck, RefreshCw, UserPlus, Trash2, Shield } from 'lucide-react';
import { format } from 'date-fns';
import type { Profile } from '@/types/database';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function BindingsSettings() {
  const { profile, role } = useAuth();
  const isAdmin = role === 'admin';
  const isManager = role === 'manager';
  const isSalesperson = role === 'salesperson';
  const canManageBindings = isAdmin || isManager;

  const { data: users = [], isLoading: usersLoading } = useUsers();
  const createBindings = useCreateBindings();
  const updateBinding = useUpdateBinding();

  // Manager group hooks
  const { data: managerGroups = [], isLoading: groupsLoading, refetch: refetchGroups } = useManagerGroups();
  const { data: allGroupMembers = [] } = useGroupMembers();
  const createGroup = useCreateManagerGroup();
  const addMember = useAddGroupMember();
  const removeMember = useRemoveGroupMember();
  
  // Team members for managers
  const { data: teamMembers = [] } = useTeamMembers();

  // Salesperson or selected salesperson (for SP-Runner binding)
  const [selectedSalesperson, setSelectedSalesperson] = useState<Profile | null>(null);
  const [salespersonSearch, setSelespersonSearch] = useState('');
  const [runnerSearch, setRunnerSearch] = useState('');

  // Manager binding state
  const [selectedManager, setSelectedManager] = useState<Profile | null>(null);
  const [managerSearch, setManagerSearch] = useState('');
  const [spSearchForManager, setSpSearchForManager] = useState('');
  const [selectedSalespersonsForManager, setSelectedSalespersonsForManager] = useState<string[]>([]);

  // Bind dialog state
  const [bindDialogOpen, setBindDialogOpen] = useState(false);
  const [selectedRunners, setSelectedRunners] = useState<string[]>([]);

  // Manager bind dialog
  const [managerBindDialogOpen, setManagerBindDialogOpen] = useState(false);

  // Confirm dialogs
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<{ id: string; name: string } | null>(null);

  // Filter users by role
  const allSalespersons = useMemo(
    () => users.filter((u) => u.role === 'salesperson'),
    [users]
  );
  
  // For managers, only show their team's salespersons; for admins, show all
  const salespersons = useMemo(() => {
    if (isManager && teamMembers.length > 0) {
      const teamMemberIds = new Set(teamMembers.map(m => m.id));
      return allSalespersons.filter((s) => teamMemberIds.has(s.id));
    }
    return allSalespersons;
  }, [allSalespersons, isManager, teamMembers]);
  
  const runners = useMemo(() => users.filter((u) => u.role === 'runner'), [users]);
  const managers = useMemo(() => users.filter((u) => u.role === 'manager'), [users]);

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

  // Filtered salespersons (for SP-Runner binding)
  const filteredSalespersons = useMemo(() => {
    const searchLower = salespersonSearch.toLowerCase();
    return salespersons.filter(
      (s) =>
        !salespersonSearch ||
        s.display_name.toLowerCase().includes(searchLower) ||
        s.email.toLowerCase().includes(searchLower)
    );
  }, [salespersons, salespersonSearch]);

  // Filtered managers
  const filteredManagers = useMemo(() => {
    const searchLower = managerSearch.toLowerCase();
    return managers.filter(
      (m) =>
        !managerSearch ||
        m.display_name.toLowerCase().includes(searchLower) ||
        m.email.toLowerCase().includes(searchLower)
    );
  }, [managers, managerSearch]);

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

  // Get the manager's group and members
  const selectedManagerGroup = managerGroups.find(g => g.manager_user_id === selectedManager?.id);
  const selectedManagerMembers = allGroupMembers.filter(m => m.group_id === selectedManagerGroup?.id);
  const boundSalespersonIds = new Set(allGroupMembers.map(m => m.member_user_id));

  // Available salespersons for manager (not already bound to any manager)
  const availableSalespersonsForManager = useMemo(() => {
    const searchLower = spSearchForManager.toLowerCase();
    return salespersons.filter(
      (sp) =>
        !boundSalespersonIds.has(sp.id) &&
        (!spSearchForManager ||
          sp.display_name.toLowerCase().includes(searchLower) ||
          sp.email.toLowerCase().includes(searchLower))
    );
  }, [salespersons, boundSalespersonIds, spSearchForManager]);

  // Get member count per manager
  const getManagerMemberCount = (managerId: string) => {
    const group = managerGroups.find(g => g.manager_user_id === managerId);
    if (!group) return 0;
    return allGroupMembers.filter(m => m.group_id === group.id).length;
  };

  const handleSelectSalesperson = (sp: Profile) => {
    setSelectedSalesperson(sp);
    setSelectedRunners([]);
  };

  const handleSelectManager = async (manager: Profile) => {
    setSelectedManager(manager);
    setSelectedSalespersonsForManager([]);

    // Check if manager has a group, create one if not
    const existingGroup = managerGroups.find(g => g.manager_user_id === manager.id);
    if (!existingGroup) {
      await createGroup.mutateAsync({
        name: `${manager.display_name}'s Team`,
        manager_user_id: manager.id,
      });
      refetchGroups();
    }
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

  // Manager binding handlers
  const handleOpenManagerBindDialog = () => {
    setSelectedSalespersonsForManager([]);
    setSpSearchForManager('');
    setManagerBindDialogOpen(true);
  };

  const handleBindSalespersonsToManager = async () => {
    if (!selectedManager || selectedSalespersonsForManager.length === 0) return;

    let groupId = selectedManagerGroup?.id;

    // Create group if it doesn't exist
    if (!groupId) {
      const newGroup = await createGroup.mutateAsync({
        name: `${selectedManager.display_name}'s Team`,
        manager_user_id: selectedManager.id,
      });
      groupId = newGroup.id;
    }

    // Add each salesperson to the group
    for (const spId of selectedSalespersonsForManager) {
      await addMember.mutateAsync({
        group_id: groupId,
        member_user_id: spId,
      });
    }

    toast.success(`Added ${selectedSalespersonsForManager.length} salesperson(s) to ${selectedManager.display_name}'s team`);
    setManagerBindDialogOpen(false);
    setSelectedSalespersonsForManager([]);
    refetchGroups();
  };

  const handleConfirmRemoveMember = (memberId: string, memberName: string) => {
    setMemberToRemove({ id: memberId, name: memberName });
    setConfirmRemoveOpen(true);
  };

  const handleRemoveMember = async () => {
    if (!memberToRemove) return;

    await removeMember.mutateAsync(memberToRemove.id);
    setConfirmRemoveOpen(false);
    setMemberToRemove(null);
    refetchGroups();
  };

  const toggleSalespersonSelection = (spId: string) => {
    setSelectedSalespersonsForManager((prev) =>
      prev.includes(spId)
        ? prev.filter((id) => id !== spId)
        : [...prev, spId]
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
                : 'Manage salesperson-runner and manager-salesperson bindings'}
            </p>
          </div>
        </div>

        {canManageBindings ? (
          isAdmin ? (
            <Tabs defaultValue="sp-runner">
              <TabsList>
                <TabsTrigger value="sp-runner" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Salesperson ↔ Runner
                </TabsTrigger>
                <TabsTrigger value="manager-sp" className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Manager ↔ Salesperson
                </TabsTrigger>
              </TabsList>

              <TabsContent value="sp-runner" className="mt-6">
                <SalespersonRunnerBinding
                  salespersons={salespersons}
                  filteredSalespersons={filteredSalespersons}
                  salespersonSearch={salespersonSearch}
                  setSalespersonSearch={setSelespersonSearch}
                  selectedSalesperson={effectiveSalesperson}
                  handleSelectSalesperson={handleSelectSalesperson}
                  bindings={bindings}
                  bindingsLoading={bindingsLoading}
                  usersLoading={usersLoading}
                  canManageBindings={canManageBindings}
                  handleOpenBindDialog={handleOpenBindDialog}
                  handleToggleBinding={handleToggleBinding}
                  updateBinding={updateBinding}
                />
            </TabsContent>

            <TabsContent value="manager-sp" className="mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Panel: Manager List */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Managers
                    </CardTitle>
                    <CardDescription>
                      Select a manager to view and manage their team
                    </CardDescription>
                    <div className="relative mt-2">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search managers..."
                        value={managerSearch}
                        onChange={(e) => setManagerSearch(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[400px]">
                      {usersLoading || groupsLoading ? (
                        <div className="p-4 text-center text-muted-foreground">
                          Loading...
                        </div>
                      ) : filteredManagers.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground">
                          No managers found
                        </div>
                      ) : (
                        <div className="divide-y">
                          {filteredManagers.map((manager) => {
                            const isSelected = selectedManager?.id === manager.id;
                            const memberCount = getManagerMemberCount(manager.id);
                            return (
                              <button
                                key={manager.id}
                                onClick={() => handleSelectManager(manager)}
                                className={cn(
                                  'w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors flex items-center justify-between',
                                  isSelected && 'bg-primary/10'
                                )}
                              >
                                <div>
                                  <p className="font-medium">{manager.display_name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {manager.email}
                                  </p>
                                </div>
                                <Badge variant={memberCount > 0 ? "default" : "secondary"}>
                                  {memberCount} agent{memberCount !== 1 ? 's' : ''}
                                </Badge>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Right Panel: Manager's Salespersons */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Users className="h-5 w-5" />
                          {selectedManager
                            ? `${selectedManager.display_name}'s Team`
                            : 'Select a Manager'}
                        </CardTitle>
                        {selectedManager && (
                          <CardDescription>
                            Salespersons assigned to this manager
                          </CardDescription>
                        )}
                      </div>
                      {isAdmin && selectedManager && (
                        <Button size="sm" onClick={handleOpenManagerBindDialog}>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Add Agents
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[400px]">
                      {!selectedManager ? (
                        <div className="p-8 text-center text-muted-foreground">
                          Select a manager to view their team
                        </div>
                      ) : selectedManagerMembers.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                          <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No salespersons assigned to this manager</p>
                          <p className="text-sm mt-2">Click "Add Agents" to assign salespersons</p>
                        </div>
                      ) : (
                        <div className="divide-y">
                          {selectedManagerMembers.map((membership) => {
                            const member = membership.member;
                            return (
                              <div
                                key={membership.id}
                                className="px-4 py-3 flex items-center justify-between"
                              >
                                <div>
                                  <p className="font-medium">
                                    {member?.display_name || 'Unknown'}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {member?.email}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Added {format(new Date(membership.created_at), 'MMM d, yyyy')}
                                  </p>
                                </div>
                                {isAdmin && (
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleConfirmRemoveMember(
                                      membership.id, 
                                      member?.display_name || 'Unknown'
                                    )}
                                  >
                                    <Trash2 className="h-4 w-4 mr-1" />
                                    Remove
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
          ) : (
            // Manager view - SP-Runner binding only (for their team)
            <SalespersonRunnerBinding
              salespersons={salespersons}
              filteredSalespersons={filteredSalespersons}
              salespersonSearch={salespersonSearch}
              setSalespersonSearch={setSelespersonSearch}
              selectedSalesperson={effectiveSalesperson}
              handleSelectSalesperson={handleSelectSalesperson}
              bindings={bindings}
              bindingsLoading={bindingsLoading}
              usersLoading={usersLoading}
              canManageBindings={canManageBindings}
              handleOpenBindDialog={handleOpenBindDialog}
              handleToggleBinding={handleToggleBinding}
              updateBinding={updateBinding}
            />
          )
        ) : (
          // Non-manager/admin view (salesperson)
          <SalespersonRunnerBinding
            salespersons={salespersons}
            filteredSalespersons={filteredSalespersons}
            salespersonSearch={salespersonSearch}
            setSalespersonSearch={setSelespersonSearch}
            selectedSalesperson={effectiveSalesperson}
            handleSelectSalesperson={handleSelectSalesperson}
            bindings={bindings}
            bindingsLoading={bindingsLoading}
            usersLoading={usersLoading}
            canManageBindings={canManageBindings}
            handleOpenBindDialog={handleOpenBindDialog}
            handleToggleBinding={handleToggleBinding}
            updateBinding={updateBinding}
            isSalesperson={isSalesperson}
          />
        )}
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

      {/* Bind Salespersons to Manager Dialog */}
      <Dialog open={managerBindDialogOpen} onOpenChange={setManagerBindDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Agents to {selectedManager?.display_name}'s Team</DialogTitle>
            <DialogDescription>
              Select salespersons to assign to this manager. Each salesperson can only be assigned to one manager.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search salespersons..."
                value={spSearchForManager}
                onChange={(e) => setSpSearchForManager(e.target.value)}
                className="pl-10"
              />
            </div>
            <ScrollArea className="h-[300px] border rounded-md">
              {availableSalespersonsForManager.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  No available salespersons to add (all are already assigned to managers)
                </div>
              ) : (
                <div className="divide-y">
                  {availableSalespersonsForManager.map((sp) => (
                    <label
                      key={sp.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedSalespersonsForManager.includes(sp.id)}
                        onCheckedChange={() => toggleSalespersonSelection(sp.id)}
                      />
                      <div>
                        <p className="font-medium">{sp.display_name}</p>
                        <p className="text-sm text-muted-foreground">{sp.email}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </ScrollArea>
            {selectedSalespersonsForManager.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {selectedSalespersonsForManager.length} salesperson{selectedSalespersonsForManager.length !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManagerBindDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleBindSalespersonsToManager}
              disabled={selectedSalespersonsForManager.length === 0 || addMember.isPending}
            >
              {addMember.isPending
                ? 'Adding...'
                : `Add ${selectedSalespersonsForManager.length} Agent${selectedSalespersonsForManager.length !== 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Remove Member Dialog */}
      <AlertDialog open={confirmRemoveOpen} onOpenChange={setConfirmRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Agent from Team?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{memberToRemove?.name}</strong> from {selectedManager?.display_name}'s team?
              This will affect the manager's ability to view this agent's orders.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

// Extracted component for SP-Runner binding
interface SalespersonRunnerBindingProps {
  salespersons: Profile[];
  filteredSalespersons: Profile[];
  salespersonSearch: string;
  setSalespersonSearch: (value: string) => void;
  selectedSalesperson: Profile | null;
  handleSelectSalesperson: (sp: Profile) => void;
  bindings: any[];
  bindingsLoading: boolean;
  usersLoading: boolean;
  canManageBindings: boolean;
  handleOpenBindDialog: () => void;
  handleToggleBinding: (id: string, active: boolean) => void;
  updateBinding: any;
  isSalesperson?: boolean;
}

function SalespersonRunnerBinding({
  filteredSalespersons,
  salespersonSearch,
  setSalespersonSearch,
  selectedSalesperson,
  handleSelectSalesperson,
  bindings,
  bindingsLoading,
  usersLoading,
  canManageBindings,
  handleOpenBindDialog,
  handleToggleBinding,
  updateBinding,
  isSalesperson = false,
}: SalespersonRunnerBindingProps) {
  return (
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
                onChange={(e) => setSalespersonSearch(e.target.value)}
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
              {selectedSalesperson
                ? `Runners for ${selectedSalesperson.display_name}`
                : 'Select a Salesperson'}
            </CardTitle>
            {canManageBindings && selectedSalesperson && (
              <Button size="sm" onClick={handleOpenBindDialog}>
                <Link2 className="h-4 w-4 mr-2" />
                Bind Runners
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[400px]">
            {!selectedSalesperson ? (
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
                      {canManageBindings && (
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
  );
}
