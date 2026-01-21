import { useState } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle } from 'lucide-react';
import { useDisableUser, ExtendedProfile } from '@/hooks/useOffboarding';

interface DisableUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: ExtendedProfile | null;
}

export function DisableUserDialog({ open, onOpenChange, user }: DisableUserDialogProps) {
  const [reason, setReason] = useState('');
  const [markAsResigned, setMarkAsResigned] = useState(false);
  
  const disableUser = useDisableUser();

  const handleSubmit = async () => {
    if (!user || !reason.trim()) return;
    
    await disableUser.mutateAsync({
      userId: user.id,
      reason: reason.trim(),
      markAsResigned,
    });
    
    // Reset form and close
    setReason('');
    setMarkAsResigned(false);
    onOpenChange(false);
  };

  const handleClose = () => {
    setReason('');
    setMarkAsResigned(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Disable User Account
          </DialogTitle>
          <DialogDescription>
            This will immediately prevent <strong>{user?.display_name}</strong> from logging in.
            All historical data (orders, claims, logs) will be preserved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for disabling</Label>
            <Textarea
              id="reason"
              placeholder="Enter the reason for disabling this account..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="resigned"
              checked={markAsResigned}
              onCheckedChange={(checked) => setMarkAsResigned(checked === true)}
            />
            <Label htmlFor="resigned" className="text-sm font-normal cursor-pointer">
              Mark as resigned (for offboarding purposes)
            </Label>
          </div>

          <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <strong>Warning:</strong> If this user is currently logged in, they will be
            automatically signed out and unable to log back in.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!reason.trim() || disableUser.isPending}
          >
            {disableUser.isPending ? 'Disabling...' : 'Disable Account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
