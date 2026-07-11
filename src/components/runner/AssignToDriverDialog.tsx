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
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMyDrivers, useBulkAssignOrdersToDriver, useDriverOrderCount } from '@/hooks/useDrivers';
import { Truck, Loader2, AlertTriangle, UserPlus } from 'lucide-react';

interface AssignToDriverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderIds: string[];
  onSuccess: () => void;
}

export function AssignToDriverDialog({
  open,
  onOpenChange,
  orderIds,
  onSuccess,
}: AssignToDriverDialogProps) {
  const [selectedDriver, setSelectedDriver] = useState<string>('');
  const { data: myDrivers = [] } = useMyDrivers();
  const bulkAssign = useBulkAssignOrdersToDriver();
  const { data: driverOrderCount } = useDriverOrderCount(selectedDriver || undefined);

  const handleAssign = () => {
    if (!selectedDriver || orderIds.length === 0) return;
    const ids = [...orderIds];
    const driverId = selectedDriver;
    bulkAssign.mutate(
      { orderIds: ids, driverId },
      {
        onSuccess: () => {
          import('@/hooks/useAuditLogs').then(({ logAudit }) => {
            for (const id of ids) {
              logAudit({ entity_type: 'order', entity_id: id, action: 'driver_assigned', after_json: { driver_id: driverId, driver_status: 'ASSIGNED' } });
            }
          });
          setSelectedDriver('');
          onOpenChange(false);
          onSuccess();
        },
      }
    );
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) setSelectedDriver('');
    onOpenChange(v);
  };

  const selectedDriverProfile = myDrivers.find(d => d.driver_id === selectedDriver)?.driver;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Assign to Driver
          </DialogTitle>
          <DialogDescription>
            Assign {orderIds.length} selected order{orderIds.length !== 1 ? 's' : ''} to a driver for delivery.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {myDrivers.length === 0 ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>No active drivers found. Add drivers in Driver Management first.</span>
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Select Driver</label>
                <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                  <SelectTrigger className="w-full rounded-xl h-11">
                    <SelectValue placeholder="Choose a driver..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {myDrivers.map(d => (
                      <SelectItem key={d.driver_id} value={d.driver_id} className="rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                            {(d.driver?.display_name || 'D')[0].toUpperCase()}
                          </div>
                          {d.driver?.display_name || 'Unknown Driver'}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedDriver && selectedDriverProfile && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 border border-border/60">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary font-bold text-sm">
                    {selectedDriverProfile.display_name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{selectedDriverProfile.display_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Current load: {driverOrderCount ?? '...'} active orders
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    <Truck className="h-3 w-3 mr-1" />
                    {driverOrderCount ?? 0}
                  </Badge>
                </div>
              )}

              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
                <p className="text-sm font-medium">
                  {orderIds.length} order{orderIds.length !== 1 ? 's' : ''} will be assigned
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Driver status will be set to ASSIGNED for each order.
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} className="rounded-xl">
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={!selectedDriver || orderIds.length === 0 || bulkAssign.isPending || myDrivers.length === 0}
            className="rounded-xl"
          >
            {bulkAssign.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Assigning...</>
            ) : (
              <><Truck className="h-4 w-4 mr-2" /> Assign {orderIds.length} Order{orderIds.length !== 1 ? 's' : ''}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
