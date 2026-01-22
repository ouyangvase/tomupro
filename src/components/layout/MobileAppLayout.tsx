import React from 'react';
import { MobileHeader } from '@/components/mobile/MobileHeader';
import { BottomNavigation } from '@/components/mobile/BottomNavigation';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

interface MobileAppLayoutProps {
  children: React.ReactNode;
  showHeader?: boolean;
  showBottomNav?: boolean;
  className?: string;
}

export function MobileAppLayout({
  children,
  showHeader = true,
  showBottomNav = true,
  className,
}: MobileAppLayoutProps) {
  const isMobile = useIsMobile();
  const { data: notifications } = useNotifications();
  
  const unreadCount = notifications?.filter(n => !n.is_read).length || 0;

  return (
    <div className={cn("min-h-screen bg-background", className)}>
      {/* Mobile Header */}
      {showHeader && isMobile && (
        <MobileHeader unreadCount={unreadCount} />
      )}
      
      {/* Main Content */}
      <main 
        className={cn(
          "px-4 pb-4",
          showBottomNav && isMobile && "has-bottom-nav"
        )}
      >
        {children}
      </main>
      
      {/* Bottom Navigation */}
      {showBottomNav && <BottomNavigation />}
    </div>
  );
}
