import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { PushNotificationPrompt } from "@/components/notifications/PushNotificationPrompt";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useRealtimeNotifications } from "@/hooks/useNotificationSystem";
import { GlobalSearchBar } from "@/components/GlobalSearchBar";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  useRealtimeNotifications();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Warm premium header */}
          <header className="h-14 md:h-16 border-b border-border/50 bg-card/80 backdrop-blur-sm flex items-center justify-between px-3 md:px-6 shrink-0 sticky top-0 z-40">
            <div className="flex items-center gap-2 md:gap-4">
              <SidebarTrigger className="text-muted-foreground hover:text-primary h-10 w-10 md:h-auto md:w-auto transition-colors" />
              <h1 className="text-base md:text-lg font-bold tracking-tight">
                TOMU<span className="text-primary">PRO</span>
              </h1>
              <GlobalSearchBar variant="desktop" className="hidden md:block ml-4" />
            </div>
            <div className="flex items-center gap-1 md:gap-2">
              <ThemeToggle />
              <NotificationBell />
            </div>
          </header>
          <main className="flex-1 overflow-auto p-3 md:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
      <PushNotificationPrompt />
    </SidebarProvider>
  );
}