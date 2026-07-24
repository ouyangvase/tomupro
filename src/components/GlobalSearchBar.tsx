import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { getOrderTabRoute } from '@/lib/orderNavigation';
import { useAuth } from '@/contexts/AuthContext';
import { useMyAssistantBinding } from '@/hooks/useRunnerAssistants';

interface SearchResult {
  id: string;
  order_code: string;
  customer_name: string | null;
  status: string;
  runner_status: string | null;
  driver_status?: string | null;
  runner_accept_status?: string | null;
  created_at: string;
}

interface GlobalSearchBarProps {
  variant?: 'desktop' | 'mobile';
  className?: string;
}

// Helper to determine display status - prioritize runner_status for final states
const getDisplayStatus = (order: SearchResult) => {
  if (order.runner_status === 'DELIVERED') return 'DELIVERED';
  if (order.runner_status === 'FAILED_DELIVERY') return 'FAILED';
  return order.status;
};

const normalizeOrderCodeQuery = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '');

const getRunnerSearchRoute = (order: SearchResult) => {
  const runnerStatus = (order.runner_status || '').toUpperCase();
  const driverStatus = (order.driver_status || '').toUpperCase();
  const tab = runnerStatus === 'DELIVERED'
    ? 'delivered'
    : runnerStatus === 'FAILED_DELIVERY' || driverStatus === 'DRIVER_FAILED'
      ? 'failed'
      : 'inbox';

  const params = new URLSearchParams({ tab, highlight: order.id });
  if (order.order_code) params.set('search', order.order_code);
  return `/dispatch?${params.toString()}`;
};

const getRoleAwareSearchRoute = (order: SearchResult, role?: string | null) => {
  if (role === 'runner' || role === 'runner_assistant') {
    return getRunnerSearchRoute(order);
  }

  if (role === 'driver') {
    const params = new URLSearchParams({ highlight: order.id });
    if (order.order_code) params.set('search', order.order_code);
    return `/delivery?${params.toString()}`;
  }

  const route = getOrderTabRoute(order.status, order.runner_status, order.id);
  if (!order.order_code) return route;
  return `${route}&search=${encodeURIComponent(order.order_code)}`;
};

export function GlobalSearchBar({ variant = 'desktop', className }: GlobalSearchBarProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: assistantBinding } = useMyAssistantBinding();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
        if (variant === 'desktop') {
          setIsOpen(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [variant]);

  // Search orders when query changes
  useEffect(() => {
    const searchOrders = async () => {
      const orderCodeQuery = normalizeOrderCodeQuery(query);
      if (orderCodeQuery.length < 2) {
        setResults([]);
        setShowDropdown(false);
        return;
      }

      setIsLoading(true);
      try {
        let ordersQuery = supabase
          .from('orders')
          .select('id, order_code, customer_name, status, runner_status, driver_status, runner_accept_status, created_at')
          .ilike('order_code', `${orderCodeQuery}%`)
          .order('created_at', { ascending: false })
          .limit(8);

        if (profile?.role === 'driver') {
          ordersQuery = ordersQuery.eq('driver_id', profile.id);
        } else if (profile?.role === 'runner') {
          ordersQuery = ordersQuery.eq('runner_id', profile.id);
        } else if (profile?.role === 'runner_assistant') {
          if (!assistantBinding?.runner_id) {
            setResults([]);
            setShowDropdown(true);
            return;
          }
          ordersQuery = ordersQuery.eq('runner_id', assistantBinding.runner_id);
        }

        const { data, error } = await ordersQuery;
        if (error) throw error;
        setResults((data || []).map((order) => ({
          id: order.id,
          order_code: order.order_code || '',
          customer_name: order.customer_name,
          status: order.status || '',
          runner_status: order.runner_status,
          driver_status: order.driver_status,
          runner_accept_status: order.runner_accept_status,
          created_at: order.created_at,
        })));
        setShowDropdown(true);
      } catch (error) {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    };

    const debounce = setTimeout(searchOrders, 300);
    return () => clearTimeout(debounce);
  }, [query, profile?.id, profile?.role, assistantBinding?.runner_id]);

  const handleResultClick = (order: SearchResult) => {
    setQuery('');
    setShowDropdown(false);
    setIsOpen(false);
    const route = getRoleAwareSearchRoute(order, profile?.role);
    navigate(route);
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setShowDropdown(false);
  };

  // Desktop variant - expandable search icon
  if (variant === 'desktop') {
    return (
      <div ref={containerRef} className={cn("relative", className)}>
        <div className={cn(
          "flex items-center transition-all duration-300",
          isOpen ? "w-72" : "w-10"
        )}>
          {isOpen ? (
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                type="text"
                placeholder="Search order code..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9 pr-8 h-9 rounded-xl bg-white/[0.04] border-white/10 text-foreground placeholder:text-muted-foreground"
                autoFocus
              />
              {query && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                  onClick={clearSearch}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl hover:bg-white/[0.06]"
              onClick={() => {
                setIsOpen(true);
                setTimeout(() => inputRef.current?.focus(), 100);
              }}
            >
              <Search className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Dropdown results */}
        {showDropdown && isOpen && (
          <div className="liquid-glass absolute top-full left-0 right-0 mt-2 rounded-2xl shadow-lg z-50 overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : results.length > 0 ? (
              <div className="max-h-64 overflow-y-auto">
                {results.map((order) => (
                  <button
                    key={order.id}
                    className="w-full px-3 py-2 text-left hover:bg-white/[0.06] transition-colors flex items-center justify-between"
                    onClick={() => handleResultClick(order)}
                  >
                    <div>
                      <p className="font-medium text-sm">{order.order_code}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {order.customer_name || 'No customer name'}
                      </p>
                    </div>
                    {(() => {
                      const displayStatus = getDisplayStatus(order);
                      return (
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          displayStatus === 'BOOKING' && "bg-blue-500/10 text-blue-500",
                          displayStatus === 'READY' && "bg-primary/10 text-primary",
                          displayStatus === 'DELIVERED' && "bg-[hsl(var(--status-success)/0.15)] text-[hsl(var(--status-success))]",
                          displayStatus === 'FAILED' && "bg-destructive/10 text-destructive",
                          displayStatus === 'CANCELLED' && "bg-destructive/10 text-destructive"
                        )}>
                          {displayStatus}
                        </span>
                      );
                    })()}
                  </button>
                ))}
              </div>
            ) : normalizeOrderCodeQuery(query).length >= 2 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                No orders found
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  // Mobile variant - full width search bar
  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search order code..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10 pr-10 h-12 bg-white/[0.04] border-white/10 rounded-xl text-foreground placeholder:text-muted-foreground"
        />
        {query ? (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
            onClick={clearSearch}
          >
            <X className="h-4 w-4" />
          </Button>
        ) : isLoading ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {/* Dropdown results */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-xl shadow-lg z-50 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : results.length > 0 ? (
            <div className="max-h-72 overflow-y-auto">
              {results.map((order) => (
                <button
                  key={order.id}
                  className="w-full px-4 py-3 text-left hover:bg-muted/50 active:bg-muted transition-colors flex items-center justify-between border-b border-border/50 last:border-b-0"
                  onClick={() => handleResultClick(order)}
                >
                  <div>
                    <p className="font-semibold">{order.order_code}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {order.customer_name || 'No customer name'}
                    </p>
                  </div>
                  {(() => {
                    const displayStatus = getDisplayStatus(order);
                    return (
                      <span className={cn(
                        "text-xs px-2.5 py-1 rounded-full font-medium",
                        displayStatus === 'BOOKING' && "bg-blue-500/10 text-blue-500",
                        displayStatus === 'READY' && "bg-primary/10 text-primary",
                        displayStatus === 'DELIVERED' && "bg-[hsl(var(--status-success)/0.15)] text-[hsl(var(--status-success))]",
                        displayStatus === 'FAILED' && "bg-destructive/10 text-destructive",
                        displayStatus === 'CANCELLED' && "bg-destructive/10 text-destructive"
                      )}>
                        {displayStatus}
                      </span>
                    );
                  })()}
                </button>
              ))}
            </div>
          ) : normalizeOrderCodeQuery(query).length >= 2 ? (
            <div className="py-6 text-center text-muted-foreground">
              No orders found for "{query}"
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
