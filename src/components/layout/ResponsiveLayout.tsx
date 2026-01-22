import { ReactNode } from 'react';
import { useDevice } from '@/hooks/use-device';
import { MobileLayout } from '@/components/mobile/MobileLayout';
import { AppLayout } from './AppLayout';

interface ResponsiveLayoutProps {
  children: ReactNode;
  // Mobile-specific props
  mobileShowHeader?: boolean;
  mobileShowBottomNav?: boolean;
  mobileClassName?: string;
  // Desktop handled by AppLayout
}

/**
 * ResponsiveLayout automatically switches between:
 * - Mobile (<=768px): Maybank-style MobileLayout
 * - Tablet (769-1024px): MobileLayout with 2-column capability
 * - Desktop (>=1025px): Console-style AppLayout with sidebar
 */
export function ResponsiveLayout({
  children,
  mobileShowHeader = true,
  mobileShowBottomNav = true,
  mobileClassName,
}: ResponsiveLayoutProps) {
  const { isDesktop } = useDevice();

  // Desktop uses existing AppLayout with sidebar
  if (isDesktop) {
    return <AppLayout>{children}</AppLayout>;
  }

  // Mobile/Tablet uses Maybank-style MobileLayout
  return (
    <MobileLayout
      showHeader={mobileShowHeader}
      showBottomNav={mobileShowBottomNav}
      className={mobileClassName}
    >
      {children}
    </MobileLayout>
  );
}
