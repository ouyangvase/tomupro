import { useState } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { User, Users } from 'lucide-react';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useAuth } from '@/contexts/AuthContext';

export type ViewMode = 'my' | 'team';

interface TeamViewToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  selectedMember: string;
  onMemberChange: (memberId: string) => void;
  className?: string;
}

/**
 * Team View Toggle component for managers to switch between their own data and team data.
 * Shows a toggle between "My Data" and "Team Data", plus a salesperson filter when in team mode.
 */
export function TeamViewToggle({
  viewMode,
  onViewModeChange,
  selectedMember,
  onMemberChange,
  className = '',
}: TeamViewToggleProps) {
  const { profile, role } = useAuth();
  const { data: teamMembers = [], isLoading: teamLoading } = useTeamMembers();
  
  // Only show for managers
  if (role !== 'manager') return null;
  
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 ${className}`}>
      {/* View Mode Toggle */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground whitespace-nowrap">View:</Label>
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(value) => value && onViewModeChange(value as ViewMode)}
          className="bg-muted/50 rounded-lg p-1"
        >
          <ToggleGroupItem
            value="my"
            aria-label="My Data"
            className="data-[state=on]:bg-background data-[state=on]:shadow-sm px-3 h-8 text-xs"
          >
            <User className="h-3 w-3 mr-1" />
            My Data
          </ToggleGroupItem>
          <ToggleGroupItem
            value="team"
            aria-label="Team Data"
            className="data-[state=on]:bg-background data-[state=on]:shadow-sm px-3 h-8 text-xs"
          >
            <Users className="h-3 w-3 mr-1" />
            Team Data
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      
      {/* Salesperson Filter - only show in team mode */}
      {viewMode === 'team' && (
        teamLoading ? (
          <span className="text-xs text-muted-foreground">Loading team…</span>
        ) : teamMembers.length > 0 ? (
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Salesperson:</Label>
            <Select value={selectedMember} onValueChange={onMemberChange}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="All Team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Team</SelectItem>
                {profile?.id && <SelectItem value={profile.id}>Me (Manager)</SelectItem>}
                {teamMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground italic">
            No team members assigned yet
          </span>
        )
      )}
    </div>
  );
}

/**
 * Hook to manage team view state for manager role
 */
export function useTeamViewState(defaultViewMode: ViewMode = 'my') {
  const { role, profile } = useAuth();
  const { data: teamMembers = [] } = useTeamMembers();
  
  // Default view mode for managers (defaults to 'my' now)
  const [viewMode, setViewMode] = useState<ViewMode>(role === 'manager' ? defaultViewMode : 'my');
  const [selectedMember, setSelectedMember] = useState<string>('all');
  
  // Calculate salesperson IDs based on view mode and selected member
  const getFilteredSalespersonIds = (): string[] | undefined => {
    if (role !== 'manager' || !profile?.id) return undefined;
    
    if (viewMode === 'my') {
      // My Data mode: only show current user's data
      return [profile.id];
    }
    
    // Team Data mode
    if (selectedMember === 'all') {
      // All team: include manager + all team members
      return [profile.id, ...teamMembers.map(m => m.id)];
    }
    
    // Specific member selected
    return [selectedMember];
  };
  
  return {
    viewMode,
    setViewMode,
    selectedMember,
    setSelectedMember,
    salespersonIds: getFilteredSalespersonIds(),
    isManager: role === 'manager',
    teamMembers,
  };
}
