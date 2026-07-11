import { useState } from 'react';
import { useCompanyContext } from '@/contexts/CompanyContext';
import { useFinanceClaims, useApproveFinanceClaim, useRejectFinanceClaim, useMarkClaimPaid } from '@/hooks/useFinanceClaims';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { CheckCircle2, XCircle, DollarSign, Clock, Loader2, AlertTriangle, Search } from 'lucide-react';
import type { FinanceClaimStatus, FinanceClaimCategory } from '@/types/database';

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  rejected: 'bg-red-100 text-red-700',
  paid: 'bg-emerald-100 text-emerald-700',
  voided: 'bg-gray-100 text-gray-500',
  draft: 'bg-gray-100 text-gray-700',
};

const categoryLabels: Record<string, string> = {
  fuel: 'Fuel', packaging: 'Packaging', toll: 'Toll',
  parking: 'Parking', equipment: 'Equipment', other: 'Other',
};

export default function ApprovalCenter() {
  const { profile } = useAuth();
  const { company, loading } = useCompanyContext();
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [search, setSearch] = useState('');
  const { data: claims, isLoading } = useFinanceClaims(company?.id, filter === 'pending' ? { status: 'pending' } : undefined);
  const approve = useApproveFinanceClaim();
  const reject = useRejectFinanceClaim();
  const markPaid = useMarkClaimPaid();
  const [rejectDialog, setRejectDialog] = useState<{ claimId: string; reason: string } | null>(null);
  const [confirmApprove, setConfirmApprove] = useState<string | null>(null);

  if (loading || !company) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const filtered = (claims ?? []).filter((c: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return c.claim_no?.toLowerCase().includes(s) || c.description?.toLowerCase().includes(s) ||
      c.runner?.display_name?.toLowerCase().includes(s);
  });

  const pendingCount = (claims ?? []).filter((c: any) => c.status === 'pending').length;
  const totalPendingAmount = (claims ?? []).filter((c: any) => c.status === 'pending').reduce((s: number, c: any) => s + Number(c.amount), 0);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Pending Claims</p>
            <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Pending Amount</p>
            <p className="text-2xl font-bold text-amber-600">${totalPendingAmount.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="flex-shrink-0">
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search claims..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Claims */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p>{filter === 'pending' ? 'No pending claims' : 'No claims found'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((claim: any) => {
            const isSelf = claim.runner_user_id === profile?.id;
            return (
              <Card key={claim.id} className="hover:bg-muted/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground">{claim.claim_no}</span>
                        <Badge variant="outline" className={statusColors[claim.status] || ''}>
                          {claim.status}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {categoryLabels[claim.category] || claim.category}
                        </Badge>
                      </div>
                      <p className="font-medium text-sm">{claim.description}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>By: {claim.runner?.display_name || 'Unknown'}</span>
                        <span>{new Date(claim.claim_date).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-bold">${Number(claim.amount).toFixed(2)}</p>
                      {claim.status === 'pending' && (
                        <div className="flex gap-1 mt-2">
                          {isSelf ? (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Own claim
                            </span>
                          ) : (
                            <>
                              <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600 border-emerald-200"
                                onClick={() => setConfirmApprove(claim.id)} disabled={approve.isPending}>
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200"
                                onClick={() => setRejectDialog({ claimId: claim.id, reason: '' })}>
                                <XCircle className="h-3 w-3 mr-1" /> Reject
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                      {claim.status === 'approved' && (
                        <Button size="sm" variant="outline" className="h-7 text-xs mt-2 text-emerald-600"
                          onClick={() => markPaid.mutate(claim.id)} disabled={markPaid.isPending}>
                          <DollarSign className="h-3 w-3 mr-1" /> Mark Paid
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Approve Confirmation */}
      <AlertDialog open={!!confirmApprove} onOpenChange={() => setConfirmApprove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Claim?</AlertDialogTitle>
            <AlertDialogDescription>
              This will approve the claim and auto-create a finance transaction. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmApprove) approve.mutate({ claimId: confirmApprove }); setConfirmApprove(null); }}>
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={() => setRejectDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Claim</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Textarea
              placeholder="Reason for rejection..."
              value={rejectDialog?.reason || ''}
              onChange={(e) => setRejectDialog(d => d ? { ...d, reason: e.target.value } : null)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!rejectDialog?.reason.trim() || reject.isPending}
              onClick={() => {
                if (rejectDialog) {
                  reject.mutate({ claimId: rejectDialog.claimId, reason: rejectDialog.reason });
                  setRejectDialog(null);
                }
              }}>
              {reject.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
