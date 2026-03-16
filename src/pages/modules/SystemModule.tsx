import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';

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
  { id: 'leaderboard', label: 'Leaderboard Settings' },
  { id: 'data-sharing', label: 'Data Sharing' },
  { id: 'reasons', label: 'Reasons' },
  { id: 'profile', label: 'Profile' },
];

export default function SystemModule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'stock-audit';

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="w-full justify-start bg-secondary/30 h-11">
            {tabs.map(tab => (
              <TabsTrigger key={tab.id} value={tab.id} className="text-xs md:text-sm px-3 md:px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <Suspense fallback={<Loading />}>
          <TabsContent value="stock-audit" className="mt-4"><StockIntegrityAudit embedded /></TabsContent>
          <TabsContent value="stock-rebuild" className="mt-4"><StockIntegrityScan embedded /></TabsContent>
          <TabsContent value="events" className="mt-4"><EventsAdmin embedded /></TabsContent>
          <TabsContent value="bindings" className="mt-4"><BindingsSettings embedded /></TabsContent>
          <TabsContent value="invite-codes" className="mt-4"><InviteCodesAdmin embedded /></TabsContent>
          <TabsContent value="commission" className="mt-4"><CommissionSettings embedded /></TabsContent>
          <TabsContent value="leaderboard" className="mt-4"><LeaderboardSettings embedded /></TabsContent>
          <TabsContent value="data-sharing" className="mt-4"><DataSharingAdmin embedded /></TabsContent>
          <TabsContent value="reasons" className="mt-4"><ReasonsSettings embedded /></TabsContent>
          <TabsContent value="profile" className="mt-4"><ProfilePage embedded /></TabsContent>
        </Suspense>
      </Tabs>
    </div>
  );
}
