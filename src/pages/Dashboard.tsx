import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { 
  Package, 
  ShoppingCart, 
  Truck, 
  FileCheck, 
  AlertTriangle, 
  BarChart3,
  CheckCircle,
  XCircle,
  Users,
  Receipt,
  PackageCheck,
  Inbox
} from 'lucide-react';
import { 
  useSalespersonStats, 
  useRunnerStats, 
  useAdminStats, 
  useRecentActivity 
} from '@/hooks/useDashboardStats';
import { formatDistanceToNow } from 'date-fns';

interface StatCardProps {
  label: string;
  value: number | undefined;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  href: string;
  isLoading: boolean;
}

function StatCard({ label, value, icon: Icon, color, href, isLoading }: StatCardProps) {
  const navigate = useNavigate();

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate(href)}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className={`h-5 w-5 ${color}`} />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-9 w-16" />
        ) : (
          <div className="text-3xl font-bold">{value ?? 0}</div>
        )}
      </CardContent>
    </Card>
  );
}

function SalespersonDashboard() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useSalespersonStats();
  const { data: activity, isLoading: activityLoading } = useRecentActivity();

  const statCards = [
    { label: 'Booking Orders', value: stats?.bookingOrders, icon: Package, color: 'text-chart-2', href: '/sales/booking' },
    { label: 'Ready Orders', value: stats?.readyOrders, icon: ShoppingCart, color: 'text-chart-1', href: '/sales/ready' },
    { label: 'Pending Delivery', value: stats?.pendingDelivery, icon: Truck, color: 'text-chart-3', href: '/sales/ready' },
    { label: 'Pending Reconciliation', value: stats?.pendingReconciliation, icon: FileCheck, color: 'text-chart-4', href: '/reconciliation/sp' },
    { label: 'Disputes', value: stats?.disputes, icon: AlertTriangle, color: 'text-destructive', href: '/disputes' },
    { label: 'Products', value: stats?.productsCount, icon: BarChart3, color: 'text-secondary', href: '/products' },
  ];

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat) => (
          <StatCard key={stat.label} {...stat} isLoading={isLoading} />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <button onClick={() => navigate('/sales/booking')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
              📋 Manage Booking Orders
            </button>
            <button onClick={() => navigate('/inbound/pending')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
              📦 Acknowledge Inbound
            </button>
            <button onClick={() => navigate('/reconciliation/sp')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
              ✅ Review Claims
            </button>
            <button onClick={() => navigate('/inventory')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
              🏭 View Stock Balance
            </button>
          </CardContent>
        </Card>

        <RecentActivityCard activity={activity} isLoading={activityLoading} />
      </div>
    </>
  );
}

function RunnerDashboard() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useRunnerStats();
  const { data: activity, isLoading: activityLoading } = useRecentActivity();

  const statCards = [
    { label: 'Assigned Jobs', value: stats?.assignedToday, icon: Inbox, color: 'text-chart-2', href: '/runner/inbox' },
    { label: 'Delivered Today', value: stats?.deliveredToday, icon: CheckCircle, color: 'text-chart-1', href: '/runner/inbox' },
    { label: 'Failed Today', value: stats?.failedToday, icon: XCircle, color: 'text-destructive', href: '/runner/inbox' },
    { label: 'Pending Claims', value: stats?.pendingClaims, icon: Receipt, color: 'text-chart-4', href: '/runner/inbox' },
  ];

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <StatCard key={stat.label} {...stat} isLoading={isLoading} />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <button onClick={() => navigate('/runner/inbox')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
              📥 View Assigned Orders
            </button>
            <button onClick={() => navigate('/runner/inbound')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
              📦 Create Inbound Shipment
            </button>
            <button onClick={() => navigate('/inventory')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
              🏭 View Stock Balance
            </button>
          </CardContent>
        </Card>

        <RecentActivityCard activity={activity} isLoading={activityLoading} />
      </div>
    </>
  );
}

function AdminDashboard() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useAdminStats();
  const { data: activity, isLoading: activityLoading } = useRecentActivity();

  const statCards = [
    { label: 'Booking Orders', value: stats?.bookingOrders, icon: Package, color: 'text-chart-2', href: '/sales/booking' },
    { label: 'Ready Orders', value: stats?.readyOrders, icon: ShoppingCart, color: 'text-chart-1', href: '/sales/ready' },
    { label: 'Pending Delivery', value: stats?.pendingDelivery, icon: Truck, color: 'text-chart-3', href: '/runner/inbox' },
    { label: 'Delivered', value: stats?.deliveredOrders, icon: CheckCircle, color: 'text-primary', href: '/reconciliation/admin' },
    { label: 'Disputes', value: stats?.disputes, icon: AlertTriangle, color: 'text-destructive', href: '/disputes' },
    { label: 'Products', value: stats?.productsCount, icon: BarChart3, color: 'text-secondary', href: '/products' },
    { label: 'Total Claims', value: stats?.totalClaims, icon: Receipt, color: 'text-chart-4', href: '/reconciliation/admin' },
    { label: 'Inbound Shipments', value: stats?.totalInbounds, icon: PackageCheck, color: 'text-chart-5', href: '/inbound/pending' },
    { label: 'Total Users', value: stats?.totalUsers, icon: Users, color: 'text-muted-foreground', href: '/settings/users' },
  ];

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-3">
        {statCards.map((stat) => (
          <StatCard key={stat.label} {...stat} isLoading={isLoading} />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <button onClick={() => navigate('/sales/booking')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
              📋 Manage All Orders
            </button>
            <button onClick={() => navigate('/reconciliation/admin')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
              ✅ Admin Reconciliation
            </button>
            <button onClick={() => navigate('/disputes')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
              ⚠️ Handle Disputes
            </button>
            <button onClick={() => navigate('/settings/users')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
              👥 Manage Users
            </button>
          </CardContent>
        </Card>

        <RecentActivityCard activity={activity} isLoading={activityLoading} />
      </div>
    </>
  );
}

interface ActivityItem {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  created_at: string;
  actor_id: string | null;
}

function RecentActivityCard({ activity, isLoading }: { activity: ActivityItem[] | undefined; isLoading: boolean }) {
  const getActionBadgeVariant = (action: string) => {
    if (action.includes('create') || action.includes('insert')) return 'default';
    if (action.includes('update')) return 'secondary';
    if (action.includes('delete')) return 'destructive';
    return 'outline';
  };

  const formatEntityType = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : activity && activity.length > 0 ? (
          <div className="space-y-3">
            {activity.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant={getActionBadgeVariant(item.action)} className="text-xs">
                    {item.action}
                  </Badge>
                  <span className="text-muted-foreground">
                    {formatEntityType(item.entity_type)}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No recent activity</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { profile, role } = useAuth();

  const renderDashboard = () => {
    switch (role) {
      case 'runner':
        return <RunnerDashboard />;
      case 'admin':
      case 'manager':
        return <AdminDashboard />;
      case 'salesperson':
      default:
        return <SalespersonDashboard />;
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Welcome back, {profile?.display_name}</h1>
          <p className="text-muted-foreground mt-1">
            Here's an overview of your operations
            <span className="text-xs ml-2">(auto-refreshes every 30s)</span>
          </p>
        </div>

        {renderDashboard()}
      </div>
    </AppLayout>
  );
}
