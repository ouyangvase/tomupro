import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

export function RoleChangeBanner() {
  const { roleChanged, dismissRoleChange, profile } = useAuth();

  if (!roleChanged) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-primary text-primary-foreground px-4 py-3 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">
            Your role has been updated to <strong className="uppercase">{profile?.role}</strong>. 
            Apply the update to use your latest permissions.
          </span>
        </div>
        <Button 
          size="sm" 
          variant="secondary"
          onClick={dismissRoleChange}
          className="gap-2 shrink-0"
        >
          <CheckCircle2 className="h-4 w-4" />
          Apply Now
        </Button>
      </div>
    </div>
  );
}
