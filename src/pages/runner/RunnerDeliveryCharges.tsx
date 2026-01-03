import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Clock, CheckCircle, XCircle, History } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useDeliveryCharges, useActiveDeliveryCharges, useCreateDeliveryCharge } from '@/hooks/useDeliveryCharges';
import { format } from 'date-fns';
import type { DeliveryChargeStatus } from '@/types/delivery-charges';

const statusConfig: Record<DeliveryChargeStatus, { label: string; icon: React.ReactNode; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  PENDING: { label: 'Pending', icon: <Clock className="h-3 w-3" />, variant: 'secondary' },
  APPROVED: { label: 'Approved', icon: <CheckCircle className="h-3 w-3" />, variant: 'default' },
  REJECTED: { label: 'Rejected', icon: <XCircle className="h-3 w-3" />, variant: 'destructive' },
};

export default function RunnerDeliveryCharges() {
  const { profile } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [historyArea, setHistoryArea] = useState<string | null>(null);
  const [newArea, setNewArea] = useState('');
  const [newAmount, setNewAmount] = useState('');

  const { data: allCharges = [], isLoading } = useDeliveryCharges({ runnerId: profile?.id });
  const { data: activeCharges = [] } = useActiveDeliveryCharges(profile?.id);
  const createCharge = useCreateDeliveryCharge();

  // Group charges by area for display
  const chargesByArea = allCharges.reduce((acc, charge) => {
    if (!acc[charge.area]) {
      acc[charge.area] = {
        active: null as typeof charge | null,
        pending: null as typeof charge | null,
        history: [] as typeof allCharges,
      };
    }
    
    if (charge.status === 'APPROVED' && !charge.superseded_at) {
      acc[charge.area].active = charge;
    } else if (charge.status === 'PENDING') {
      acc[charge.area].pending = charge;
    }
    acc[charge.area].history.push(charge);
    
    return acc;
  }, {} as Record<string, { active: typeof allCharges[0] | null; pending: typeof allCharges[0] | null; history: typeof allCharges }>);

  const handleSubmit = async () => {
    if (!newArea.trim() || !newAmount) return;

    await createCharge.mutateAsync({
      area: newArea.trim(),
      charge_amount: parseFloat(newAmount),
    });

    setNewArea('');
    setNewAmount('');
    setDialogOpen(false);
  };

  const areaHistory = historyArea ? chargesByArea[historyArea]?.history || [] : [];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Delivery Charges</h1>
            <p className="text-muted-foreground">
              Manage your delivery charges by area. Proposals require admin approval.
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Area Charge
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Charges</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeCharges.length}</div>
              <p className="text-xs text-muted-foreground">Areas with approved rates</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending Approval</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {allCharges.filter(c => c.status === 'PENDING').length}
              </div>
              <p className="text-xs text-muted-foreground">Awaiting admin review</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Areas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Object.keys(chargesByArea).length}</div>
              <p className="text-xs text-muted-foreground">Unique delivery areas</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Delivery Charges by Area</CardTitle>
            <CardDescription>
              Your current approved rates and pending proposals
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : Object.keys(chargesByArea).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No delivery charges configured. Add your first area charge above.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Area</TableHead>
                    <TableHead>Current Rate</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Pending Proposal</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(chargesByArea).map(([area, data]) => (
                    <TableRow key={area}>
                      <TableCell className="font-medium">{area}</TableCell>
                      <TableCell>
                        {data.active ? (
                          <span className="font-mono">RM {Number(data.active.charge_amount).toFixed(2)}</span>
                        ) : (
                          <span className="text-muted-foreground">Not set</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {data.active ? (
                          <Badge variant="default" className="gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Active
                          </Badge>
                        ) : data.pending ? (
                          <Badge variant="secondary" className="gap-1">
                            <Clock className="h-3 w-3" />
                            Pending
                          </Badge>
                        ) : (
                          <Badge variant="outline">No active rate</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {data.pending ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono">RM {Number(data.pending.charge_amount).toFixed(2)}</span>
                            <Badge variant="secondary" className="text-xs">Pending</Badge>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setHistoryArea(area)}
                          >
                            <History className="h-4 w-4 mr-1" />
                            History
                          </Button>
                          {!data.pending && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setNewArea(area);
                                setNewAmount(data.active?.charge_amount.toString() || '');
                                setDialogOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Charge Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{newArea ? 'Propose New Rate' : 'Add Area Charge'}</DialogTitle>
            <DialogDescription>
              {newArea 
                ? `Submit a new delivery charge proposal for ${newArea}. This will require admin approval.`
                : 'Add a new delivery area with your proposed charge. Admin approval is required.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="area">Area Name</Label>
              <Input
                id="area"
                value={newArea}
                onChange={(e) => setNewArea(e.target.value)}
                placeholder="e.g., Kuala Lumpur, Petaling Jaya"
                disabled={!!chargesByArea[newArea]}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Charge Amount (RM)</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!newArea.trim() || !newAmount || createCharge.isPending}
            >
              {createCharge.isPending ? 'Submitting...' : 'Submit for Approval'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={!!historyArea} onOpenChange={() => setHistoryArea(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Charge History: {historyArea}</DialogTitle>
            <DialogDescription>
              Complete history of delivery charges for this area
            </DialogDescription>
          </DialogHeader>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Proposed</TableHead>
                <TableHead>Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {areaHistory.map((charge) => {
                const config = statusConfig[charge.status];
                return (
                  <TableRow key={charge.id}>
                    <TableCell className="font-mono">
                      RM {Number(charge.charge_amount).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={config.variant} className="gap-1">
                        {config.icon}
                        {config.label}
                        {charge.status === 'APPROVED' && !charge.superseded_at && ' (Active)'}
                        {charge.superseded_at && ' (Superseded)'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(charge.created_at), 'dd MMM yyyy HH:mm')}
                    </TableCell>
                    <TableCell className="text-sm">
                      {charge.approved_at ? (
                        <span>{format(new Date(charge.approved_at), 'dd MMM yyyy HH:mm')}</span>
                      ) : charge.status === 'REJECTED' ? (
                        <span className="text-destructive">
                          {charge.rejection_remark || 'Rejected'}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Pending</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}