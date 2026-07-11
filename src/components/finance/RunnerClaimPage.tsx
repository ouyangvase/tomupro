import { useState } from 'react';
import { useCompanyContext } from '@/contexts/CompanyContext';
import { useFinanceClaims, useSubmitFinanceClaim } from '@/hooks/useFinanceClaims';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Receipt, Clock, CheckCircle2, XCircle, DollarSign, Loader2 } from 'lucide-react';
import type { FinanceClaimCategory, FinanceClaimStatus } from '@/types/database';

const statusConfig: Record<FinanceClaimStatus, { label: string; color: string; icon: any }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700', icon: Clock },
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700', icon: Clock },
  approved: { label: 'Approved', color: 'bg-blue-100 text-blue-700', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: XCircle },
  paid: { label: 'Paid', color: 'bg-emerald-100 text-emerald-700', icon: DollarSign },
  voided: { label: 'Voided', color: 'bg-gray-100 text-gray-500', icon: XCircle },
};

const categoryLabels: Record<FinanceClaimCategory, string> = {
  fuel: 'Fuel',
  packaging: 'Packaging',
  toll: 'Toll',
  parking: 'Parking',
  equipment: 'Equipment',
  other: 'Other',
};

function SubmitClaimDialog() {
  const [open, setOpen] = useState(false);
  const submit = useSubmitFinanceClaim();
  const [form, setForm] = useState({
    category: 'fuel' as FinanceClaimCategory,
    description: '',
    amount: '',
    claim_date: new Date().toISOString().split('T')[0],
    tracking_number: '',
    payment_method: '',
    notes: '',
  });

  const handleSubmit = () => {
    submit.mutate({
      category: form.category,
      description: form.description,
      amount: parseFloat(form.amount) || 0,
      claim_date: form.claim_date,
      tracking_number: form.tracking_number || undefined,
      payment_method: form.payment_method || undefined,
      notes: form.notes || undefined,
    }, {
      onSuccess: () => {
        setOpen(false);
        setForm({ category: 'fuel', description: '', amount: '', claim_date: new Date().toISOString().split('T')[0], tracking_number: '', payment_method: '', notes: '' });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-1" /> New Claim</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit Expense Claim</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm(f => ({ ...f, category: v as FinanceClaimCategory }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(categoryLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={form.claim_date} onChange={(e) => setForm(f => ({ ...f, claim_date: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input placeholder="What is this expense for?" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={form.payment_method} onValueChange={(v) => setForm(f => ({ ...f, payment_method: v }))}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Tracking Number (Optional)</Label>
            <Input placeholder="e.g. receipt number" value={form.tracking_number} onChange={(e) => setForm(f => ({ ...f, tracking_number: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Notes (Optional)</Label>
            <Textarea placeholder="Additional notes..." value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!form.description.trim() || !form.amount || submit.isPending}>
            {submit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit Claim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function RunnerClaimPage() {
  const { company, loading } = useCompanyContext();
  const { data: claims, isLoading } = useFinanceClaims(company?.id);

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!company) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Receipt className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>You need to join a workspace first.</p>
        <p className="text-sm">Ask your admin to invite you.</p>
      </div>
    );
  }

  const pending = (claims ?? []).filter(c => c.status === 'pending');
  const approved = (claims ?? []).filter(c => c.status === 'approved' || c.status === 'paid');
  const totalApproved = approved.reduce((s, c) => s + Number(c.amount), 0);
  const totalPaid = (claims ?? []).filter(c => c.status === 'paid').reduce((s, c) => s + Number(c.amount), 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Pending</p>
            <p className="text-2xl font-bold text-amber-600">{pending.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Approved Total</p>
            <p className="text-2xl font-bold text-blue-600">${totalApproved.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Paid Total</p>
            <p className="text-2xl font-bold text-emerald-600">${totalPaid.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Total Claims</p>
            <p className="text-2xl font-bold">{(claims ?? []).length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">My Claims</h3>
        <SubmitClaimDialog />
      </div>

      {/* Claims List */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (claims ?? []).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Receipt className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p>No claims yet. Submit your first expense claim.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(claims ?? []).map((claim: any) => {
            const cfg = statusConfig[claim.status as FinanceClaimStatus] || statusConfig.draft;
            const Icon = cfg.icon;
            return (
              <Card key={claim.id} className="hover:bg-muted/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{claim.claim_no}</span>
                        <Badge variant="outline" className={cfg.color}>
                          <Icon className="h-3 w-3 mr-1" />
                          {cfg.label}
                        </Badge>
                      </div>
                      <p className="font-medium text-sm truncate">{claim.description}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{categoryLabels[claim.category as FinanceClaimCategory] || claim.category}</span>
                        <span>{new Date(claim.claim_date).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <p className="text-lg font-bold">${Number(claim.amount).toFixed(2)}</p>
                    </div>
                  </div>
                  {claim.admin_note && (
                    <div className="mt-2 p-2 rounded bg-muted text-xs text-muted-foreground">
                      Admin: {claim.admin_note}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
