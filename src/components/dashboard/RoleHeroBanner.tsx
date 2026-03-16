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
}> = {
  admin: {
    title: 'Command Center',
    subtitle: 'Monitor operations, issues, and team performance in real time.',
    tagline: 'Administrator',
    image: capybaraAdmin,
  },
  driver: {
    title: 'Delivery Mission Control',
    subtitle: 'Stay on route, complete deliveries, and rank up.',
    tagline: 'Driver',
    image: capybaraDriver,
  },
  runner: {
    title: 'Operations Center',
    subtitle: 'Sort faster, process accurately, and keep the flow moving.',
    tagline: 'Runner',
    image: capybaraRunner,
  },
  salesperson: {
    title: 'Sales Arena',
    subtitle: 'Push your numbers, beat the ranking, and hit your target.',
    tagline: 'Salesperson',
    image: capybaraSales,
  },
  manager: {
    title: 'Leadership Center',
    subtitle: 'Lead your team, resolve bottlenecks, and climb the rankings.',
    tagline: 'Team Manager',
    image: capybaraManager,
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
      "relative overflow-hidden rounded-xl border border-border bg-card p-6 md:p-8",
      className
    )}>
      {/* Subtle accent line */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-primary/60 to-transparent" />
      
      <div className="relative flex items-center justify-between gap-6">
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center gap-2">
            <Badge className="text-xs font-semibold px-2.5 py-0.5 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15">
              {config.tagline}
            </Badge>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[hsl(var(--status-success))]" />
              <span className="text-xs text-[hsl(var(--status-success))] font-medium">Live</span>
            </div>
          </div>
          
          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              {timeGreeting}, {displayName}
            </h2>
            <p className="text-sm text-muted-foreground mt-1 font-medium">{config.title}</p>
          </div>
          
          <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">
            {config.subtitle}
          </p>
        </div>
        
        {/* Mascot */}
        <div className="hidden md:block shrink-0">
          <img
            src={config.image}
            alt={`${role} capybara`}
            className="h-28 lg:h-32 w-28 lg:w-32 object-contain drop-shadow-md"
          />
        </div>
      </div>
    </div>
  );
}