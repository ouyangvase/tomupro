import { Eye, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { Badge } from '@/components/ui/badge';

export function ImpersonationBanner() {
  const { isImpersonating, impersonatedUser, stopImpersonation, isLoading } = useImpersonation();

  if (!isImpersonating || !impersonatedUser) {
    return null;
  }

  const roleColors: Record<string, string> = {
    salesperson: 'bg-blue-500/20 text-blue-300',
    manager: 'bg-purple-500/20 text-purple-300',
    runner: 'bg-green-500/20 text-green-300',
    driver: 'bg-orange-500/20 text-orange-300',
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-orange-600 text-white py-2 px-4 flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-3">
        <Eye className="h-4 w-4 shrink-0" />
        <span className="text-sm font-medium">
          Viewing as: <strong>{impersonatedUser.display_name}</strong>
        </span>
        <Badge 
          variant="secondary" 
          className={`${roleColors[impersonatedUser.role] || 'bg-muted'} border-0 text-xs`}
        >
          {impersonatedUser.role}
        </Badge>
        {impersonatedUser.status !== 'active' && (
          <Badge variant="destructive" className="text-xs">
            {impersonatedUser.status}
          </Badge>
        )}
      </div>
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={stopImpersonation}
        disabled={isLoading}
        className="text-white hover:bg-orange-700 hover:text-white"
      >
        <X className="h-4 w-4 mr-1" />
        Exit View Mode
      </Button>
    </div>
  );
}
