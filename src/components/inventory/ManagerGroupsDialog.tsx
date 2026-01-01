import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, Users } from 'lucide-react';
import { 
  useManagerGroups, 
  useGroupMembers,
  useCreateManagerGroup,
  useAddGroupMember,
  useRemoveGroupMember,
} from '@/hooks/useStockVisibility';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface ManagerGroupsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  managers: { id: string; display_name: string }[];
  salespersons: { id: string; display_name: string }[];
}

export function ManagerGroupsDialog({ open, onOpenChange, managers, salespersons }: ManagerGroupsDialogProps) {
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupManagerId, setNewGroupManagerId] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<Record<string, string>>({});
  
  const { data: groups = [], isLoading: groupsLoading } = useManagerGroups();
  const { data: allMembers = [] } = useGroupMembers();
  const createGroup = useCreateManagerGroup();
  const addMember = useAddGroupMember();
  const removeMember = useRemoveGroupMember();
  
  // Managers that don't have a group yet
  const availableManagers = managers.filter(
    m => !groups.some(g => g.manager_user_id === m.id)
  );
  
  // Salespersons not in any group
  const unassignedSalespersons = salespersons.filter(
    sp => !allMembers.some(m => m.member_user_id === sp.id)
  );
  
  const handleCreateGroup = async () => {
    if (!newGroupName || !newGroupManagerId) return;
    
    await createGroup.mutateAsync({
      name: newGroupName,
      manager_user_id: newGroupManagerId,
    });
    
    setNewGroupName('');
    setNewGroupManagerId('');
  };
  
  const handleAddMember = async (groupId: string) => {
    const memberId = selectedMemberId[groupId];
    if (!memberId) return;
    
    await addMember.mutateAsync({
      group_id: groupId,
      member_user_id: memberId,
    });
    
    setSelectedMemberId(prev => ({ ...prev, [groupId]: '' }));
  };
  
  const handleRemoveMember = async (membershipId: string) => {
    await removeMember.mutateAsync(membershipId);
  };
  
  const getMembersForGroup = (groupId: string) => {
    return allMembers.filter(m => m.group_id === groupId);
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manager Groups</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Create new group */}
          <div className="p-4 border rounded-lg space-y-4">
            <h3 className="font-medium">Create New Group</h3>
            <div className="grid grid-cols-3 gap-4 items-end">
              <div className="space-y-2">
                <Label>Group Name</Label>
                <Input
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  placeholder="e.g., Team Alpha"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Manager</Label>
                <Select value={newGroupManagerId} onValueChange={setNewGroupManagerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select manager" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableManagers.map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <Button 
                onClick={handleCreateGroup}
                disabled={!newGroupName || !newGroupManagerId || createGroup.isPending}
              >
                <Plus className="h-4 w-4 mr-1" />
                Create
              </Button>
            </div>
          </div>
          
          {/* Existing groups */}
          <div className="space-y-2">
            <h3 className="font-medium">Existing Groups</h3>
            
            {groupsLoading ? (
              <p className="text-muted-foreground text-center py-4">Loading...</p>
            ) : groups.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No manager groups configured
              </p>
            ) : (
              <Accordion type="single" collapsible className="w-full">
                {groups.map(group => {
                  const members = getMembersForGroup(group.id);
                  return (
                    <AccordionItem key={group.id} value={group.id}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          <span>{group.name}</span>
                          <Badge variant="secondary">
                            {group.manager?.display_name}
                          </Badge>
                          <Badge variant="outline">
                            {members.length} members
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4 pl-6">
                          {/* Add member */}
                          <div className="flex gap-2 items-end">
                            <div className="flex-1 space-y-2">
                              <Label>Add Salesperson</Label>
                              <Select 
                                value={selectedMemberId[group.id] || ''} 
                                onValueChange={v => setSelectedMemberId(prev => ({ ...prev, [group.id]: v }))}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select salesperson" />
                                </SelectTrigger>
                                <SelectContent>
                                  {unassignedSalespersons.map(sp => (
                                    <SelectItem key={sp.id} value={sp.id}>
                                      {sp.display_name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Button 
                              size="sm"
                              onClick={() => handleAddMember(group.id)}
                              disabled={!selectedMemberId[group.id] || addMember.isPending}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          
                          {/* Members list */}
                          {members.length > 0 ? (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Salesperson</TableHead>
                                  <TableHead className="w-12"></TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {members.map(member => (
                                  <TableRow key={member.id}>
                                    <TableCell>
                                      {member.member?.display_name || 'Unknown'}
                                    </TableCell>
                                    <TableCell>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleRemoveMember(member.id)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              No members in this group yet
                            </p>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
