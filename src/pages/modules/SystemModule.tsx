import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { EmbeddedProvider } from '@/contexts/EmbeddedContext';

const EventsAdmin = lazy(() => import('@/pages/admin/EventsAdmin'));
const ProfilePage = lazy(() => import('@/pages/settings/ProfilePage'));
const BindingsSettings = lazy(() => import('@/pages/settings/BindingsSettings'));
const InviteCodesAdmin = lazy(() => import('@/pages/admin/InviteCodesAdmin'));
const CommissionSettings = lazy(() => import('@/pages/admin/CommissionSettings'));
const LeaderboardSettings = lazy(() => import('@/pages/admin/LeaderboardSettings'));
const ReasonsSettings = lazy(() => import('@/pages/settings/ReasonsSettings'));
const AreaLearningSettings = lazy(() => import('@/pages/admin/AreaLearningSettings'));
const IntegrationSettings = lazy(() => import('@/pages/admin/IntegrationSettings'));
const BrandingSettings = lazy(() => import('@/pages/admin/BrandingSettings'));
const TelegramAdminSettings = lazy(() => import('@/pages/admin/TelegramAdminSettings'));
const GoogleSheetSettings = lazy(() => import('@/pages/admin/GoogleSheetSettings'));
const InterestLeadsAdmin = lazy(() => import('@/pages/admin/InterestLeadsAdmin'));

const Loading = () => (
  <div className="flex items-center justify-center py-16">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

const tabs = [
  { id: 'branding', label: 'Branding' },
  { id: 'events', label: 'Events' },
  { id: 'bindings', label: 'Bindings' },
  { id: 'invite-codes', label: 'Invite Codes' },
  { id: 'commission', label: 'Commission' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'reasons', label: 'Reasons' },
  { id: 'area-learning', label: 'Area Learning' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'google-sheet', label: 'Google Sheet' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'interest-leads', label: 'Interest Leads' },
  { id: 'profile', label: 'Profile' },
];

// Tabs that moved from System to Inventory — redirect old URLs
const REDIRECTED_TABS: Record<string, string> = {
  'stock-audit': '/inventory?tab=balance',
  'stock-rebuild': '/inventory?tab=balance',
  'data-sharing': '/inventory?tab=data-sharing',
};

export default function SystemModule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'branding';

  // Redirect old inventory-related tab URLs to Inventory module
  if (REDIRECTED_TABS[activeTab]) {
    return <Navigate to={REDIRECTED_TABS[activeTab]} replace />;
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })}>
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="h-11 w-max min-w-max justify-start bg-secondary/30">
            {tabs.map(t => (
              <TabsTrigger key={t.id} value={t.id} className="shrink-0 whitespace-nowrap px-3 text-xs md:px-4 md:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      <EmbeddedProvider>
        <Suspense fallback={<Loading />}>
          <div className="mt-4">
            {activeTab === 'branding' && <BrandingSettings />}
            {activeTab === 'events' && <EventsAdmin />}
            {activeTab === 'bindings' && <BindingsSettings />}
            {activeTab === 'invite-codes' && <InviteCodesAdmin />}
            {activeTab === 'commission' && <CommissionSettings />}
            {activeTab === 'leaderboard' && <LeaderboardSettings />}
            {activeTab === 'reasons' && <ReasonsSettings />}
            {activeTab === 'area-learning' && <AreaLearningSettings />}
            {activeTab === 'integrations' && <IntegrationSettings />}
            {activeTab === 'google-sheet' && <GoogleSheetSettings />}
            {activeTab === 'telegram' && <TelegramAdminSettings />}
            {activeTab === 'interest-leads' && <InterestLeadsAdmin />}
            {activeTab === 'profile' && <ProfilePage />}
          </div>
        </Suspense>
      </EmbeddedProvider>
    </div>
  );
}
