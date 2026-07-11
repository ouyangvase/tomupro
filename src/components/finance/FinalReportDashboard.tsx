import { useState } from 'react';
import { useCompanyContext } from '@/contexts/CompanyContext';
import { useFinanceReports } from '@/hooks/useFinanceReports';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { FileText, TrendingUp, TrendingDown, DollarSign, Loader2, Download } from 'lucide-react';
import { exportToCSV } from '@/lib/csv';

export default function FinalReportDashboard() {
  const { company, loading } = useCompanyContext();
  const { data: reports, isLoading } = useFinanceReports(company?.id);
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  if (loading || isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (!company) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>You need to join a workspace first.</p>
      </div>
    );
  }

  const closedReports = (reports ?? []).filter(r => r.status === 'closed');

  if (closedReports.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No closed reports available yet.</p>
        <p className="text-sm">Reports become visible after the admin closes a month.</p>
      </div>
    );
  }

  const selected = selectedMonth
    ? closedReports.find(r => r.report_month === selectedMonth)
    : closedReports[0];

  if (!selectedMonth && selected) {
    // Auto-select the most recent
    setTimeout(() => setSelectedMonth(selected.report_month), 0);
  }

  const handleExport = () => {
    if (!selected) return;
    exportToCSV(
      [{
        month: selected.report_month,
        total_income: selected.total_income,
        total_expense: selected.total_expense,
        net_profit: selected.net_profit,
        gross_profit: selected.gross_profit,
        profit_margin: selected.profit_margin,
        closed_at: selected.closed_at,
      }],
      `finance-report-${selected.report_month}`
    );
  };

  return (
    <div className="space-y-6">
      {/* Month Selector */}
      <div className="flex items-center justify-between">
        <Select value={selectedMonth || closedReports[0]?.report_month} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select month" />
          </SelectTrigger>
          <SelectContent>
            {closedReports.map(r => (
              <SelectItem key={r.report_month} value={r.report_month}>
                {r.report_month}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-1" /> Export CSV
        </Button>
      </div>

      {/* P&L Card */}
      {selected && (
        <>
          <Card className="bg-gradient-to-br from-slate-50 to-slate-100/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Profit & Loss — {selected.report_month}</CardTitle>
              <CardDescription>
                Closed {selected.closed_at ? new Date(selected.closed_at).toLocaleDateString() : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                    <TrendingUp className="h-3 w-3" /> Revenue
                  </div>
                  <p className="text-xl font-bold text-emerald-700">${Number(selected.total_income).toFixed(2)}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs text-red-600 font-medium">
                    <TrendingDown className="h-3 w-3" /> Expenses
                  </div>
                  <p className="text-xl font-bold text-red-700">${Number(selected.total_expense).toFixed(2)}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                    <DollarSign className="h-3 w-3" /> Net Profit
                  </div>
                  <p className={`text-xl font-bold ${Number(selected.net_profit) >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                    ${Number(selected.net_profit).toFixed(2)}
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground font-medium">Gross Profit</div>
                  <p className="text-xl font-bold">${Number(selected.gross_profit).toFixed(2)}</p>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground font-medium">Profit Margin</div>
                  <p className="text-xl font-bold">{Number(selected.profit_margin).toFixed(1)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Year Overview Table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">All Closed Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-medium">Month</th>
                      <th className="text-right py-2 px-3 font-medium">Income</th>
                      <th className="text-right py-2 px-3 font-medium">Expense</th>
                      <th className="text-right py-2 px-3 font-medium">Net Profit</th>
                      <th className="text-right py-2 px-3 font-medium">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedReports.map(r => (
                      <tr key={r.report_month} className={`border-b hover:bg-muted/30 ${r.report_month === selected.report_month ? 'bg-primary/5' : ''}`}>
                        <td className="py-2 px-3 font-medium">{r.report_month}</td>
                        <td className="py-2 px-3 text-right text-emerald-600">${Number(r.total_income).toFixed(2)}</td>
                        <td className="py-2 px-3 text-right text-red-600">${Number(r.total_expense).toFixed(2)}</td>
                        <td className={`py-2 px-3 text-right font-medium ${Number(r.net_profit) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                          ${Number(r.net_profit).toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right">{Number(r.profit_margin).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
