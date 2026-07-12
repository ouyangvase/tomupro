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
  iconBg = 'bg-primary/10',
  className,
}: QuickActionTileProps) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(href)}
      className={cn(
        "group w-full flex items-center gap-3 p-3.5 rounded-2xl",
        "bg-white/[0.035] hover:bg-white/[0.07]",
        "border border-white/10 hover:border-primary/25",
        "transition-all duration-200",
        className
      )}
    >
      <div className={cn(
        "flex items-center justify-center h-10 w-10 rounded-xl transition-colors shrink-0",
        iconBg
      )}>
        <Icon className={cn("h-4.5 w-4.5", iconColor)} />
      </div>
      <div className="flex-1 text-left min-w-0">
        <p className="font-medium text-foreground text-sm truncate">{title}</p>
        <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
      </div>
      {badge !== undefined && badge > 0 && (
        <Badge variant="destructive" className="shrink-0 text-xs">{badge}</Badge>
      )}
      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
    </button>
  );
}
