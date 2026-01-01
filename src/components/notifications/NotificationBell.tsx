import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUnreadCount, useNotifications, useMarkAsRead } from '@/hooks/useNotificationSystem';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: unreadCount = 0 } = useUnreadCount();
  const { data: notifications = [] } = useNotifications();
  const markAsRead = useMarkAsRead();
  const navigate = useNavigate();

  const recentNotifications = notifications.slice(0, 5);

  const handleNotificationClick = (notification: typeof notifications[0]) => {
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
    
    setOpen(false);
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'HIGH': return 'bg-destructive/10 border-destructive/30';
      case 'MEDIUM': return 'bg-primary/10 border-primary/30';
      default: return 'bg-muted';
    }
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
          <h4 className="font-semibold">Notifications</h4>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => {
              navigate('/notifications');
              setOpen(false);
            }}
          >
            View all
          </Button>
        </div>
        <ScrollArea className="h-[300px]">
          {recentNotifications.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              No notifications
            </div>
          ) : (
            <div className="divide-y">
              {recentNotifications.map((notification) => (
                <button
                  key={notification.id}
                  className={cn(
                    "w-full text-left p-4 hover:bg-muted/50 transition-colors",
                    !notification.is_read && getPriorityColor(notification.priority)
                  )}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-sm truncate",
                        !notification.is_read && "font-semibold"
                      )}>
                        {notification.title}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    {!notification.is_read && (
                      <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />
                    )}
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
