import { useState, useMemo, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useOrders } from '@/hooks/useOrders';
import { useAuth } from '@/contexts/AuthContext';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { useMyDrivers } from '@/hooks/useDrivers';
import { formatBND } from '@/lib/currency';
import { formatOrderItemsDisplay } from '@/lib/orderItemsDisplay';
import { format } from 'date-fns';
import type { Order, ReconciliationStatus } from '@/types/database';
import { CheckCircle, Search, Send, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BulkClaimDialog } from '@/components/runner/BulkClaimDialog';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const reconciliationColors: Record<ReconciliationStatus, string> = {
  NOT_CLAIMED: 'bg-muted text-muted-foreground',
  CLAIMED: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  SP_ACK_PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  ADMIN_ACK_PENDING: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  SETTLED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  DISPUTE: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export default function RunnerDeliveredOrders() {
  const { user } = useAuth();
  const { data: orders, isLoading } = useOrders({ runnerId: user?.id });
  const { data: userDirectory = [] } = useUserDirectory();
  const { data: myDrivers = [] } = useMyDrivers();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [areaFilter, setAreaFilter] = useState('all');
  const [driverFilter, setDriverFilter] = useState('all');
  const [salespersonFilter, setSalespersonFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkClaimOpen, setBulkClaimOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter to only delivered orders
  const deliveredOrders = useMemo(() => {
    if (!orders) return [];
    
    let filtered = orders.filter(order => 
      order.runner_status === 'DELIVERED' && order.status !== 'CANCELLED'
    );

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(order =>
        order.order_code.toLowerCase().includes(query) ||
        order.customer_name?.toLowerCase().includes(query) ||
        order.area?.toLowerCase().includes(query)
      );
    }

    // Apply area filter
    if (areaFilter !== 'all') {
      filtered = filtered.filter(order => order.area === areaFilter);
    }

    // Apply driver filter
    if (driverFilter !== 'all') {
      filtered = filtered.filter(order => order.driver_id === driverFilter);
    }

    // Apply salesperson filter
    if (salespersonFilter !== 'all') {
      filtered = filtered.filter(order => order.salesperson_id === salespersonFilter);
    }

    return filtered;
  }, [orders, searchQuery, areaFilter, driverFilter, salespersonFilter]);

  // Orders eligible for claiming (DELIVERED + NOT_CLAIMED)
  const claimableOrders = useMemo(() => {
    return deliveredOrders.filter(o => o.reconciliation_status === 'NOT_CLAIMED');
  }, [deliveredOrders]);

  // Selected orders that are claimable
  const selectedClaimableOrders = useMemo(() => {
    return claimableOrders.filter(o => selectedIds.has(o.id));
  }, [claimableOrders, selectedIds]);

  // Toggle single selection
  const toggleSelection = useCallback((orderId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  }, []);

  // Select all claimable orders
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === claimableOrders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(claimableOrders.map(o => o.id)));
    }
  }, [claimableOrders, selectedIds.size]);

  // Handle bulk claim submission
  const handleBulkClaimSubmit = async (exchangeRate: number, note?: string) => {
    if (selectedClaimableOrders.length === 0) return;
    
    setIsSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('submit-bulk-claim', {
        body: {
          orderIds: selectedClaimableOrders.map(o => o.id),
          exchangeRate,
          note,
        },
      });

      if (response.error) throw response.error;
      if (!response.data?.success) throw new Error(response.data?.error || 'Failed to submit claim');

      toast.success(`Successfully claimed ${selectedClaimableOrders.length} order(s)`);
      setSelectedIds(new Set());
      setBulkClaimOpen(false);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (error) {
      console.error('Bulk claim error:', error);
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle single order claim
  const handleSingleClaim = (order: Order) => {
    setSelectedIds(new Set([order.id]));
    setBulkClaimOpen(true);
  };

  // Extract unique areas for filter
  const areaOptions = useMemo(() => {
    if (!orders) return [];
    const uniqueAreas = [...new Set(orders.filter(o => o.runner_status === 'DELIVERED').map(o => o.area).filter(Boolean))];
    return uniqueAreas.sort().map(area => ({ label: area as string, value: area as string }));
  }, [orders]);

  // Salesperson filter options
  const salespersonOptions = useMemo(() => {
    const salespersons = userDirectory.filter(u => u.role === 'salesperson');
    return salespersons.map(sp => ({
      label: sp.display_name,
      value: sp.id,
    }));
  }, [userDirectory]);

  // Driver filter options
  const driverOptions = useMemo(() => {
    return myDrivers.map(d => ({
      label: d.driver?.display_name || 'Unknown',
      value: d.driver_id,
    }));
  }, [myDrivers]);

  const allClaimableSelected = claimableOrders.length > 0 && selectedIds.size === claimableOrders.length;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <CheckCircle className="h-8 w-8 text-green-600" />
          <div>
            <h1 className="text-2xl font-bold">Delivered Orders</h1>
            <p className="text-muted-foreground">
              View all orders that have been successfully delivered
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Delivered</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{deliveredOrders.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending Claim</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {deliveredOrders.filter(o => o.reconciliation_status === 'NOT_CLAIMED').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatBND(deliveredOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search order code, customer, area..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <Select value={areaFilter} onValueChange={setAreaFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Areas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Areas</SelectItem>
                  {areaOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={driverFilter} onValueChange={setDriverFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Drivers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Drivers</SelectItem>
                  {driverOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={salespersonFilter} onValueChange={setSalespersonFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Salespersons" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Salespersons</SelectItem>
                  {salespersonOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Action Bar */}
        {selectedClaimableOrders.length > 0 && (
          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="p-4 flex items-center justify-between">
              <span className="text-sm font-medium">
                {selectedClaimableOrders.length} order(s) selected • Total: {formatBND(selectedClaimableOrders.reduce((sum, o) => sum + o.total_amount, 0))}
              </span>
              <Button onClick={() => setBulkClaimOpen(true)} disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Bulk Claim ({selectedClaimableOrders.length})
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Orders Table */}
        <Card>
          <CardContent className="p-0">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={allClaimableSelected}
                        onCheckedChange={toggleSelectAll}
                        disabled={claimableOrders.length === 0}
                      />
                    </TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Order Ref</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Area</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Amount (BND)</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Salesperson</TableHead>
                    <TableHead>Delivered At</TableHead>
                    <TableHead>Reconciliation</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : deliveredOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                        No delivered orders found
                      </TableCell>
                    </TableRow>
                  ) : (
                    deliveredOrders.map((order) => {
                      const isClaimable = order.reconciliation_status === 'NOT_CLAIMED';
                      const isSelected = selectedIds.has(order.id);
                      const { displayText, hasError, errorMessage } = formatOrderItemsDisplay(order.order_items);

                      return (
                        <TableRow key={order.id} className={isSelected ? 'bg-primary/5' : ''}>
                          <TableCell>
                            {isClaimable ? (
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleSelection(order.id)}
                              />
                            ) : (
                              <Checkbox disabled checked={false} className="opacity-30" />
                            )}
                          </TableCell>
                          <TableCell>{format(new Date(order.order_date), 'dd MMM yyyy')}</TableCell>
                          <TableCell><span className="font-mono text-sm">{order.order_code}</span></TableCell>
                          <TableCell>{order.customer_name || '-'}</TableCell>
                          <TableCell><Badge variant="outline">{order.area || '-'}</Badge></TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {hasError ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="text-destructive cursor-help">{displayText}</span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{errorMessage}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <span className="font-medium">{displayText}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell><span className="font-medium">{formatBND(order.total_amount)}</span></TableCell>
                          <TableCell><Badge variant="outline">{order.payment_method}</Badge></TableCell>
                          <TableCell>{order.driver?.display_name || '-'}</TableCell>
                          <TableCell>{order.salesperson?.display_name || '-'}</TableCell>
                          <TableCell>
                            {order.delivered_at 
                              ? format(new Date(order.delivered_at), 'dd MMM yyyy HH:mm')
                              : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge className={reconciliationColors[order.reconciliation_status]}>
                              {order.reconciliation_status.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {isClaimable && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => handleSingleClaim(order)}
                              >
                                Claim
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Bulk Claim Dialog */}
        <BulkClaimDialog
          open={bulkClaimOpen}
          onOpenChange={setBulkClaimOpen}
          orders={selectedClaimableOrders}
          onSubmit={handleBulkClaimSubmit}
          isSubmitting={isSubmitting}
        />
      </div>
    </AppLayout>
  );
}
