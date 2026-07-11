import { useState } from 'react';
import { useCompanyContext } from '@/contexts/CompanyContext';
import { useCompanyMembers, useCreateCompany, useInviteToCompany, useUpdateMemberRole, useSuspendMember } from '@/hooks/useCompany';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, UserPlus, Shield, Users, Loader2 } from 'lucide-react';
import type { CompanyMemberRole } from '@/types/database';

function CreateWorkspaceForm() {
  const [name, setName] = useState('');
  const createCompany = useCreateCompany();

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground" />
          <h2 className="text-2xl font-bold">Create Your Workspace</h2>
          <p className="text-muted-foreground text-sm">Set up a finance workspace to manage claims, transactions, and reports.</p>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company-name">Workspace Name</Label>
            <Input
              id="company-name"
              placeholder="e.g. Tomu Logistics"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            onClick={() => createCompany.mutate(name)}
            disabled={!name.trim() || createCompany.isPending}
          >
            {createCompany.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Workspace
          </Button>
        </div>
      </div>
    </div>
  );
}

function InviteMemberDialog({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<CompanyMemberRole>('runner');
  const invite = useInviteToCompany();

  const handleInvite = () => {
    invite.mutate({ companyId, email, role }, {
      onSuccess: () => { setOpen(false); setEmail(''); setRole('runner'); }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><UserPlus className="h-4 w-4 mr-1" /> Invite</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Member</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input placeholder="user@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as CompanyMemberRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="runner">Runner</SelectItem>
                <SelectItem value="viewer">Finance Viewer</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleInvite} disabled={!email.trim() || invite.isPending}>
            {invite.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const roleBadgeColor: Record<string, string> = {
  owner: 'bg-amber-100 text-amber-800',
  admin: 'bg-blue-100 text-blue-800',
  runner: 'bg-green-100 text-green-800',
  viewer: 'bg-gray-100 text-gray-800',
};

const statusBadgeColor: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  pending: 'bg-yellow-100 text-yellow-800',
  suspended: 'bg-red-100 text-red-800',
};

export default function WorkspaceSettings() {
  const { company, isCompanyAdmin, loading } = useCompanyContext();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!company) return <CreateWorkspaceForm />;

  return <WorkspaceView companyId={company.id} companyName={company.company_name} isAdmin={isCompanyAdmin} />;
}

function WorkspaceView({ companyId, companyName, isAdmin }: { companyId: string; companyName: string; isAdmin: boolean }) {
  const { data: members, isLoading } = useCompanyMembers(companyId);
  const updateRole = useUpdateMemberRole();
  const suspendMember = useSuspendMember();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                {companyName}
              </CardTitle>
              <CardDescription>Finance Workspace Settings</CardDescription>
            </div>
            {isAdmin && <InviteMemberDialog companyId={companyId} />}
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Members
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="space-y-2">
              {(members ?? []).map((m) => (
                <div key={m.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                      {(m.user?.display_name || '?')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{m.user?.display_name || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.user?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="outline" className={roleBadgeColor[m.role] || ''}>
                      <Shield className="h-3 w-3 mr-1" />
                      {m.role}
                    </Badge>
                    <Badge variant="outline" className={statusBadgeColor[m.status] || ''}>
                      {m.status}
                    </Badge>
                    {isAdmin && m.role !== 'owner' && (
                      <Select
                        value={m.role}
                        onValueChange={(v) => updateRole.mutate({ memberId: m.id, companyId, role: v as CompanyMemberRole })}
                      >
                        <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="runner">Runner</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {isAdmin && m.role !== 'owner' && (
                      <Button
                        size="sm"
                        variant={m.status === 'suspended' ? 'outline' : 'destructive'}
                        className="h-7 text-xs"
                        onClick={() => suspendMember.mutate({ memberId: m.id, companyId, suspend: m.status !== 'suspended' })}
                      >
                        {m.status === 'suspended' ? 'Activate' : 'Suspend'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {(members ?? []).length === 0 && (
                <p className="text-center text-muted-foreground py-8 text-sm">No members yet. Invite someone to get started.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
