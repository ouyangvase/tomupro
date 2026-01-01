import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { NotificationBell } from "@/components/notifications/NotificationBell";
interface AppLayoutProps {
  children: React.ReactNode;
}
export function AppLayout({
  children
}: AppLayoutProps) {
  return <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b bg-card flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-4">
              <SidebarTrigger />
              <h1 className="text-lg font-semibold">Tomu</h1>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>;
}