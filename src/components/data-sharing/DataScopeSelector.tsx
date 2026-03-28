import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Eye, Users, Globe } from 'lucide-react';
import { useMySharedAccess } from '@/hooks/useDataSharing';
import type { DataViewMode } from '@/types/data-sharing';

interface DataScopeSelectorProps {
  value: DataViewMode;
  onChange: (mode: DataViewMode) => void;
  scope?: 'orders' | 'products' | 'stock' | 'inbound' | 'delivered_orders' | 'claims';
  className?: string;
}

export function DataScopeSelector({ value, onChange, scope = 'orders', className }: DataScopeSelectorProps) {
  const { data: sharedAccess = [] } = useMySharedAccess();

  // Filter shared access by scope
  const relevantShares = sharedAccess.filter(share => {
    switch (scope) {
      case 'orders': return share.scopes.orders;
      case 'products': return share.scopes.products;
      case 'stock': return share.scopes.stock;
      case 'inbound': return share.scopes.inbound;
      case 'delivered_orders': return share.scopes.delivered_orders;
      case 'claims': return share.scopes.claims;
      default: return share.scopes.orders;
    }
  });
  
  // If no shared access for this scope, don't show selector
  if (relevantShares.length === 0) {
    return null;
  }

  const icons: Record<DataViewMode, React.ReactNode> = {
    my_data: <Eye className="h-4 w-4" />,
    shared: <Users className="h-4 w-4" />,
    all_accessible: <Globe className="h-4 w-4" />,
  };

  const labels: Record<DataViewMode, string> = {
    my_data: 'My Data',
    shared: `Shared Users (${relevantShares.length})`,
    all_accessible: 'All Accessible',
  };

  return (
    <Select value={value} onValueChange={(v) => onChange(v as DataViewMode)}>
      <SelectTrigger className={className || "w-[180px]"}>
        <div className="flex items-center gap-2">
          {icons[value]}
          <SelectValue />
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="my_data">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            <span>My Data</span>
          </div>
        </SelectItem>
        <SelectItem value="shared">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>Shared Users</span>
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {relevantShares.length}
            </Badge>
          </div>
        </SelectItem>
        <SelectItem value="all_accessible">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            <span>All Accessible</span>
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

/**
 * Badge to indicate the owner of a shared record
 */
export function OwnerBadge({ ownerName, isOwnData }: { ownerName: string; isOwnData: boolean }) {
  if (isOwnData) return null;
  
  return (
    <Badge variant="outline" className="ml-2 text-xs font-normal">
      <Users className="h-3 w-3 mr-1" />
      {ownerName}
    </Badge>
  );
}
