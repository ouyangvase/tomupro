import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Package, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { 
  useUserStockSummary, 
  useCreateOffboardingTransfer,
  ExtendedProfile 
} from '@/hooks/useOffboarding';
import { useManagers } from '@/hooks/useTeamMembers';

interface OffboardingStockTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: ExtendedProfile | null;
}

export function OffboardingStockTransferDialog({ 
  open, 
  onOpenChange, 
  user 
}: OffboardingStockTransferDialogProps) {
  const [targetManagerId, setTargetManagerId] = useState<string>('');
  const [notes, setNotes] = useState('');
  
  const { data: managers = [] } = useManagers();
  const { data: stockSummary, isLoading: loadingStock } = useUserStockSummary(
    open ? user?.id || null : null
  );
  const createTransfer = useCreateOffboardingTransfer();

  // Set default target manager when user changes
  useEffect(() => {
    if (user?.manager_id) {
      setTargetManagerId(user.manager_id);
    } else if (managers.length > 0) {
      setTargetManagerId(managers[0].id);
    }
  }, [user, managers]);

  const handleSubmit = async () => {
    if (!user || !targetManagerId) return;
    
    await createTransfer.mutateAsync({
      fromUserId: user.id,
      toUserId: targetManagerId,
      notes: notes.trim() || undefined,
    });
    
    // Reset and close
    setNotes('');
    onOpenChange(false);
  };

  const handleClose = () => {
    setNotes('');
    onOpenChange(false);
  };

  const hasStock = stockSummary && stockSummary.totalSkus > 0;
  const selectedManager = managers.find(m => m.id === targetManagerId);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Transfer Stock to Manager
          </DialogTitle>
          <DialogDescription>
            Transfer all remaining stock from <strong>{user?.display_name}</strong>'s 
            warehouse to a manager's warehouse.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Stock Summary */}
          <div className="rounded-lg border bg-muted/30 p-4">
            <h4 className="font-medium mb-2">Current Stock Summary</h4>
            {loadingStock ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading stock...
              </div>
            ) : hasStock ? (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Total SKUs:</span>
                  <span className="ml-2 font-semibold">{stockSummary.totalSkus}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Qty:</span>
                  <span className="ml-2 font-semibold">{stockSummary.totalQty}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                No stock to transfer
              </div>
            )}
          </div>

          {/* Target Manager Selection */}
          <div className="space-y-2">
            <Label>Transfer To</Label>
            <Select value={targetManagerId} onValueChange={setTargetManagerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select target manager..." />
              </SelectTrigger>
              <SelectContent>
                {managers.map((manager) => (
                  <SelectItem key={manager.id} value={manager.id}>
                    {manager.display_name}
                    {manager.id === user?.manager_id && ' (Assigned Manager)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Transfer Preview */}
          {hasStock && targetManagerId && (
            <div className="flex items-center justify-center gap-3 py-2 text-sm">
              <div className="text-center">
                <div className="font-medium">{user?.display_name}</div>
                <div className="text-muted-foreground text-xs">
                  {stockSummary?.totalQty} units
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
              <div className="text-center">
                <div className="font-medium">{selectedManager?.display_name}</div>
                <div className="text-muted-foreground text-xs">
                  Manager warehouse
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any notes about this transfer..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Info box */}
          <div className="rounded-lg bg-primary/10 p-3 text-sm">
            <strong>Note:</strong> The transfer will be created as pending.
            The target manager must approve it before stock is moved.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!hasStock || !targetManagerId || createTransfer.isPending}
          >
            {createTransfer.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Transfer (Needs Approval)'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
