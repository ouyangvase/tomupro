import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
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
import { CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import { 
  usePendingDeliveryCharges, 
  useDeliveryCharges,
  useApproveDeliveryCharge, 
  useRejectDeliveryCharge 
} from '@/hooks/useDeliveryCharges';
import { format } from 'date-fns';
import type { DeliveryCharge } from '@/types/delivery-charges';

export default function DeliveryChargesAdmin() {
  const [selectedCharge, setSelectedCharge] = useState<DeliveryCharge | null>(null);
  const [rejectRemark, setRejectRemark] = useState('');
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);

  const { data: pendingCharges = [], isLoading } = usePendingDeliveryCharges();
  const approveCharge = useApproveDeliveryCharge();
  const rejectCharge = useRejectDeliveryCharge();

  // Get existing approved charge for comparison
  const { data: allCharges = [] } = useDeliveryCharges();
  
  const getExistingCharge = (runnerId: string, area: string) => {
    return allCharges.find(
      c => c.runner_id === runnerId && 
           c.area === area && 
           c.status === 'APPROVED' && 
           !c.superseded_at
    );
  };

  const handleApprove = async () => {
    if (!selectedCharge) return;
    await approveCharge.mutateAsync(selectedCharge.id);
    setSelectedCharge(null);
    setActionType(null);
  };

  const handleReject = async () => {
    if (!selectedCharge) return;
    await rejectCharge.mutateAsync({ 
      chargeId: selectedCharge.id, 
      remark: rejectRemark 
    });
    setSelectedCharge(null);
    setActionType(null);
    setRejectRemark('');
  };

  const openActionDialog = (charge: DeliveryCharge, action: 'approve' | 'reject') => {
    setSelectedCharge(charge);
    setActionType(action);
    setRejectRemark('');
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Delivery Charges Approval</h1>
          <p className="text-muted-foreground">
            Review and approve runner delivery charge proposals
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending Approval</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingCharges.length}</div>
              <p className="text-xs text-muted-foreground">Proposals awaiting review</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Unique Runners</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Set(pendingCharges.map(c => c.runner_id)).size}
              </div>
              <p className="text-xs text-muted-foreground">Runners with pending proposals</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Unique Areas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Set(pendingCharges.map(c => c.area)).size}
              </div>
              <p className="text-xs text-muted-foreground">Areas with pending rates</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Pending Proposals</CardTitle>
            <CardDescription>
              Approve or reject delivery charge proposals from runners
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : pendingCharges.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground flex flex-col items-center gap-2">
                <CheckCircle className="h-8 w-8 text-green-500" />
                <p>No pending proposals</p>
                <p className="text-sm">All delivery charge proposals have been reviewed</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Runner</TableHead>
                    <TableHead>Area</TableHead>
                    <TableHead>Proposed Amount</TableHead>
                    <TableHead>Current Rate</TableHead>
                    <TableHead>Change</TableHead>
                    <TableHead>Proposed On</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingCharges.map((charge) => {
                    const existingCharge = getExistingCharge(charge.runner_id, charge.area);
                    const currentAmount = existingCharge ? Number(existingCharge.charge_amount) : null;
                    const proposedAmount = Number(charge.charge_amount);
                    const change = currentAmount !== null ? proposedAmount - currentAmount : null;

                    return (
                      <TableRow key={charge.id}>
                        <TableCell className="font-medium">
                          {charge.runner?.display_name || 'Unknown'}
                        </TableCell>
                        <TableCell>{charge.area}</TableCell>
                        <TableCell className="font-mono">
                          BND {proposedAmount.toFixed(2)}
                        </TableCell>
                        <TableCell className="font-mono">
                          {currentAmount !== null ? (
                            `BND ${currentAmount.toFixed(2)}`
                          ) : (
                            <Badge variant="outline">New Area</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {change !== null ? (
                            <Badge 
                              variant={change > 0 ? 'destructive' : change < 0 ? 'default' : 'secondary'}
                              className="font-mono"
                            >
                              {change > 0 ? '+' : ''}{change.toFixed(2)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(charge.created_at), 'dd MMM yyyy HH:mm')}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => openActionDialog(charge, 'approve')}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => openActionDialog(charge, 'reject')}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Approve Dialog */}
      <Dialog open={actionType === 'approve'} onOpenChange={() => setActionType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Delivery Charge</DialogTitle>
            <DialogDescription>
              Confirm approval of this delivery charge proposal
            </DialogDescription>
          </DialogHeader>

          {selectedCharge && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground">Runner</Label>
                  <p className="font-medium">{selectedCharge.runner?.display_name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Area</Label>
                  <p className="font-medium">{selectedCharge.area}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Proposed Amount</Label>
                  <p className="font-mono font-medium">BND {Number(selectedCharge.charge_amount).toFixed(2)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Proposed On</Label>
                  <p>{format(new Date(selectedCharge.created_at), 'dd MMM yyyy HH:mm')}</p>
                </div>
              </div>

              <div className="bg-muted p-3 rounded-lg text-sm">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">This action will:</p>
                    <ul className="list-disc list-inside text-muted-foreground mt-1">
                      <li>Set this charge as the active rate for {selectedCharge.area}</li>
                      <li>Supersede any previous approved rate</li>
                      <li>Apply to all future claims in this area</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setActionType(null)}>
              Cancel
            </Button>
            <Button 
              onClick={handleApprove}
              disabled={approveCharge.isPending}
            >
              {approveCharge.isPending ? 'Approving...' : 'Confirm Approval'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={actionType === 'reject'} onOpenChange={() => setActionType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Delivery Charge</DialogTitle>
            <DialogDescription>
              Reject this delivery charge proposal with an optional remark
            </DialogDescription>
          </DialogHeader>

          {selectedCharge && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground">Runner</Label>
                  <p className="font-medium">{selectedCharge.runner?.display_name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Area</Label>
                  <p className="font-medium">{selectedCharge.area}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Proposed Amount</Label>
                  <p className="font-mono font-medium">BND {Number(selectedCharge.charge_amount).toFixed(2)}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="remark">Rejection Remark (Optional)</Label>
                <Textarea
                  id="remark"
                  value={rejectRemark}
                  onChange={(e) => setRejectRemark(e.target.value)}
                  placeholder="Provide a reason for rejection..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setActionType(null)}>
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={handleReject}
              disabled={rejectCharge.isPending}
            >
              {rejectCharge.isPending ? 'Rejecting...' : 'Reject Proposal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}