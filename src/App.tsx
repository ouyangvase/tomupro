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
import InventoryBalance from "./pages/InventoryBalance";
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
      <Route path="/sales/ready" element={<ProtectedRoute><BookingSales /></ProtectedRoute>} />
      <Route path="/sales/cancelled" element={<ProtectedRoute><BookingSales /></ProtectedRoute>} />
      <Route path="/runner/inbox" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/runner/inbound" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/reconciliation/sp" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/reconciliation/admin" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/disputes" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/inbound/pending" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/inventory" element={<ProtectedRoute><InventoryBalance /></ProtectedRoute>} />
      <Route path="/products" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
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
