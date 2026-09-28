import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { subscribeToOrderRealtime } from '@/lib/orderRealtime';
import { cn } from '@/lib/utils';
import { getOrderTabRoute } from '@/lib/orderNavigation';
import { dedupeOrderSearchResults, normalizeOrderCodeSearch } from '@/lib/orderSearch';
import { resolveCurrentOrderState, type CurrentOrderFields, type CurrentOrderState } from '@/lib/orderLifecycle';
import { useAuth } from '@/contexts/AuthContext';

interface SearchResult extends CurrentOrderFields {
  id: string;
  order_code: string;
  customer_name: string | null;
  runner_id: string | null;
  runner_name: string | null;
  created_at: string;
  updated_at: string;
  currentState: CurrentOrderState;
}

interface GlobalSearchBarProps {
  variant?: 'desktop' | 'mobile';
  className?: string;
}

const normalizeOrderCodeQuery = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '');

const formatSearchDate = (value: string | null) => {
  if (!value) return null;
  try {
    return format(parseISO(value), 'dd MMM yyyy');
  } catch {
    return value;
  }
};

const getSearchSubstatus = (state: CurrentOrderState) => {
  const date = formatSearchDate(state.scheduledDate);
  return state.currentSubStatus && date ? `${state.currentSubStatus} · ${date}` : state.currentSubStatus;
};

const getRunnerSearchRoute = (order: SearchResult) => {
  const tab = order.currentState.destinationTab === 'delivered'
    ? 'delivered'
    : order.currentState.destinationTab === 'action-required'
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

  const route = getOrderTabRoute(order);
  if (!order.order_code) return route;
  return `${route}&search=${encodeURIComponent(order.order_code)}`;
};

export function GlobalSearchBar({ variant = 'desktop', className }: GlobalSearchBarProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRequestRef = useRef(0);
  const navigate = useNavigate();
  const { profile, profileStatus } = useAuth();

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
    const requestId = ++searchRequestRef.current;
    const searchOrders = async () => {
      const orderCodeQuery = normalizeOrderCodeQuery(query);
      if (orderCodeQuery.length < 2) {
        setResults([]);
        setShowDropdown(false);
        setSearchError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setSearchError(null);
      if (profileStatus !== 'ready' || !profile?.id || !profile.role) {
        setShowDropdown(true);
        if (profileStatus === 'error' || profileStatus === 'missing') {
          setSearchError('Search is unavailable until your account is ready.');
          setIsLoading(false);
        }
        return;
      }

      try {
        const { data, error } = await supabase.rpc('search_visible_orders', {
          p_query: query.trim(),
          p_limit: 20,
        });
        if (error) throw error;
        if (requestId !== searchRequestRef.current) return;
        const currentOrders = dedupeOrderSearchResults(data || []);
        setResults(currentOrders.map((order) => ({
          id: order.id,
          order_code: order.order_code || '',
          customer_name: order.customer_name,
          runner_id: order.runner_id,
          runner_name: order.runner_name,
          status: order.status,
          operational_status: order.operational_status,
          current_operational_state: order.current_operational_state,
          runner_status: order.runner_status,
          runner_review_status: order.runner_review_status,
          runner_final_outcome: order.runner_final_outcome,
          runner_comment: order.runner_comment,
          runner_failed_reason_id: order.runner_failed_reason_id,
          salesperson_action_required: order.salesperson_action_required,
          salesperson_action_type: order.salesperson_action_type,
          next_delivery_date: order.next_delivery_date,
          driver_next_delivery_date: order.driver_next_delivery_date,
          driver_failed_reason: order.driver_failed_reason,
          delivered_at: order.delivered_at,
          cancelled_at: order.cancelled_at,
          created_at: order.created_at,
          updated_at: order.updated_at,
          currentState: resolveCurrentOrderState(order),
        })));
        setShowDropdown(true);
      } catch (error) {
        if (requestId !== searchRequestRef.current) return;
        setResults([]);
        setSearchError(error instanceof Error ? error.message : 'Search failed. Please try again.');
        setShowDropdown(true);
      } finally {
        if (requestId === searchRequestRef.current) setIsLoading(false);
      }
    };

    const debounce = setTimeout(searchOrders, 300);
    return () => clearTimeout(debounce);
  }, [profile?.id, profile?.role, profileStatus, query, refreshVersion]);

  // Re-resolve an open search when the live order row changes. The status is
  // fetched again from orders; no search-index status is trusted.
  useEffect(() => {
    const orderCodeQuery = normalizeOrderCodeSearch(query);
    if (orderCodeQuery.length < 2 || !profile?.id) return;

    return subscribeToOrderRealtime({
      userId: profile.id,
      role: null,
      scope: 'search',
      onPayload: (payload) => {
        const newCode = normalizeOrderCodeSearch(String((payload.new as { order_code?: string }).order_code || ''));
        const oldCode = normalizeOrderCodeSearch(String((payload.old as { order_code?: string }).order_code || ''));
        if (newCode.startsWith(orderCodeQuery) || oldCode.startsWith(orderCodeQuery)) {
          setRefreshVersion((version) => version + 1);
        }
      },
    });
  }, [profile?.id, query]);

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
    setSearchError(null);
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
            ) : searchError ? (
              <div className="py-4 text-center text-sm text-destructive">{searchError}</div>
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
                      {profile?.role === 'runner_assistant' && order.runner_name && (
                        <p className="text-xs font-medium text-primary">Runner: {order.runner_name}</p>
                      )}
                    </div>
                    {(() => {
                      const displayStatus = order.currentState.currentStatus;
                      const substatus = getSearchSubstatus(order.currentState);
                      return (
                        <div className="flex flex-col items-end gap-1">
                          <span className={cn(
                            "text-xs px-2 py-0.5 rounded-full",
                            displayStatus === 'BOOKING' && "bg-blue-500/10 text-blue-500",
                            displayStatus === 'READY' && "bg-primary/10 text-primary",
                            displayStatus === 'DELIVERED' && "bg-[hsl(var(--status-success)/0.15)] text-[hsl(var(--status-success))]",
                            displayStatus === 'ACTION_REQUIRED' && "bg-amber-500/10 text-amber-600",
                            displayStatus === 'CANCELLED' && "bg-destructive/10 text-destructive"
                          )}>
                            {displayStatus}
                          </span>
                          {substatus && <span className="text-[11px] text-muted-foreground">{substatus}</span>}
                        </div>
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
          autoFocus
        />
        {isLoading ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-muted-foreground" />
        ) : query ? (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
            onClick={clearSearch}
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {/* Dropdown results */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-xl shadow-lg z-50 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : searchError ? (
            <div className="py-6 text-center text-sm text-destructive">{searchError}</div>
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
                    {profile?.role === 'runner_assistant' && order.runner_name && (
                      <p className="text-xs font-medium text-primary">Runner: {order.runner_name}</p>
                    )}
                  </div>
                  {(() => {
                      const displayStatus = order.currentState.currentStatus;
                      const substatus = getSearchSubstatus(order.currentState);
                      return (
                      <div className="flex flex-col items-end gap-1">
                        <span className={cn(
                          "text-xs px-2.5 py-1 rounded-full font-medium",
                          displayStatus === 'BOOKING' && "bg-blue-500/10 text-blue-500",
                          displayStatus === 'READY' && "bg-primary/10 text-primary",
                          displayStatus === 'DELIVERED' && "bg-[hsl(var(--status-success)/0.15)] text-[hsl(var(--status-success))]",
                          displayStatus === 'ACTION_REQUIRED' && "bg-amber-500/10 text-amber-600",
                          displayStatus === 'CANCELLED' && "bg-destructive/10 text-destructive"
                        )}>
                          {displayStatus}
                        </span>
                        {substatus && <span className="text-[11px] text-muted-foreground">{substatus}</span>}
                      </div>
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
