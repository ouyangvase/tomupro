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
      <div className="space-grid-bg min-h-screen flex w-full bg-background text-foreground">
        <AppSidebar />
        <div className="relative flex-1 flex flex-col min-w-0">
          <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(239,244,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(239,244,255,0.035)_1px,transparent_1px)] [background-size:56px_56px]" />
          <header className="liquid-glass overflow-visible mx-3 mt-3 h-14 flex items-center justify-between px-4 md:mx-4 md:px-5 shrink-0 sticky top-3 z-40 rounded-2xl">
            <div className="flex min-w-0 flex-1 items-center">
              <GlobalSearchBar variant="desktop" className="hidden md:block" />
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <NotificationBell />
            </div>
          </header>
          <main className="relative flex-1 overflow-auto px-4 py-5 md:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-[1831px]">
              {children}
            </div>
          </main>
        </div>
      </div>
      <PushNotificationPrompt />
    </SidebarProvider>
  );
}
