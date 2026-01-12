import { useState } from 'react';
import { Bell, Package as PackageIcon, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useAppNotifications,
  useUnreadAppNotificationCount,
  useMarkAppNotificationRead,
  useMarkAllAppNotificationsRead,
  type AppNotification,
} from '@/hooks/usePackages';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface AppNotificationBellProps {
  onPackageClick?: (packageId: string) => void;
}

export function AppNotificationBell({ onPackageClick }: AppNotificationBellProps) {
  const [open, setOpen] = useState(false);
  const { data: unreadCount = 0 } = useUnreadAppNotificationCount();
  const { data: notifications = [] } = useAppNotifications();
  const markAsRead = useMarkAppNotificationRead();
  const markAllAsRead = useMarkAllAppNotificationsRead();

  const handleNotificationClick = (notification: AppNotification) => {
    if (!notification.is_read) {
      markAsRead.mutate(notification.id);
    }

    if (notification.entity_type === 'package' && notification.entity_id && onPackageClick) {
      onPackageClick(notification.entity_id);
      setOpen(false);
    }
  };

  const handleMarkAllRead = () => {
    markAllAsRead.mutate();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h4 className="font-semibold">Package Notifications</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={markAllAsRead.isPending}
            >
              <CheckCheck className="h-4 w-4 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[350px]">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              No notifications
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  className={cn(
                    'w-full text-left p-4 hover:bg-muted/50 transition-colors',
                    !notification.is_read && 'bg-primary/5'
                  )}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start gap-3">
                    <PackageIcon className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p
                          className={cn(
                            'text-sm truncate',
                            !notification.is_read && 'font-semibold'
                          )}
                        >
                          {notification.title}
                        </p>
                        {!notification.is_read && (
                          <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                        )}
                      </div>
                      {notification.body && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {notification.body}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(notification.created_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
