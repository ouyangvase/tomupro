import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import capybaraAdmin from '@/assets/capybara-admin.png';
import capybaraDriver from '@/assets/capybara-driver.png';
import capybaraRunner from '@/assets/capybara-runner.png';
import capybaraSales from '@/assets/capybara-sales.png';
import capybaraManager from '@/assets/capybara-manager.png';

interface RoleHeroBannerProps {
  className?: string;
}

const roleConfig: Record<string, {
  title: string;
  subtitle: string;
  tagline: string;
  image: string;
  accentGradient: string;
}> = {
  admin: {
    title: 'Command Center',
    subtitle: 'Monitor operations, issues, and team performance in real time',
    tagline: 'System Administrator',
    image: capybaraAdmin,
    accentGradient: 'from-primary/15 via-primary/8 to-[hsl(var(--status-success)/0.05)]',
  },
  driver: {
    title: 'Delivery Mission Control',
    subtitle: 'Stay on route, complete deliveries, and rank up',
    tagline: 'Driver',
    image: capybaraDriver,
    accentGradient: 'from-primary/15 via-primary/8 to-[hsl(var(--status-pending)/0.05)]',
  },
  runner: {
    title: 'Operations Runner Center',
    subtitle: 'Sort faster, process accurately, and keep the flow moving',
    tagline: 'Runner',
    image: capybaraRunner,
    accentGradient: 'from-primary/15 via-[hsl(var(--status-warning)/0.08)] to-transparent',
  },
  salesperson: {
    title: 'Sales Arena',
    subtitle: 'Push your numbers, beat the ranking, and hit your target',
    tagline: 'Salesperson',
    image: capybaraSales,
    accentGradient: 'from-primary/15 via-primary/8 to-[hsl(var(--status-success)/0.05)]',
  },
  manager: {
    title: 'Leadership Center',
    subtitle: 'Lead your team, resolve bottlenecks, and climb the rankings',
    tagline: 'Team Manager',
    image: capybaraManager,
    accentGradient: 'from-primary/15 via-primary/8 to-[hsl(var(--status-pending)/0.05)]',
  },
};

export function RoleHeroBanner({ className }: RoleHeroBannerProps) {
  const { profile } = useAuth();
  const role = profile?.role || 'admin';
  const config = roleConfig[role] || roleConfig.admin;
  const displayName = profile?.display_name?.split(' ')[0] || 'there';

  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl border border-primary/15 p-6 md:p-8",
      `bg-gradient-to-br ${config.accentGradient}`,
      className
    )}>
      {/* Decorative blobs */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-primary/8 rounded-full blur-3xl translate-x-1/3 -translate-y-1/3" />
      <div className="absolute bottom-0 left-1/4 w-32 h-32 bg-[hsl(var(--status-success)/0.06)] rounded-full blur-2xl" />
      <div className="absolute -bottom-4 right-1/3 w-24 h-24 bg-[hsl(var(--status-pending)/0.04)] rounded-full blur-xl" />
      
      <div className="relative flex items-center justify-between gap-6">
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-xs font-semibold px-3 py-1 bg-primary/10 text-primary border-primary/20">
              {config.tagline}
            </Badge>
            <div className="hidden sm:flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[hsl(var(--status-success))] animate-pulse" />
              <span className="text-xs text-[hsl(var(--status-success))] font-medium">Live</span>
            </div>
          </div>
          
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">
              {timeGreeting}, {displayName} 👋
            </h2>
            <p className="text-xs text-muted-foreground/60 font-medium mt-0.5">{config.title}</p>
          </div>
          
          <p className="text-sm text-muted-foreground max-w-lg">
            {config.subtitle}
          </p>
        </div>
        
        {/* Mascot */}
        <div className="hidden md:block shrink-0">
          <img
            src={config.image}
            alt={`${role} capybara`}
            className="h-28 lg:h-36 w-28 lg:w-36 object-contain drop-shadow-lg"
          />
        </div>
      </div>
    </div>
  );
}
