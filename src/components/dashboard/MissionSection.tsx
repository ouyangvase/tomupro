import { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MissionSectionProps {
  icon: LucideIcon;
  title: string;
  urgencyCount?: number;
  children: ReactNode;
  className?: string;
}

export function MissionSection({ icon: Icon, title, urgencyCount, children, className }: MissionSectionProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 border border-primary/15">
          <Icon className="h-4 w-4 text-primary" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        {urgencyCount !== undefined && urgencyCount > 0 && (
          <Badge variant="destructive" className="text-xs animate-fade-in">
            {urgencyCount}
          </Badge>
        )}
      </div>
      {children}
    </div>
  );
}
