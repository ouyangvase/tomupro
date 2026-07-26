import type { ReactNode } from 'react';
import { ChevronDown, History } from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface DriverActivityHistoryProps {
  title: string;
  summary: string;
  children: ReactNode;
}

export function DriverActivityHistory({
  title,
  summary,
  children,
}: DriverActivityHistoryProps) {
  return (
    <Card className="overflow-hidden">
      <Collapsible className="group">
        <CollapsibleTrigger className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left">
          <History className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-foreground">{title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{summary}</p>
          </div>
          <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-4 border-t border-border/60 bg-muted/20 p-4">
            {children}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
