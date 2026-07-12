import { ReactNode } from 'react';
import { MobileHeader } from './MobileHeader';
import { BottomNavigation } from './BottomNavigation';
import { cn } from '@/lib/utils';

interface MobileLayoutProps {
  children: ReactNode;
  showHeader?: boolean;
  showBottomNav?: boolean;
  className?: string;
  contentClassName?: string;
}

export function MobileLayout({
  children,
  showHeader = true,
  showBottomNav = true,
  className,
  contentClassName,
}: MobileLayoutProps) {
  return (
    <div className={cn("space-grid-bg min-h-dvh w-full max-w-full overflow-x-hidden bg-background text-foreground flex flex-col", className)}>
      {showHeader && <MobileHeader />}
      
      <main className={cn(
        "flex-1 min-w-0 w-full max-w-full overflow-x-hidden overflow-y-auto",
        showBottomNav && "pb-20", // Space for bottom nav
        contentClassName
      )}>
        {children}
      </main>
      
      {showBottomNav && <BottomNavigation />}
    </div>
  );
}
