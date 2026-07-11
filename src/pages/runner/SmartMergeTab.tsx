import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Layers, Phone, MapPin, Package, Users, ChevronDown, ChevronUp, CheckCircle, AlertTriangle, Banknote, RefreshCw, XCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatBND } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/* ── Types ── */

interface SkuItem { sku: string; qty: number; }

interface SimpleOrder {
  id: string;
  order_code: string;
  order_date: string;
  customer_name: string;
  phone: string;
  address: string;
  area: string | null;
  total_amount: number;
  total_qty: number;
  runner_status: string;
  items_display: string;
}

interface MergeGroup {
  key: string;
  phone: string;
  phoneNorm: string;
  address: string;
  deliveryDate: string;
  customerName: string;
  orders: SimpleOrder[];
  totalOrders: number;
  totalAmount: number;
  combinedSkuList: SkuItem[];
}

/* ── Helpers ── */

function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('673') && digits.length > 7) return digits.slice(3);
  if (digits.startsWith('0') && digits.length > 1) return digits.slice(1);
  return digits;
}

function normalizeAddr(a: string | null | undefined): string {
  return (a || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/* ── Component ── */

export default function SmartMergeTab() {
  const { user, role } = useAuth();
  const isRunner = role === 'runner';

  // 1) Check if enabled
  const enabledQ = useQuery({
    queryKey: ['sm-enabled'],
    retry: 1,
    queryFn: async () => {
      const { data } = await supabase
        .from('integration_settings')
        .select('webhook_enabled')
        .eq('integration_name', 'smart_merge')
        .maybeSingle();
      return data?.webhook_enabled ?? true;
    },
  });

  // 2) Fetch orders — simple flat query, no nested joins
  const ordersQ = useQuery({
    queryKey: ['sm-orders', user?.id, role],
    retry: 1,
    enabled: !!user?.id,
    queryFn: async () => {
      // Fetch orders with items inline via a simple select
      let q = supabase
        .from('orders')
        .select('id, order_code, order_date, customer_name, phone, address, area, total_amount, total_qty, runner_status, order_items(sku_label, qty)')
        .eq('status', 'READY')
        .in('runner_status', ['ASSIGNED', 'TAKEN'])
        .order('created_at', { ascending: false })
        .limit(1000);

      if (isRunner && user?.id) {
        q = q.eq('runner_id', user.id);
      }

      const { data, error } = await q;
      if (error) throw new Error(`Orders query failed: ${error.message}`);

      return (data || []).map((o: any): SimpleOrder => ({
        id: o.id,
        order_code: o.order_code || '',
        order_date: o.order_date || '',
        customer_name: o.customer_name || '',
        phone: o.phone || '',
        address: o.address || '',
        area: o.area || null,
        total_amount: Number(o.total_amount) || 0,
        total_qty: Number(o.total_qty) || 0,
        runner_status: o.runner_status || '',
        items_display: (o.order_items || [])
          .map((i: any) => `${i.sku_label || '?'} x${i.qty || 0}`)
          .join(', ') || 'No items',
      }));
    },
  });

  // 3) Group into merge groups
  const mergeGroups = useMemo((): MergeGroup[] => {
    const orders = ordersQ.data;
    if (!orders || orders.length === 0) return [];

    const phoneMap = new Map<string, SimpleOrder[]>();
    for (const o of orders) {
      const norm = normalizePhone(o.phone);
      if (!norm) continue;
      const arr = phoneMap.get(norm) || [];
      arr.push(o);
      phoneMap.set(norm, arr);
    }

    const result: MergeGroup[] = [];
    for (const [phoneNorm, phoneOrders] of phoneMap) {
      if (phoneOrders.length < 2) continue;

      const subMap = new Map<string, SimpleOrder[]>();
      for (const o of phoneOrders) {
        const k = `${normalizeAddr(o.address)}||${o.order_date}`;
        const arr = subMap.get(k) || [];
        arr.push(o);
        subMap.set(k, arr);
      }

      for (const sub of subMap.values()) {
        if (sub.length < 2) continue;

        const skuMap = new Map<string, number>();
        for (const o of sub) {
          const parts = o.items_display.split(', ');
          for (const p of parts) {
            const m = p.match(/^(.+)\s+x(\d+)$/);
            if (m) skuMap.set(m[1], (skuMap.get(m[1]) || 0) + parseInt(m[2]));
          }
        }

        const first = sub[0];
        result.push({
          key: `${phoneNorm}||${normalizeAddr(first.address)}||${first.order_date}`,
          phone: first.phone,
          phoneNorm,
          address: first.address,
          deliveryDate: first.order_date,
          customerName: first.customer_name,
          orders: sub,
          totalOrders: sub.length,
          totalAmount: sub.reduce((s, o) => s + o.total_amount, 0),
          combinedSkuList: Array.from(skuMap, ([sku, qty]) => ({ sku, qty })).sort((a, b) => a.sku.localeCompare(b.sku)),
        });
      }
    }

    result.sort((a, b) => b.totalOrders - a.totalOrders);
    return result;
  }, [ordersQ.data]);

  const totalMergeOrders = mergeGroups.reduce((s, g) => s + g.totalOrders, 0);
  const totalMergeAmt = mergeGroups.reduce((s, g) => s + g.totalAmount, 0);

  // UI state
  const [showPopup, setShowPopup] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deliverGroup, setDeliverGroup] = useState<MergeGroup | null>(null);
  const [deliverState, setDeliverState] = useState<{ cur: number; total: number; failed: string[] } | null>(null);
  const [delivering, setDelivering] = useState(false);

  useEffect(() => {
    if (!ordersQ.isLoading && mergeGroups.length > 0) {
      const shown = sessionStorage.getItem('sm_popup');
      if (!shown) {
        setShowPopup(true);
        sessionStorage.setItem('sm_popup', '1');
      }
    }
  }, [ordersQ.isLoading, mergeGroups.length]);

  const toggleExpand = useCallback((key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const handleBulkDeliver = async (group: MergeGroup) => {
    setDelivering(true);
    const failed: string[] = [];
    for (let i = 0; i < group.orders.length; i++) {
      setDeliverState({ cur: i + 1, total: group.orders.length, failed: [...failed] });
      try {
        const { data: { user: u } } = await supabase.auth.getUser();
        if (!u) throw new Error('Auth');
        const { data, error } = await supabase.rpc('mark_order_delivered_fast', {
          p_order_id: group.orders[i].id,
          p_actor_id: u.id,
        });
        if (error) throw error;
        const r = data as any;
        if (r && !r.success && !r.error?.toLowerCase().includes('already')) throw new Error(r.error);
      } catch {
        failed.push(group.orders[i].order_code);
      }
    }
    setDeliverState({ cur: group.orders.length, total: group.orders.length, failed });
    setDelivering(false);
    if (failed.length === 0) {
      toast.success(`All ${group.orders.length} orders delivered`);
      setDeliverGroup(null);
      setDeliverState(null);
      ordersQ.refetch();
    } else {
      toast.error(`${failed.length} failed: ${failed.join(', ')}`);
    }
  };

  // ── RENDER ──

  // Error state — show the actual error
  if (ordersQ.error || enabledQ.error) {
    const errMsg = (ordersQ.error as Error)?.message || (enabledQ.error as Error)?.message || 'Unknown error';
    return (
      <div className="py-16 text-center space-y-4">
        <XCircle className="h-10 w-10 text-destructive mx-auto" />
        <h3 className="font-semibold text-destructive">Failed to load Smart Merge</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">{errMsg}</p>
        <Button variant="outline" size="sm" onClick={() => { ordersQ.refetch(); enabledQ.refetch(); }}>
          <RefreshCw className="h-4 w-4 mr-2" /> Retry
        </Button>
      </div>
    );
  }

  // Loading
  if (ordersQ.isLoading || enabledQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // Disabled
  if (enabledQ.data === false) {
    return (
      <div className="max-w-lg mx-auto mt-12">
        <Card>
          <CardContent className="py-12 flex flex-col items-center text-center space-y-4">
            <Layers className="h-10 w-10 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Smart Merge Disabled</h2>
            <p className="text-sm text-muted-foreground">Contact your admin to enable this feature.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Layers className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Smart Merge</h1>
            <p className="text-sm text-muted-foreground">
              {mergeGroups.length > 0
                ? `${mergeGroups.length} group${mergeGroups.length !== 1 ? 's' : ''} \u2022 ${totalMergeOrders} orders`
                : 'No mergeable deliveries found'}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => ordersQ.refetch()} className="gap-1.5">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Empty state */}
      {mergeGroups.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <Layers className="h-10 w-10 text-muted-foreground mx-auto" />
            <h3 className="font-semibold">No Merge Groups</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              No orders share the same phone, address, and date. All deliveries are unique.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Merge Cards */}
      {mergeGroups.map((group) => (
        <Card
          key={group.key}
          className="border-amber-300/50 dark:border-amber-700/50 bg-gradient-to-br from-amber-50/50 to-transparent dark:from-amber-950/20"
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/40">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                </div>
                <CardTitle className="text-sm font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  Merge Delivery — Same Customer
                </CardTitle>
              </div>
              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                {group.totalOrders} orders
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium">{group.phone}</span>
              </div>
              {group.customerName && (
                <div className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{group.customerName}</span>
                </div>
              )}
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <span className="text-muted-foreground">{group.address || 'No address'}</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-secondary/40 border border-border/40">
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" /> Combined Items:
              </p>
              <div className="space-y-1">
                {group.combinedSkuList.map((item) => (
                  <div key={item.sku} className="flex items-center justify-between text-sm">
                    <span className="truncate mr-2">{item.sku}</span>
                    <span className="font-medium shrink-0">&times;{item.qty}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-center">
              <p className="text-xs text-muted-foreground">Total COD</p>
              <p className="text-lg font-bold text-primary">{formatBND(group.totalAmount)}</p>
            </div>

            <Collapsible open={expanded.has(group.key)} onOpenChange={() => toggleExpand(group.key)}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full gap-1.5 text-muted-foreground">
                  {expanded.has(group.key)
                    ? <><ChevronUp className="h-4 w-4" /> Hide Orders</>
                    : <><ChevronDown className="h-4 w-4" /> Show Orders ({group.totalOrders})</>}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-2 mt-2">
                  {group.orders.map((order) => (
                    <div key={order.id} className="p-3 rounded-lg bg-card border border-border/50 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm font-medium">{order.order_code}</span>
                        <Badge variant="outline" className={cn('text-[10px]',
                          order.runner_status === 'TAKEN' && 'bg-primary/10 text-primary border-primary/30',
                          order.runner_status === 'ASSIGNED' && 'bg-blue-500/10 text-blue-600 border-blue-500/30',
                        )}>{order.runner_status}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span className="truncate mr-2">{order.items_display}</span>
                        <span className="font-medium text-foreground shrink-0">{formatBND(order.total_amount)}</span>
                      </div>
                      {order.area && <Badge variant="outline" className="text-[10px]">{order.area}</Badge>}
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="flex gap-3 pt-1">
              <Button className="flex-1 gap-1.5" onClick={() => setDeliverGroup(group)}>
                <CheckCircle className="h-4 w-4" /> Mark All Delivered
              </Button>
              <Button variant="outline" className="flex-1 gap-1.5"
                onClick={() => toast.info(`Collect ${formatBND(group.totalAmount)} from ${group.customerName || 'customer'}`, { duration: 5000 })}>
                <Banknote className="h-4 w-4" /> Collect Payment
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* First-visit popup */}
      <AlertDialog open={showPopup} onOpenChange={setShowPopup}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" /> Smart Merge Detected
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              You have <strong>{totalMergeOrders} orders</strong> from the same customer across{' '}
              <strong>{mergeGroups.length} group{mergeGroups.length !== 1 ? 's' : ''}</strong>.
              Deliver together and collect <strong className="text-primary">{formatBND(totalMergeAmt)}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Dismiss</AlertDialogCancel>
            <AlertDialogAction>View Groups</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deliver confirmation */}
      <AlertDialog open={!!deliverGroup} onOpenChange={(open) => { if (!open && !delivering) { setDeliverGroup(null); setDeliverState(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-primary" /> Mark All As Delivered
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deliverState
                ? delivering ? `Delivering ${deliverState.cur}/${deliverState.total}...` : deliverState.failed.length > 0 ? `Done with ${deliverState.failed.length} failure(s)` : `All ${deliverState.total} delivered!`
                : `Mark all ${deliverGroup?.totalOrders} orders for ${deliverGroup?.customerName || deliverGroup?.phone} as delivered?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deliverState && (
            <div className="px-6 pb-2">
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div className={cn('h-full rounded-full transition-all', deliverState.failed.length > 0 ? 'bg-amber-500' : 'bg-primary')}
                  style={{ width: `${(deliverState.cur / deliverState.total) * 100}%` }} />
              </div>
              {deliverState.failed.length > 0 && <p className="text-sm text-destructive mt-2">Failed: {deliverState.failed.join(', ')}</p>}
            </div>
          )}
          {!deliverState && deliverGroup && (
            <div className="px-6 space-y-2">
              {deliverGroup.orders.map((o) => (
                <div key={o.id} className="flex justify-between text-sm p-2 rounded bg-secondary/40">
                  <span className="font-mono">{o.order_code}</span>
                  <span className="font-medium">{formatBND(o.total_amount)}</span>
                </div>
              ))}
              <div className="flex justify-between font-semibold text-sm pt-2 border-t">
                <span>Total</span>
                <span className="text-primary">{formatBND(deliverGroup.totalAmount)}</span>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            {deliverState && !delivering ? (
              <AlertDialogAction onClick={() => { setDeliverGroup(null); setDeliverState(null); }}>Close</AlertDialogAction>
            ) : (
              <>
                <AlertDialogCancel disabled={delivering}>Cancel</AlertDialogCancel>
                <AlertDialogAction disabled={delivering} onClick={() => deliverGroup && handleBulkDeliver(deliverGroup)}>
                  {delivering && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Confirm Deliver All
                </AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
