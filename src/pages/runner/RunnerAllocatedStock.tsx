import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useDriverAllocatedStock } from '@/hooks/useDriverPickups';
import { useRunnerReturns, useAcknowledgeReturn } from '@/hooks/useDriverReturns';
import { useMyDrivers } from '@/hooks/useDrivers';
import { AppLayout } from '@/components/layout/AppLayout';
import { Package, RotateCcw, CheckCircle, Clock, User, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

interface AllocatedStockItem {
  driver_id: string;
  product_id: string;
  sku_name: string;
  sku_code: string | null;
  allocated_qty: number;
  delivered_qty: number;
  pending_qty: number;
}

export default function RunnerAllocatedStock() {
  const [selectedDriver, setSelectedDriver] = useState<string>('all');
  
  const { data: drivers, isLoading: loadingDrivers } = useMyDrivers();
  const { data: allocatedStock, isLoading: loadingStock } = useDriverAllocatedStock(
    selectedDriver === 'all' ? undefined : selectedDriver
  );
  const { data: returns, isLoading: loadingReturns } = useRunnerReturns();
  const acknowledgeReturn = useAcknowledgeReturn();

  const pendingReturns = returns?.filter(r => r.status === 'PENDING_RUNNER_ACK') || [];
  const acknowledgedReturns = returns?.filter(r => r.status === 'RUNNER_ACKED') || [];

  // Group allocated stock by driver
  const stockByDriver = (allocatedStock as AllocatedStockItem[] | undefined)?.reduce((acc, item) => {
    if (!acc[item.driver_id]) {
      acc[item.driver_id] = [];
    }
    acc[item.driver_id].push(item);
    return acc;
  }, {} as Record<string, AllocatedStockItem[]>) || {};

  // Get driver name by ID
  const getDriverName = (driverId: string) => {
    const driver = drivers?.find(d => d.driver_id === driverId);
    return driver?.driver?.display_name || 'Unknown Driver';
  };

  // Calculate totals
  const totalAllocated = (allocatedStock as AllocatedStockItem[] | undefined)?.reduce((sum, item) => sum + (item.allocated_qty || 0), 0) || 0;
  const totalDelivered = (allocatedStock as AllocatedStockItem[] | undefined)?.reduce((sum, item) => sum + (item.delivered_qty || 0), 0) || 0;
  const totalPending = (allocatedStock as AllocatedStockItem[] | undefined)?.reduce((sum, item) => sum + (item.pending_qty || 0), 0) || 0;

  const isLoading = loadingDrivers || loadingStock || loadingReturns;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Package className="h-6 w-6" />
              Allocated Stock
            </h1>
            <p className="text-muted-foreground">Track stock allocated to drivers and pending returns</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Allocated</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalAllocated}</div>
              <p className="text-xs text-muted-foreground">Items with drivers</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Delivered</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{totalDelivered}</div>
              <p className="text-xs text-muted-foreground">Successfully delivered</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending Delivery</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{totalPending}</div>
              <p className="text-xs text-muted-foreground">With drivers, not yet delivered</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="allocated">
          <TabsList>
            <TabsTrigger value="allocated">
              Allocated Stock
            </TabsTrigger>
            <TabsTrigger value="pending-returns">
              Pending Returns ({pendingReturns.length})
            </TabsTrigger>
            <TabsTrigger value="return-history">
              Return History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="allocated" className="space-y-4">
            {/* Driver Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Filter by driver:</span>
              <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All Drivers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Drivers</SelectItem>
                  {drivers?.map(d => (
                    <SelectItem key={d.driver_id} value={d.driver_id}>
                      {d.driver?.display_name || 'Unknown'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : selectedDriver === 'all' ? (
              // Show by driver groups
              Object.keys(stockByDriver).length > 0 ? (
                Object.entries(stockByDriver).map(([driverId, items]) => (
                  <Card key={driverId}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        {getDriverName(driverId)}
                      </CardTitle>
                      <CardDescription>
                        {items.length} product(s) allocated
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-right">Allocated</TableHead>
                            <TableHead className="text-right">Delivered</TableHead>
                            <TableHead className="text-right">Pending</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map(item => (
                            <TableRow key={`${driverId}-${item.product_id}`}>
                              <TableCell>
                                <div className="font-medium">{item.sku_name}</div>
                                {item.sku_code && (
                                  <div className="text-xs text-muted-foreground">{item.sku_code}</div>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge variant="secondary">{item.allocated_qty}</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
                                  {item.delivered_qty}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                                  {item.pending_qty}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No allocated stock found</p>
                    <p className="text-sm mt-1">Create pickups to allocate stock to drivers</p>
                  </CardContent>
                </Card>
              )
            ) : (
              // Single driver view
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    {getDriverName(selectedDriver)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {allocatedStock && allocatedStock.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Allocated</TableHead>
                          <TableHead className="text-right">Delivered</TableHead>
                          <TableHead className="text-right">Pending</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(allocatedStock as AllocatedStockItem[]).map(item => (
                          <TableRow key={item.product_id}>
                            <TableCell>
                              <div className="font-medium">{item.sku_name}</div>
                              {item.sku_code && (
                                <div className="text-xs text-muted-foreground">{item.sku_code}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary">{item.allocated_qty}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
                                {item.delivered_qty}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                                {item.pending_qty}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="py-8 text-center text-muted-foreground">
                      No allocated stock for this driver
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="pending-returns">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RotateCcw className="h-5 w-5" />
                  Pending Returns
                </CardTitle>
                <CardDescription>Returns awaiting your acknowledgement</CardDescription>
              </CardHeader>
              <CardContent>
                {pendingReturns.length > 0 ? (
                  <div className="space-y-4">
                    {pendingReturns.map(ret => (
                      <Card key={ret.id} className="border-amber-200 dark:border-amber-800">
                        <CardHeader className="pb-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <CardTitle className="text-base flex items-center gap-2">
                                <User className="h-4 w-4" />
                                {ret.driver?.display_name || 'Unknown Driver'}
                              </CardTitle>
                              <CardDescription>
                                Submitted {format(new Date(ret.created_at), 'dd MMM yyyy HH:mm')}
                              </CardDescription>
                            </div>
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                              <Clock className="h-3 w-3 mr-1" />
                              Pending
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {ret.notes && (
                            <p className="text-sm text-muted-foreground">Note: {ret.notes}</p>
                          )}
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead className="text-right">Qty</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {ret.items?.map(item => (
                                <TableRow key={item.id}>
                                  <TableCell>
                                    {item.product?.sku_name}
                                    {item.product?.sku_code && (
                                      <span className="text-xs text-muted-foreground ml-1">
                                        ({item.product.sku_code})
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Badge>{item.qty}</Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          <div className="flex justify-end">
                            <Button
                              onClick={() => acknowledgeReturn.mutate(ret.id)}
                              disabled={acknowledgeReturn.isPending}
                            >
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Acknowledge Return
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    <RotateCcw className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No pending returns</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="return-history">
            <Card>
              <CardHeader>
                <CardTitle>Return History</CardTitle>
                <CardDescription>Previously acknowledged returns</CardDescription>
              </CardHeader>
              <CardContent>
                {acknowledgedReturns.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Driver</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Acknowledged At</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {acknowledgedReturns.map(ret => (
                        <TableRow key={ret.id}>
                          <TableCell>
                            {format(new Date(ret.created_at), 'dd MMM yyyy')}
                          </TableCell>
                          <TableCell>{ret.driver?.display_name || 'Unknown'}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {ret.items?.map(item => (
                                <div key={item.id} className="text-sm">
                                  {item.product?.sku_name} x {item.qty}
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            {ret.acknowledged_at
                              ? format(new Date(ret.acknowledged_at), 'dd MMM HH:mm')
                              : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    No return history
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
