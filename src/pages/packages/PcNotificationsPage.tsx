import { useState } from 'react';
import { format } from 'date-fns';
import { Bell, CheckCheck, Package, PackageOpen } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { usePcNotifications, useMarkPcNotificationRead, useMarkAllPcNotificationsRead } from '@/hooks/usePcNotifications';
import { PcPackageDetailDialog } from '@/components/packages/PcPackageDetailDialog';

function formatDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'MMM d, yyyy h:mm a');
  } catch {
    return dateStr;
  }
}

export default function PcNotificationsPage() {
  const { data: notifications = [], isLoading } = usePcNotifications();
  const markRead = useMarkPcNotificationRead();
  const markAllRead = useMarkAllPcNotificationsRead();
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const handleNotificationClick = (notification: typeof notifications[0]) => {
    if (!notification.read_at) {
      markRead.mutate(notification.id);
    }
    if (notification.pc_package_id) {
      setSelectedPackageId(notification.pc_package_id);
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bell className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Notifications</h1>
          {unreadCount > 0 && (
            <Badge variant="destructive">{unreadCount} unread</Badge>
          )}
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
          >
            <CheckCheck className="h-4 w-4 mr-1" />
            Mark all read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Bell className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Notifications</h3>
            <p className="text-muted-foreground">
              You don't have any notifications yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => (
            <Card
              key={notification.id}
              className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                !notification.read_at ? 'border-l-4 border-l-primary bg-primary/5' : ''
              }`}
              onClick={() => handleNotificationClick(notification)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    {notification.pc_package_id ? (
                      <PackageOpen className="h-5 w-5 text-primary" />
                    ) : (
                      <Bell className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className={`font-medium ${!notification.read_at ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {notification.title}
                      </h3>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(notification.created_at)}
                      </span>
                    </div>
                    {notification.body && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {notification.body}
                      </p>
                    )}
                    {notification.pc_package_id && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-primary">
                        <Package className="h-3 w-3" />
                        <span>Tap to view package</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PcPackageDetailDialog
        pcPackageId={selectedPackageId}
        open={!!selectedPackageId}
        onOpenChange={(open) => !open && setSelectedPackageId(null)}
      />
    </div>
  );
}
