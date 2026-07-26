import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useRunnerAssistants, useCreateRunnerAssistant, useUpdateRunnerAssistant } from '@/hooks/useRunnerAssistants';
import { useUsers } from '@/hooks/useUsers';
import { useToast } from '@/hooks/use-toast';
import { Plus, Loader2, UserCheck, Trash2 } from 'lucide-react';
import type { RunnerAssistant } from '@/types/database';

type PermissionField =
  | 'can_deliver'
  | 'can_confirm_receipt'
  | 'can_manage_driver_stock'
  | 'can_manage_driver_inbox'
  | 'can_manage_cash_settlement'
  | 'can_manage_driver_operations'
  | 'can_view_stock_audit'
  | 'can_manage_inbound_stock'
  | 'can_view_driver_workload';

const permissionOptions: Array<{ field: PermissionField; label: string; description: string }> = [
  { field: 'can_deliver', label: 'Can Click Delivered', description: 'Mark orders delivered for the assigned Runner' },
  { field: 'can_confirm_receipt', label: 'Confirm Receipt', description: 'Confirm or reject transfer receipts' },
  { field: 'can_manage_driver_stock', label: 'Driver Stock', description: 'Manage pickups, returns and allocated stock' },
  { field: 'can_manage_driver_inbox', label: 'Driver Inbox', description: 'Assign orders in the shared Driver Inbox' },
  { field: 'can_manage_cash_settlement', label: 'Cash Settlement', description: 'View accepted delivery amounts and reconcile cash' },
  { field: 'can_manage_driver_operations', label: 'Driver Operations', description: 'Review and accept Driver delivery or failure reports' },
  { field: 'can_view_stock_audit', label: 'Stock Balance & Audit', description: 'View the shared stock balance and audit pages' },
  { field: 'can_manage_inbound_stock', label: 'Inbound Stock', description: 'Create and review Runner inbound stock' },
  { field: 'can_view_driver_workload', label: 'Driver Workload', description: 'View performance and export Driver workload' },
];

export default function RunnerAssistantSettings() {
  const { toast } = useToast();
  const { data: assistants = [], isLoading } = useRunnerAssistants();
  const { data: allUsers = [] } = useUsers();
  const createAssistant = useCreateRunnerAssistant();
  const updateAssistant = useUpdateRunnerAssistant();

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedAssistantId, setSelectedAssistantId] = useState('');
  const [selectedRunnerId, setSelectedRunnerId] = useState('');
  const [permissions, setPermissions] = useState<Record<PermissionField, boolean>>(
    () => Object.fromEntries(permissionOptions.map(({ field }) => [field, false])) as Record<PermissionField, boolean>,
  );

  const assistantUsers = allUsers.filter(u => u.is_active && u.id !== selectedRunnerId);
  const runnerUsers = allUsers.filter(u => u.role === 'runner' && u.is_active);

  // Already assigned assistant IDs
  const assignedAssistantIds = new Set(assistants.map(a => a.assistant_id));

  const handleCreate = () => {
    if (!selectedAssistantId || !selectedRunnerId) {
      toast({ variant: 'destructive', title: 'Please select both a runner assistant and a runner' });
      return;
    }
    if (selectedAssistantId === selectedRunnerId) {
      toast({ variant: 'destructive', title: 'A Runner cannot be assigned as their own assistant' });
      return;
    }
    createAssistant.mutate({
      runner_id: selectedRunnerId,
      assistant_id: selectedAssistantId,
      ...permissions,
    }, {
      onSuccess: () => {
        setCreateOpen(false);
        resetForm();
      },
    });
  };

  const resetForm = () => {
    setSelectedAssistantId('');
    setSelectedRunnerId('');
    setPermissions(Object.fromEntries(permissionOptions.map(({ field }) => [field, false])) as Record<PermissionField, boolean>);
  };

  const handleToggle = (
    assistant: RunnerAssistant,
    field: PermissionField,
    value: boolean,
  ) => {
    updateAssistant.mutate({ id: assistant.id, [field]: value });
  };

  const handleDeactivate = (assistant: RunnerAssistant) => {
    updateAssistant.mutate({ id: assistant.id, is_active: false });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold">Runner Assistants</h3>
          <p className="text-sm text-muted-foreground">Assign assistants to runners with specific permissions</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm" className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-1" /> Assign Assistant
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : assistants.length === 0 ? (
        <Card className="p-8 text-center">
          <UserCheck className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No runner assistants assigned yet</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {assistants.map(a => (
            <Card key={a.id} className="overflow-hidden p-4">
              <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="truncate font-semibold text-sm">{a.assistant?.display_name || 'Unknown'}</span>
                    <Badge variant="outline" className="text-[10px]">Assistant</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Assigned to: <span className="font-medium text-foreground">{a.runner?.display_name || 'Unknown'}</span>
                  </p>
                </div>

                <div className="grid min-w-0 flex-[2] grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {permissionOptions.map(({ field, label }) => (
                    <div key={field} className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-muted/40 p-2">
                      <Label className="min-w-0 text-xs leading-tight">{label}</Label>
                      <Switch checked={Boolean(a[field])} onCheckedChange={(v) => handleToggle(a, field, v)} />
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeactivate(a)}
                    className="h-9 w-full text-destructive hover:text-destructive sm:col-span-2 lg:col-span-3"
                    aria-label={`Remove ${a.assistant?.display_name || 'assistant'}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Runner Assistant</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Assistant User</Label>
              <Select value={selectedAssistantId} onValueChange={setSelectedAssistantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select assistant user..." />
                </SelectTrigger>
                <SelectContent>
                  {assistantUsers
                    .filter(u => !assignedAssistantIds.has(u.id))
                    .map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>
                    ))}
                  {assistantUsers.filter(u => !assignedAssistantIds.has(u.id)).length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      No unassigned active users are available.
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Assign to Runner</Label>
              <Select value={selectedRunnerId} onValueChange={setSelectedRunnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select runner..." />
                </SelectTrigger>
                <SelectContent>
                  {runnerUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1 pt-2">
              <Label className="text-sm font-semibold">Permissions</Label>
              {permissionOptions.map(({ field, label, description }) => (
                <div key={field} className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </div>
                  <Switch
                    checked={permissions[field]}
                    onCheckedChange={(checked) => setPermissions((current) => ({ ...current, [field]: checked }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createAssistant.isPending || !selectedAssistantId || !selectedRunnerId}>
              {createAssistant.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
