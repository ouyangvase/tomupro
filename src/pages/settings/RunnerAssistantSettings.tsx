import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  ASSISTANT_PERMISSION_FIELDS,
  useCreateRunnerAssistant,
  useRemoveRunnerAssistant,
  useRemoveRunnerAssistantLink,
  useRunnerAssistants,
  useUpdateRunnerAssistant,
  type AssistantPermissionField,
  type AssistantPermissions,
} from '@/hooks/useRunnerAssistants';
import { useUsers } from '@/hooks/useUsers';
import { useToast } from '@/hooks/use-toast';
import { Link2, Loader2, Pencil, Plus, Trash2, UserCheck, UserMinus } from 'lucide-react';
import type { RunnerAssistant } from '@/types/database';

const permissionOptions: Array<{
  field: AssistantPermissionField;
  label: string;
  description: string;
}> = [
  { field: 'can_deliver', label: 'Can Click Delivered', description: 'Mark orders delivered for linked Runners' },
  { field: 'can_confirm_receipt', label: 'Confirm Receipt', description: 'Confirm or reject transfer receipts' },
  { field: 'can_manage_driver_stock', label: 'Driver Stock', description: 'Manage pickups, returns and allocated stock' },
  { field: 'can_manage_driver_inbox', label: 'Driver Inbox', description: 'Assign orders in the shared Driver Inbox' },
  { field: 'can_manage_cash_settlement', label: 'Cash Settlement', description: 'View accepted delivery amounts and reconcile cash' },
  { field: 'can_manage_driver_operations', label: 'Driver Operations', description: 'Review and accept Driver delivery or failure reports' },
  { field: 'can_view_stock_audit', label: 'Stock Balance & Audit', description: 'View shared stock balance and audit details' },
  { field: 'can_manage_inbound_stock', label: 'Inbound Stock', description: 'Create and review Runner inbound stock' },
  { field: 'can_view_driver_workload', label: 'Driver Workload', description: 'View performance and export Driver workload' },
];

const emptyPermissions = () => Object.fromEntries(
  ASSISTANT_PERMISSION_FIELDS.map((field) => [field, false]),
) as AssistantPermissions;

type AssistantGroup = {
  assistantId: string;
  assistant: RunnerAssistant['assistant'];
  bindings: RunnerAssistant[];
  permissions: AssistantPermissions;
};

function getPermissions(binding?: RunnerAssistant): AssistantPermissions {
  return Object.fromEntries(
    ASSISTANT_PERMISSION_FIELDS.map((field) => [field, Boolean(binding?.[field])]),
  ) as AssistantPermissions;
}

export default function RunnerAssistantSettings() {
  const { toast } = useToast();
  const { data: assistants = [], isLoading } = useRunnerAssistants();
  const { data: allUsers = [] } = useUsers();
  const createAssistant = useCreateRunnerAssistant();
  const updateAssistant = useUpdateRunnerAssistant();
  const removeLink = useRemoveRunnerAssistantLink();
  const removeAssistant = useRemoveRunnerAssistant();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAssistantId, setSelectedAssistantId] = useState('');
  const [selectedRunnerIds, setSelectedRunnerIds] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<AssistantPermissions>(emptyPermissions);

  const groups = useMemo(() => {
    const grouped = new Map<string, AssistantGroup>();
    assistants.forEach((binding) => {
      const current = grouped.get(binding.assistant_id);
      if (current) {
        current.bindings.push(binding);
        return;
      }
      grouped.set(binding.assistant_id, {
        assistantId: binding.assistant_id,
        assistant: binding.assistant,
        bindings: [binding],
        permissions: getPermissions(binding),
      });
    });
    return Array.from(grouped.values()).sort((a, b) =>
      (a.assistant?.display_name || '').localeCompare(b.assistant?.display_name || ''),
    );
  }, [assistants]);

  const assistantUsers = allUsers.filter((user) => user.is_active);
  const runnerUsers = allUsers.filter((user) => user.role === 'runner' && user.is_active);
  const saving = createAssistant.isPending || removeLink.isPending;

  const resetForm = () => {
    setSelectedAssistantId('');
    setSelectedRunnerIds([]);
    setPermissions(emptyPermissions());
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openManage = (group: AssistantGroup) => {
    setSelectedAssistantId(group.assistantId);
    setSelectedRunnerIds(group.bindings.map((binding) => binding.runner_id));
    setPermissions(group.permissions);
    setDialogOpen(true);
  };

  const handleAssistantChange = (assistantId: string) => {
    setSelectedAssistantId(assistantId);
    const existing = groups.find((group) => group.assistantId === assistantId);
    setSelectedRunnerIds(existing?.bindings.map((binding) => binding.runner_id) || []);
    setPermissions(existing?.permissions || emptyPermissions());
  };

  const toggleRunner = (runnerId: string, checked: boolean) => {
    setSelectedRunnerIds((current) => checked
      ? Array.from(new Set([...current, runnerId]))
      : current.filter((id) => id !== runnerId));
  };

  const handleSave = async () => {
    if (!selectedAssistantId || selectedRunnerIds.length === 0) {
      toast({ variant: 'destructive', title: 'Select an Assistant and at least one Runner' });
      return;
    }
    if (selectedRunnerIds.includes(selectedAssistantId)) {
      toast({ variant: 'destructive', title: 'A user cannot assist themselves' });
      return;
    }

    const currentBindings = assistants.filter((binding) => binding.assistant_id === selectedAssistantId);
    const removedBindings = currentBindings.filter((binding) => !selectedRunnerIds.includes(binding.runner_id));

    try {
      await createAssistant.mutateAsync({
        assistant_id: selectedAssistantId,
        runner_ids: selectedRunnerIds,
        ...permissions,
      });
      await Promise.all(removedBindings.map((binding) => removeLink.mutateAsync(binding.id)));
      setDialogOpen(false);
      resetForm();
    } catch {
      // Mutation hooks show the server error.
    }
  };

  const handleToggle = (
    group: AssistantGroup,
    field: AssistantPermissionField,
    value: boolean,
  ) => {
    updateAssistant.mutate({
      assistant_id: group.assistantId,
      [field]: value,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold">Runner Assistants</h3>
          <p className="text-sm text-muted-foreground">
            One permission profile can operate across multiple linked Runners.
          </p>
        </div>
        <Button onClick={openCreate} size="sm" className="w-full sm:w-auto">
          <Plus className="mr-1 h-4 w-4" /> Assign Assistant
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : groups.length === 0 ? (
        <Card className="p-8 text-center">
          <UserCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No Runner Assistants assigned yet</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <Card key={group.assistantId} className="overflow-hidden p-4">
              <div className="flex min-w-0 flex-col gap-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="truncate font-semibold">
                        {group.assistant?.display_name || group.assistant?.email || 'Unknown'}
                      </span>
                      <Badge variant="outline" className="text-[10px]">Assistant</Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {group.bindings.length} Runner{group.bindings.length === 1 ? '' : 's'}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {group.bindings.map((binding) => (
                        <Badge key={binding.id} className="gap-1 rounded-full" variant="secondary">
                          <Link2 className="h-3 w-3" />
                          {binding.runner?.display_name || binding.runner?.email || 'Unknown Runner'}
                          <button
                            type="button"
                            className="ml-1 rounded-full p-0.5 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => removeLink.mutate(binding.id)}
                            aria-label={`Remove ${binding.runner?.display_name || 'Runner'} link`}
                          >
                            <UserMinus className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openManage(group)}>
                      <Pencil className="mr-1 h-4 w-4" /> Manage Runners
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeAssistant.mutate(group.assistantId)}
                      aria-label={`Remove ${group.assistant?.display_name || 'Assistant'}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {permissionOptions.map(({ field, label }) => (
                    <div key={field} className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-muted/40 p-2">
                      <Label className="min-w-0 text-xs leading-tight">{label}</Label>
                      <Switch
                        checked={group.permissions[field]}
                        onCheckedChange={(value) => handleToggle(group, field, value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Runner Assistant</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Assistant User</Label>
              <Select value={selectedAssistantId} onValueChange={handleAssistantChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select any active user..." />
                </SelectTrigger>
                <SelectContent>
                  {assistantUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.display_name || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Existing Assistants remain selectable when adding another Runner.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Linked Runners</Label>
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-2">
                {runnerUsers.map((runner) => {
                  const checked = selectedRunnerIds.includes(runner.id);
                  return (
                    <label
                      key={runner.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => toggleRunner(runner.id, value === true)}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {runner.display_name || runner.email}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{runner.email}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Global Permissions</Label>
              <p className="text-xs text-muted-foreground">
                These permissions apply to every linked Runner.
              </p>
              <div className="space-y-2">
                {permissionOptions.map(({ field, label, description }) => (
                  <div key={field} className="flex items-center justify-between gap-4 rounded-md border p-3">
                    <div className="min-w-0">
                      <Label className="text-sm">{label}</Label>
                      <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                    <Switch
                      checked={permissions[field]}
                      onCheckedChange={(value) => setPermissions((current) => ({ ...current, [field]: value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Links
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
