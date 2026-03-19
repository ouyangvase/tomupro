import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { EmbeddedProvider } from '@/contexts/EmbeddedContext';

const StockIntegrityAudit = lazy(() => import('@/pages/admin/StockIntegrityAudit'));
const StockIntegrityScan = lazy(() => import('@/pages/admin/StockIntegrityScan'));
const EventsAdmin = lazy(() => import('@/pages/admin/EventsAdmin'));
const ProfilePage = lazy(() => import('@/pages/settings/ProfilePage'));
const BindingsSettings = lazy(() => import('@/pages/settings/BindingsSettings'));
const InviteCodesAdmin = lazy(() => import('@/pages/admin/InviteCodesAdmin'));
const CommissionSettings = lazy(() => import('@/pages/admin/CommissionSettings'));
const LeaderboardSettings = lazy(() => import('@/pages/admin/LeaderboardSettings'));
const DataSharingAdmin = lazy(() => import('@/pages/admin/DataSharingAdmin'));
const ReasonsSettings = lazy(() => import('@/pages/settings/ReasonsSettings'));
const IntegrationSettings = lazy(() => import('@/pages/admin/IntegrationSettings'));

const Loading = () => (
  <div className="flex items-center justify-center py-16">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

const tabs = [
  { id: 'stock-audit', label: 'Stock Audit' },
  { id: 'stock-rebuild', label: 'Stock Rebuild' },
  { id: 'events', label: 'Events' },
  { id: 'bindings', label: 'Bindings' },
  { id: 'invite-codes', label: 'Invite Codes' },
  { id: 'commission', label: 'Commission' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'data-sharing', label: 'Data Sharing' },
  { id: 'reasons', label: 'Reasons' },
  { id: 'profile', label: 'Profile' },
];

export default function SystemModule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'stock-audit';

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })}>
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="w-full justify-start bg-secondary/30 h-11">
            {tabs.map(t => (
              <TabsTrigger key={t.id} value={t.id} className="text-xs md:text-sm px-3 md:px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      <EmbeddedProvider>
        <Suspense fallback={<Loading />}>
          <div className="mt-4">
            {activeTab === 'stock-audit' && <StockIntegrityAudit />}
            {activeTab === 'stock-rebuild' && <StockIntegrityScan />}
            {activeTab === 'events' && <EventsAdmin />}
            {activeTab === 'bindings' && <BindingsSettings />}
            {activeTab === 'invite-codes' && <InviteCodesAdmin />}
            {activeTab === 'commission' && <CommissionSettings />}
            {activeTab === 'leaderboard' && <LeaderboardSettings />}
            {activeTab === 'data-sharing' && <DataSharingAdmin />}
            {activeTab === 'reasons' && <ReasonsSettings />}
            {activeTab === 'profile' && <ProfilePage />}
          </div>
        </Suspense>
      </EmbeddedProvider>
    </div>
  );
}
