import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { PushNotificationPrompt } from "@/components/notifications/PushNotificationPrompt";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useRealtimeNotifications } from "@/hooks/useNotificationSystem";
import { GlobalSearchBar } from "@/components/GlobalSearchBar";
import { useIsEmbedded } from "@/contexts/EmbeddedContext";
import { MobileLayout } from "@/components/mobile/MobileLayout";
import { useDevice } from "@/hooks/use-device";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const isEmbedded = useIsEmbedded();
  const { isDesktop } = useDevice();
  useRealtimeNotifications();

  // When embedded inside a module page, skip the shell
  if (isEmbedded) {
    return <>{children}</>;
  }

  if (!isDesktop) {
    return <MobileLayout>{children}</MobileLayout>;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Clean top header */}
          <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 md:px-6 shrink-0 sticky top-0 z-40">
            <div className="flex min-w-0 flex-1 items-center">
              <GlobalSearchBar variant="desktop" className="hidden md:block" />
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <NotificationBell />
            </div>
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
      <PushNotificationPrompt />
    </SidebarProvider>
  );
}
