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
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/15">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        {urgencyCount !== undefined && urgencyCount > 0 && (
          <Badge variant="destructive" className="shadow-sm animate-fade-in">
            {urgencyCount}
          </Badge>
        )}
      </div>
      {children}
    </div>
  );
}
