import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export interface DetailSection {
  title: string;
  items: DetailItem[];
}

export interface DetailItem {
  label: string;
  value: React.ReactNode;
  fullWidth?: boolean;
}

interface RowDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  status?: {
    label: string;
    variant?: 'default' | 'secondary' | 'destructive' | 'outline';
  };
  sections: DetailSection[];
  actions?: React.ReactNode;
}

export function RowDetailDrawer({
  open,
  onOpenChange,
  title,
  subtitle,
  status,
  sections,
  actions,
}: RowDetailDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg p-0">
        <SheetHeader className="p-6 pb-4 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg font-semibold truncate">
                {title}
              </SheetTitle>
              {subtitle && (
                <SheetDescription className="mt-1">
                  {subtitle}
                </SheetDescription>
              )}
            </div>
            {status && (
              <Badge variant={status.variant || 'default'} className="shrink-0">
                {status.label}
              </Badge>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 h-[calc(100vh-180px)]">
          <div className="p-6 space-y-6">
            {sections.map((section, sectionIndex) => (
              <div key={sectionIndex}>
                <h4 className="text-sm font-semibold text-foreground mb-3">
                  {section.title}
                </h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {section.items.map((item, itemIndex) => (
                    <div 
                      key={itemIndex}
                      className={cn(item.fullWidth && "col-span-2")}
                    >
                      <p className="text-xs text-muted-foreground mb-0.5">
                        {item.label}
                      </p>
                      <div className="text-sm font-medium text-foreground">
                        {item.value || '-'}
                      </div>
                    </div>
                  ))}
                </div>
                {sectionIndex < sections.length - 1 && (
                  <Separator className="mt-6" />
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        {actions && (
          <div className="p-4 border-t bg-muted/30">
            {actions}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
