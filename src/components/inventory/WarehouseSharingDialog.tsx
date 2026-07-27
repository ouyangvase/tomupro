import { useState } from 'react';
import { format } from 'date-fns';
import { Loader2, Mail, Share2, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  useMyInventoryShares,
  useRevokeInventoryShare,
  useShareInventory,
} from '@/hooks/useWarehouseSharing';

interface WarehouseSharingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WarehouseSharingDialog({ open, onOpenChange }: WarehouseSharingDialogProps) {
  const [email, setEmail] = useState('');
  const { data: shares = [], isLoading } = useMyInventoryShares();
  const shareInventory = useShareInventory();
  const revokeShare = useRevokeInventoryShare();

  const normalizedEmail = email.trim().toLowerCase();
  const canSubmit = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);

  const handleShare = async () => {
    if (!canSubmit) return;
    await shareInventory.mutateAsync(normalizedEmail);
    setEmail('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[85vh] overflow-hidden p-0">
        <DialogHeader className="border-b px-5 pb-4 pt-5 text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Share2 className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>Warehouse Sharing</DialogTitle>
              <DialogDescription className="mt-1">
                Share stock visibility and order fulfillment access by email.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 overflow-y-auto px-5 py-5">
          <div className="space-y-2">
            <label htmlFor="warehouse-share-email" className="text-sm font-medium">
              TOMUPRO user email
            </label>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="warehouse-share-email"
                  type="email"
                  autoComplete="off"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleShare();
                    }
                  }}
                  placeholder="user@example.com"
                  className="h-11 pl-9"
                />
              </div>
              <Button
                type="button"
                onClick={handleShare}
                disabled={!canSubmit || shareInventory.isPending}
                className="h-11 shrink-0"
              >
                {shareInventory.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Share2 className="h-4 w-4" />
                )}
                <span className="ml-2 hidden sm:inline">Share</span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The recipient can view your balance and use your warehouse for new orders. They cannot edit your stock.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Shared with</h3>
              </div>
              <span className="text-xs text-muted-foreground">{shares.length} user(s)</span>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading shares...
              </div>
            ) : shares.length === 0 ? (
              <div className="rounded-lg border border-dashed px-4 py-8 text-center">
                <Share2 className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
                <p className="text-sm font-medium">Not shared yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Enter an exact email above to grant access.
                </p>
              </div>
            ) : (
              <div className="divide-y rounded-lg border">
                {shares.map((share) => (
                  <div key={share.id} className="flex items-center gap-3 px-3 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                      {(share.viewer_display_name || share.viewer_email)[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{share.viewer_display_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{share.viewer_email}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Shared {format(new Date(share.created_at), 'dd MMM yyyy')}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove access for ${share.viewer_email}`}
                      disabled={revokeShare.isPending}
                      onClick={() => revokeShare.mutate(share.id)}
                      className="h-9 w-9 shrink-0 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
