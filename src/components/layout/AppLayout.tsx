import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { PushNotificationPrompt } from "@/components/notifications/PushNotificationPrompt";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { AppName } from "@/components/brand/AppName";
import { useRealtimeNotifications } from "@/hooks/useNotificationSystem";
import { GlobalSearchBar } from "@/components/GlobalSearchBar";
import { useIsEmbedded } from "@/contexts/EmbeddedContext";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const isEmbedded = useIsEmbedded();
  useRealtimeNotifications();

  // When embedded inside a module page, skip the shell
  if (isEmbedded) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Clean top header */}
          <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 md:px-6 shrink-0 sticky top-0 z-40">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground h-9 w-9 transition-colors" />
              <div className="hidden md:flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-foreground">
                  <AppName highlight />
                </h1>
                
              </div>
              <GlobalSearchBar variant="desktop" className="hidden md:block ml-4" />
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