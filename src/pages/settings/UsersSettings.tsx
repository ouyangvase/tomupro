import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import {
  useUsers,
  useUpdateUser,
  ensureWarehouseForRole,
  deactivateWarehousesForUser,
} from '@/hooks/useUsers';
import { useReenableUser, ExtendedProfile } from '@/hooks/useOffboarding';
import { useForcePasswordReset } from '@/hooks/useForcePasswordReset';
import { useManagers } from '@/hooks/useTeamMembers';
import { 
  Users, 
  Pencil, 
  Search, 
  Filter, 
  UserCheck, 
  MoreHorizontal,
  Ban,
  Package,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  KeyRound
} from 'lucide-react';
import { format } from 'date-fns';
import type { Profile, AppRole } from '@/types/database';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { DisableUserDialog } from '@/components/admin/DisableUserDialog';
import { OffboardingStockTransferDialog } from '@/components/admin/OffboardingStockTransferDialog';

const roleColors: Record<AppRole, string> = {
  admin: 'bg-destructive text-destructive-foreground',
  manager: 'bg-primary text-primary-foreground',
  salesperson: 'bg-secondary text-secondary-foreground',
  runner: 'bg-accent text-accent-foreground',
  runner_assistant: 'bg-accent text-accent-foreground',
  driver: 'bg-muted text-muted-foreground',
  user: 'bg-muted text-muted-foreground',
  finance_viewer: 'bg-muted text-muted-foreground',
};

const statusColors: Record<string, string> = {
  active: 'bg-green-500/10 text-green-600 border-green-500/30',
  disabled: 'bg-red-500/10 text-red-600 border-red-500/30',
  resigned: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
};

export default function UsersSettings() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const { data: users, isLoading } = useUsers();
  const { data: managers = [] } = useManagers();
  const updateUser = useUpdateUser();
  const reenableUser = useReenableUser();
  const forcePasswordReset = useForcePasswordReset();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editRole, setEditRole] = useState<AppRole>('salesperson');
  const [editManagerId, setEditManagerId] = useState<string>('none');

  // Offboarding dialogs
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [reenableDialogOpen, setReenableDialogOpen] = useState(false);
  const [passwordResetDialogOpen, setPasswordResetDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ExtendedProfile | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredUsers = useMemo(() => {
    if (!users) return [];

    return users.filter((user) => {
      const extendedUser = user as ExtendedProfile;
      // Search filter
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        user.display_name.toLowerCase().includes(searchLower) ||
        user.email.toLowerCase().includes(searchLower);

      // Role filter
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;

      // Status filter
      const userStatus = extendedUser.status || 'active';
      const matchesStatus = statusFilter === 'all' || userStatus === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  // Build a map of user ID to manager name for display
  const managerMap = useMemo(() => {
    const map = new Map<string, string>();
    users?.forEach(u => {
      if (u.role === 'manager') {
        map.set(u.id, u.display_name);
      }
    });
    return map;
  }, [users]);

  const handleOpenEdit = (user: Profile) => {
    setEditingUser(user);
    setEditDisplayName(user.display_name);
    setEditRole(user.role);
    setEditManagerId(user.manager_id || 'none');
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingUser || !editDisplayName.trim()) return;

    const previousRole = editingUser.role;
    const newRole = editRole;
    const newManagerId = editManagerId === 'none' ? null : editManagerId;

    // Update profile including manager_id
    await updateUser.mutateAsync({
      id: editingUser.id,
      display_name: editDisplayName.trim(),
      role: newRole,
      manager_id: newManagerId,
    });

    // Handle warehouse automation if role changed
    if (previousRole !== newRole) {
      // Deactivate old warehouse if moving away from salesperson/runner
      if (
        (previousRole === 'salesperson' || previousRole === 'runner') &&
        newRole !== 'salesperson' &&
        newRole !== 'runner'
      ) {
        await deactivateWarehousesForUser(editingUser.id, previousRole);
      }

      // Ensure new warehouse if becoming salesperson/runner
      if (newRole === 'salesperson' || newRole === 'runner') {
        await ensureWarehouseForRole(editingUser.id, newRole, editDisplayName.trim());
      }
    }

    setEditDialogOpen(false);
    setEditingUser(null);
  };

  const handleOpenDisable = (user: Profile) => {
    setSelectedUser(user as ExtendedProfile);
    setDisableDialogOpen(true);
  };

  const handleOpenTransfer = (user: Profile) => {
    setSelectedUser(user as ExtendedProfile);
    setTransferDialogOpen(true);
  };

  const handleOpenReenable = (user: Profile) => {
    setSelectedUser(user as ExtendedProfile);
    setReenableDialogOpen(true);
  };

  const handleOpenPasswordReset = (user: Profile) => {
    setSelectedUser(user as ExtendedProfile);
    setPasswordResetDialogOpen(true);
  };

  const handleReenable = async () => {
    if (!selectedUser) return;
    await reenableUser.mutateAsync(selectedUser.id);
    setReenableDialogOpen(false);
    setSelectedUser(null);
  };

  const handlePasswordReset = async () => {
    if (!selectedUser) return;
    await forcePasswordReset.mutateAsync({
      userId: selectedUser.id,
      email: selectedUser.email,
      displayName: selectedUser.display_name,
    });
    setPasswordResetDialogOpen(false);
    setSelectedUser(null);
  };

  const columns: Column<Profile>[] = [
    {
      key: 'display_name',
      header: 'Name',
      sortable: true,
    },
    {
      key: 'email',
      header: 'Email',
      sortable: true,
    },
    {
      key: 'role',
      header: 'Role',
      sortable: true,
      render: (user) => (
        <Badge className={roleColors[user.role]}>
          {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (user) => {
        const extendedUser = user as ExtendedProfile;
        const status = extendedUser.status || 'active';
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className={statusColors[status]}>
                  {status === 'active' && <CheckCircle className="h-3 w-3 mr-1" />}
                  {status === 'disabled' && <Ban className="h-3 w-3 mr-1" />}
                  {status === 'resigned' && <AlertTriangle className="h-3 w-3 mr-1" />}
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Badge>
              </TooltipTrigger>
              {extendedUser.disabled_reason && (
                <TooltipContent>
                  <p>Reason: {extendedUser.disabled_reason}</p>
                  {extendedUser.disabled_at && (
                    <p className="text-xs text-muted-foreground">
                      Since: {format(new Date(extendedUser.disabled_at), 'MMM d, yyyy')}
                    </p>
                  )}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        );
      },
    },
    {
      key: 'manager_id',
      header: 'Manager',
      sortable: true,
      render: (user) => {
        if (!user.manager_id) return <span className="text-muted-foreground">—</span>;
        const managerName = managerMap.get(user.manager_id);
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="gap-1">
                  <UserCheck className="h-3 w-3" />
                  {managerName || 'Unknown'}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Reports to: {managerName || 'Unknown'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
    },
    {
      key: 'created_at',
      header: 'Created',
      sortable: true,
      render: (user) => format(new Date(user.created_at), 'MMM d, yyyy'),
    },
  ];

  // Add actions column for admin
  if (isAdmin) {
    columns.push({
      key: 'actions',
      header: 'Actions',
      render: (user) => {
        const extendedUser = user as ExtendedProfile;
        const isActive = !extendedUser.status || extendedUser.status === 'active';
        const isDisabledOrResigned = extendedUser.status === 'disabled' || extendedUser.status === 'resigned';
        
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleOpenEdit(user)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit User
              </DropdownMenuItem>
              
              {isActive && (
                <DropdownMenuItem onClick={() => handleOpenPasswordReset(user)}>
                  <KeyRound className="h-4 w-4 mr-2" />
                  Force Password Reset
                </DropdownMenuItem>
              )}
              
              <DropdownMenuSeparator />
              
              {isActive ? (
                <DropdownMenuItem 
                  onClick={() => handleOpenDisable(user)}
                  className="text-destructive focus:text-destructive"
                >
                  <Ban className="h-4 w-4 mr-2" />
                  Disable Login
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => handleOpenReenable(user)}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Re-enable Account
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleOpenTransfer(user)}>
                    <Package className="h-4 w-4 mr-2" />
                    Transfer Stock to Manager
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    });
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">User Management</h1>
              <p className="text-muted-foreground">
                {isAdmin ? 'Manage users, roles, and offboarding' : 'View system users'}
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <div className="w-full sm:w-40">
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger>
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="salesperson">Salesperson</SelectItem>
                <SelectItem value="runner">Runner</SelectItem>
                <SelectItem value="runner_assistant">Runner Assistant</SelectItem>
                <SelectItem value="driver">Driver</SelectItem>
                <SelectItem value="finance_viewer">Finance Viewer</SelectItem>
                <SelectItem value="user">User</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-40">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
                <SelectItem value="resigned">Resigned</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DataGrid
          data={filteredUsers}
          columns={columns}
          loading={isLoading}
          keyField="id"
          showSearch={false}
        />
      </div>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={editingUser?.email || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="salesperson">Salesperson</SelectItem>
                  <SelectItem value="runner">Runner</SelectItem>
                  <SelectItem value="runner_assistant">Runner Assistant</SelectItem>
                  <SelectItem value="driver">Driver</SelectItem>
                  <SelectItem value="finance_viewer">Finance Viewer</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                </SelectContent>
              </Select>
              {editingUser && editRole !== editingUser.role && (
                <p className="text-xs text-muted-foreground">
                  {(editRole === 'salesperson' || editRole === 'runner') && (
                    <>A warehouse will be auto-created for this user.</>
                  )}
                  {editingUser.role === 'salesperson' || editingUser.role === 'runner' ? (
                    editRole !== 'salesperson' && editRole !== 'runner' && (
                      <> Their warehouse will be marked inactive.</>
                    )
                  ) : null}
                </p>
              )}
            </div>
            
            {/* Manager Assignment - Only for salesperson role */}
            {(editRole === 'salesperson' || editRole === 'manager') && (
              <div className="space-y-2">
                <Label htmlFor="manager">Assigned Manager</Label>
                <Select 
                  value={editManagerId} 
                  onValueChange={setEditManagerId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a manager..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Manager</SelectItem>
                    {managers
                      .filter(m => m.id !== editingUser?.id) // Cannot assign self as manager
                      .map(manager => (
                        <SelectItem key={manager.id} value={manager.id}>
                          {manager.display_name}
                        </SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Assigning a manager allows them to view and manage this user's orders and data.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={!editDisplayName.trim() || updateUser.isPending}
            >
              {updateUser.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable User Dialog */}
      <DisableUserDialog
        open={disableDialogOpen}
        onOpenChange={setDisableDialogOpen}
        user={selectedUser}
      />

      {/* Stock Transfer Dialog */}
      <OffboardingStockTransferDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        user={selectedUser}
      />

      {/* Re-enable Confirmation Dialog */}
      <AlertDialog open={reenableDialogOpen} onOpenChange={setReenableDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-enable User Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to re-enable <strong>{selectedUser?.display_name}</strong>'s account?
              They will be able to log in again immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReenable} disabled={reenableUser.isPending}>
              {reenableUser.isPending ? 'Re-enabling...' : 'Re-enable Account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Password Reset Confirmation Dialog */}
      <AlertDialog open={passwordResetDialogOpen} onOpenChange={setPasswordResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Force Password Reset</AlertDialogTitle>
            <AlertDialogDescription>
              This immediately changes <strong>{selectedUser?.display_name}</strong>'s password to the temporary
              password <strong>Tomu@12345678</strong>. They must log in with it and set their own new password
              before they can access the application.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePasswordReset} disabled={forcePasswordReset.isPending}>
              {forcePasswordReset.isPending ? 'Resetting...' : 'Reset to Temporary Password'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
