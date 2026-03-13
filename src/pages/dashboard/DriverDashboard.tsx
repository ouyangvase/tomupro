import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Inbox, Navigation, Target, Package, RotateCcw, ChevronRight, BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MissionSection } from '@/components/dashboard/MissionSection';
import { QuickActionTile } from '@/components/dashboard/QuickActionTile';

export function DriverDashboard() {
  const navigate = useNavigate();

  return (
    <div className="space-y-8">
      {/* Quick Navigation Cards */}
      <MissionSection icon={Inbox} title="Start Your Day">
        <div className="grid gap-4 md:grid-cols-3">
          <Card 
            className="cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5"
            onClick={() => navigate('/driver/inbox')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-primary">My Deliveries</p>
                  <p className="text-xs text-muted-foreground mt-1">View assigned orders</p>
                </div>
                <div className="p-3 rounded-2xl bg-primary/15 group-hover:bg-primary/25 transition-colors">
                  <Inbox className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card 
            className="cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group"
            onClick={() => navigate('/driver/route')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Optimized Route</p>
                  <p className="text-xs text-muted-foreground mt-1">Plan your deliveries</p>
                </div>
                <div className="p-3 rounded-2xl bg-secondary group-hover:bg-primary/15 transition-colors">
                  <Navigation className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card 
            className="cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group"
            onClick={() => navigate('/driver/analytics')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">My Analytics</p>
                  <p className="text-xs text-muted-foreground mt-1">Track performance</p>
                </div>
                <div className="p-3 rounded-2xl bg-secondary group-hover:bg-primary/15 transition-colors">
                  <Target className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </MissionSection>

      {/* Quick Actions */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-bold flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <BarChart3 className="h-4 w-4 text-primary" />
            </div>
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <QuickActionTile icon={Inbox} title="View My Deliveries" subtitle="Check assigned orders" href="/driver/inbox" />
          <QuickActionTile icon={Navigation} title="Plan Optimized Route" subtitle="Efficient delivery paths" href="/driver/route" />
          <QuickActionTile icon={Package} title="View Pickups" subtitle="Scheduled stock pickups" href="/driver/pickups" />
          <QuickActionTile icon={RotateCcw} title="Submit Returns" subtitle="Return unsold items" href="/driver/returns" />
        </CardContent>
      </Card>
    </div>
  );
}
