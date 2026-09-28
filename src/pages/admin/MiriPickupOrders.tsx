import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw, Search, Settings2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { formatBND } from '@/lib/currency';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type MiriOrder = {
  id: string;
  order_code: string;
  external_order_id: string | null;
  external_tracking_number: string | null;
  tomu_seller_account_id: string | null;
  tomu_seller_account_code: string | null;
  sniper_seller_id: string | null;
  runner_id: string | null;
  actual_pickup_charge: number | null;
  settlement_base_amount: number | null;
  internal_settlement_offset: number | null;
  runner_payable_amount: number | null;
  seller_charge_amount: number | null;
  runner_status: string;
  content_verification_status: string | null;
  integration_status: string | null;
  integration_error: string | null;
  telegram_chat_id: string | null;
  telegram_message_id: string | null;
  created_at: string;
  delivered_at: string | null;
};

type ProfileRow = { id: string; display_name: string; email: string; role: string; runner_code?: string | null; can_receive_miri_pickup?: boolean };
type SellerAccount = { id: string; profile_id: string; account_code: string; sniper_seller_id: string; store_name: string; status: string; can_create_miri_pickup: boolean; phone_last_four?: string | null };

const money = (value: number | null) => formatBND(value ?? 0);

export default function MiriPickupOrders() {
  const { role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [skuStatus, setSkuStatus] = useState('ALL');
  const [sellerId, setSellerId] = useState('ALL');
  const [runnerId, setRunnerId] = useState('ALL');
  const [showSettings, setShowSettings] = useState(false);
  const [baseAmount, setBaseAmount] = useState('200.00');
  const [sellerForm, setSellerForm] = useState({ profileId: '', sniperSellerId: '' });
  const [sellerPickerSearch, setSellerPickerSearch] = useState('');
  const [sellerPickerOpen, setSellerPickerOpen] = useState(false);
  const [sellerAccountsSearch, setSellerAccountsSearch] = useState('');

  const ordersQuery = useQuery({
    queryKey: ['miri-pickup-orders'],
    enabled: role === 'admin',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_code, external_order_id, external_tracking_number, tomu_seller_account_id, tomu_seller_account_code, sniper_seller_id, runner_id, actual_pickup_charge, settlement_base_amount, internal_settlement_offset, runner_payable_amount, seller_charge_amount, runner_status, content_verification_status, integration_status, integration_error, telegram_chat_id, telegram_message_id, created_at, delivered_at')
        .eq('order_type', 'MIRI_INBOUND_PICKUP')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as MiriOrder[];
    },
  });

  const settingsQuery = useQuery({
    queryKey: ['miri-pickup-settings'],
    enabled: role === 'admin',
    queryFn: async () => {
      const [{ data: feature }, { data: settlement }, { data: profiles }, { data: sellers }] = await Promise.all([
        supabase.from('feature_settings').select('value_boolean').eq('scope_type', 'GLOBAL').eq('setting_key', 'SNIPER_MIRI_PICKUP_INTEGRATION_ENABLED').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('miri_pickup_settings').select('settlement_base_amount').maybeSingle(),
        supabase.from('profiles').select('id, display_name, email, role, runner_code, can_receive_miri_pickup').in('role', ['salesperson', 'manager', 'runner']).eq('is_active', true).order('display_name'),
        supabase.from('seller_accounts').select('id, profile_id, account_code, sniper_seller_id, store_name, status, can_create_miri_pickup, phone_last_four').order('store_name'),
      ]);
      return {
        enabled: Boolean(feature?.value_boolean),
        settlementBase: Number(settlement?.settlement_base_amount || 200),
        profiles: (profiles || []) as ProfileRow[],
        sellers: (sellers || []) as SellerAccount[],
      };
    },
  });

  const settings = settingsQuery.data;
  const profiles = useMemo(() => settings?.profiles || [], [settings?.profiles]);
  const sellers = useMemo(() => settings?.sellers || [], [settings?.sellers]);
  const sellerMap = useMemo(() => new Map<string, SellerAccount>(sellers.flatMap((seller): [string, SellerAccount][] => [[seller.id, seller], [seller.account_code, seller]])), [sellers]);
  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const selectedSellerProfile = profiles.find((profile) => profile.id === sellerForm.profileId);
  const selectedSellerAccount = sellers.find((seller) => seller.profile_id === sellerForm.profileId);
  const sellerPickerOptions = profiles
    .filter((profile) => profile.role !== 'runner')
    .filter((profile) => {
      const account = sellers.find((seller) => seller.profile_id === profile.id);
      const label = `${profile.display_name} ${profile.email} ${account?.account_code || ''} ${account?.store_name || ''}`.toLowerCase();
      return !sellerPickerSearch.trim() || label.includes(sellerPickerSearch.trim().toLowerCase());
    });
  const filteredSellerAccounts = sellers.filter((seller) => {
    const profile = profileMap.get(seller.profile_id);
    const term = sellerAccountsSearch.trim().toLowerCase();
    return !term || [seller.store_name, seller.account_code, seller.sniper_seller_id, seller.phone_last_four, profile?.display_name, profile?.email].some((value) => String(value || '').toLowerCase().includes(term));
  });

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (ordersQuery.data || []).filter((order) => {
      const seller = sellerMap.get(order.tomu_seller_account_id || '');
      const matchesSearch = !term || [order.order_code, order.external_order_id, order.external_tracking_number, order.sniper_seller_id, order.telegram_message_id].some((value) => String(value || '').toLowerCase().includes(term));
      const matchesStatus = status === 'ALL' || (status === 'DELIVERED' ? order.runner_status === 'DELIVERED' : status === 'ACTIVE' ? order.runner_status !== 'DELIVERED' : order.runner_status === status);
      const matchesSku = skuStatus === 'ALL' || order.content_verification_status === skuStatus;
      const matchesSeller = sellerId === 'ALL' || seller?.id === sellerId;
      const matchesRunner = runnerId === 'ALL' || order.runner_id === runnerId;
      return matchesSearch && matchesStatus && matchesSku && matchesSeller && matchesRunner;
    });
  }, [ordersQuery.data, runnerId, search, sellerId, sellerMap, skuStatus, status]);

  const toggleFeature = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase.from('feature_settings').update({ value_boolean: enabled, updated_at: new Date().toISOString() }).eq('scope_type', 'GLOBAL').eq('setting_key', 'SNIPER_MIRI_PICKUP_INTEGRATION_ENABLED');
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['miri-pickup-settings'] }),
  });

  const createSeller = useMutation({
    mutationFn: async () => {
      if (!sellerForm.profileId || !sellerForm.sniperSellerId || !selectedSellerProfile) throw new Error('Select a Tomu Seller and enter the Sniper seller ID');
      const payload = { profile_id: sellerForm.profileId, sniper_seller_id: sellerForm.sniperSellerId.trim(), store_name: selectedSellerAccount?.store_name || selectedSellerProfile.display_name, can_create_miri_pickup: true, status: 'ACTIVE' };
      const result = selectedSellerAccount
        ? await supabase.from('seller_accounts').update(payload).eq('id', selectedSellerAccount.id)
        : await supabase.from('seller_accounts').insert(payload);
      const { error } = result;
      if (error) throw error;
    },
    onSuccess: () => {
      setSellerForm({ profileId: '', sniperSellerId: '' });
      setSellerPickerSearch('');
      setSellerPickerOpen(false);
      queryClient.invalidateQueries({ queryKey: ['miri-pickup-settings'] });
      toast({ title: 'Seller account added' });
    },
    onError: (error: Error) => toast({ variant: 'destructive', title: 'Could not add seller', description: error.message }),
  });

  const toggleRunner = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from('profiles').update({ can_receive_miri_pickup: enabled }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['miri-pickup-settings'] }),
  });

  const updateBase = useMutation({
    mutationFn: async () => {
      const value = Number(baseAmount);
      if (!Number.isFinite(value) || value <= 0) throw new Error('Settlement base must be greater than zero');
      const { error } = await supabase.from('miri_pickup_settings').update({ settlement_base_amount: value, updated_at: new Date().toISOString() }).eq('id', true);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['miri-pickup-settings'] });
      toast({ title: 'Settlement base updated' });
    },
    onError: (error: Error) => toast({ variant: 'destructive', title: 'Could not update base', description: error.message }),
  });

  if (role !== 'admin') {
    return <Card className="p-6"><div className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" /> Admin access is required.</div></Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Miri Pickup Orders</h1>
          <p className="text-sm text-muted-foreground">MIRI INBOUND PICKUP · P200 settlement and SKU receiving</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={settings?.enabled ? 'default' : 'outline'}>{settings?.enabled ? 'Integration enabled' : 'Integration disabled'}</Badge>
          <Button variant="outline" size="sm" onClick={() => ordersQuery.refetch()}><RefreshCw className="mr-1.5 h-4 w-4" />Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => setShowSettings((value) => !value)}><Settings2 className="mr-1.5 h-4 w-4" />Settings</Button>
        </div>
      </div>

      {showSettings && (
        <Card className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <div><p className="font-semibold">Integration controls</p><p className="text-xs text-muted-foreground">Current settlement base: {money(settings?.settlementBase || 200)}. Change it only before the next batch.</p></div>
            <div className="flex items-center gap-2"><Input className="w-28" type="number" min="0.01" step="0.01" value={baseAmount} onChange={(event) => setBaseAmount(event.target.value)} /><Button size="sm" variant="outline" disabled={updateBase.isPending} onClick={() => updateBase.mutate()}>Save base</Button><Button size="sm" variant={settings?.enabled ? 'destructive' : 'default'} disabled={toggleFeature.isPending} onClick={() => toggleFeature.mutate(!settings?.enabled)}>{settings?.enabled ? 'Disable intake' : 'Enable intake'}</Button></div>
          </div>
          <div>
            <p className="mb-2 font-semibold">Seller account mapping</p>
            <div className="grid gap-2 md:grid-cols-[minmax(260px,1fr)_minmax(220px,1fr)_auto]">
              <div className="relative">
                {selectedSellerProfile && (
                  <p className="mb-1 text-xs text-muted-foreground">
                    Selected: <span className="font-medium text-foreground">{selectedSellerAccount?.store_name || selectedSellerProfile.display_name}</span>{' '}
                    <span>{selectedSellerAccount ? `— ${selectedSellerAccount.account_code}` : '— new Tomu account'}</span>
                  </p>
                )}
                <Input
                  placeholder="Search and select Tomu Seller"
                  value={sellerPickerSearch}
                  onFocus={() => setSellerPickerOpen(true)}
                  onChange={(event) => { setSellerPickerSearch(event.target.value); setSellerPickerOpen(true); }}
                />
                {sellerPickerOpen && (
                  <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-background p-1 shadow-lg">
                    {sellerPickerOptions.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-muted-foreground">No Tomu Seller found.</p>
                    ) : sellerPickerOptions.map((profile) => {
                      const account = sellers.find((seller) => seller.profile_id === profile.id);
                      return (
                        <button
                          key={profile.id}
                          type="button"
                          className="w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
                          onClick={() => {
                            setSellerForm((form) => ({ ...form, profileId: profile.id, sniperSellerId: account?.sniper_seller_id || '' }));
                            setSellerPickerSearch('');
                            setSellerPickerOpen(false);
                          }}
                        >
                          <span className="font-medium">{account?.store_name || profile.display_name}</span>
                          <span className="ml-2 text-muted-foreground">{account ? `— ${account.account_code}` : '— create account on save'}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <Input placeholder="Sniper seller ID (integration mapping)" value={sellerForm.sniperSellerId} onChange={(event) => setSellerForm((form) => ({ ...form, sniperSellerId: event.target.value }))} />
              <Button onClick={() => createSeller.mutate()} disabled={createSeller.isPending || !sellerForm.profileId}>{selectedSellerAccount ? 'Save mapping' : 'Add seller'}</Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Tomu account code, seller account ID, and store name are supplied by the selected Tomu Seller. Only the Sniper seller ID is an external mapping value.</p>
          </div>
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">Tomu Seller Accounts</p>
              <Input className="w-full md:w-80" placeholder="Search store, Tomu code, email, phone" value={sellerAccountsSearch} onChange={(event) => setSellerAccountsSearch(event.target.value)} />
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground"><tr>{['Store name', 'Tomu account code', 'Internal seller account ID', 'Email / phone', 'Status'].map((heading) => <th key={heading} className="px-3 py-2 font-medium">{heading}</th>)}</tr></thead>
                <tbody>
                  {filteredSellerAccounts.map((seller) => {
                    const profile = profileMap.get(seller.profile_id);
                    return <tr key={seller.id} className="border-t">
                      <td className="px-3 py-2 font-medium">{seller.store_name}</td>
                      <td className="px-3 py-2">{seller.account_code}</td>
                      <td className="px-3 py-2 font-mono text-xs">{seller.id}</td>
                      <td className="px-3 py-2 text-muted-foreground">{profile?.email || '-'}{seller.phone_last_four ? ` · ••••${seller.phone_last_four}` : ''}</td>
                      <td className="px-3 py-2"><Badge variant={seller.status === 'ACTIVE' ? 'default' : 'outline'}>{seller.status}</Badge></td>
                    </tr>;
                  })}
                </tbody>
              </table>
              {filteredSellerAccounts.length === 0 && <p className="p-4 text-sm text-muted-foreground">No Tomu Seller Accounts found.</p>}
            </div>
          </div>
          <div>
            <p className="mb-2 font-semibold">Runner access</p>
            <div className="flex flex-wrap gap-2">
              {profiles.filter((profile) => profile.role === 'runner').map((profile) => <Button key={profile.id} size="sm" variant={profile.can_receive_miri_pickup ? 'default' : 'outline'} onClick={() => toggleRunner.mutate({ id: profile.id, enabled: !profile.can_receive_miri_pickup })}>{profile.display_name} · {profile.can_receive_miri_pickup ? 'allowed' : 'blocked'}</Button>)}
            </div>
          </div>
        </Card>
      )}

      <Card className="grid gap-2 p-3 md:grid-cols-[minmax(220px,1fr)_150px_170px_170px_150px]">
        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search tracking, Sniper order, Telegram..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={sellerId} onChange={(event) => setSellerId(event.target.value)}><option value="ALL">All sellers</option>{sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.store_name}</option>)}</select>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={runnerId} onChange={(event) => setRunnerId(event.target.value)}><option value="ALL">All runners</option>{profiles.filter((profile) => profile.role === 'runner').map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name}</option>)}</select>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="DELIVERED">Delivered</option><option value="CANCELLED">Cancelled</option></select>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={skuStatus} onChange={(event) => setSkuStatus(event.target.value)}><option value="ALL">All SKU states</option><option value="SKU_PENDING">SKU pending</option><option value="SKU_CONFIRMED">SKU confirmed</option><option value="STOCKED">Stocked</option></select>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3"><p className="font-semibold">{filteredOrders.length} Miri order(s)</p><p className="text-xs text-muted-foreground">Internal offset is admin-only</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground"><tr>{['Tomu / Sniper order', 'Tracking', 'Seller', 'Runner', 'Charge', 'Base / offset', 'Status', 'SKU', 'Telegram', 'Created / delivered'].map((heading) => <th key={heading} className="px-4 py-3 font-medium">{heading}</th>)}</tr></thead>
            <tbody>
              {filteredOrders.map((order) => {
                const seller = sellerMap.get(order.tomu_seller_account_id || '');
                const runner = profileMap.get(order.runner_id || '');
                return <tr key={order.id} className="border-t align-top">
                  <td className="px-4 py-3"><p className="font-semibold">{order.order_code}</p><p className="text-xs text-muted-foreground">{order.external_order_id || order.sniper_seller_id || '-'}</p></td>
                  <td className="px-4 py-3 font-medium">{order.external_tracking_number || '-'}</td>
                  <td className="px-4 py-3">{seller?.store_name || order.tomu_seller_account_id || '-'}{seller && <p className="text-xs text-muted-foreground">{seller.account_code}</p>}</td>
                  <td className="px-4 py-3">{runner?.display_name || order.runner_id || '-'}</td>
                  <td className="px-4 py-3"><p className="font-semibold">{money(order.actual_pickup_charge)}</p><p className="text-xs text-muted-foreground">Runner {money(order.runner_payable_amount)} · Seller {money(order.seller_charge_amount)}</p></td>
                  <td className="px-4 py-3"><p>{money(order.settlement_base_amount)}</p><p className="text-xs text-muted-foreground">Offset {money(order.internal_settlement_offset)}</p></td>
                  <td className="px-4 py-3"><Badge variant={order.runner_status === 'DELIVERED' ? 'default' : 'outline'}>{order.runner_status}</Badge>{order.integration_error && <p className="mt-1 max-w-[160px] text-xs text-destructive">{order.integration_error}</p>}</td>
                  <td className="px-4 py-3"><Badge variant={order.content_verification_status === 'SKU_PENDING' ? 'outline' : 'default'}>{order.content_verification_status || '-'}</Badge></td>
                  <td className="px-4 py-3 text-xs">{order.telegram_chat_id || '-'}<br />msg {order.telegram_message_id || '-'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(order.created_at).toLocaleString()}<br />{order.delivered_at ? new Date(order.delivered_at).toLocaleString() : 'Not delivered'}</td>
                </tr>;
              })}
            </tbody>
          </table>
          {!ordersQuery.isLoading && filteredOrders.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">No Miri pickup orders found.</div>}
        </div>
      </Card>
      <p className="text-xs text-muted-foreground">SKU confirmation and Stock In are separate from delivery. Use the protected <code>confirm_miri_pickup_skus</code> workflow first, then <code>stock_miri_pickup_skus</code> after Warehouse receiving.</p>
    </div>
  );
}
