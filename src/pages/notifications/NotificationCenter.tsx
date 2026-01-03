import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { 
  CheckCheck, Bell, AlertTriangle, Filter, Package, 
  Truck, DollarSign, Archive, Clock, CheckCircle, XCircle 
} from 'lucide-react';
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

const ENTITY_TYPES = [
  { value: 'all', label: 'All Types', icon: Bell },
  { value: 'ORDER', label: 'Orders', icon: Package },
  { value: 'CLAIM', label: 'Claims', icon: DollarSign },
  { value: 'CLAIM_BATCH', label: 'Claim Batches', icon: DollarSign },
  { value: 'INBOUND', label: 'Inbound', icon: Archive },
];

const STATUS_FILTERS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'FAILED_DELIVERY', label: 'Failed Delivery' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'CLAIMED', label: 'Claimed' },
];

export default function NotificationCenter() {
  const { data: notifications = [], isLoading } = useNotifications();
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();
  const navigate = useNavigate();
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const unreadNotifications = notifications.filter(n => !n.is_read);
  const highPriorityNotifications = notifications.filter(n => n.priority === 'HIGH');

  const filteredNotifications = notifications.filter(n => {
    const matchesEntity = entityFilter === 'all' || n.entity_type === entityFilter;
    const matchesStatus = statusFilter === 'all' || n.status_to === statusFilter || n.type === statusFilter;
    return matchesEntity && matchesStatus;
  });

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

  const getTypeIcon = (type: string, statusTo?: string) => {
    // Status-based icons
    if (statusTo === 'DELIVERED') {
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    }
    if (statusTo === 'FAILED_DELIVERY' || type === 'FAILED_DELIVERY') {
      return <XCircle className="h-4 w-4 text-destructive" />;
    }
    if (statusTo === 'ASSIGNED' || type === 'RUNNER_ASSIGNED') {
      return <Truck className="h-4 w-4 text-primary" />;
    }
    
    // Type-based icons
    switch (type) {
      case 'DAILY_DIGEST':
        return <Clock className="h-4 w-4" />;
      case 'DISPUTE':
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'DELIVERED':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'CLAIM_SUBMITTED':
      case 'CLAIM_ACKED':
        return <DollarSign className="h-4 w-4 text-primary" />;
      case 'INBOUND_PENDING':
      case 'INBOUND_ACKED':
        return <Archive className="h-4 w-4" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const getStatusTransitionBadge = (notification: Notification) => {
    if (notification.status_from && notification.status_to) {
      return (
        <Badge variant="outline" className="text-xs font-mono">
          {notification.status_from} → {notification.status_to}
        </Badge>
      );
    }
    return null;
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
                <div className="mt-1">{getTypeIcon(notification.type, notification.status_to)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
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
                  <p className="text-sm text-muted-foreground whitespace-pre-line">
                    {notification.message}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                    <span>{format(new Date(notification.created_at), 'PPp')}</span>
                    <span>{formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}</span>
                    {notification.entity_type && (
                      <Badge variant="outline" className="text-xs">{notification.entity_type}</Badge>
                    )}
                    {getStatusTransitionBadge(notification)}
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
              {unreadNotifications.length} unread · {highPriorityNotifications.length} high priority
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

            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={entityFilter} onValueChange={setEntityFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Entity type" />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <type.icon className="h-4 w-4" />
                        {type.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map(status => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
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
              <NotificationList items={unreadNotifications.filter(n => {
                const matchesEntity = entityFilter === 'all' || n.entity_type === entityFilter;
                const matchesStatus = statusFilter === 'all' || n.status_to === statusFilter;
                return matchesEntity && matchesStatus;
              })} />
            </TabsContent>
            <TabsContent value="high" className="mt-0">
              <NotificationList items={highPriorityNotifications.filter(n => {
                const matchesEntity = entityFilter === 'all' || n.entity_type === entityFilter;
                const matchesStatus = statusFilter === 'all' || n.status_to === statusFilter;
                return matchesEntity && matchesStatus;
              })} />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </div>
    </AppLayout>
  );
}