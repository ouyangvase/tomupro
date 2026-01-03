import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

// Pages
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import BookingSales from "./pages/sales/BookingSales";
import ReadySales from "./pages/sales/ReadySales";
import CancelledSales from "./pages/sales/CancelledSales";
import InventoryBalance from "./pages/InventoryBalance";
import RunnerInbox from "./pages/runner/RunnerInbox";
import RunnerInbound from "./pages/runner/RunnerInbound";
import RunnerClaimBatches from "./pages/runner/RunnerClaimBatches";
import DriverManagement from "./pages/runner/DriverManagement";
import DriverPickups from "./pages/runner/DriverPickups";
import DriverInbox from "./pages/driver/DriverInbox";
import DriverPickupsPage from "./pages/driver/DriverPickupsPage";
import DriverReturnsPage from "./pages/driver/DriverReturnsPage";
import DriverRankingPage from "./pages/driver/DriverRankingPage";
import DriverReturns from "./pages/runner/DriverReturns";
import DriverRanking from "./pages/runner/DriverRanking";
import InboundPending from "./pages/inbound/InboundPending";
import ReconciliationSP from "./pages/reconciliation/ReconciliationSP";
import ReconciliationAdmin from "./pages/reconciliation/ReconciliationAdmin";
import ClaimBatchesAdmin from "./pages/admin/ClaimBatchesAdmin";
import ClaimBatchesHistory from "./pages/admin/ClaimBatchesHistory";
import AdminRunnerInbox from "./pages/admin/AdminRunnerInbox";
import DisputeCenter from "./pages/disputes/DisputeCenter";
import ClaimsHistory from "./pages/claims/ClaimsHistory";
import StockAdjustment from "./pages/inventory/StockAdjustment";
import ReasonsSettings from "./pages/settings/ReasonsSettings";
import UsersSettings from "./pages/settings/UsersSettings";
import BindingsSettings from "./pages/settings/BindingsSettings";
import ProfilePage from "./pages/settings/ProfilePage";
import ProductsPage from "./pages/products/ProductsPage";
import NotificationCenter from "./pages/notifications/NotificationCenter";
import ManagerOversight from "./pages/manager/ManagerOversight";
import AdminOverview from "./pages/admin/AdminOverview";
import RunnerDeliveryCharges from "./pages/runner/RunnerDeliveryCharges";
import DeliveryChargesAdmin from "./pages/admin/DeliveryChargesAdmin";
import DeliveryFeesReport from "./pages/admin/DeliveryFeesReport";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
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
    return <Navigate to="/auth" replace />;
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
      <Route path="/runner/inbox" element={<ProtectedRoute><RunnerInbox /></ProtectedRoute>} />
      <Route path="/runner/inbound" element={<ProtectedRoute><RunnerInbound /></ProtectedRoute>} />
      <Route path="/runner/claims" element={<ProtectedRoute><RunnerClaimBatches /></ProtectedRoute>} />
      <Route path="/runner/drivers" element={<ProtectedRoute><DriverManagement /></ProtectedRoute>} />
      <Route path="/runner/driver-pickups" element={<ProtectedRoute><DriverPickups /></ProtectedRoute>} />
      <Route path="/runner/driver-returns" element={<ProtectedRoute><DriverReturns /></ProtectedRoute>} />
      <Route path="/runner/driver-ranking" element={<ProtectedRoute><DriverRanking /></ProtectedRoute>} />
      <Route path="/driver/inbox" element={<ProtectedRoute><DriverInbox /></ProtectedRoute>} />
      <Route path="/driver/pickups" element={<ProtectedRoute><DriverPickupsPage /></ProtectedRoute>} />
      <Route path="/driver/returns" element={<ProtectedRoute><DriverReturnsPage /></ProtectedRoute>} />
      <Route path="/driver/ranking" element={<ProtectedRoute><DriverRankingPage /></ProtectedRoute>} />
      <Route path="/reconciliation/sp" element={<ProtectedRoute><ReconciliationSP /></ProtectedRoute>} />
      <Route path="/reconciliation/admin" element={<ProtectedRoute><ReconciliationAdmin /></ProtectedRoute>} />
      <Route path="/admin/claim-batches" element={<ProtectedRoute><ClaimBatchesAdmin /></ProtectedRoute>} />
      <Route path="/admin/claim-batches-history" element={<ProtectedRoute><ClaimBatchesHistory /></ProtectedRoute>} />
      <Route path="/admin/runner-inbox" element={<ProtectedRoute><AdminRunnerInbox /></ProtectedRoute>} />
      <Route path="/disputes" element={<ProtectedRoute><DisputeCenter /></ProtectedRoute>} />
      <Route path="/claims" element={<ProtectedRoute><ClaimsHistory /></ProtectedRoute>} />
      <Route path="/inbound/pending" element={<ProtectedRoute><InboundPending /></ProtectedRoute>} />
      <Route path="/inventory" element={<ProtectedRoute><InventoryBalance /></ProtectedRoute>} />
      <Route path="/inventory/adjustment" element={<ProtectedRoute><StockAdjustment /></ProtectedRoute>} />
      <Route path="/products" element={<ProtectedRoute><ProductsPage /></ProtectedRoute>} />
      <Route path="/settings/reasons" element={<ProtectedRoute><ReasonsSettings /></ProtectedRoute>} />
      <Route path="/settings/users" element={<ProtectedRoute><UsersSettings /></ProtectedRoute>} />
      <Route path="/settings/bindings" element={<ProtectedRoute><BindingsSettings /></ProtectedRoute>} />
      <Route path="/settings/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><NotificationCenter /></ProtectedRoute>} />
      <Route path="/manager/oversight" element={<ProtectedRoute><ManagerOversight /></ProtectedRoute>} />
      <Route path="/admin/overview" element={<ProtectedRoute><AdminOverview /></ProtectedRoute>} />
      <Route path="/runner/delivery-charges" element={<ProtectedRoute><RunnerDeliveryCharges /></ProtectedRoute>} />
      <Route path="/admin/delivery-charges" element={<ProtectedRoute><DeliveryChargesAdmin /></ProtectedRoute>} />
      <Route path="/admin/delivery-fees-report" element={<ProtectedRoute><DeliveryFeesReport /></ProtectedRoute>} />
      <Route path="/settings/*" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
