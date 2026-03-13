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
      "relative overflow-hidden rounded-2xl border border-primary/15 p-5 md:p-6",
      "bg-gradient-to-br from-primary/10 via-primary/5 to-transparent",
      className
    )}>
      {/* Decorative blobs */}
      <div className="absolute top-0 right-0 w-40 h-40 bg-primary/8 rounded-full blur-3xl translate-x-1/4 -translate-y-1/4" />
      <div className="absolute bottom-0 left-1/4 w-28 h-28 bg-[hsl(var(--status-success)/0.06)] rounded-full blur-2xl" />

      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="p-3 rounded-2xl bg-primary/15 shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">
              {subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {actions}
          {image && (
            <div className="hidden lg:block">
              <img
                src={image}
                alt={imageAlt || title}
                className="h-20 w-20 object-contain drop-shadow-md"
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
