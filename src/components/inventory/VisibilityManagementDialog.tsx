import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus } from 'lucide-react';
import { 
  useVisibilityOverrides, 
  useSetVisibilityOverride, 
  useDeleteVisibilityOverride 
} from '@/hooks/useStockVisibility';

interface VisibilityManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: { id: string; display_name: string; role: string }[];
}

export function VisibilityManagementDialog({ open, onOpenChange, users }: VisibilityManagementDialogProps) {
  const [viewerId, setViewerId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  
  const { data: overrides = [], isLoading } = useVisibilityOverrides();
  const setOverride = useSetVisibilityOverride();
  const deleteOverride = useDeleteVisibilityOverride();
  
  const salespersons = users.filter(u => u.role === 'salesperson');
  const viewerCandidates = users.filter(u => u.role !== 'admin'); // Admin already sees all
  
  const handleAddOverride = async () => {
    if (!viewerId || !ownerId) return;
    
    await setOverride.mutateAsync({
      viewer_user_id: viewerId,
      owner_user_id: ownerId,
      can_view: true,
    });
    
    setViewerId('');
    setOwnerId('');
  };
  
  const handleToggle = async (override: typeof overrides[0], newValue: boolean) => {
    await setOverride.mutateAsync({
      viewer_user_id: override.viewer_user_id,
      owner_user_id: override.owner_user_id,
      can_view: newValue,
    });
  };
  
  const handleDelete = async (id: string) => {
    await deleteOverride.mutateAsync(id);
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Stock Visibility</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Add new override */}
          <div className="p-4 border rounded-lg space-y-4">
            <h3 className="font-medium">Grant Visibility Access</h3>
            <div className="grid grid-cols-3 gap-4 items-end">
              <div className="space-y-2">
                <Label>Viewer (who can see)</Label>
                <Select value={viewerId} onValueChange={setViewerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    {viewerCandidates.map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.display_name} ({u.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Owner (whose stock)</Label>
                <Select value={ownerId} onValueChange={setOwnerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select salesperson" />
                  </SelectTrigger>
                  <SelectContent>
                    {salespersons.filter(sp => sp.id !== viewerId).map(sp => (
                      <SelectItem key={sp.id} value={sp.id}>
                        {sp.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <Button 
                onClick={handleAddOverride}
                disabled={!viewerId || !ownerId || setOverride.isPending}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </div>
          
          {/* Existing overrides */}
          <div className="space-y-2">
            <h3 className="font-medium">Current Visibility Overrides</h3>
            
            {isLoading ? (
              <p className="text-muted-foreground text-center py-4">Loading...</p>
            ) : overrides.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No visibility overrides configured
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Viewer</TableHead>
                    <TableHead>Can See Stock Of</TableHead>
                    <TableHead className="w-24">Enabled</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overrides.map(override => (
                    <TableRow key={override.id}>
                      <TableCell>
                        <div>
                          {override.viewer?.display_name || 'Unknown'}
                          <Badge variant="outline" className="ml-2 text-xs">
                            {users.find(u => u.id === override.viewer_user_id)?.role}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        {override.owner?.display_name || 'Unknown'}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={override.can_view}
                          onCheckedChange={v => handleToggle(override, v)}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(override.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
