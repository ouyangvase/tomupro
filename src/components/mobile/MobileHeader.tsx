import { Bell, Settings } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useUnreadPcNotificationCount } from '@/hooks/usePcNotifications';

interface MobileHeaderProps {
  onNotificationClick?: () => void;
  onProfileClick?: () => void;
}

export function MobileHeader({ onNotificationClick, onProfileClick }: MobileHeaderProps) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { data: unreadCount = 0 } = useUnreadPcNotificationCount();
  
  const getInitials = (name?: string) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleNotificationClick = () => {
    if (onNotificationClick) {
      onNotificationClick();
    } else {
      navigate('/notifications');
    }
  };

  const handleProfileClick = () => {
    if (onProfileClick) {
      onProfileClick();
    } else {
      navigate('/settings/profile');
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-background border-b border-border/40 px-4 py-3 safe-area-top">
      <div className="flex items-center justify-between">
        {/* Left: Avatar + Greeting */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="h-10 w-10 ring-2 ring-primary/20">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {getInitials(profile?.display_name)}
              </AvatarFallback>
            </Avatar>
            <button 
              onClick={handleProfileClick}
              className="absolute -bottom-1 -right-1 h-5 w-5 bg-muted rounded-full flex items-center justify-center border border-border"
            >
              <Settings className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Hello,</span>
            <span className="font-semibold text-foreground leading-tight">
              {profile?.display_name?.split(' ')[0] || 'User'}
            </span>
          </div>
        </div>

        {/* Right: Notification Bell */}
        <button 
          onClick={handleNotificationClick}
          className="relative p-2 hover:bg-muted rounded-full transition-colors"
        >
          <Bell className="h-6 w-6 text-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-5 w-5 bg-destructive text-destructive-foreground text-xs font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
