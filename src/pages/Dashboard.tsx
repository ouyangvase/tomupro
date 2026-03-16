import { useAuth } from '@/contexts/AuthContext';
import { useDevice } from '@/hooks/use-device';
import { AppLayout } from '@/components/layout/AppLayout';
import { MobileDashboard } from '@/pages/dashboard/MobileDashboard';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useRealtimeUpdates } from '@/hooks/useRealtimeUpdates';
import { RoleHeroBanner } from '@/components/dashboard/RoleHeroBanner';
import capybaraLoading from '@/assets/capybara-loading.png';

import { lazy, Suspense } from 'react';

const AdminDashboard = lazy(() => import('@/pages/dashboard/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const SalespersonDashboard = lazy(() => import('@/pages/dashboard/SalespersonDashboard').then(m => ({ default: m.SalespersonDashboard })));
const RunnerDashboard = lazy(() => import('@/pages/dashboard/RunnerDashboard').then(m => ({ default: m.RunnerDashboard })));
const ManagerDashboard = lazy(() => import('@/pages/dashboard/ManagerDashboard').then(m => ({ default: m.ManagerDashboard })));
const DriverDashboard = lazy(() => import('@/pages/dashboard/DriverDashboard').then(m => ({ default: m.DriverDashboard })));

function DashboardLoading() {
  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <img src={capybaraLoading} alt="Loading" className="h-32 w-32 object-contain drop-shadow-lg animate-fade-in" />
        <p className="text-muted-foreground text-lg font-medium">Loading your dashboard...</p>
        <p className="text-sm text-muted-foreground/60">Our capybara is gathering your data</p>
      </div>
    </AppLayout>
  );
}

export default function Dashboard() {
  const { profile, role, loading, profileStatus, profileError, retryProfile, resetSession } = useAuth();
  const { isDesktop } = useDevice();
  
  useRealtimeUpdates();

  if (profileStatus === 'loading' || profileStatus === 'idle') {
    return <DashboardLoading />;
  }

  if (profileStatus === 'error' || profileStatus === 'missing' || !role) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold">
            {profileStatus === 'missing' ? 'Account Setup Incomplete' : 'Failed to Load Dashboard'}
          </h2>
          <p className="text-muted-foreground text-center max-w-md">
            {profileError || (profileStatus === 'missing' 
              ? 'Your profile has not been set up. Please contact an administrator.'
              : 'We could not load your account information. Please try again.')}
          </p>
          <div className="flex gap-3 mt-4">
            <Button onClick={retryProfile} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
            <Button variant="outline" onClick={resetSession} className="gap-2">
              Sign Out
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!isDesktop) {
    return <MobileDashboard />;
  }

  const renderDashboard = () => {
    switch (role) {
      case 'driver': return <DriverDashboard />;
      case 'runner': return <RunnerDashboard />;
      case 'admin': return <AdminDashboard />;
      case 'manager': return <ManagerDashboard />;
      case 'salesperson': return <SalespersonDashboard />;
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <RoleHeroBanner />
        {renderDashboard()}
      </div>
    </AppLayout>
  );
}
