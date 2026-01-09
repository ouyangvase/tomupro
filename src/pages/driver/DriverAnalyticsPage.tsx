import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverAnalytics } from '@/hooks/useDriverAnalytics';
import { AppLayout } from '@/components/layout/AppLayout';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, TrendingDown, Clock, MapPin, Package, Target, DollarSign } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

export default function DriverAnalyticsPage() {
  const { profile } = useAuth();
  const { data: analytics, isLoading } = useDriverAnalytics(profile?.id);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="text-center py-12 text-muted-foreground">Loading analytics...</div>
      </AppLayout>
    );
  }

  if (!analytics) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardContent className="py-12 text-center">
              <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">No Data Yet</h2>
              <p className="text-muted-foreground">
                Start delivering orders to see your performance analytics.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const weeklyChange = analytics.lastWeek.delivered > 0
    ? Math.round(((analytics.thisWeek.delivered - analytics.lastWeek.delivered) / analytics.lastWeek.delivered) * 100)
    : analytics.thisWeek.delivered > 0 ? 100 : 0;

  const monthlyChange = analytics.lastMonth.delivered > 0
    ? Math.round(((analytics.thisMonth.delivered - analytics.lastMonth.delivered) / analytics.lastMonth.delivered) * 100)
    : analytics.thisMonth.delivered > 0 ? 100 : 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6" />
            My Performance
          </h1>
          <p className="text-muted-foreground">Track your delivery performance and trends</p>
        </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold">{analytics.successRate}%</p>
              </div>
              <Target className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Order Value</p>
                <p className="text-2xl font-bold">BND {analytics.avgOrderValue}</p>
              </div>
              <DollarSign className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">This Week</p>
                <p className="text-2xl font-bold">{analytics.thisWeek.delivered}</p>
              </div>
              {weeklyChange >= 0 ? (
                <TrendingUp className="h-8 w-8 text-green-500" />
              ) : (
                <TrendingDown className="h-8 w-8 text-red-500" />
              )}
            </div>
            <p className={`text-xs mt-1 ${weeklyChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {weeklyChange >= 0 ? '+' : ''}{weeklyChange}% vs last week
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">This Month</p>
                <p className="text-2xl font-bold">{analytics.thisMonth.delivered}</p>
              </div>
              {monthlyChange >= 0 ? (
                <TrendingUp className="h-8 w-8 text-green-500" />
              ) : (
                <TrendingDown className="h-8 w-8 text-red-500" />
              )}
            </div>
            <p className={`text-xs mt-1 ${monthlyChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {monthlyChange >= 0 ? '+' : ''}{monthlyChange}% vs last month
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="weekly">
        <TabsList>
          <TabsTrigger value="weekly">Weekly Trend</TabsTrigger>
          <TabsTrigger value="monthly">Monthly Trend</TabsTrigger>
          <TabsTrigger value="areas">Area Coverage</TabsTrigger>
        </TabsList>

        <TabsContent value="weekly">
          <Card>
            <CardHeader>
              <CardTitle>This Week's Performance</CardTitle>
              <CardDescription>Daily delivery breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.weeklyTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(val) => format(parseISO(val), 'EEE')}
                    />
                    <YAxis />
                    <Tooltip 
                      labelFormatter={(val) => format(parseISO(val as string), 'EEEE, dd MMM')}
                    />
                    <Bar dataKey="delivered" fill="#10b981" name="Delivered" />
                    <Bar dataKey="failed" fill="#ef4444" name="Failed" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {analytics.thisWeek.avgDeliveryTimeMinutes && (
                <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  Average delivery time: {analytics.thisWeek.avgDeliveryTimeMinutes} minutes
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monthly">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Performance</CardTitle>
              <CardDescription>Daily trend for this month</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics.monthlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(val) => format(parseISO(val), 'd')}
                    />
                    <YAxis />
                    <Tooltip 
                      labelFormatter={(val) => format(parseISO(val as string), 'dd MMM yyyy')}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="delivered" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      name="Delivered"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="failed" 
                      stroke="#ef4444" 
                      strokeWidth={2}
                      name="Failed"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="areas">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Top Areas
                </CardTitle>
                <CardDescription>Your most active delivery areas</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics.topAreas}
                        dataKey="deliveredCount"
                        nameKey="area"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {analytics.topAreas.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Area Statistics</CardTitle>
                <CardDescription>Delivery performance by area</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {analytics.areaStats
                    .sort((a, b) => b.deliveredCount - a.deliveredCount)
                    .map(area => (
                      <div key={area.area} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                        <div>
                          <p className="font-medium text-sm">{area.area}</p>
                          <div className="flex gap-2 mt-1">
                            <Badge variant="outline" className="bg-green-50 text-green-700 text-xs">
                              {area.deliveredCount} delivered
                            </Badge>
                            {area.failedCount > 0 && (
                              <Badge variant="outline" className="bg-red-50 text-red-700 text-xs">
                                {area.failedCount} failed
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">BND {area.totalAmount.toLocaleString()}</p>
                          {area.avgDeliveryTime && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {area.avgDeliveryTime}m avg
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
      </div>
    </AppLayout>
  );
}
