import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
  onConfirm?: () => void | Promise<void>;
  isLoading?: boolean;
  confirmDisabled?: boolean;
}

export function MobileActionSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "default",
  onConfirm,
  isLoading = false,
  confirmDisabled = false,
}: MobileActionSheetProps) {
  const handleConfirm = async () => {
    if (onConfirm) {
      await onConfirm();
    }
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "rounded-t-2xl flex flex-col",
          children ? "max-h-[80vh]" : "h-auto"
        )}
      >
        <SheetHeader className="shrink-0 text-left">
          <SheetTitle>{title}</SheetTitle>
          {description && (
            <SheetDescription>{description}</SheetDescription>
          )}
        </SheetHeader>

        {children && (
          <ScrollArea className="flex-1 -mx-6 px-6 py-4">
            {children}
          </ScrollArea>
        )}

        <div className="shrink-0 sticky bottom-0 bg-background pt-4 pb-2 flex flex-col gap-2">
          <Button
            variant={confirmVariant}
            className="w-full h-12 min-h-[44px] text-base"
            onClick={handleConfirm}
            disabled={isLoading || confirmDisabled}
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {confirmLabel}
          </Button>
          <Button
            variant="ghost"
            className="w-full h-12 min-h-[44px] text-base"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
