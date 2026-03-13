import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { ChevronRight } from 'lucide-react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuickActionTileProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  href: string;
  badge?: number;
  iconColor?: string;
  iconBg?: string;
  className?: string;
}

export function QuickActionTile({
  icon: Icon,
  title,
  subtitle,
  href,
  badge,
  iconColor = 'text-primary',
  iconBg = 'bg-primary/15',
  className,
}: QuickActionTileProps) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(href)}
      className={cn(
        "group w-full flex items-center gap-4 p-4 rounded-xl",
        "bg-gradient-to-r from-secondary/40 to-secondary/20",
        "hover:from-primary/15 hover:to-primary/5",
        "border border-border/40 hover:border-primary/30",
        "transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
        className
      )}
    >
      <div className={cn(
        "flex items-center justify-center h-11 w-11 rounded-xl transition-colors",
        iconBg, "group-hover:bg-primary/20"
      )}>
        <Icon className={cn("h-5 w-5", iconColor, "group-hover:text-primary transition-colors")} />
      </div>
      <div className="flex-1 text-left min-w-0">
        <p className="font-semibold text-foreground group-hover:text-primary transition-colors text-sm truncate">{title}</p>
        <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
      </div>
      {badge !== undefined && badge > 0 && (
        <Badge variant="destructive" className="shrink-0 shadow-sm">{badge}</Badge>
      )}
      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
    </button>
  );
}
