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

export default function RunnerAssistantSettings() {
  const { toast } = useToast();
  const { data: assistants = [], isLoading } = useRunnerAssistants();
  const { data: allUsers = [] } = useUsers();
  const createAssistant = useCreateRunnerAssistant();
  const updateAssistant = useUpdateRunnerAssistant();

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedAssistantId, setSelectedAssistantId] = useState('');
  const [selectedRunnerId, setSelectedRunnerId] = useState('');
  const [canDeliver, setCanDeliver] = useState(false);
  const [canConfirmReceipt, setCanConfirmReceipt] = useState(false);
  const [canManageDriverStock, setCanManageDriverStock] = useState(false);
  const [canManageDriverInbox, setCanManageDriverInbox] = useState(false);

  // Filter users by role for dropdowns
  const assistantUsers = allUsers.filter(u => u.role === 'runner_assistant' && u.is_active);
  const runnerUsers = allUsers.filter(u => u.role === 'runner' && u.is_active);

  // Already assigned assistant IDs
  const assignedAssistantIds = new Set(assistants.map(a => a.assistant_id));

  const handleCreate = () => {
    if (!selectedAssistantId || !selectedRunnerId) {
      toast({ variant: 'destructive', title: 'Please select both a runner assistant and a runner' });
      return;
    }
    createAssistant.mutate({
      runner_id: selectedRunnerId,
      assistant_id: selectedAssistantId,
      can_deliver: canDeliver,
      can_confirm_receipt: canConfirmReceipt,
      can_manage_driver_stock: canManageDriverStock,
      can_manage_driver_inbox: canManageDriverInbox,
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
    setCanDeliver(false);
    setCanConfirmReceipt(false);
    setCanManageDriverStock(false);
    setCanManageDriverInbox(false);
  };

  const handleToggle = (
    assistant: RunnerAssistant,
    field: 'can_deliver' | 'can_confirm_receipt' | 'can_manage_driver_stock' | 'can_manage_driver_inbox',
    value: boolean,
  ) => {
    updateAssistant.mutate({ id: assistant.id, [field]: value });
  };

  const handleDeactivate = (assistant: RunnerAssistant) => {
    updateAssistant.mutate({ id: assistant.id, is_active: false });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Runner Assistants</h3>
          <p className="text-sm text-muted-foreground">Assign assistants to runners with specific permissions</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm" className="rounded-full">
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
            <Card key={a.id} className="p-4">
              <div className="flex items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{a.assistant?.display_name || 'Unknown'}</span>
                    <Badge variant="outline" className="text-[10px]">Assistant</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Assigned to: <span className="font-medium text-foreground">{a.runner?.display_name || 'Unknown'}</span>
                  </p>
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={a.can_deliver}
                      onCheckedChange={(v) => handleToggle(a, 'can_deliver', v)}
                    />
                    <Label className="text-xs">Can Deliver</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={a.can_confirm_receipt}
                      onCheckedChange={(v) => handleToggle(a, 'can_confirm_receipt', v)}
                    />
                    <Label className="text-xs">Can Confirm Receipt</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={!!a.can_manage_driver_stock}
                      onCheckedChange={(v) => handleToggle(a, 'can_manage_driver_stock', v)}
                    />
                    <Label className="text-xs">Driver Stock</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={!!a.can_manage_driver_inbox}
                      onCheckedChange={(v) => handleToggle(a, 'can_manage_driver_inbox', v)}
                    />
                    <Label className="text-xs">Driver Inbox</Label>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeactivate(a)}
                    className="text-destructive hover:text-destructive"
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
              <Label className="text-sm">Runner Assistant User</Label>
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
                      No unassigned runner_assistant users found. Create a user with the "runner_assistant" role first.
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

            <div className="space-y-3 pt-2">
              <Label className="text-sm font-semibold">Permissions</Label>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Access A: Can Click Delivered</p>
                  <p className="text-xs text-muted-foreground">Can mark orders as delivered for the assigned runner</p>
                </div>
                <Switch checked={canDeliver} onCheckedChange={setCanDeliver} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Access B: Can Confirm Receipt</p>
                  <p className="text-xs text-muted-foreground">Can confirm or reject transfer receipts</p>
                </div>
                <Switch checked={canConfirmReceipt} onCheckedChange={setCanConfirmReceipt} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Access C: Driver Stock</p>
                  <p className="text-xs text-muted-foreground">Can help the assigned runner with pickups, returns, and allocated stock</p>
                </div>
                <Switch checked={canManageDriverStock} onCheckedChange={setCanManageDriverStock} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Access D: Driver Inbox</p>
                  <p className="text-xs text-muted-foreground">Can use the assigned runner's Driver Inbox assignment workspace</p>
                </div>
                <Switch checked={canManageDriverInbox} onCheckedChange={setCanManageDriverInbox} />
              </div>
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
