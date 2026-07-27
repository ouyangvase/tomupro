import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
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

// Retry dynamic import once on chunk load failure (stale deployment cache)
function lazyRetry<T extends { default: React.ComponentType<never> }>(
  importFn: () => Promise<T>,
) {
  return lazy(() =>
    importFn().catch(() => {
      const key = 'chunk_reload';
      const last = sessionStorage.getItem(key);
      if (!last || Date.now() - Number(last) > 10_000) {
        sessionStorage.setItem(key, String(Date.now()));
        window.location.reload();
      }
      return importFn();
    }),
  );
}

// Pages
import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";

// Module pages
const OrdersModule = lazyRetry(() => import("./pages/modules/OrdersModule"));
const DispatchModule = lazyRetry(() => import("./pages/modules/DispatchModule"));
const DeliveryModule = lazyRetry(() => import("./pages/modules/DeliveryModule"));
const PerformanceModule = lazyRetry(() => import("./pages/modules/PerformanceModule"));
const TeamModule = lazyRetry(() => import("./pages/modules/TeamModule"));
const FinanceModule = lazyRetry(() => import("./pages/modules/FinanceModule"));
const InventoryModule = lazyRetry(() => import("./pages/modules/InventoryModule"));
const SystemModule = lazyRetry(() => import("./pages/modules/SystemModule"));

// SEO landing pages
const LogisticsServiceBrunei = lazyRetry(() => import("./pages/seo/LogisticsServiceBrunei"));
const LastMileDeliveryBrunei = lazyRetry(() => import("./pages/seo/LastMileDeliveryBrunei"));
const FulfillmentServiceBrunei = lazyRetry(() => import("./pages/seo/FulfillmentServiceBrunei"));
const DeliveryManagementSystem = lazyRetry(() => import("./pages/seo/DeliveryManagementSystem"));
const LogisticsCompanyBrunei = lazyRetry(() => import("./pages/seo/LogisticsCompanyBrunei"));
const CourierServiceBrunei = lazyRetry(() => import("./pages/seo/CourierServiceBrunei"));
const SameDayDeliveryBrunei = lazyRetry(() => import("./pages/seo/SameDayDeliveryBrunei"));
const EcommerceDeliveryBrunei = lazyRetry(() => import("./pages/seo/EcommerceDeliveryBrunei"));
const ParcelDeliveryBrunei = lazyRetry(() => import("./pages/seo/ParcelDeliveryBrunei"));
const DeliveryAppBrunei = lazyRetry(() => import("./pages/seo/DeliveryAppBrunei"));

// Blog pages
const BlogIndex = lazyRetry(() => import("./pages/blog/BlogIndex"));
const BlogPost = lazyRetry(() => import("./pages/blog/BlogPost"));

// Auth pages
const ResetPassword = lazyRetry(() => import("./pages/auth/ResetPassword"));

// Standalone pages (lazy-loaded — rarely visited)
const ProfilePage = lazyRetry(() => import("./pages/settings/ProfilePage"));
const NotificationCenter = lazyRetry(() => import("./pages/notifications/NotificationCenter"));
const TelegramUserSettings = lazyRetry(() => import("./pages/settings/TelegramUserSettings"));
const TelegramLogsPage = lazyRetry(() => import("./pages/settings/TelegramLogsPage"));
const DriverOnboarding = lazyRetry(() => import("./pages/driver/DriverOnboarding"));
const EventCreate = lazyRetry(() => import("./pages/admin/EventCreate"));
const EventDetail = lazyRetry(() => import("./pages/admin/EventDetail"));
const UserEventsPage = lazyRetry(() => import("./pages/events/UserEventsPage"));
const GuideCenterPage = lazyRetry(() => import("./pages/guide/GuideCenterPage"));
const OrderNotFound = lazyRetry(() => import("./pages/orders/OrderNotFound"));
const EventPopupModal = lazyRetry(() => import("./components/events/EventPopupModal").then(m => ({ default: m.EventPopupModal })));
const OnboardingFlow = lazyRetry(() => import("./components/guide/OnboardingFlow").then(m => ({ default: m.OnboardingFlow })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,          // 5 minutes — prevents excessive refetches
      gcTime: 10 * 60 * 1000,            // 10 minutes garbage collection
      refetchOnWindowFocus: false,        // Disable — was causing cascade refetches on every tab switch
      retry: 1,                           // Keep retries bounded during Supabase degradation
      refetchOnReconnect: false,          // Avoid cascade refetches when Supabase reconnects
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

  // Show loading only for auth — don't block on maintenance check
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  const isAdmin = profile?.role === "admin";
  if (user && profileStatus === 'ready' && !maintenanceLoading && isMaintenanceMode && !isAdmin) {
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
      <RealtimeProvider>
        <ResponsiveLayout>
          <Suspense fallback={<ModuleLoading />}>
            {children}
          </Suspense>
        </ResponsiveLayout>
      </RealtimeProvider>
    </ProtectedRoute>
  );
}

function ProtectedStandalone({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <RealtimeProvider>
        <Suspense fallback={<ModuleLoading />}>
          {children}
        </Suspense>
      </RealtimeProvider>
    </ProtectedRoute>
  );
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes — no RealtimeProvider, no auth */}
      <Route path="/auth" element={<LandingPage />} />
      <Route path="/reset-password" element={<Suspense fallback={<ModuleLoading />}><ResetPassword /></Suspense>} />

      {/* SEO landing pages */}
      <Route path="/logistics-service-brunei" element={<Suspense fallback={<ModuleLoading />}><LogisticsServiceBrunei /></Suspense>} />
      <Route path="/last-mile-delivery-brunei" element={<Suspense fallback={<ModuleLoading />}><LastMileDeliveryBrunei /></Suspense>} />
      <Route path="/fulfillment-service-brunei" element={<Suspense fallback={<ModuleLoading />}><FulfillmentServiceBrunei /></Suspense>} />
      <Route path="/delivery-management-system" element={<Suspense fallback={<ModuleLoading />}><DeliveryManagementSystem /></Suspense>} />
      <Route path="/logistics-company-brunei" element={<Suspense fallback={<ModuleLoading />}><LogisticsCompanyBrunei /></Suspense>} />
      <Route path="/courier-service-brunei" element={<Suspense fallback={<ModuleLoading />}><CourierServiceBrunei /></Suspense>} />
      <Route path="/same-day-delivery-brunei" element={<Suspense fallback={<ModuleLoading />}><SameDayDeliveryBrunei /></Suspense>} />
      <Route path="/ecommerce-delivery-brunei" element={<Suspense fallback={<ModuleLoading />}><EcommerceDeliveryBrunei /></Suspense>} />
      <Route path="/parcel-delivery-brunei" element={<Suspense fallback={<ModuleLoading />}><ParcelDeliveryBrunei /></Suspense>} />
      <Route path="/delivery-app-brunei" element={<Suspense fallback={<ModuleLoading />}><DeliveryAppBrunei /></Suspense>} />

      {/* Blog pages */}
      <Route path="/blog" element={<Suspense fallback={<ModuleLoading />}><BlogIndex /></Suspense>} />
      <Route path="/blog/:slug" element={<Suspense fallback={<ModuleLoading />}><BlogPost /></Suspense>} />

      <Route path="/" element={<ProtectedRoute><RealtimeProvider><Dashboard /></RealtimeProvider></ProtectedRoute>} />

      {/* Module routes — wrapped in RealtimeProvider for authenticated users only */}
      <Route path="/orders" element={<ProtectedModule><OrdersModule /></ProtectedModule>} />
      <Route path="/dispatch" element={<ProtectedModule><DispatchModule /></ProtectedModule>} />
      <Route path="/delivery" element={<Navigate to="/delivery/inbox" replace />} />
      <Route path="/delivery/:tab" element={<ProtectedModule><DeliveryModule /></ProtectedModule>} />
      <Route path="/performance" element={<ProtectedModule><PerformanceModule /></ProtectedModule>} />
      <Route path="/team" element={<ProtectedModule><TeamModule /></ProtectedModule>} />
      <Route path="/finance" element={<ProtectedModule><FinanceModule /></ProtectedModule>} />
      <Route path="/inventory" element={<ProtectedModule><InventoryModule /></ProtectedModule>} />
      <Route path="/system" element={<ProtectedModule><SystemModule /></ProtectedModule>} />

      {/* Standalone pages */}
      <Route path="/settings/profile" element={<ProtectedStandalone><ProfilePage /></ProtectedStandalone>} />
      <Route path="/settings/telegram" element={<ProtectedStandalone><TelegramUserSettings /></ProtectedStandalone>} />
      <Route path="/settings/telegram-logs" element={<ProtectedStandalone><TelegramLogsPage /></ProtectedStandalone>} />
      <Route path="/notifications" element={<ProtectedStandalone><NotificationCenter /></ProtectedStandalone>} />
      <Route path="/orders/not-found" element={<ProtectedStandalone><OrderNotFound /></ProtectedStandalone>} />
      <Route path="/admin/events/create" element={<ProtectedStandalone><EventCreate /></ProtectedStandalone>} />
      <Route path="/admin/events/:eventId" element={<ProtectedStandalone><EventDetail /></ProtectedStandalone>} />
      <Route path="/admin/events/:eventId/analytics" element={<ProtectedStandalone><EventDetail /></ProtectedStandalone>} />
      <Route path="/events" element={<ProtectedStandalone><UserEventsPage /></ProtectedStandalone>} />
      <Route path="/guide" element={<ProtectedStandalone><GuideCenterPage /></ProtectedStandalone>} />

      {/* Legacy redirects — keep old bookmarks working */}
      <Route path="/sales/booking" element={<Navigate to="/orders?tab=booking" replace />} />
      <Route path="/sales/ready" element={<Navigate to="/orders?tab=ready" replace />} />
      <Route path="/sales/cancelled" element={<Navigate to="/orders?tab=cancelled" replace />} />
      <Route path="/sales/action-required" element={<Navigate to="/orders?tab=action-required" replace />} />
      <Route path="/runner/delivered-orders" element={<Navigate to="/orders?tab=delivered" replace />} />
      <Route path="/runner/inbox" element={<Navigate to="/dispatch?tab=inbox" replace />} />
      <Route path="/admin/runner-inbox" element={<Navigate to="/dispatch?tab=inbox" replace />} />
      <Route path="/runner/inbound" element={<Navigate to="/inventory?tab=inbound" replace />} />
      <Route path="/runner/driver-inbox" element={<Navigate to="/dispatch?tab=driver-inbox" replace />} />
      <Route path="/runner/drivers" element={<Navigate to="/dispatch?tab=drivers" replace />} />
      <Route path="/runner/failed-orders" element={<Navigate to="/dispatch?tab=failed" replace />} />
      <Route path="/runner/driver-locations" element={<Navigate to="/dispatch?tab=map" replace />} />
      <Route path="/driver/inbox" element={<Navigate to="/delivery/inbox" replace />} />
      <Route path="/driver/route" element={<Navigate to="/delivery/inbox" replace />} />
      <Route path="/driver/pickups" element={<Navigate to="/delivery/pickups" replace />} />
      <Route path="/driver/returns" element={<Navigate to="/delivery/returns" replace />} />
      <Route path="/driver/stock" element={<Navigate to="/delivery/stock" replace />} />
      <Route path="/driver/analytics" element={<Navigate to="/delivery/analytics" replace />} />
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
      <Route path="/runner/cash-settlement" element={<Navigate to="/dispatch?tab=driver-stock" replace />} />
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
      <Route path="/admin/stock-audit" element={<Navigate to="/inventory?tab=balance" replace />} />
      <Route path="/admin/stock-integrity" element={<Navigate to="/inventory?tab=balance" replace />} />
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
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrandingProvider>
    <AuthProvider>
      <ThemeProvider>
        <LocationProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <RoleChangeBanner />
            <BrowserRouter>
              <AppRoutes />
              <Suspense fallback={null}>
                <EventPopupModal />
                <OnboardingFlow />
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </LocationProvider>
      </ThemeProvider>
    </AuthProvider>
    </BrandingProvider>
  </QueryClientProvider>
);

export default App;
