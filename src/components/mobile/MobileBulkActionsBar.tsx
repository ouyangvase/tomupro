import * as React from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileBulkActionsBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  children: React.ReactNode;
  className?: string;
}

export function MobileBulkActionsBar({
  selectedCount,
  onClearSelection,
  children,
  className,
}: MobileBulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 bg-background border-t shadow-lg safe-area-pb",
        "p-4 animate-in slide-in-from-bottom-4 duration-200",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-sm font-medium text-primary">
          {selectedCount} selected
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          className="h-9 px-3"
        >
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {children}
      </div>
    </div>
  );
}
