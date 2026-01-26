import { useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { AppNotificationBell } from "@/components/packages/AppNotificationBell";
import { PushNotificationPrompt } from "@/components/notifications/PushNotificationPrompt";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useRealtimeNotifications } from "@/hooks/useNotificationSystem";
import { useIsMobile } from "@/hooks/use-mobile";
import { PackageDetailDialog } from "@/components/packages/PackageDetailDialog";
import { ImpersonationProvider } from "@/contexts/ImpersonationContext";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { useAuth } from "@/contexts/AuthContext";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  // Subscribe to realtime notifications
  useRealtimeNotifications();
  const isMobile = useIsMobile();
  const { role } = useAuth();
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

  const isAdmin = role === 'admin';

  // Wrap content with ImpersonationProvider only for admins
  const content = (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Impersonation Banner - shown when admin is viewing as another user */}
          {isAdmin && <ImpersonationBanner />}
          
          {/* Sticky header with better mobile spacing */}
          <header className="h-14 md:h-16 border-b border-border bg-card/95 backdrop-blur-sm flex items-center justify-between px-3 md:px-6 shrink-0 sticky top-0 z-40">
            <div className="flex items-center gap-2 md:gap-4">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground h-10 w-10 md:h-auto md:w-auto" />
              <h1 className="text-base md:text-lg font-semibold">Tomu</h1>
            </div>
            <div className="flex items-center gap-1 md:gap-2">
              <ThemeToggle />
              <AppNotificationBell onPackageClick={setSelectedPackageId} />
              <NotificationBell />
            </div>
          </header>
          {/* Responsive padding for main content */}
          <main className="flex-1 overflow-auto p-3 md:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
      <PushNotificationPrompt />
      <PackageDetailDialog 
        packageId={selectedPackageId}
        open={!!selectedPackageId}
        onOpenChange={(open) => !open && setSelectedPackageId(null)}
      />
    </SidebarProvider>
  );

  // Wrap with ImpersonationProvider for admins
  if (isAdmin) {
    return <ImpersonationProvider>{content}</ImpersonationProvider>;
  }

  return content;
}
