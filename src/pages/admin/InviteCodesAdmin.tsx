import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { 
  Plus, 
  Copy, 
  ToggleLeft, 
  ToggleRight, 
  Trash2, 
  Ticket,
  Calendar,
  Users,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  useInviteCodes,
  useCreateInviteCode,
  useUpdateInviteCode,
  useDeleteInviteCode,
} from '@/hooks/useInviteCodes';

export default function InviteCodesAdmin() {
  const { data: codes, isLoading } = useInviteCodes();
  const createCode = useCreateInviteCode();
  const updateCode = useUpdateInviteCode();
  const deleteCode = useDeleteInviteCode();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newCodeRole, setNewCodeRole] = useState('salesperson');
  const [newCodeMaxUses, setNewCodeMaxUses] = useState('1');
  const [newCodeExpiry, setNewCodeExpiry] = useState('');

  const handleCreate = async () => {
    await createCode.mutateAsync({
      role: newCodeRole,
      max_uses: parseInt(newCodeMaxUses) || 1,
      expires_at: newCodeExpiry || null,
    });
    setIsCreateOpen(false);
    setNewCodeRole('salesperson');
    setNewCodeMaxUses('1');
    setNewCodeExpiry('');
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Code copied to clipboard');
  };

  const handleToggle = async (id: string, currentActive: boolean) => {
    await updateCode.mutateAsync({ id, is_active: !currentActive });
  };

  const handleDelete = async (id: string) => {
    await deleteCode.mutateAsync(id);
  };

  const getStatusBadge = (code: { is_active: boolean; used_count: number; max_uses: number; expires_at: string | null }) => {
    const isExpired = code.expires_at && new Date(code.expires_at) < new Date();
    const isUsedUp = code.used_count >= code.max_uses;

    if (!code.is_active) {
      return <Badge variant="secondary" className="gap-1"><XCircle className="h-3 w-3" /> Disabled</Badge>;
    }
    if (isExpired) {
      return <Badge variant="destructive" className="gap-1"><Clock className="h-3 w-3" /> Expired</Badge>;
    }
    if (isUsedUp) {
      return <Badge variant="secondary" className="gap-1"><CheckCircle className="h-3 w-3" /> Used</Badge>;
    }
    return <Badge className="gap-1 bg-emerald-500/20 text-emerald-500 border-emerald-500/30"><CheckCircle className="h-3 w-3" /> Active</Badge>;
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Ticket className="h-6 w-6 text-primary" />
              Invite Codes
            </h1>
            <p className="text-muted-foreground mt-1">
              Create and manage registration codes for new salespersons
            </p>
          </div>

          <Button className="gap-2" onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Create Code
          </Button>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Invite Code</DialogTitle>
                <DialogDescription>
                  Generate a new registration code for users to sign up as salesperson.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={newCodeRole} onValueChange={setNewCodeRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="salesperson">Salesperson</SelectItem>
                      <SelectItem value="runner">Runner</SelectItem>
                      <SelectItem value="driver">Driver</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Max Uses</Label>
                  <Input
                    type="number"
                    min="1"
                    value={newCodeMaxUses}
                    onChange={(e) => setNewCodeMaxUses(e.target.value)}
                    placeholder="1"
                  />
                  <p className="text-xs text-muted-foreground">
                    How many times this code can be used
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Expiry Date (Optional)</Label>
                  <Input
                    type="datetime-local"
                    value={newCodeExpiry}
                    onChange={(e) => setNewCodeExpiry(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={createCode.isPending}>
                  {createCode.isPending ? 'Creating...' : 'Generate Code'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">All Codes</CardTitle>
            <CardDescription>
              {codes?.length || 0} invite codes created
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : codes && codes.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {codes.map((code) => (
                    <TableRow key={code.id}>
                      <TableCell className="font-mono font-semibold text-primary">
                        {code.code}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {code.role}
                        </Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(code)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          <span>{code.used_count} / {code.max_uses}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {code.expires_at ? (
                          <div className="flex items-center gap-1 text-sm">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            {format(new Date(code.expires_at), 'MMM d, yyyy')}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(code.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCopy(code.code)}
                            title="Copy code"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggle(code.id, code.is_active)}
                            title={code.is_active ? 'Disable' : 'Enable'}
                          >
                            {code.is_active ? (
                              <ToggleRight className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" title="Delete">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Invite Code?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete the code "{code.code}".
                                  This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(code.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Ticket className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No invite codes created yet</p>
                <p className="text-sm mt-1">Create your first code to get started</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
