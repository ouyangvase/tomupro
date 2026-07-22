import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useDebugTeamVisibility } from '@/hooks/useTeamVisibility';
import { Bug, Users, Package, FileText } from 'lucide-react';
import { useState } from 'react';

/**
 * Debug panel for admins to check visibility configuration.
 * Only visible to admin users.
 */
export function VisibilityDebugPanel() {
  const { role } = useAuth();
  const { data: debug, isLoading } = useDebugTeamVisibility();
  const [isExpanded, setIsExpanded] = useState(false);

  // Only show for admins
  if (role !== 'admin') return null;

  return (
    <Card className="border-dashed border-2 border-muted-foreground/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Visibility Debug Panel</CardTitle>
            <Badge variant="outline" className="text-xs">Admin Only</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? 'Collapse' : 'Expand'}
            </Button>
          </div>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="pt-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading debug info...</p>
          ) : debug ? (
            <div className="space-y-4">
              {/* User Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">User ID:</span>
                  <p className="font-mono text-xs break-all">{debug.user_id}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Role:</span>
                  <Badge variant="secondary" className="ml-2">{debug.role}</Badge>
                </div>
              </div>

              {/* Visibility Summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Visible Users</p>
                    <p className="font-bold">
                      {debug.is_admin ? 'All' : debug.visible_ids_count}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Orders Visible</p>
                    <p className="font-bold">{debug.orders_visible_count}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Products Visible</p>
                    <p className="font-bold">{debug.products_visible_count}</p>
                  </div>
                </div>
              </div>

              {/* Team Members */}
              {debug.team_members && debug.team_members.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Team Members:</p>
                  <div className="flex flex-wrap gap-2">
                    {debug.team_members.map((member) => (
                      <Badge key={member.id} variant="outline" className="text-xs">
                        {member.display_name} ({member.role})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Visible IDs (if not admin) */}
              {!debug.is_admin && debug.visible_ids && (
                <div>
                  <p className="text-sm font-medium mb-2">Visible Owner IDs:</p>
                  <div className="max-h-32 overflow-auto bg-muted p-2 rounded-md">
                    <pre className="text-xs font-mono whitespace-pre-wrap">
                      {JSON.stringify(debug.visible_ids, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No debug data available</p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
