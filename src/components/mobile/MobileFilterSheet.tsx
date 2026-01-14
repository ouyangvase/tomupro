import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileFilterSheetProps {
  children: React.ReactNode;
  activeFiltersCount?: number;
  onReset?: () => void;
  onApply?: () => void;
  title?: string;
  triggerClassName?: string;
}

export function MobileFilterSheet({
  children,
  activeFiltersCount = 0,
  onReset,
  onApply,
  title = "Filters",
  triggerClassName,
}: MobileFilterSheetProps) {
  const [open, setOpen] = React.useState(false);

  const handleApply = () => {
    onApply?.();
    setOpen(false);
  };

  const handleReset = () => {
    onReset?.();
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant={activeFiltersCount > 0 ? "default" : "outline"}
          size="sm"
          className={cn("h-11 min-h-[44px] px-4", triggerClassName)}
        >
          <Filter className="h-4 w-4 mr-2" />
          {title}
          {activeFiltersCount > 0 && (
            <Badge variant="secondary" className="ml-2">
              {activeFiltersCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="h-[85vh] rounded-t-2xl flex flex-col"
      >
        <SheetHeader className="shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle>{title}</SheetTitle>
            {activeFiltersCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="h-9 px-3"
              >
                <X className="h-4 w-4 mr-1" />
                Clear all
              </Button>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6 py-4">{children}</ScrollArea>

        <div className="shrink-0 sticky bottom-0 bg-background border-t -mx-6 px-6 py-4 flex gap-3">
          <Button
            variant="outline"
            className="flex-1 h-12 min-h-[44px]"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 h-12 min-h-[44px]"
            onClick={handleApply}
          >
            Apply Filters
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
