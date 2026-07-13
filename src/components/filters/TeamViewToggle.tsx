import { useState, useMemo } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { User, Users, Share2 } from 'lucide-react';
import { useTeamMembers, TeamMember } from '@/hooks/useTeamMembers';
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
 * Includes both traditional team members AND shared subjects from user_data_shares.
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

  // Separate team members from shared subjects for display
  const traditionalMembers = teamMembers.filter(m => !m.isShared);
  const sharedMembers = teamMembers.filter(m => m.isShared);
  const hasAnyMembers = teamMembers.length > 0;
  
  return (
    <div className={`flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 ${className}`}>
      {/* View Mode Toggle */}
      <div className="flex min-w-0 items-center gap-2">
        <Label className="text-xs font-medium text-foreground/70 whitespace-nowrap">View:</Label>
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(value) => value && onViewModeChange(value as ViewMode)}
          className="min-w-0 bg-muted/50 rounded-lg p-1"
        >
          <ToggleGroupItem
            value="my"
            aria-label="My Data"
            className="data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm data-[state=off]:text-foreground/60 px-3 h-8 text-xs font-medium"
          >
            <User className="h-3 w-3 mr-1" />
            My Data
          </ToggleGroupItem>
          <ToggleGroupItem
            value="team"
            aria-label="Team Data"
            className="data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm data-[state=off]:text-foreground/60 px-3 h-8 text-xs font-medium"
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
        ) : hasAnyMembers ? (
          <div className="flex min-w-0 items-center gap-2">
            <Label className="text-xs font-medium text-foreground/70 whitespace-nowrap">Salesperson:</Label>
            <Select value={selectedMember} onValueChange={onMemberChange}>
              <SelectTrigger className="h-8 min-w-0 flex-1 text-xs sm:w-[200px] sm:flex-none">
                <SelectValue placeholder="All Team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Team ({teamMembers.length + 1})</SelectItem>
                {profile?.id && <SelectItem value={profile.id}>Me (Manager)</SelectItem>}
                
                {/* Traditional team members */}
                {traditionalMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.display_name}
                  </SelectItem>
                ))}
                
                {/* Shared subjects - with visual indicator */}
                {sharedMembers.length > 0 && traditionalMembers.length > 0 && (
                  <div className="px-2 py-1 text-xs text-muted-foreground border-t mt-1 pt-1">
                    <Share2 className="h-3 w-3 inline mr-1" />
                    Shared Access
                  </div>
                )}
                {sharedMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    <span className="flex items-center gap-1">
                      {member.display_name}
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                        Shared
                      </Badge>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground italic">
            No team members or shared access
          </span>
        )
      )}
    </div>
  );
}

/**
 * Hook to manage team view state for manager role
 * Includes both traditional team members AND shared subjects
 */
export function useTeamViewState(defaultViewMode: ViewMode = 'team') {
  const { role, profile } = useAuth();
  const { data: teamMembers = [] } = useTeamMembers();
  
  // Default view mode for managers — defaults to 'team' so managers see all data immediately
  const [viewMode, setViewMode] = useState<ViewMode>(role === 'manager' ? defaultViewMode : 'my');
  const [selectedMember, setSelectedMember] = useState<string>('all');

  // Memoize accessible members (includes shared subjects now)
  const allAccessibleMembers = useMemo(() => {
    return teamMembers.map(m => ({
      id: m.id,
      displayName: m.display_name,
      isShared: m.isShared ?? false,
    }));
  }, [teamMembers]);
  
  // Calculate salesperson IDs based on view mode and selected member
  const getFilteredSalespersonIds = (): string[] | undefined => {
    if (role !== 'manager' || !profile?.id) return undefined;

    if (viewMode === 'my') {
      // My Data mode: only show current user's data
      return [profile.id];
    }

    // Team Data mode
    if (selectedMember === 'all') {
      // All team: return undefined to let the server-side get_visible_owner_ids()
      // RPC handle the full visibility scope. This avoids client-side intersection
      // issues where useTeamMembers may return fewer members than the RPC due to RLS.
      return undefined;
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
    allAccessibleMembers,
    hasTeamOrSharedAccess: allAccessibleMembers.length > 0,
  };
}
