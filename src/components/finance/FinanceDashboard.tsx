import { useCompanyContext } from '@/contexts/CompanyContext';
import { useFinanceDashboardStats } from '@/hooks/useFinanceReports';
import { useFinanceTransactions } from '@/hooks/useFinanceTransactions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, DollarSign, Clock, Loader2, ArrowUpRight, ArrowDownRight } from 'lucide-react';

export default function FinanceDashboard() {
  const { company, loading } = useCompanyContext();
  const { data: stats, isLoading } = useFinanceDashboardStats(company?.id);
  const { data: recentTxns } = useFinanceTransactions(company?.id);

  if (loading || isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (!company || !stats) {
    return <div className="text-center py-16 text-muted-foreground">No workspace found</div>;
  }

  const recent = (recentTxns ?? []).slice(0, 10);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-emerald-200/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpRight className="h-4 w-4 text-emerald-600" />
              <span className="text-xs font-medium text-emerald-600">Total Income</span>
            </div>
            <p className="text-2xl font-bold text-emerald-700">${stats.totalIncome.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-50 to-red-100/50 border-red-200/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <ArrowDownRight className="h-4 w-4 text-red-600" />
              <span className="text-xs font-medium text-red-600">Total Expenses</span>
            </div>
            <p className="text-2xl font-bold text-red-700">${stats.totalExpense.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-medium text-blue-600">Net Profit</span>
            </div>
            <p className={`text-2xl font-bold ${stats.netProfit >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
              ${stats.netProfit.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 border-amber-200/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-medium text-amber-600">Pending Claims</span>
            </div>
            <p className="text-2xl font-bold text-amber-700">{stats.pendingClaims}</p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Trend */}
      {stats.monthlyData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Monthly Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.monthlyData.slice(-6).map((m) => {
                const maxVal = Math.max(...stats.monthlyData.map(d => Math.max(d.income, d.expense)), 1);
                return (
                  <div key={m.month} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium w-20">{m.month}</span>
                      <span className="text-emerald-600">+${m.income.toFixed(0)}</span>
                      <span className="text-red-600">-${m.expense.toFixed(0)}</span>
                      <span className={m.income - m.expense >= 0 ? 'text-blue-600 font-medium' : 'text-red-600 font-medium'}>
                        ${(m.income - m.expense).toFixed(0)}
                      </span>
                    </div>
                    <div className="flex gap-1 h-3">
                      <div className="bg-emerald-400 rounded-sm" style={{ width: `${(m.income / maxVal) * 50}%` }} />
                      <div className="bg-red-400 rounded-sm" style={{ width: `${(m.expense / maxVal) * 50}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expense Breakdown */}
      {stats.categoryBreakdown.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Expense Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.categoryBreakdown
                .sort((a, b) => b.amount - a.amount)
                .map((cat) => {
                  const pct = stats.totalExpense > 0 ? (cat.amount / stats.totalExpense) * 100 : 0;
                  return (
                    <div key={cat.category} className="flex items-center gap-3">
                      <span className="text-sm w-24 capitalize">{cat.category}</span>
                      <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-medium w-20 text-right">${cat.amount.toFixed(2)}</span>
                      <span className="text-xs text-muted-foreground w-12 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Transactions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">No transactions yet</p>
          ) : (
            <div className="space-y-2">
              {recent.map((tx: any) => (
                <div key={tx.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/30">
                  <div className="flex items-center gap-2">
                    {tx.type === 'income' ? (
                      <TrendingUp className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium truncate max-w-[200px]">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">{new Date(tx.transaction_date).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <span className={`font-medium ${tx.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {tx.type === 'income' ? '+' : '-'}${Number(tx.amount).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
