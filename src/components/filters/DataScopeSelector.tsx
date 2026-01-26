import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHasDataShares, DataShare } from "@/hooks/useDataShares";
import { Badge } from "@/components/ui/badge";
import { Eye, Users, Layers } from "lucide-react";

export type DataScope = 'my' | 'shared' | 'all';

interface DataScopeSelectorProps {
  value: DataScope;
  onChange: (value: DataScope) => void;
  shares?: DataShare[];
  className?: string;
}

/**
 * Component for selecting data scope when viewing data.
 * Shows tabs to switch between:
 * - My Data: Only current user's data
 * - Shared Users: Only data from shared subjects
 * - All Accessible: Combined view of own + shared data
 * 
 * Only renders if user has active data shares.
 */
export function DataScopeSelector({ 
  value, 
  onChange, 
  shares = [],
  className 
}: DataScopeSelectorProps) {
  const { hasShares, sharesCount, isLoading } = useHasDataShares();
  
  // Don't render if no shares
  if (isLoading || !hasShares) return null;
  
  const activeShares = shares.filter(s => s.active);
  const displayCount = activeShares.length || sharesCount;
  
  return (
    <Tabs 
      value={value} 
      onValueChange={(v) => onChange(v as DataScope)}
      className={className}
    >
      <TabsList className="h-10">
        <TabsTrigger value="my" className="gap-1.5 px-3">
          <Eye className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">My Data</span>
          <span className="sm:hidden">Mine</span>
        </TabsTrigger>
        <TabsTrigger value="shared" className="gap-1.5 px-3">
          <Users className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Shared</span>
          <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
            {displayCount}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="all" className="gap-1.5 px-3">
          <Layers className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">All</span>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

/**
 * Compact version for mobile or tight spaces
 */
export function DataScopeSelectorCompact({ 
  value, 
  onChange, 
  className 
}: Omit<DataScopeSelectorProps, 'shares'>) {
  const { hasShares, sharesCount, isLoading } = useHasDataShares();
  
  if (isLoading || !hasShares) return null;
  
  return (
    <Tabs 
      value={value} 
      onValueChange={(v) => onChange(v as DataScope)}
      className={className}
    >
      <TabsList className="h-9">
        <TabsTrigger value="my" className="px-2">
          <Eye className="h-4 w-4" />
        </TabsTrigger>
        <TabsTrigger value="shared" className="px-2 gap-1">
          <Users className="h-4 w-4" />
          <span className="text-xs">{sharesCount}</span>
        </TabsTrigger>
        <TabsTrigger value="all" className="px-2">
          <Layers className="h-4 w-4" />
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

export default DataScopeSelector;
