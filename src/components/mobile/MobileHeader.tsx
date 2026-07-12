import { Bell, Settings, Search, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';
import { GlobalSearchBar } from '@/components/GlobalSearchBar';
import { useState } from 'react';
import capybaraAdmin from '@/assets/capybara-admin.png';
import capybaraRunner from '@/assets/capybara-runner.png';
import capybaraDriver from '@/assets/capybara-driver.png';
import capybaraSales from '@/assets/capybara-sales.png';
import capybaraManager from '@/assets/capybara-manager.png';
import tomuLogo from '@/assets/tomu-logo.png';

interface MobileHeaderProps {
  onNotificationClick?: () => void;
  onProfileClick?: () => void;
}

export function MobileHeader({ onNotificationClick, onProfileClick }: MobileHeaderProps) {
  const { profile, role } = useAuth();
  const navigate = useNavigate();
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const [searchOpen, setSearchOpen] = useState(false);
  
  const getInitials = (name?: string) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const roleCapybara: Record<string, string> = {
    admin: capybaraAdmin,
    runner: capybaraRunner,
    driver: capybaraDriver,
    salesperson: capybaraSales,
    manager: capybaraManager,
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
    <header className="liquid-glass overflow-visible sticky top-0 z-50 mx-3 mt-3 px-4 py-3 safe-area-pt rounded-2xl">
      {searchOpen ? (
        /* Search mode — full-width search bar */
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <GlobalSearchBar variant="mobile" />
          </div>
          <button
            onClick={() => setSearchOpen(false)}
            className="p-2.5 bg-white/[0.04] hover:bg-white/[0.07] rounded-full transition-colors border border-white/10 shadow-sm shrink-0"
          >
            <X className="h-5 w-5 text-foreground" />
          </button>
        </div>
      ) : (
        /* Default mode — avatar + actions */
        <div className="flex items-center justify-between">
          {/* Left: Capybara avatar + greeting */}
          <div className="flex items-center gap-3">
            <div className="relative" onClick={handleProfileClick}>
              <div className="h-12 w-12 rounded-full bg-primary/10 border-2 border-primary/20 overflow-hidden flex items-center justify-center">
                <img
                  src={roleCapybara[role || 'admin'] || tomuLogo}
                  alt="avatar"
                  className="h-10 w-10 object-contain"
                />
              </div>
              <button
                className="absolute -bottom-0.5 -right-0.5 h-5 w-5 bg-[#050D30] rounded-full flex items-center justify-center border border-white/10 shadow-sm"
              >
                <Settings className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground font-medium">Hello,</span>
              <span className="text-lg font-bold text-foreground leading-tight">
                {profile?.display_name?.split(' ')[0] || 'User'}
              </span>
            </div>
          </div>

          {/* Right: Search + Notification */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSearchOpen(true)}
              className="relative p-2.5 bg-white/[0.04] hover:bg-white/[0.07] rounded-full transition-colors border border-white/10 shadow-sm"
            >
              <Search className="h-5 w-5 text-foreground" />
            </button>
            <button
              onClick={handleNotificationClick}
              className="relative p-2.5 bg-white/[0.04] hover:bg-white/[0.07] rounded-full transition-colors border border-white/10 shadow-sm"
            >
              <Bell className="h-5 w-5 text-foreground" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
