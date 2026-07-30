import { useState, useMemo } from 'react';
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
import {
  useManagerRunnerBindings,
  useCreateManagerRunnerBindings,
  useDeleteManagerRunnerBinding,
} from '@/hooks/useManagerRunnerBindings';
import { Link2, Link2Off, Search, Users, UserCheck, RefreshCw, UserPlus, Trash2, Shield, Truck } from 'lucide-react';
import { format } from 'date-fns';
import type { Profile } from '@/types/database';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import CanonicalBindingPanel from './CanonicalBindingPanel';

export default function BindingsSettings() {
  const { role } = useAuth();

  if (role !== 'admin') {
    return <LegacyBindingsSettings />;
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Link2 className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Binding Management</h1>
          <p className="text-sm text-muted-foreground">
            Manage user eligibility without changing order assignments.
          </p>
        </div>
      </div>

      <Tabs defaultValue="salesperson-binding">
        <div className="sticky top-0 z-20 -mx-4 overflow-x-auto border-b bg-background/95 px-4 py-2 backdrop-blur md:mx-0 md:px-0">
          <TabsList className="h-11 w-max min-w-max justify-start">
            <TabsTrigger value="salesperson-binding" className="gap-2">
              <Shield className="h-4 w-4" />
              Salesperson Binding
            </TabsTrigger>
            <TabsTrigger value="driver-binding" className="gap-2">
              <Truck className="h-4 w-4" />
              Driver Binding
            </TabsTrigger>
            <TabsTrigger value="runner-access" className="gap-2">
              <Link2 className="h-4 w-4" />
              Runner Access
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="salesperson-binding" className="mt-4">
          <CanonicalBindingPanel mode="salesperson" />
        </TabsContent>
        <TabsContent value="driver-binding" className="mt-4">
          <CanonicalBindingPanel mode="driver" />
        </TabsContent>
        <TabsContent value="runner-access" className="mt-4">
          <LegacyBindingsSettings embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LegacyBindingsSettings({ embedded = false }: { embedded?: boolean }) {
  const { profile, role } = useAuth();
  const isAdmin = role === 'admin';
  const isManager = role === 'manager';
  const isSalesperson = role === 'salesperson';
  // All three roles can manage bindings - admin/manager for their scope, salesperson for themselves
  const canManageBindings = isAdmin || isManager || isSalesperson;

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

  // Unified user selection for runner binding (admin view)
  const [selectedBindUser, setSelectedBindUser] = useState<Profile | null>(null);
  const [bindUserSearch, setBindUserSearch] = useState('');

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

  // Manager-Runner binding state
  const [managerRunnerSearch, setManagerRunnerSearch] = useState('');
  const [selectedRunnersForManager, setSelectedRunnersForManager] = useState<string[]>([]);
  const [managerRunnerBindDialogOpen, setManagerRunnerBindDialogOpen] = useState(false);
  const [confirmRemoveRunnerOpen, setConfirmRemoveRunnerOpen] = useState(false);
  const [runnerBindingToRemove, setRunnerBindingToRemove] = useState<{ id: string; name: string } | null>(null);

  // Manager-Runner binding hooks
  // For managers, use their own ID; for admins viewing a selected manager, use that manager's ID
  const effectiveManagerForRunnerBinding = isManager ? profile?.id : (selectedManager?.id || (selectedBindUser?.role === 'manager' ? selectedBindUser?.id : undefined));
  const { data: managerRunnerBindings = [], isLoading: managerRunnerBindingsLoading } = useManagerRunnerBindings(
    effectiveManagerForRunnerBinding ? { managerId: effectiveManagerForRunnerBinding } : undefined
  );
  const createManagerRunnerBindings = useCreateManagerRunnerBindings();
  const deleteManagerRunnerBinding = useDeleteManagerRunnerBinding();

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

  // Unified users list for runner binding (managers + salespersons)
  const bindableUsers = useMemo(() => {
    const combined = [...managers, ...salespersons];
    const searchLower = bindUserSearch.toLowerCase();
    return combined.filter(
      (u) =>
        !bindUserSearch ||
        u.display_name.toLowerCase().includes(searchLower) ||
        u.email.toLowerCase().includes(searchLower) ||
        u.role.toLowerCase().includes(searchLower)
    );
  }, [managers, salespersons, bindUserSearch]);

  // For salesperson view, auto-select themselves
  const effectiveSalesperson = isSalesperson
    ? users.find((u) => u.id === profile?.id) || null
    : selectedSalesperson;

  // For unified runner binding: fetch SP bindings when a salesperson is selected
  const unifiedBindSalespersonId = selectedBindUser?.role === 'salesperson' ? selectedBindUser.id : undefined;
  const { data: unifiedSpBindings = [], isLoading: unifiedSpBindingsLoading } = useBindings(
    unifiedBindSalespersonId ? { salespersonId: unifiedBindSalespersonId, includeInactive: true } : undefined
  );

  // Fetch bindings for selected salesperson (old tab)
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
  // Admins can see all salespersons, managers only see their team
  const availableSalespersonsForManager = useMemo(() => {
    const searchLower = spSearchForManager.toLowerCase();
    const sourceSalespersons = isAdmin ? allSalespersons : salespersons;
    return sourceSalespersons.filter(
      (sp) =>
        !boundSalespersonIds.has(sp.id) &&
        (!spSearchForManager ||
          sp.display_name.toLowerCase().includes(searchLower) ||
          sp.email.toLowerCase().includes(searchLower))
    );
  }, [isAdmin, allSalespersons, salespersons, boundSalespersonIds, spSearchForManager]);

  // Manager-Runner: Available runners (not already bound to this manager)
  const boundManagerRunnerIds = useMemo(
    () => new Set(managerRunnerBindings.map((b) => b.runner_id)),
    [managerRunnerBindings]
  );

  const availableRunnersForManager = useMemo(() => {
    const searchLower = managerRunnerSearch.toLowerCase();
    return runners.filter(
      (r) =>
        !boundManagerRunnerIds.has(r.id) &&
        (!managerRunnerSearch ||
          r.display_name.toLowerCase().includes(searchLower) ||
          r.email.toLowerCase().includes(searchLower))
    );
  }, [runners, boundManagerRunnerIds, managerRunnerSearch]);

  // Unified binding: available runners for selected bind user
  const unifiedBoundRunnerIds = useMemo(() => {
    if (!selectedBindUser) return new Set<string>();
    if (selectedBindUser.role === 'salesperson') {
      return new Set(unifiedSpBindings.filter((b) => b.active).map((b) => b.runner_id));
    }
    if (selectedBindUser.role === 'manager') {
      return new Set(managerRunnerBindings.map((b) => b.runner_id));
    }
    return new Set<string>();
  }, [selectedBindUser, unifiedSpBindings, managerRunnerBindings]);

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

  // Unified bind user handler
  const handleSelectBindUser = (user: Profile) => {
    setSelectedBindUser(user);
    setSelectedRunners([]);
    // Also set selectedManager if it's a manager (for the manager-runner bindings hook)
    if (user.role === 'manager') {
      setSelectedManager(user);
    } else if (user.role === 'salesperson') {
      setSelectedSalesperson(user);
    }
  };

  // Unified bind runners dialog
  const [unifiedBindDialogOpen, setUnifiedBindDialogOpen] = useState(false);
  const [unifiedBindRunnerSearch, setUnifiedBindRunnerSearch] = useState('');
  const [unifiedSelectedRunners, setUnifiedSelectedRunners] = useState<string[]>([]);

  const unifiedAvailableRunners = useMemo(() => {
    const searchLower = unifiedBindRunnerSearch.toLowerCase();
    return runners.filter(
      (r) =>
        !unifiedBoundRunnerIds.has(r.id) &&
        (!unifiedBindRunnerSearch ||
          r.display_name.toLowerCase().includes(searchLower) ||
          r.email.toLowerCase().includes(searchLower))
    );
  }, [runners, unifiedBoundRunnerIds, unifiedBindRunnerSearch]);

  const handleOpenUnifiedBindDialog = () => {
    setUnifiedSelectedRunners([]);
    setUnifiedBindRunnerSearch('');
    setUnifiedBindDialogOpen(true);
  };

  const handleUnifiedBindRunners = async () => {
    if (!selectedBindUser || unifiedSelectedRunners.length === 0) return;

    if (selectedBindUser.role === 'salesperson') {
      await createBindings.mutateAsync({
        salesperson_id: selectedBindUser.id,
        runner_ids: unifiedSelectedRunners,
      });
    } else if (selectedBindUser.role === 'manager') {
      await createManagerRunnerBindings.mutateAsync({
        manager_id: selectedBindUser.id,
        runner_ids: unifiedSelectedRunners,
      });
    }

    setUnifiedBindDialogOpen(false);
    setUnifiedSelectedRunners([]);
  };

  const toggleUnifiedRunnerSelection = (runnerId: string) => {
    setUnifiedSelectedRunners((prev) =>
      prev.includes(runnerId)
        ? prev.filter((id) => id !== runnerId)
        : [...prev, runnerId]
    );
  };

  // Unified unbind / toggle handlers
  const handleUnifiedToggleBinding = async (bindingId: string, currentActive: boolean) => {
    if (selectedBindUser?.role === 'salesperson') {
      await updateBinding.mutateAsync({
        id: bindingId,
        active: !currentActive,
      });
    }
  };

  const handleUnifiedRemoveBinding = async (bindingId: string) => {
    if (selectedBindUser?.role === 'manager') {
      await deleteManagerRunnerBinding.mutateAsync(bindingId);
    }
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

  // Manager-Runner binding handlers
  const handleOpenManagerRunnerBindDialog = () => {
    setSelectedRunnersForManager([]);
    setManagerRunnerSearch('');
    setManagerRunnerBindDialogOpen(true);
  };

  const handleBindRunnersToManager = async () => {
    const managerId = isManager ? profile?.id : selectedManager?.id;
    if (!managerId || selectedRunnersForManager.length === 0) return;

    await createManagerRunnerBindings.mutateAsync({
      manager_id: managerId,
      runner_ids: selectedRunnersForManager,
    });

    setManagerRunnerBindDialogOpen(false);
    setSelectedRunnersForManager([]);
  };

  const toggleRunnerForManagerSelection = (runnerId: string) => {
    setSelectedRunnersForManager((prev) =>
      prev.includes(runnerId)
        ? prev.filter((id) => id !== runnerId)
        : [...prev, runnerId]
    );
  };

  const handleConfirmRemoveRunnerBinding = (bindingId: string, runnerName: string) => {
    setRunnerBindingToRemove({ id: bindingId, name: runnerName });
    setConfirmRemoveRunnerOpen(true);
  };

  const handleRemoveRunnerBinding = async () => {
    if (!runnerBindingToRemove) return;
    await deleteManagerRunnerBinding.mutateAsync(runnerBindingToRemove.id);
    setConfirmRemoveRunnerOpen(false);
    setRunnerBindingToRemove(null);
  };

  const currentManagerName = isManager
    ? profile?.display_name
    : selectedManager?.display_name;

  return (
    <>
      <div className={cn('space-y-6', !embedded && 'p-6')}>
        {!embedded && <div className="flex items-center gap-3">
          <Link2 className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">
              {isSalesperson ? 'My Bindings' : 'Binding Management'}
            </h1>
            <p className="text-muted-foreground">
              {isSalesperson
                ? 'Manage runners assigned to your account'
                : 'Manage salesperson-runner and manager-salesperson bindings'}
            </p>
          </div>
        </div>}

        {isAdmin ? (
          // Admin view - Two tabs: Runner Binding (unified) and Team Assignment
          <Tabs defaultValue="runner-binding">
              <TabsList>
                <TabsTrigger value="runner-binding" className="flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Runner Binding
                </TabsTrigger>
                <TabsTrigger value="team-assignment" className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Team Assignment
                </TabsTrigger>
              </TabsList>

              <TabsContent value="runner-binding" className="mt-6">
                <UnifiedRunnerBinding
                  users={bindableUsers}
                  usersLoading={usersLoading}
                  userSearch={bindUserSearch}
                  setUserSearch={setBindUserSearch}
                  selectedUser={selectedBindUser}
                  handleSelectUser={handleSelectBindUser}
                  spBindings={unifiedSpBindings}
                  spBindingsLoading={unifiedSpBindingsLoading}
                  managerBindings={managerRunnerBindings}
                  managerBindingsLoading={managerRunnerBindingsLoading}
                  handleOpenBindDialog={handleOpenUnifiedBindDialog}
                  handleToggleBinding={handleUnifiedToggleBinding}
                  handleRemoveBinding={handleUnifiedRemoveBinding}
                  updateBinding={updateBinding}
                />
            </TabsContent>

            <TabsContent value="team-assignment" className="mt-6">
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
        ) : isManager ? (
          // Manager view - Tabs for SP-Runner and Manager-Runner bindings
          <Tabs defaultValue="sp-runner">
            <TabsList>
              <TabsTrigger value="sp-runner" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Salesperson ↔ Runner
              </TabsTrigger>
              <TabsTrigger value="manager-runner" className="flex items-center gap-2">
                <Truck className="h-4 w-4" />
                My Runners
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

            <TabsContent value="manager-runner" className="mt-6">
              <ManagerRunnerBindingPanel
                isAdmin={false}
                managers={[]}
                managersLoading={false}
                managerSearch=""
                setManagerSearch={() => {}}
                selectedManager={null}
                handleSelectManager={() => {}}
                managerRunnerBindings={managerRunnerBindings}
                managerRunnerBindingsLoading={managerRunnerBindingsLoading}
                availableRunnersForManager={availableRunnersForManager}
                handleOpenManagerRunnerBindDialog={handleOpenManagerRunnerBindDialog}
                handleConfirmRemoveRunnerBinding={handleConfirmRemoveRunnerBinding}
                currentManagerName={currentManagerName}
                isManagerView={true}
              />
            </TabsContent>
          </Tabs>
        ) : (
          // Salesperson view - own bindings only
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

      {/* Unified Bind Runners Dialog (for admin Runner Binding tab) */}
      <Dialog open={unifiedBindDialogOpen} onOpenChange={setUnifiedBindDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bind Runners to {selectedBindUser?.display_name}</DialogTitle>
            <DialogDescription>
              Select runners to bind to this {selectedBindUser?.role}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search runners..."
                value={unifiedBindRunnerSearch}
                onChange={(e) => setUnifiedBindRunnerSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <ScrollArea className="h-[300px] border rounded-md">
              {unifiedAvailableRunners.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  No available runners to bind
                </div>
              ) : (
                <div className="divide-y">
                  {unifiedAvailableRunners.map((runner) => (
                    <label
                      key={runner.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={unifiedSelectedRunners.includes(runner.id)}
                        onCheckedChange={() => toggleUnifiedRunnerSelection(runner.id)}
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
            {unifiedSelectedRunners.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {unifiedSelectedRunners.length} runner{unifiedSelectedRunners.length !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnifiedBindDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUnifiedBindRunners}
              disabled={unifiedSelectedRunners.length === 0 || createBindings.isPending || createManagerRunnerBindings.isPending}
            >
              {(createBindings.isPending || createManagerRunnerBindings.isPending)
                ? 'Binding...'
                : `Bind ${unifiedSelectedRunners.length} Runner${unifiedSelectedRunners.length !== 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Bind Runners to Manager Dialog */}
      <Dialog open={managerRunnerBindDialogOpen} onOpenChange={setManagerRunnerBindDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bind Runners to {currentManagerName}</DialogTitle>
            <DialogDescription>
              Select runners to bind to {isManager ? 'yourself' : 'this manager'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search runners..."
                value={managerRunnerSearch}
                onChange={(e) => setManagerRunnerSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <ScrollArea className="h-[300px] border rounded-md">
              {availableRunnersForManager.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  No available runners to bind
                </div>
              ) : (
                <div className="divide-y">
                  {availableRunnersForManager.map((runner) => (
                    <label
                      key={runner.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedRunnersForManager.includes(runner.id)}
                        onCheckedChange={() => toggleRunnerForManagerSelection(runner.id)}
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
            {selectedRunnersForManager.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {selectedRunnersForManager.length} runner{selectedRunnersForManager.length !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManagerRunnerBindDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleBindRunnersToManager}
              disabled={selectedRunnersForManager.length === 0 || createManagerRunnerBindings.isPending}
            >
              {createManagerRunnerBindings.isPending
                ? 'Binding...'
                : `Bind ${selectedRunnersForManager.length} Runner${selectedRunnersForManager.length !== 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Remove Runner Binding Dialog */}
      <AlertDialog open={confirmRemoveRunnerOpen} onOpenChange={setConfirmRemoveRunnerOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Runner Binding?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove the binding with <strong>{runnerBindingToRemove?.name}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveRunnerBinding}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
                        {binding.runner?.display_name || binding.runner?.email || 'Unknown Runner'}
                      </p>
                      {binding.runner?.email && binding.runner?.display_name && (
                        <p className="text-sm text-muted-foreground">
                          {binding.runner.email}
                        </p>
                      )}
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

// Extracted component for Manager-Runner binding
interface ManagerRunnerBindingPanelProps {
  isAdmin: boolean;
  managers: Profile[];
  managersLoading: boolean;
  managerSearch: string;
  setManagerSearch: (value: string) => void;
  selectedManager: Profile | null;
  handleSelectManager: (manager: Profile) => void;
  managerRunnerBindings: any[];
  managerRunnerBindingsLoading: boolean;
  availableRunnersForManager: Profile[];
  handleOpenManagerRunnerBindDialog: () => void;
  handleConfirmRemoveRunnerBinding: (bindingId: string, runnerName: string) => void;
  currentManagerName?: string;
  isManagerView?: boolean;
}

function ManagerRunnerBindingPanel({
  isAdmin,
  managers,
  managersLoading,
  managerSearch,
  setManagerSearch,
  selectedManager,
  handleSelectManager,
  managerRunnerBindings,
  managerRunnerBindingsLoading,
  handleOpenManagerRunnerBindDialog,
  handleConfirmRemoveRunnerBinding,
  currentManagerName,
  isManagerView = false,
}: ManagerRunnerBindingPanelProps) {  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Panel: Manager List (Admin only) */}
      {isAdmin && !isManagerView && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Managers
            </CardTitle>
            <CardDescription>
              Select a manager to view and manage their runner bindings
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
              {managersLoading ? (
                <div className="p-4 text-center text-muted-foreground">
                  Loading...
                </div>
              ) : managers.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  No managers found
                </div>
              ) : (
                <div className="divide-y">
                  {managers.map((manager) => {
                    const isSelected = selectedManager?.id === manager.id;
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
      <Card className={isManagerView ? 'lg:col-span-2' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Truck className="h-5 w-5" />
              {currentManagerName
                ? `Runners for ${currentManagerName}`
                : 'Select a Manager'}
            </CardTitle>
            {(isManagerView || selectedManager) && (
              <Button size="sm" onClick={handleOpenManagerRunnerBindDialog}>
                <Link2 className="h-4 w-4 mr-2" />
                Bind Runners
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[400px]">
            {!isManagerView && !selectedManager ? (
              <div className="p-8 text-center text-muted-foreground">
                Select a manager to view their runner bindings
              </div>
            ) : managerRunnerBindingsLoading ? (
              <div className="p-4 text-center text-muted-foreground">
                Loading...
              </div>
            ) : managerRunnerBindings.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No runners bound to {isManagerView ? 'you' : 'this manager'}</p>
                <p className="text-sm mt-2">Click "Bind Runners" to add runners</p>
              </div>
            ) : (
              <div className="divide-y">
                {managerRunnerBindings.map((binding) => (
                  <div
                    key={binding.id}
                    className="px-4 py-3 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium">
                        {binding.runner?.display_name || binding.runner?.email || 'Unknown Runner'}
                      </p>
                      {binding.runner?.email && binding.runner?.display_name && (
                        <p className="text-sm text-muted-foreground">
                          {binding.runner.email}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Bound {format(new Date(binding.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleConfirmRemoveRunnerBinding(
                        binding.id,
                        binding.runner?.display_name || 'Unknown'
                      )}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remove
                    </Button>
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

// Unified Runner Binding component - shows managers + salespersons in one list
interface UnifiedRunnerBindingProps {
  users: Profile[];
  usersLoading: boolean;
  userSearch: string;
  setUserSearch: (value: string) => void;
  selectedUser: Profile | null;
  handleSelectUser: (user: Profile) => void;
  spBindings: any[];
  spBindingsLoading: boolean;
  managerBindings: any[];
  managerBindingsLoading: boolean;
  handleOpenBindDialog: () => void;
  handleToggleBinding: (id: string, active: boolean) => void;
  handleRemoveBinding: (id: string) => void;
  updateBinding: any;
}

function UnifiedRunnerBinding({
  users,
  usersLoading,
  userSearch,
  setUserSearch,
  selectedUser,
  handleSelectUser,
  spBindings,
  spBindingsLoading,
  managerBindings,
  managerBindingsLoading,
  handleOpenBindDialog,
  handleToggleBinding,
  handleRemoveBinding,
  updateBinding,
}: UnifiedRunnerBindingProps) {
  const isSelectedManager = selectedUser?.role === 'manager';
  const isSelectedSalesperson = selectedUser?.role === 'salesperson';
  const bindings = isSelectedManager ? managerBindings : spBindings;
  const bindingsLoading = isSelectedManager ? managerBindingsLoading : spBindingsLoading;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Panel: All Users (Managers + Salespersons) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Users
          </CardTitle>
          <CardDescription>
            Select a manager or salesperson to manage their runner bindings
          </CardDescription>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
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
            ) : users.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                No users found
              </div>
            ) : (
              <div className="divide-y">
                {users.map((user) => {
                  const isSelected = selectedUser?.id === user.id;
                  return (
                    <button
                      key={user.id}
                      onClick={() => handleSelectUser(user)}
                      className={cn(
                        'w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors flex items-center justify-between',
                        isSelected && 'bg-primary/10'
                      )}
                    >
                      <div>
                        <p className="font-medium">{user.display_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {user.email}
                        </p>
                      </div>
                      <Badge variant="outline" className="capitalize">
                        {user.role}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Right Panel: Bound Runners */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <UserCheck className="h-5 w-5" />
              {selectedUser
                ? `Runners for ${selectedUser.display_name}`
                : 'Select a User'}
            </CardTitle>
            {selectedUser && (
              <Button size="sm" onClick={handleOpenBindDialog}>
                <Link2 className="h-4 w-4 mr-2" />
                Bind Runners
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[400px]">
            {!selectedUser ? (
              <div className="p-8 text-center text-muted-foreground">
                Select a user to view their runner bindings
              </div>
            ) : bindingsLoading ? (
              <div className="p-4 text-center text-muted-foreground">
                Loading...
              </div>
            ) : bindings.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No runners bound to this {selectedUser.role}</p>
                <p className="text-sm mt-2">Click "Bind Runners" to add runners</p>
              </div>
            ) : (
              <div className="divide-y">
                {bindings.map((binding: any) => {
                  const runner = binding.runner;
                  const runnerName = runner?.display_name || runner?.email || 'Unknown Runner';
                  const runnerEmail = runner?.display_name && runner?.email ? runner.email : null;

                  return (
                    <div
                      key={binding.id}
                      className={cn(
                        'px-4 py-3 flex items-center justify-between',
                        isSelectedSalesperson && !binding.active && 'opacity-50 bg-muted/30'
                      )}
                    >
                      <div>
                        <p className="font-medium">{runnerName}</p>
                        {runnerEmail && (
                          <p className="text-sm text-muted-foreground">{runnerEmail}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Bound {format(new Date(binding.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isSelectedSalesperson && (
                          <Badge variant={binding.active ? 'default' : 'secondary'}>
                            {binding.active ? 'Active' : 'Inactive'}
                          </Badge>
                        )}
                        {isSelectedSalesperson ? (
                          <Button
                            size="sm"
                            variant={binding.active ? 'destructive' : 'outline'}
                            onClick={() => handleToggleBinding(binding.id, binding.active)}
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
                        ) : (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleRemoveBinding(binding.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
