import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  CheckCheck, Bell, AlertTriangle, Package, 
  Truck, DollarSign, Archive, Clock, CheckCircle, XCircle,
  Eye, UserPlus, Zap, Inbox, BarChart3, Settings,
  ChevronDown
} from 'lucide-react';
import { useNotifications, useMarkAsRead, useMarkAllAsRead, type Notification } from '@/hooks/useNotificationSystem';
import { formatDistanceToNow, format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import capybaraEmpty from '@/assets/capybara-empty.png';

type FilterTab = 'all' | 'unread' | 'action' | 'high' | 'orders' | 'finance' | 'system';

const FILTER_TABS: { value: FilterTab; label: string; icon: React.ElementType }[] = [
  { value: 'all', label: 'All', icon: Inbox },
  { value: 'unread', label: 'Unread', icon: Bell },
  { value: 'action', label: 'Action Required', icon: Zap },
  { value: 'high', label: 'High Priority', icon: AlertTriangle },
  { value: 'orders', label: 'Orders', icon: Package },
  { value: 'finance', label: 'Finance', icon: DollarSign },
  { value: 'system', label: 'System', icon: Settings },
];

const PAGE_SIZE = 20;

export default function NotificationCenter() {
  const { data: notifications = [], isLoading } = useNotifications();
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Derived stats
  const unreadCount = useMemo(() => notifications.filter(n => !n.is_read).length, [notifications]);
  const highPriorityCount = useMemo(() => notifications.filter(n => n.priority === 'HIGH').length, [notifications]);
  const actionRequiredCount = useMemo(() => notifications.filter(n => 
    n.type === 'CLAIM_SUBMITTED' || n.type === 'INBOUND_PENDING' || n.type === 'RUNNER_ASSIGNED'
  ).length, [notifications]);

  // Filtering
  const filteredNotifications = useMemo(() => {
    let filtered = notifications;
    switch (activeFilter) {
      case 'unread': filtered = notifications.filter(n => !n.is_read); break;
      case 'action': filtered = notifications.filter(n => 
        n.type === 'CLAIM_SUBMITTED' || n.type === 'INBOUND_PENDING' || n.type === 'RUNNER_ASSIGNED'
      ); break;
      case 'high': filtered = notifications.filter(n => n.priority === 'HIGH'); break;
      case 'orders': filtered = notifications.filter(n => n.entity_type === 'ORDER'); break;
      case 'finance': filtered = notifications.filter(n => 
        n.entity_type === 'CLAIM' || n.entity_type === 'CLAIM_BATCH'
      ); break;
      case 'system': filtered = notifications.filter(n => 
        n.type === 'DAILY_DIGEST' || n.type === 'SYSTEM' || (!n.entity_type)
      ); break;
    }
    return filtered;
  }, [notifications, activeFilter]);

  const visibleNotifications = filteredNotifications.slice(0, visibleCount);
  const hasMore = visibleCount < filteredNotifications.length;

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsRead.mutate(notification.id);
    }
    if (notification.reference_type === 'order' && notification.reference_id) {
      navigate(`/sales/ready`);
    } else if (notification.reference_type === 'claim_batch' && notification.reference_id) {
      navigate(`/admin/claim-batches`);
    } else if (notification.reference_type === 'inbound' && notification.reference_id) {
      navigate(`/inbound/pending`);
    }
  };

  const getActionButton = (notification: Notification) => {
    if (notification.type === 'CLAIM_SUBMITTED' || notification.type === 'CLAIM_ACKED') {
      return { label: 'Approve Claim', action: () => navigate('/admin/claim-batches') };
    }
    if (notification.type === 'RUNNER_ASSIGNED' || notification.status_to === 'ASSIGNED') {
      return { label: 'Assign Runner', action: () => navigate('/sales/ready') };
    }
    if (notification.type === 'INBOUND_PENDING') {
      return { label: 'View Inbound', action: () => navigate('/inbound/pending') };
    }
    if (notification.entity_type === 'ORDER' || notification.reference_type === 'order') {
      return { label: 'View Order', action: () => navigate('/sales/ready') };
    }
    return null;
  };

  const getTypeIcon = (type: string, statusTo?: string) => {
    if (statusTo === 'DELIVERED' || type === 'DELIVERED') return <CheckCircle className="h-5 w-5 text-green-500" />;
    if (statusTo === 'FAILED_DELIVERY' || type === 'FAILED_DELIVERY') return <XCircle className="h-5 w-5 text-destructive" />;
    if (statusTo === 'ASSIGNED' || type === 'RUNNER_ASSIGNED') return <Truck className="h-5 w-5 text-primary" />;
    
    if (type === 'CLAIM_SUBMITTED' || type === 'CLAIM_ACKED') return <DollarSign className="h-5 w-5 text-primary" />;
    if (type === 'INBOUND_PENDING' || type === 'INBOUND_ACKED') return <Archive className="h-5 w-5 text-muted-foreground" />;
    if (type === 'DAILY_DIGEST') return <Clock className="h-5 w-5 text-muted-foreground" />;
    return <Bell className="h-5 w-5 text-muted-foreground" />;
  };

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6 pb-12">
        {/* Page Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Notification Center</h1>
            <p className="text-muted-foreground mt-1">Your operations event feed</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllAsRead.mutate()}
            disabled={unreadCount === 0}
            className="rounded-full"
          >
            <CheckCheck className="h-4 w-4 mr-1.5" />
            Mark all read
          </Button>
        </div>

        {/* Summary Bar */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-border/60">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold tracking-tight">{notifications.length}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-destructive/20 bg-destructive/[0.03]">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold tracking-tight">{highPriorityCount}</p>
                <p className="text-xs text-muted-foreground">High Priority</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-primary/20 bg-primary/[0.03]">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold tracking-tight">{actionRequiredCount}</p>
                <p className="text-xs text-muted-foreground">Action Required</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Smart Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {FILTER_TABS.map(tab => {
            const isActive = activeFilter === tab.value;
            const Icon = tab.icon;
            const count = tab.value === 'all' ? notifications.length
              : tab.value === 'unread' ? unreadCount
              : tab.value === 'high' ? highPriorityCount
              : tab.value === 'action' ? actionRequiredCount
              : undefined;

            return (
              <button
                key={tab.value}
                onClick={() => { setActiveFilter(tab.value); setVisibleCount(PAGE_SIZE); }}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {count !== undefined && (
                  <span className={cn(
                    "text-xs ml-0.5",
                    isActive ? "text-primary-foreground/80" : "text-muted-foreground"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Event Feed */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : visibleNotifications.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 flex flex-col items-center text-center">
              <img src={capybaraEmpty} alt="No notifications" className="h-32 w-32 mb-4 opacity-80" />
              <h3 className="text-lg font-semibold">All clear!</h3>
              <p className="text-sm text-muted-foreground mt-1">No notifications match this filter.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {visibleNotifications.map((notification) => {
              const actionBtn = getActionButton(notification);
              const isHigh = notification.priority === 'HIGH';
              const isUnread = !notification.is_read;

              return (
                <Card
                  key={notification.id}
                  className={cn(
                    "group cursor-pointer transition-all hover:shadow-md",
                    isHigh && "border-destructive/30 bg-destructive/[0.02]",
                    isUnread && !isHigh && "border-primary/30 bg-primary/[0.02]"
                  )}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3.5">
                      {/* Icon */}
                      <div className={cn(
                        "h-10 w-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
                        isHigh ? "bg-destructive/10" : "bg-muted"
                      )}>
                        {getTypeIcon(notification.type, notification.status_to)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className={cn(
                            "text-sm leading-snug",
                            isUnread ? "font-semibold text-foreground" : "font-medium text-foreground/80"
                          )}>
                            {notification.title}
                          </h4>
                          {isUnread && <div className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                          {isHigh && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 rounded-full">
                              High
                            </Badge>
                          )}
                          {notification.priority === 'MEDIUM' && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 rounded-full">
                              Medium
                            </Badge>
                          )}
                        </div>

                        <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line line-clamp-2">
                          {notification.message}
                        </p>

                        {/* Metadata Row */}
                        <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(notification.created_at), 'MMM d, h:mm a')}
                          </span>
                          <span className="text-xs text-muted-foreground/60">
                            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                          </span>
                          {notification.entity_type && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 rounded-full font-mono">
                              {notification.entity_type}
                            </Badge>
                          )}
                          {notification.status_from && notification.status_to && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 rounded-full font-mono">
                              {notification.status_from} → {notification.status_to}
                            </Badge>
                          )}
                        </div>

                        {/* Action Button */}
                        {actionBtn && (
                          <div className="mt-3">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs rounded-full"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!notification.is_read) markAsRead.mutate(notification.id);
                                actionBtn.action();
                              }}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              {actionBtn.label}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Load More */}
            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-muted-foreground"
                  onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                >
                  <ChevronDown className="h-4 w-4 mr-1" />
                  Load more ({filteredNotifications.length - visibleCount} remaining)
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
