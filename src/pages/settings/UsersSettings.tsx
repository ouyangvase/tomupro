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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import {
  useUsers,
  useUpdateUser,
  ensureWarehouseForRole,
  deactivateWarehousesForUser,
} from '@/hooks/useUsers';
import { Users, Pencil, Search, Filter } from 'lucide-react';
import { format } from 'date-fns';
import type { Profile, AppRole } from '@/types/database';
import { Badge } from '@/components/ui/badge';

const roleColors: Record<AppRole, string> = {
  admin: 'bg-destructive text-destructive-foreground',
  manager: 'bg-primary text-primary-foreground',
  salesperson: 'bg-secondary text-secondary-foreground',
  runner: 'bg-accent text-accent-foreground',
  driver: 'bg-muted text-muted-foreground',
};

export default function UsersSettings() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const { data: users, isLoading } = useUsers();
  const updateUser = useUpdateUser();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editRole, setEditRole] = useState<AppRole>('salesperson');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const filteredUsers = useMemo(() => {
    if (!users) return [];

    return users.filter((user) => {
      // Search filter
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        user.display_name.toLowerCase().includes(searchLower) ||
        user.email.toLowerCase().includes(searchLower);

      // Role filter
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, roleFilter]);

  const handleOpenEdit = (user: Profile) => {
    setEditingUser(user);
    setEditDisplayName(user.display_name);
    setEditRole(user.role);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingUser || !editDisplayName.trim()) return;

    const previousRole = editingUser.role;
    const newRole = editRole;

    // Update profile
    await updateUser.mutateAsync({
      id: editingUser.id,
      display_name: editDisplayName.trim(),
      role: newRole,
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
      render: (user) => (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            handleOpenEdit(user);
          }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ),
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
                {isAdmin ? 'Manage users and their roles' : 'View system users'}
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
          <div className="w-full sm:w-48">
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
              </SelectContent>
            </Select>
          </div>
        </div>

        <DataGrid
          data={filteredUsers}
          columns={columns}
          loading={isLoading}
          keyField="id"
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
    </AppLayout>
  );
}
