import { useAuth } from '@/contexts/AuthContext';
import capybaraAdmin from '@/assets/capybara-admin.png';
import capybaraDriver from '@/assets/capybara-driver.png';
import capybaraRunner from '@/assets/capybara-runner.png';
import capybaraSales from '@/assets/capybara-sales.png';
import capybaraManager from '@/assets/capybara-manager.png';
import capybaraHero from '@/assets/capybara-hero.png';

interface RoleHeroBannerProps {
  className?: string;
}

const roleConfig: Record<string, {
  greeting: string;
  subtitle: string;
  image: string;
}> = {
  admin: {
    greeting: 'Command Center',
    subtitle: 'Full system overview at your fingertips',
    image: capybaraAdmin,
  },
  driver: {
    greeting: 'Ready to Deliver',
    subtitle: 'Your route is planned, parcels are waiting',
    image: capybaraDriver,
  },
  runner: {
    greeting: 'Operations Hub',
    subtitle: 'Manage drivers, parcels, and deliveries',
    image: capybaraRunner,
  },
  salesperson: {
    greeting: 'Sales Dashboard',
    subtitle: 'Track orders, commissions, and performance',
    image: capybaraSales,
  },
  manager: {
    greeting: 'Team Overview',
    subtitle: 'Approvals, performance, and team health',
    image: capybaraManager,
  },
};

export function RoleHeroBanner({ className }: RoleHeroBannerProps) {
  const { profile } = useAuth();
  const role = profile?.role || 'admin';
  const config = roleConfig[role] || roleConfig.admin;
  const displayName = profile?.display_name?.split(' ')[0] || 'there';

  // Get time-of-day greeting
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/12 via-primary/6 to-transparent border border-primary/15 p-6 md:p-8 ${className || ''}`}>
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-primary/8 rounded-full blur-3xl translate-x-1/3 -translate-y-1/3" />
      <div className="absolute bottom-0 left-1/3 w-32 h-32 bg-[hsl(var(--status-success)/0.06)] rounded-full blur-2xl" />
      
      <div className="relative flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-primary mb-1">{config.greeting}</p>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground mb-2">
            {timeGreeting}, {displayName} 👋
          </h2>
          <p className="text-sm md:text-base text-muted-foreground max-w-md">
            {config.subtitle}
          </p>
        </div>
        
        {/* Role mascot */}
        <div className="hidden md:block shrink-0">
          <img
            src={config.image}
            alt={`${role} capybara`}
            className="h-24 lg:h-32 w-24 lg:w-32 object-contain drop-shadow-lg"
          />
        </div>
      </div>
    </div>
  );
}