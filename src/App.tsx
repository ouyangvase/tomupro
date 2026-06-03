import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LocationProvider } from "@/contexts/LocationContext";
import { RoleChangeBanner } from "@/components/RoleChangeBanner";
import RealtimeProvider from "@/components/RealtimeProvider";
import { useDriverOnboarding } from "@/hooks/useDriverOnboarding";
import LocationPermissionGate from "@/components/driver/LocationPermissionGate";
import { ProfileGate } from "@/components/auth/ProfileGate";
import { useMaintenanceMode } from "@/hooks/useMaintenanceMode";
import { MaintenanceOverlay } from "@/components/MaintenanceOverlay";
import { ResponsiveLayout } from "@/components/layout/ResponsiveLayout";
import { lazy, Suspense } from "react";

// Pages
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import Landing from "./pages/Landing";

// Module pages
const OrdersModule = lazy(() => import("./pages/modules/OrdersModule"));
const DispatchModule = lazy(() => import("./pages/modules/DispatchModule"));
const DeliveryModule = lazy(() => import("./pages/modules/DeliveryModule"));
const PerformanceModule = lazy(() => import("./pages/modules/PerformanceModule"));
const TeamModule = lazy(() => import("./pages/modules/TeamModule"));
const FinanceModule = lazy(() => import("./pages/modules/FinanceModule"));
const InventoryModule = lazy(() => import("./pages/modules/InventoryModule"));
const SystemModule = lazy(() => import("./pages/modules/SystemModule"));

// Standalone pages that remain as direct routes
import ProfilePage from "./pages/settings/ProfilePage";
import NotificationCenter from "./pages/notifications/NotificationCenter";
import DriverOnboarding from "./pages/driver/DriverOnboarding";
import EventCreate from "./pages/admin/EventCreate";
import EventDetail from "./pages/admin/EventDetail";
import UserEventsPage from "./pages/events/UserEventsPage";
import { EventPopupModal } from "./components/events/EventPopupModal";
import GuideCenterPage from "./pages/guide/GuideCenterPage";
import { OnboardingFlow } from "./components/guide/OnboardingFlow";
import { FloatingHelpButton } from "./components/guide/FloatingHelpButton";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
    },
  },
});

const ModuleLoading = () => (
  <div className="flex items-center justify-center py-16">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, profileStatus, profileError, retryProfile, resetSession } = useAuth();
  const { needsOnboarding, checkingLink } = useDriverOnboarding();
  const { isMaintenanceMode, isLoading: maintenanceLoading } = useMaintenanceMode();
  
  if (loading || maintenanceLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }
  
  const isAdmin = profile?.role === "admin";
  if (user && profileStatus === 'ready' && isMaintenanceMode && !isAdmin) {
    return <MaintenanceOverlay />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (profileStatus !== 'ready') {
    return (
      <ProfileGate
        profileStatus={profileStatus}
        profileError={profileError}
        onRetry={retryProfile}
        onResetSession={resetSession}
        onPasswordChanged={retryProfile}
      >
        {children}
      </ProfileGate>
    );
  }

  const isDriver = profile?.role === "driver";
  
  if (isDriver && checkingLink) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (isDriver && needsOnboarding) {
    return <DriverOnboarding />;
  }

  if (profile?.role === "user") {
    return <Navigate to="/settings/profile" replace />;
  }
  
  if (isDriver) {
    return <LocationPermissionGate>{children}</LocationPermissionGate>;
  }
  
  return <>{children}</>;
}

function ProtectedModule({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <ResponsiveLayout>
        <Suspense fallback={<ModuleLoading />}>
          {children}
        </Suspense>
      </ResponsiveLayout>
    </ProtectedRoute>
  );
}

// Public marketing landing for logged-out visitors at "/".
// Logged-in users keep the existing Dashboard experience unchanged.
function RootRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Landing />;
  }

  return (
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  );
}

function AppRoutes() {
  return (
    <RealtimeProvider>
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/" element={<RootRoute />} />
      
      {/* Module routes */}
      <Route path="/orders" element={<ProtectedModule><OrdersModule /></ProtectedModule>} />
      <Route path="/dispatch" element={<ProtectedModule><DispatchModule /></ProtectedModule>} />
      <Route path="/delivery" element={<ProtectedModule><DeliveryModule /></ProtectedModule>} />
      <Route path="/performance" element={<ProtectedModule><PerformanceModule /></ProtectedModule>} />
      <Route path="/team" element={<ProtectedModule><TeamModule /></ProtectedModule>} />
      <Route path="/finance" element={<ProtectedModule><FinanceModule /></ProtectedModule>} />
      <Route path="/inventory" element={<ProtectedModule><InventoryModule /></ProtectedModule>} />
      <Route path="/system" element={<ProtectedModule><SystemModule /></ProtectedModule>} />

      {/* Standalone pages */}
      <Route path="/settings/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><NotificationCenter /></ProtectedRoute>} />
      <Route path="/admin/events/create" element={<ProtectedRoute><EventCreate /></ProtectedRoute>} />
      <Route path="/admin/events/:eventId" element={<ProtectedRoute><EventDetail /></ProtectedRoute>} />
      <Route path="/admin/events/:eventId/analytics" element={<ProtectedRoute><EventDetail /></ProtectedRoute>} />
      <Route path="/events" element={<ProtectedRoute><UserEventsPage /></ProtectedRoute>} />
      <Route path="/guide" element={<ProtectedRoute><GuideCenterPage /></ProtectedRoute>} />

      {/* Legacy redirects — keep old bookmarks working */}
      <Route path="/sales/booking" element={<Navigate to="/orders?tab=booking" replace />} />
      <Route path="/sales/ready" element={<Navigate to="/orders?tab=ready" replace />} />
      <Route path="/sales/cancelled" element={<Navigate to="/orders?tab=cancelled" replace />} />
      <Route path="/sales/action-required" element={<Navigate to="/orders?tab=action-required" replace />} />
      <Route path="/runner/delivered-orders" element={<Navigate to="/orders?tab=delivered" replace />} />
      <Route path="/runner/inbox" element={<Navigate to="/dispatch?tab=inbox" replace />} />
      <Route path="/admin/runner-inbox" element={<Navigate to="/dispatch?tab=inbox" replace />} />
      <Route path="/runner/inbound" element={<Navigate to="/dispatch?tab=inbound" replace />} />
      <Route path="/runner/driver-inbox" element={<Navigate to="/dispatch?tab=driver-inbox" replace />} />
      <Route path="/runner/drivers" element={<Navigate to="/dispatch?tab=drivers" replace />} />
      <Route path="/runner/failed-orders" element={<Navigate to="/dispatch?tab=failed" replace />} />
      <Route path="/runner/driver-locations" element={<Navigate to="/dispatch?tab=map" replace />} />
      <Route path="/driver/inbox" element={<Navigate to="/delivery?tab=inbox" replace />} />
      <Route path="/driver/route" element={<Navigate to="/delivery?tab=route" replace />} />
      <Route path="/driver/pickups" element={<Navigate to="/delivery?tab=pickups" replace />} />
      <Route path="/driver/returns" element={<Navigate to="/delivery?tab=returns" replace />} />
      <Route path="/driver/analytics" element={<Navigate to="/delivery?tab=analytics" replace />} />
      <Route path="/leaderboard" element={<Navigate to="/performance?tab=leaderboard" replace />} />
      <Route path="/manager/ranking-board" element={<Navigate to="/performance?tab=ranking" replace />} />
      <Route path="/manager/impact-board" element={<Navigate to="/performance?tab=impact" replace />} />
      <Route path="/runner/driver-ranking" element={<Navigate to="/performance?tab=driver-ranking" replace />} />
      <Route path="/driver/ranking" element={<Navigate to="/performance?tab=ranking" replace />} />
      <Route path="/settings/users" element={<Navigate to="/team?tab=users" replace />} />
      <Route path="/manager/pending-approvals" element={<Navigate to="/team?tab=approvals" replace />} />
      <Route path="/manager/oversight" element={<Navigate to="/team?tab=oversight" replace />} />
      <Route path="/disputes" element={<Navigate to="/team" replace />} />
      <Route path="/reconciliation/admin" element={<Navigate to="/finance?tab=reconciliation" replace />} />
      <Route path="/admin/claim-batches" element={<Navigate to="/finance?tab=claims" replace />} />
      <Route path="/admin/claim-batches-history" element={<Navigate to="/finance?tab=claims-history" replace />} />
      <Route path="/admin/delivery-charges" element={<Navigate to="/finance?tab=delivery-charges" replace />} />
      <Route path="/admin/delivery-fees-report" element={<Navigate to="/finance?tab=delivery-report" replace />} />
      <Route path="/admin/overview" element={<Navigate to="/finance?tab=overview" replace />} />
      <Route path="/runner/claims" element={<Navigate to="/finance?tab=my-claims" replace />} />
      <Route path="/runner/cash-settlement" element={<Navigate to="/finance?tab=cash-settlement" replace />} />
      <Route path="/runner/cash-driver" element={<Navigate to="/finance?tab=cash-driver" replace />} />
      <Route path="/runner/delivery-charges" element={<Navigate to="/finance?tab=delivery-charges" replace />} />
      <Route path="/runner/driver-pickups" element={<Navigate to="/finance?tab=driver-pickups" replace />} />
      <Route path="/runner/driver-returns" element={<Navigate to="/finance?tab=driver-returns" replace />} />
      <Route path="/runner/allocated-stock" element={<Navigate to="/finance?tab=allocated-stock" replace />} />
      <Route path="/inventory-balance" element={<Navigate to="/inventory?tab=balance" replace />} />
      <Route path="/inventory/balance" element={<Navigate to="/inventory?tab=balance" replace />} />
      <Route path="/inbound/pending" element={<Navigate to="/inventory?tab=inbound" replace />} />
      <Route path="/inbound/history" element={<Navigate to="/inventory?tab=inbound-history" replace />} />
      <Route path="/inventory/adjustment" element={<Navigate to="/inventory?tab=adjustments" replace />} />
      <Route path="/admin/warehouses" element={<Navigate to="/inventory?tab=warehouses" replace />} />
      <Route path="/products" element={<Navigate to="/inventory?tab=products" replace />} />
      <Route path="/admin/stock-audit" element={<Navigate to="/system?tab=stock-audit" replace />} />
      <Route path="/admin/stock-integrity" element={<Navigate to="/system?tab=stock-rebuild" replace />} />
      <Route path="/admin/events" element={<Navigate to="/system?tab=events" replace />} />
      <Route path="/settings/bindings" element={<Navigate to="/system?tab=bindings" replace />} />
      <Route path="/admin/invite-codes" element={<Navigate to="/system?tab=invite-codes" replace />} />
      <Route path="/settings/commission" element={<Navigate to="/system?tab=commission" replace />} />
      <Route path="/admin/leaderboard-settings" element={<Navigate to="/system?tab=leaderboard" replace />} />
      <Route path="/admin/data-sharing" element={<Navigate to="/system?tab=data-sharing" replace />} />
      <Route path="/settings/reasons" element={<Navigate to="/system?tab=reasons" replace />} />
      <Route path="/manager/dashboard" element={<Navigate to="/" replace />} />

      <Route path="/settings/*" element={<Navigate to="/settings/profile" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
    </RealtimeProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ThemeProvider>
        <LocationProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <RoleChangeBanner />
            <BrowserRouter>
              <EventPopupModal />
              <OnboardingFlow />
              <FloatingHelpButton />
              <AppRoutes />
            </BrowserRouter>
          </TooltipProvider>
        </LocationProvider>
      </ThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
