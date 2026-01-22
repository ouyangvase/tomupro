import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LucideIcon, Home, Package, Truck, User, BarChart3, Inbox, ClipboardList, Users, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import type { AppRole } from '@/types/database';

interface NavItem {
  icon: LucideIcon;
  label: string;
  href: string;
  isCenter?: boolean;
}

const getNavItems = (role: AppRole | null): NavItem[] => {
  switch (role) {
    case 'salesperson':
      return [
        { icon: Home, label: 'Home', href: '/' },
        { icon: ClipboardList, label: 'Booking', href: '/sales/booking' },
        { icon: Package, label: 'Ready', href: '/sales/ready', isCenter: true },
        { icon: BarChart3, label: 'Stock', href: '/inventory' },
        { icon: User, label: 'Profile', href: '/settings/profile' },
      ];
    case 'manager':
      return [
        { icon: Home, label: 'Home', href: '/' },
        { icon: Users, label: 'Team', href: '/manager/oversight' },
        { icon: Package, label: 'Orders', href: '/sales/ready', isCenter: true },
        { icon: BarChart3, label: 'Stock', href: '/inventory' },
        { icon: User, label: 'Profile', href: '/settings/profile' },
      ];
    case 'runner':
      return [
        { icon: Home, label: 'Home', href: '/' },
        { icon: Inbox, label: 'Inbox', href: '/runner/inbox' },
        { icon: Truck, label: 'Deliver', href: '/runner/driver-inbox', isCenter: true },
        { icon: Package, label: 'Stock', href: '/runner/allocated-stock' },
        { icon: User, label: 'Profile', href: '/settings/profile' },
      ];
    case 'driver':
      return [
        { icon: Home, label: 'Home', href: '/' },
        { icon: Inbox, label: 'Inbox', href: '/driver/inbox' },
        { icon: Truck, label: 'Route', href: '/driver/route', isCenter: true },
        { icon: Package, label: 'Pickups', href: '/driver/pickups' },
        { icon: User, label: 'Profile', href: '/settings/profile' },
      ];
    case 'admin':
      return [
        { icon: Home, label: 'Home', href: '/' },
        { icon: Users, label: 'Users', href: '/settings/users' },
        { icon: Package, label: 'Orders', href: '/admin/runner-inbox', isCenter: true },
        { icon: Settings, label: 'Settings', href: '/settings/reasons' },
        { icon: User, label: 'Profile', href: '/settings/profile' },
      ];
    default:
      return [
        { icon: Home, label: 'Home', href: '/' },
        { icon: User, label: 'Profile', href: '/settings/profile' },
      ];
  }
};

export function BottomNavigation() {
  const { role } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  const navItems = getNavItems(role);

  // Don't show on auth page
  if (location.pathname === '/auth') {
    return null;
  }

  const isActive = (href: string) => {
    if (href === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(href);
  };

  return (
    <nav className="bottom-nav md:hidden">
      <div className="flex items-end justify-around px-2">
        {navItems.map((item) => (
          <button
            key={item.href}
            onClick={() => navigate(item.href)}
            className={cn(
              item.isCenter ? "bottom-nav-center" : "bottom-nav-item",
              !item.isCenter && isActive(item.href) && "active"
            )}
          >
            {item.isCenter ? (
              <div className="bottom-nav-center-btn">
                <item.icon />
              </div>
            ) : (
              <>
                <item.icon />
                <span>{item.label}</span>
              </>
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}
