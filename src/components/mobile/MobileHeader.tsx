import { Bell, Settings, Search, X } from 'lucide-react';
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
    <header className="mobile-top-island sticky top-0 z-40 mx-3 mt-3 rounded-[2rem] p-1 safe-area-pt">
      {searchOpen ? (
        /* Search mode — full-width search bar */
        <div className="mobile-top-island-core flex items-center gap-2">
          <div className="flex-1">
            <GlobalSearchBar variant="mobile" />
          </div>
          <button
            onClick={() => setSearchOpen(false)}
            className="mobile-icon-button shrink-0"
            aria-label="Close search"
          >
            <X className="h-5 w-5 text-foreground" strokeWidth={1.8} />
          </button>
        </div>
      ) : (
        /* Default mode — avatar + actions */
        <div className="mobile-top-island-core flex items-center justify-between">
          {/* Left: Capybara avatar + greeting */}
          <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={handleProfileClick}>
            <div className="relative shrink-0">
              <div className="flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-full border border-[#d7c6aa] bg-[#fffaf3] shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),0_10px_24px_rgba(113,78,31,0.10)]">
                <img
                  src={roleCapybara[role || 'admin'] || tomuLogo}
                  alt="avatar"
                  className="h-11 w-11 object-contain"
                />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-white/70 bg-[#10182f] shadow-sm">
                <Settings className="h-3 w-3 text-white/70" strokeWidth={1.7} />
              </span>
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="text-xs font-medium text-[#7d7468]">Hello,</span>
              <span className="truncate text-lg font-black leading-tight text-[#171512]">
                {profile?.display_name?.split(' ')[0] || 'User'}
              </span>
            </div>
          </button>

          {/* Right: Search + Notification */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSearchOpen(true)}
              className="mobile-icon-button"
              aria-label="Search"
            >
              <Search className="h-5 w-5 text-foreground" strokeWidth={1.8} />
            </button>
            <button
              onClick={handleNotificationClick}
              className="mobile-icon-button relative"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5 text-foreground" strokeWidth={1.8} />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#e11d2f] px-1 text-[10px] font-bold text-white shadow-[0_6px_14px_rgba(225,29,47,0.32)]">
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
