import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  title: string;
  showViewAll?: boolean;
  onViewAll?: () => void;
  viewAllText?: string;
  className?: string;
}

export function SectionHeader({
  title,
  showViewAll = false,
  onViewAll,
  viewAllText = 'View All',
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      {showViewAll && onViewAll && (
        <button
          onClick={onViewAll}
          className="text-sm font-medium text-primary flex items-center gap-1 hover:underline"
        >
          {viewAllText}
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
