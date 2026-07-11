import { useState } from 'react';
import { useCompanyContext } from '@/contexts/CompanyContext';
import { useFinanceAuditLogs } from '@/hooks/useFinanceAuditLogs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollText, Search, Loader2, ChevronDown, ChevronRight } from 'lucide-react';

const actionColors: Record<string, string> = {
  claim_submitted: 'bg-blue-100 text-blue-700',
  claim_approved: 'bg-emerald-100 text-emerald-700',
  claim_rejected: 'bg-red-100 text-red-700',
  claim_paid: 'bg-green-100 text-green-700',
  transaction_created: 'bg-purple-100 text-purple-700',
  month_closed: 'bg-amber-100 text-amber-700',
  member_invited: 'bg-indigo-100 text-indigo-700',
  role_changed: 'bg-orange-100 text-orange-700',
};

export default function FinanceAuditLogPage() {
  const { company, loading } = useCompanyContext();
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: logs, isLoading } = useFinanceAuditLogs(
    company?.id,
    moduleFilter !== 'all' ? { module: moduleFilter } : undefined
  );

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (!company) {
    return <div className="text-center py-16 text-muted-foreground">No workspace found</div>;
  }

  const filtered = (logs ?? []).filter((l: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return l.action?.toLowerCase().includes(s) || l.module?.toLowerCase().includes(s) ||
      l.user?.display_name?.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5" />
            Finance Audit Log
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Modules" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modules</SelectItem>
            <SelectItem value="claims">Claims</SelectItem>
            <SelectItem value="transactions">Transactions</SelectItem>
            <SelectItem value="reports">Reports</SelectItem>
            <SelectItem value="workspace">Workspace</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Log Entries */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ScrollText className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p>No audit logs found</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((log: any) => {
            const isExpanded = expandedId === log.id;
            return (
              <Card key={log.id} className="hover:bg-muted/30 transition-colors">
                <CardContent className="p-3">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {isExpanded ? <ChevronDown className="h-4 w-4 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={actionColors[log.action] || 'bg-gray-100 text-gray-700'}>
                            {log.action?.replace(/_/g, ' ')}
                          </Badge>
                          <Badge variant="outline" className="text-xs">{log.module}</Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span>{log.user?.display_name || 'System'}</span>
                          <span>{new Date(log.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 ml-7 space-y-2">
                      {log.record_id && (
                        <div className="text-xs text-muted-foreground">
                          Record: <span className="font-mono">{log.record_id}</span>
                        </div>
                      )}
                      {log.before_data && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Before:</p>
                          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-32">
                            {JSON.stringify(log.before_data, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.after_data && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">After:</p>
                          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-32">
                            {JSON.stringify(log.after_data, null, 2)}
                          </pre>
                        </div>
                      )}
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
