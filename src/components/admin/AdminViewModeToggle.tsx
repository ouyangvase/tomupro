import { Eye } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { ImpersonationUserSelect } from './ImpersonationUserSelect';

export function AdminViewModeToggle() {
  const { role } = useAuth();
  const { isImpersonating, stopImpersonation } = useImpersonation();

  // Only show for admins
  if (role !== 'admin') {
    return null;
  }

  return (
    <div className="space-y-3 p-4 border-t border-border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <Label htmlFor="view-mode" className="text-sm font-medium cursor-pointer">
            Admin View Mode
          </Label>
        </div>
        <Switch
          id="view-mode"
          checked={isImpersonating}
          onCheckedChange={(checked) => {
            if (!checked && isImpersonating) {
              stopImpersonation();
            }
          }}
          disabled={!isImpersonating}
        />
      </div>
      
      {!isImpersonating && (
        <div className="pt-1">
          <ImpersonationUserSelect />
        </div>
      )}
      
      {isImpersonating && (
        <p className="text-xs text-muted-foreground">
          Toggle off or click "Exit View Mode" in the banner to return to admin view.
        </p>
      )}
    </div>
  );
}
