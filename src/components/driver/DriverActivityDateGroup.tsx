import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface DriverActivityDateGroupProps {
  date: string;
  summary?: string;
  children: ReactNode;
}

export function DriverActivityDateGroup({
  date,
  summary,
  children,
}: DriverActivityDateGroupProps) {
  return (
    <Collapsible className="group border-b border-border/70 last:border-b-0">
      <CollapsibleTrigger className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-foreground">{date}</p>
          {summary && <p className="mt-0.5 text-xs text-muted-foreground">{summary}</p>}
        </div>
        <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-3 border-t border-border/60 bg-muted/20 px-4 py-4">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
