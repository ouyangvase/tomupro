import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, ShoppingCart, Truck, FileCheck, AlertTriangle, BarChart3 } from 'lucide-react';

export default function Dashboard() {
  const { profile, role } = useAuth();
  const navigate = useNavigate();

  const stats = [
    { label: 'Booking Orders', value: '24', icon: Package, color: 'text-chart-2', href: '/sales/booking' },
    { label: 'Ready Orders', value: '18', icon: ShoppingCart, color: 'text-chart-1', href: '/sales/ready' },
    { label: 'Pending Delivery', value: '12', icon: Truck, color: 'text-chart-3', href: '/runner/inbox' },
    { label: 'Pending Reconciliation', value: '8', icon: FileCheck, color: 'text-chart-4', href: '/reconciliation/sp' },
    { label: 'Disputes', value: '3', icon: AlertTriangle, color: 'text-destructive', href: '/disputes' },
    { label: 'Products', value: '156', icon: BarChart3, color: 'text-secondary', href: '/products' },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Welcome back, {profile?.display_name}</h1>
          <p className="text-muted-foreground mt-1">Here's an overview of your operations</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {stats.map((stat) => (
            <Card 
              key={stat.label} 
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(stat.href)}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {role === 'salesperson' || role === 'admin' ? (
                <>
                  <button onClick={() => navigate('/sales/booking')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
                    📋 Manage Booking Orders
                  </button>
                  <button onClick={() => navigate('/inbound/pending')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
                    📦 Acknowledge Inbound
                  </button>
                  <button onClick={() => navigate('/reconciliation/sp')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
                    ✅ Review Claims
                  </button>
                </>
              ) : role === 'runner' ? (
                <>
                  <button onClick={() => navigate('/runner/inbox')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
                    📥 View Assigned Orders
                  </button>
                  <button onClick={() => navigate('/runner/inbound')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
                    📦 Create Inbound Shipment
                  </button>
                </>
              ) : null}
              <button onClick={() => navigate('/inventory')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
                🏭 View Stock Balance
              </button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">No recent activity</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
