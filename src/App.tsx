import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LocationProvider } from "@/contexts/LocationContext";
import { RoleChangeBanner } from "@/components/RoleChangeBanner";
import { useDriverOnboarding } from "@/hooks/useDriverOnboarding";
import LocationPermissionGate from "@/components/driver/LocationPermissionGate";
import { ProfileGate } from "@/components/auth/ProfileGate";

// Pages
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import BookingSales from "./pages/sales/BookingSales";
import ReadySales from "./pages/sales/ReadySales";
import CancelledSales from "./pages/sales/CancelledSales";
import SalespersonActionInbox from "./pages/sales/SalespersonActionInbox";
import InventoryBalance from "./pages/InventoryBalance";
import RunnerInbox from "./pages/runner/RunnerInbox";
import RunnerInbound from "./pages/runner/RunnerInbound";
import RunnerClaimBatches from "./pages/runner/RunnerClaimBatches";
import RunnerFailedOrders from "./pages/runner/RunnerFailedOrders";
import DriverManagement from "./pages/runner/DriverManagement";
import DriverPickups from "./pages/runner/DriverPickups";
import RunnerDriverInbox from "./pages/runner/RunnerDriverInbox";
import RunnerAllocatedStock from "./pages/runner/RunnerAllocatedStock";
import DriverInbox from "./pages/driver/DriverInbox";
import DriverPickupsPage from "./pages/driver/DriverPickupsPage";
import DriverReturnsPage from "./pages/driver/DriverReturnsPage";
import DriverRankingPage from "./pages/driver/DriverRankingPage";
import DriverRoutePage from "./pages/driver/DriverRoutePage";
import DriverAnalyticsPage from "./pages/driver/DriverAnalyticsPage";
import DriverOnboarding from "./pages/driver/DriverOnboarding";
import DriverReturns from "./pages/runner/DriverReturns";
import DriverRanking from "./pages/runner/DriverRanking";
import DriverLocationsPage from "./pages/runner/DriverLocationsPage";
import InboundPending from "./pages/inbound/InboundPending";
import InboundHistory from "./pages/inbound/InboundHistory";

import ReconciliationAdmin from "./pages/reconciliation/ReconciliationAdmin";
import ClaimBatchesAdmin from "./pages/admin/ClaimBatchesAdmin";
import ClaimBatchesHistory from "./pages/admin/ClaimBatchesHistory";
import AdminRunnerInbox from "./pages/admin/AdminRunnerInbox";
import DisputeCenter from "./pages/disputes/DisputeCenter";

import StockAdjustment from "./pages/inventory/StockAdjustment";
import ReasonsSettings from "./pages/settings/ReasonsSettings";
import UsersSettings from "./pages/settings/UsersSettings";
import BindingsSettings from "./pages/settings/BindingsSettings";
import ProfilePage from "./pages/settings/ProfilePage";
import ProductsPage from "./pages/products/ProductsPage";
import NotificationCenter from "./pages/notifications/NotificationCenter";
import ManagerOversight from "./pages/manager/ManagerOversight";
import ManagerDashboard from "./pages/manager/ManagerDashboard";
import ManagerImpactBoard from "./pages/manager/ManagerImpactBoard";
import ManagerRankingBoard from "./pages/manager/ManagerRankingBoard";
import PendingStockApprovals from "./pages/manager/PendingStockApprovals";
import AdminOverview from "./pages/admin/AdminOverview";
import RunnerDeliveryCharges from "./pages/runner/RunnerDeliveryCharges";
import RunnerDeliveredOrders from "./pages/runner/RunnerDeliveredOrders";
import DeliveryChargesAdmin from "./pages/admin/DeliveryChargesAdmin";
import DeliveryFeesReport from "./pages/admin/DeliveryFeesReport";
import WarehouseManagement from "./pages/admin/WarehouseManagement";
import CommissionSettings from "./pages/admin/CommissionSettings";
import LeaderboardSettings from "./pages/admin/LeaderboardSettings";
import LeaderboardPage from "./pages/leaderboard/LeaderboardPage";
import InviteCodesAdmin from "./pages/admin/InviteCodesAdmin";
import DataSharingAdmin from "./pages/admin/DataSharingAdmin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, profileStatus, profileError, retryProfile, resetSession } = useAuth();
  const { needsOnboarding, checkingLink } = useDriverOnboarding();
  
  // Step 1: Auth is still initializing
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
  
  // Step 2: No user - redirect to auth
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Step 3: User exists but profile is not ready - show ProfileGate
  // This handles: loading, error, missing states with recovery actions
  if (profileStatus !== 'ready') {
    return (
      <ProfileGate
        profileStatus={profileStatus}
        profileError={profileError}
        onRetry={retryProfile}
        onResetSession={resetSession}
      >
        {children}
      </ProfileGate>
    );
  }

  // Step 4: Only check runner binding for drivers
  const isDriver = profile?.role === "driver";
  
  // Show loading while checking driver-runner link (only for drivers)
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

  // Show onboarding ONLY for drivers not linked to a runner
  if (isDriver && needsOnboarding) {
    return <DriverOnboarding />;
  }

  // Users with 'user' role can only access profile page
  if (profile?.role === "user") {
    return <Navigate to="/settings/profile" replace />;
  }
  
  // For drivers, wrap with location permission gate
  if (isDriver) {
    return <LocationPermissionGate>{children}</LocationPermissionGate>;
  }
  
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/sales/booking" element={<ProtectedRoute><BookingSales /></ProtectedRoute>} />
      <Route path="/sales/ready" element={<ProtectedRoute><ReadySales /></ProtectedRoute>} />
      <Route path="/sales/cancelled" element={<ProtectedRoute><CancelledSales /></ProtectedRoute>} />
      <Route path="/sales/action-required" element={<ProtectedRoute><SalespersonActionInbox /></ProtectedRoute>} />
      <Route path="/runner/inbox" element={<ProtectedRoute><RunnerInbox /></ProtectedRoute>} />
      <Route path="/runner/failed-orders" element={<ProtectedRoute><RunnerFailedOrders /></ProtectedRoute>} />
      <Route path="/runner/inbound" element={<ProtectedRoute><RunnerInbound /></ProtectedRoute>} />
      <Route path="/runner/claims" element={<ProtectedRoute><RunnerClaimBatches /></ProtectedRoute>} />
      <Route path="/runner/drivers" element={<ProtectedRoute><DriverManagement /></ProtectedRoute>} />
      <Route path="/runner/driver-pickups" element={<ProtectedRoute><DriverPickups /></ProtectedRoute>} />
      <Route path="/runner/driver-inbox" element={<ProtectedRoute><RunnerDriverInbox /></ProtectedRoute>} />
      <Route path="/runner/driver-returns" element={<ProtectedRoute><DriverReturns /></ProtectedRoute>} />
      <Route path="/runner/allocated-stock" element={<ProtectedRoute><RunnerAllocatedStock /></ProtectedRoute>} />
      <Route path="/runner/driver-ranking" element={<ProtectedRoute><DriverRanking /></ProtectedRoute>} />
      <Route path="/runner/driver-locations" element={<ProtectedRoute><DriverLocationsPage /></ProtectedRoute>} />
      <Route path="/driver/inbox" element={<ProtectedRoute><DriverInbox /></ProtectedRoute>} />
      <Route path="/driver/pickups" element={<ProtectedRoute><DriverPickupsPage /></ProtectedRoute>} />
      <Route path="/driver/returns" element={<ProtectedRoute><DriverReturnsPage /></ProtectedRoute>} />
      <Route path="/driver/ranking" element={<ProtectedRoute><DriverRankingPage /></ProtectedRoute>} />
      <Route path="/driver/route" element={<ProtectedRoute><DriverRoutePage /></ProtectedRoute>} />
      <Route path="/driver/analytics" element={<ProtectedRoute><DriverAnalyticsPage /></ProtectedRoute>} />
      <Route path="/reconciliation/admin" element={<ProtectedRoute><ReconciliationAdmin /></ProtectedRoute>} />
      <Route path="/admin/claim-batches" element={<ProtectedRoute><ClaimBatchesAdmin /></ProtectedRoute>} />
      <Route path="/admin/claim-batches-history" element={<ProtectedRoute><ClaimBatchesHistory /></ProtectedRoute>} />
      <Route path="/admin/runner-inbox" element={<ProtectedRoute><AdminRunnerInbox /></ProtectedRoute>} />
      <Route path="/disputes" element={<ProtectedRoute><DisputeCenter /></ProtectedRoute>} />
      
      <Route path="/inbound/pending" element={<ProtectedRoute><InboundPending /></ProtectedRoute>} />
      <Route path="/inbound/history" element={<ProtectedRoute><InboundHistory /></ProtectedRoute>} />
      <Route path="/inventory" element={<ProtectedRoute><InventoryBalance /></ProtectedRoute>} />
      <Route path="/inventory-balance" element={<ProtectedRoute><InventoryBalance /></ProtectedRoute>} />
      <Route path="/inventory/balance" element={<ProtectedRoute><InventoryBalance /></ProtectedRoute>} />
      <Route path="/inventory/adjustment" element={<ProtectedRoute><StockAdjustment /></ProtectedRoute>} />
      <Route path="/products" element={<ProtectedRoute><ProductsPage /></ProtectedRoute>} />
      <Route path="/settings/reasons" element={<ProtectedRoute><ReasonsSettings /></ProtectedRoute>} />
      <Route path="/settings/users" element={<ProtectedRoute><UsersSettings /></ProtectedRoute>} />
      <Route path="/settings/bindings" element={<ProtectedRoute><BindingsSettings /></ProtectedRoute>} />
      <Route path="/settings/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><NotificationCenter /></ProtectedRoute>} />
      <Route path="/manager/dashboard" element={<ProtectedRoute><ManagerDashboard /></ProtectedRoute>} />
      <Route path="/manager/impact-board" element={<ProtectedRoute><ManagerImpactBoard /></ProtectedRoute>} />
      <Route path="/manager/ranking-board" element={<ProtectedRoute><ManagerRankingBoard /></ProtectedRoute>} />
      <Route path="/manager/oversight" element={<ProtectedRoute><ManagerOversight /></ProtectedRoute>} />
      <Route path="/manager/pending-approvals" element={<ProtectedRoute><PendingStockApprovals /></ProtectedRoute>} />
      <Route path="/admin/overview" element={<ProtectedRoute><AdminOverview /></ProtectedRoute>} />
      <Route path="/runner/delivery-charges" element={<ProtectedRoute><RunnerDeliveryCharges /></ProtectedRoute>} />
      <Route path="/runner/delivered-orders" element={<ProtectedRoute><RunnerDeliveredOrders /></ProtectedRoute>} />
      <Route path="/admin/delivery-charges" element={<ProtectedRoute><DeliveryChargesAdmin /></ProtectedRoute>} />
      <Route path="/admin/delivery-fees-report" element={<ProtectedRoute><DeliveryFeesReport /></ProtectedRoute>} />
      <Route path="/admin/warehouses" element={<ProtectedRoute><WarehouseManagement /></ProtectedRoute>} />
      <Route path="/settings/commission" element={<ProtectedRoute><CommissionSettings /></ProtectedRoute>} />
      <Route path="/admin/leaderboard-settings" element={<ProtectedRoute><LeaderboardSettings /></ProtectedRoute>} />
      <Route path="/admin/invite-codes" element={<ProtectedRoute><InviteCodesAdmin /></ProtectedRoute>} />
      <Route path="/admin/data-sharing" element={<ProtectedRoute><DataSharingAdmin /></ProtectedRoute>} />
      <Route path="/leaderboard" element={<ProtectedRoute><LeaderboardPage /></ProtectedRoute>} />
      
      <Route path="/settings/*" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
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
              <AppRoutes />
            </BrowserRouter>
          </TooltipProvider>
        </LocationProvider>
      </ThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
