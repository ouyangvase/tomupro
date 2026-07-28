import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Search, Users, Mail, Phone, Building2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

interface InterestLead {
  id: string;
  full_name: string;
  company_name: string | null;
  phone: string | null;
  email: string;
  business_type: string | null;
  message: string | null;
  status: string;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline'; className: string; next: string }> = {
  new: { label: 'New', variant: 'default', className: 'bg-blue-500 hover:bg-blue-600', next: 'contacted' },
  contacted: { label: 'Contacted', variant: 'default', className: 'bg-amber-500 hover:bg-amber-600', next: 'closed' },
  closed: { label: 'Closed', variant: 'secondary', className: 'bg-gray-400 hover:bg-gray-500', next: 'new' },
};

export default function InterestLeadsAdmin() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['interest-leads'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('interest_leads')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as InterestLead[];
    },
    enabled: profile?.role === 'admin',
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase as any)
        .from('interest_leads')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interest-leads'] });
      toast.success('Status updated');
    },
    onError: () => {
      toast.error('Failed to update status');
    },
  });

  const filtered = useMemo(() => {
    return leads.filter((lead) => {
      const q = search.toLowerCase();
      const matchesSearch = !q ||
        lead.full_name.toLowerCase().includes(q) ||
        (lead.company_name?.toLowerCase().includes(q)) ||
        lead.email.toLowerCase().includes(q) ||
        (lead.phone?.includes(q));
      const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [leads, search, statusFilter]);

  const formatDate = (d: string) => new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });

  const newCount = leads.filter((l) => l.status === 'new').length;

  if (profile?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5" />
            Interest Leads
            {newCount > 0 && (
              <Badge className="bg-blue-500 text-white ml-2">{newCount} new</Badge>
            )}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{leads.length} total submissions</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search leads..."
              className="pl-9 w-[220px]"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          {search || statusFilter !== 'all' ? 'No leads match your filters.' : 'No interest registrations yet.'}
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[150px]">Name</TableHead>
                <TableHead className="min-w-[130px]">Company</TableHead>
                <TableHead className="min-w-[120px]">Phone</TableHead>
                <TableHead className="min-w-[180px]">Email</TableHead>
                <TableHead className="min-w-[120px]">Business Type</TableHead>
                <TableHead className="min-w-[200px]">Message</TableHead>
                <TableHead className="min-w-[160px]">Submitted</TableHead>
                <TableHead className="min-w-[110px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((lead) => {
                const sc = STATUS_CONFIG[lead.status] || STATUS_CONFIG.new;
                return (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">{lead.full_name}</TableCell>
                    <TableCell className="text-muted-foreground">{lead.company_name || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {lead.phone ? (
                        <a href={`tel:${lead.phone}`} className="hover:text-primary transition-colors">{lead.phone}</a>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      <a href={`mailto:${lead.email}`} className="text-primary hover:underline">{lead.email}</a>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{lead.business_type || '-'}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[250px]">
                      <span className="line-clamp-2 text-xs">{lead.message || '-'}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(lead.created_at)}</TableCell>
                    <TableCell>
                      <Badge
                        className={`cursor-pointer text-white ${sc.className}`}
                        onClick={() => updateStatus.mutate({ id: lead.id, status: sc.next })}
                      >
                        {sc.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
