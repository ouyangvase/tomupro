import { useState } from 'react';
import { useCompanyContext } from '@/contexts/CompanyContext';
import { useFinanceReports, useCloseMonth } from '@/hooks/useFinanceReports';
import { useFinanceTransactions } from '@/hooks/useFinanceTransactions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Lock, Calendar, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

function getAvailableMonths(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

export default function MonthlyClosingPage() {
  const { company, loading } = useCompanyContext();
  const { data: reports, isLoading } = useFinanceReports(company?.id);
  const [selectedMonth, setSelectedMonth] = useState(getAvailableMonths()[1] || ''); // Default to last month
  const [confirmOpen, setConfirmOpen] = useState(false);
  const closeMonth = useCloseMonth();

  // Get transactions for selected month preview
  const monthStart = selectedMonth ? `${selectedMonth}-01` : undefined;
  const [year, month] = selectedMonth ? selectedMonth.split('-').map(Number) : [0, 0];
  const monthEnd = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  const { data: txns } = useFinanceTransactions(company?.id, monthStart ? { dateFrom: monthStart, dateTo: monthEnd } : undefined);

  if (loading || isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (!company) {
    return <div className="text-center py-16 text-muted-foreground">No workspace found</div>;
  }

  const closedMonths = new Set((reports ?? []).filter(r => r.status === 'closed').map(r => r.report_month));
  const isSelectedClosed = closedMonths.has(selectedMonth);

  const confirmedTxns = (txns ?? []).filter((t: any) => t.status === 'confirmed');
  const income = confirmedTxns.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount), 0);
  const expense = confirmedTxns.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount), 0);
  const net = income - expense;

  return (
    <div className="space-y-6">
      {/* Month Selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Monthly Closing
          </CardTitle>
          <CardDescription>Close a month to generate a financial report snapshot and lock transactions.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>
                {getAvailableMonths().map(m => (
                  <SelectItem key={m} value={m}>
                    {m} {closedMonths.has(m) ? ' (Closed)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isSelectedClosed ? (
              <Badge variant="outline" className="bg-emerald-100 text-emerald-700">
                <Lock className="h-3 w-3 mr-1" /> Closed
              </Badge>
            ) : (
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={closeMonth.isPending || !selectedMonth}
              >
                {closeMonth.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Lock className="h-4 w-4 mr-1" /> Close Month
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {selectedMonth && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Preview — {selectedMonth}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Transactions</p>
                <p className="text-xl font-bold">{confirmedTxns.length}</p>
              </div>
              <div>
                <p className="text-xs text-emerald-600">Income</p>
                <p className="text-xl font-bold text-emerald-700">${income.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-red-600">Expense</p>
                <p className="text-xl font-bold text-red-700">${expense.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-blue-600">Net</p>
                <p className={`text-xl font-bold ${net >= 0 ? 'text-blue-700' : 'text-red-700'}`}>${net.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Closed Months History */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Closed Months</CardTitle>
        </CardHeader>
        <CardContent>
          {(reports ?? []).filter(r => r.status === 'closed').length === 0 ? (
            <p className="text-center py-6 text-muted-foreground text-sm">No months closed yet</p>
          ) : (
            <div className="space-y-2">
              {(reports ?? []).filter(r => r.status === 'closed').map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <div>
                      <p className="font-medium text-sm">{r.report_month}</p>
                      <p className="text-xs text-muted-foreground">
                        Closed {r.closed_at ? new Date(r.closed_at).toLocaleDateString() : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-medium ${Number(r.net_profit) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      ${Number(r.net_profit).toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">{Number(r.profit_margin).toFixed(1)}% margin</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm Dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Close Month {selectedMonth}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will generate a financial report snapshot for {selectedMonth}. Transactions for this month will become locked and visible to Finance Viewers. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2 px-1 space-y-1 text-sm">
            <p>Income: <span className="font-medium text-emerald-600">${income.toFixed(2)}</span></p>
            <p>Expense: <span className="font-medium text-red-600">${expense.toFixed(2)}</span></p>
            <p>Net: <span className={`font-medium ${net >= 0 ? 'text-blue-600' : 'text-red-600'}`}>${net.toFixed(2)}</span></p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { closeMonth.mutate(selectedMonth); setConfirmOpen(false); }}>
              Close Month
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
