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
 * Team View Toggle component for users to switch between their own data and shared data.
 * Shows a toggle between "My Data" and "Team Data", plus a user filter when in team mode.
 * Uses user_data_shares to determine which users are visible as "team".
 */
export function TeamViewToggle({
  viewMode,
  onViewModeChange,
  selectedMember,
  onMemberChange,
  className = '',
}: TeamViewToggleProps) {
  const { profile } = useAuth();
  const { data: teamMembers = [], isLoading: teamLoading } = useTeamMembers();
  
  // Only show if user has team members (data shares)
  if (teamMembers.length === 0 && !teamLoading) return null;
  
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
            aria-label="Shared Data"
            className="data-[state=on]:bg-background data-[state=on]:shadow-sm px-3 h-8 text-xs"
          >
            <Users className="h-3 w-3 mr-1" />
            Shared Data
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      
      {/* User Filter - only show in team mode */}
      {viewMode === 'team' && (
        teamLoading ? (
          <span className="text-xs text-muted-foreground">Loading…</span>
        ) : teamMembers.length > 0 ? (
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">User:</Label>
            <Select value={selectedMember} onValueChange={onMemberChange}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="All Shared" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Shared Users</SelectItem>
                {profile?.id && <SelectItem value={profile.id}>Me</SelectItem>}
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
            No shared users
          </span>
        )
      )}
    </div>
  );
}

/**
 * Hook to manage team view state
 */
export function useTeamViewState(defaultViewMode: ViewMode = 'my') {
  const { role, profile } = useAuth();
  const { data: teamMembers = [] } = useTeamMembers();
  
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const [selectedMember, setSelectedMember] = useState<string>('all');
  
  // Calculate user IDs based on view mode and selected member
  const getFilteredUserIds = (): string[] | undefined => {
    if (!profile?.id) return undefined;
    
    if (viewMode === 'my') {
      // My Data mode: only show current user's data
      return [profile.id];
    }
    
    // Shared Data mode
    if (selectedMember === 'all') {
      // All shared: include self + all team members
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
    salespersonIds: getFilteredUserIds(),
    hasTeamMembers: teamMembers.length > 0,
    isManager: role === 'manager',
    teamMembers,
  };
}
