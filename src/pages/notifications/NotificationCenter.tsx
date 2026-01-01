import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCheck, Bell, AlertTriangle, Filter } from 'lucide-react';
import { useNotifications, useMarkAsRead, useMarkAllAsRead, type Notification } from '@/hooks/useNotificationSystem';
import { formatDistanceToNow, format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function NotificationCenter() {
  const { data: notifications = [], isLoading } = useNotifications();
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();
  const navigate = useNavigate();
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const unreadNotifications = notifications.filter(n => !n.is_read);
  const highPriorityNotifications = notifications.filter(n => n.priority === 'HIGH');

  const filteredNotifications = notifications.filter(n => {
    if (typeFilter === 'all') return true;
    return n.type === typeFilter;
  });

  const notificationTypes = Array.from(new Set(notifications.map(n => n.type))).filter(Boolean);

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsRead.mutate(notification.id);
    }

    // Navigate to relevant entity
    if (notification.reference_type === 'order' && notification.reference_id) {
      navigate(`/sales/ready`);
    } else if (notification.reference_type === 'claim_batch' && notification.reference_id) {
      navigate(`/admin/claim-batches`);
    } else if (notification.reference_type === 'inbound' && notification.reference_id) {
      navigate(`/inbound/pending`);
    }
  };

  const getPriorityBadge = (priority?: string) => {
    switch (priority) {
      case 'HIGH':
        return <Badge variant="destructive">High</Badge>;
      case 'MEDIUM':
        return <Badge variant="secondary">Medium</Badge>;
      default:
        return <Badge variant="outline">Low</Badge>;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'DAILY_DIGEST':
        return <Bell className="h-4 w-4" />;
      case 'DISPUTE':
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const NotificationList = ({ items }: { items: Notification[] }) => (
    <div className="space-y-2">
      {items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No notifications
          </CardContent>
        </Card>
      ) : (
        items.map((notification) => (
          <Card
            key={notification.id}
            className={cn(
              "cursor-pointer hover:bg-muted/50 transition-colors",
              !notification.is_read && "border-primary/50 bg-primary/5"
            )}
            onClick={() => handleNotificationClick(notification)}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="mt-1">{getTypeIcon(notification.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className={cn(
                      "text-sm",
                      !notification.is_read && "font-semibold"
                    )}>
                      {notification.title}
                    </h4>
                    {getPriorityBadge(notification.priority)}
                    {!notification.is_read && (
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {notification.message}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span>{format(new Date(notification.created_at), 'PPp')}</span>
                    <span>{formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}</span>
                    {notification.type && <Badge variant="outline" className="text-xs">{notification.type}</Badge>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Notification Center</h1>
            <p className="text-muted-foreground">
              {unreadNotifications.length} unread notifications
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => markAllAsRead.mutate()}
            disabled={unreadNotifications.length === 0}
          >
            <CheckCheck className="h-4 w-4 mr-2" />
            Mark all as read
          </Button>
        </div>

        <Tabs defaultValue="all">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <TabsList>
              <TabsTrigger value="all">
                All ({notifications.length})
              </TabsTrigger>
              <TabsTrigger value="unread">
                Unread ({unreadNotifications.length})
              </TabsTrigger>
              <TabsTrigger value="high">
                High Priority ({highPriorityNotifications.length})
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {notificationTypes.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <ScrollArea className="h-[calc(100vh-280px)] mt-4">
            <TabsContent value="all" className="mt-0">
              <NotificationList items={filteredNotifications} />
            </TabsContent>
            <TabsContent value="unread" className="mt-0">
              <NotificationList items={unreadNotifications.filter(n => typeFilter === 'all' || n.type === typeFilter)} />
            </TabsContent>
            <TabsContent value="high" className="mt-0">
              <NotificationList items={highPriorityNotifications.filter(n => typeFilter === 'all' || n.type === typeFilter)} />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </div>
    </AppLayout>
  );
}
