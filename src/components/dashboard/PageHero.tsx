import { cn } from '@/lib/utils';

interface PageHeroProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  image?: string;
  imageAlt?: string;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export function PageHero({ icon, title, subtitle, image, imageAlt, actions, className, children }: PageHeroProps) {
  return (
    <div className={cn(
      "relative overflow-hidden rounded-xl border border-border bg-card p-5 md:p-6",
      className
    )}>
      {/* Top accent */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-primary/30" />

      <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex w-full min-w-0 flex-1 items-center gap-4 md:w-auto">
          <div className="p-2.5 rounded-xl bg-primary/10 shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">
              {subtitle}
            </p>
          </div>
        </div>

        <div className="flex w-full min-w-0 flex-col gap-3 md:w-auto md:shrink-0 md:flex-row md:items-center">
          {actions}
          {image && (
            <div className="hidden lg:block">
              <img
                src={image}
                alt={imageAlt || title}
                className="h-16 w-16 object-contain drop-shadow-sm"
              />
            </div>
          )}
        </div>
      </div>

      {children && (
        <div className="relative mt-4">
          {children}
        </div>
      )}
    </div>
  );
}
