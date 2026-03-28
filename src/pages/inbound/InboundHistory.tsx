import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useInboundShipments } from '@/hooks/useInboundShipments';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useSalespersons } from '@/hooks/useUserDirectory';
import { useProducts } from '@/hooks/useProducts';
import type { InboundShipment, InboundItem, InboundStatus } from '@/types/database';
import { History, Calendar, ZoomIn, X, Image as ImageIcon } from 'lucide-react';
import { format, parseISO, isWithinInterval } from 'date-fns';

const statusColors: Record<InboundStatus, string> = {
  PENDING_SP_ACK: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  ACKNOWLEDGED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  DISPUTE: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

// Lightbox component for full-screen image viewing
interface LightboxProps {
  imageUrl: string;
  alt: string;
  uploadDate?: string;
  onClose: () => void;
}

function ImageLightbox({ imageUrl, alt, uploadDate, onClose }: LightboxProps) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[95vh] p-0 overflow-hidden">
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 z-10 bg-background/80 hover:bg-background"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
          <img
            src={imageUrl}
            alt={alt}
            className="w-full h-auto max-h-[80vh] object-contain"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.onerror = null;
              target.src = '/placeholder.svg';
            }}
          />
          {uploadDate && (
            <div className="p-4 bg-muted/50 border-t flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>Uploaded: {format(new Date(uploadDate), 'MMM d, yyyy h:mm a')}</span>
              </div>
              <div className="flex items-center gap-1">
                <ImageIcon className="h-4 w-4" />
                <span>{alt}</span>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function InboundHistory() {
  const { user, profile } = useAuth();
  const role = profile?.role;
  
  // Admin and Runner access only
  if (role !== 'admin' && role !== 'runner') {
    return (
      <AppLayout>
        <div className="p-6">
          <h1 className="text-2xl font-bold text-destructive">Access Denied</h1>
          <p className="text-muted-foreground mt-2">This page is only accessible to administrators and runners.</p>
        </div>
      </AppLayout>
    );
  }
  
  // Fetch all shipments (RLS handles visibility)
  const { data: allShipments, isLoading } = useInboundShipments();
  const { data: products } = useProducts();
  const { data: teamMembers = [] } = useTeamMembers();
  const { data: allSalespersons = [] } = useSalespersons();

  // Filters
  const [targetUserFilter, setTargetUserFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Detail dialog state
  const [selectedShipment, setSelectedShipment] = useState<InboundShipment | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; alt: string; date?: string } | null>(null);

  // Get available target users for filter dropdown
  const targetUserOptions = useMemo(() => {
    if (role === 'admin' || role === 'runner') {
      return allSalespersons;
    } else if (role === 'manager') {
      // Include self and team members
      const selfOption = user ? [{ id: user.id, display_name: 'My Inbound', email: user.email }] : [];
      return [...selfOption, ...teamMembers];
    } else {
      // Salesperson only sees their own
      return [];
    }
  }, [role, user, teamMembers, allSalespersons]);

  // Filter shipments
  const filteredShipments = useMemo(() => {
    if (!allShipments) return [];

    return allShipments.filter((shipment) => {
      // Status filter
      if (statusFilter !== 'all' && shipment.status !== statusFilter) {
        return false;
      }

      // Target user filter
      if (targetUserFilter !== 'all' && shipment.salesperson_id !== targetUserFilter) {
        return false;
      }

      // Date range filter
      if (dateFrom && dateTo) {
        const arrivalDate = parseISO(shipment.arrival_date);
        const fromDate = parseISO(dateFrom);
        const toDate = parseISO(dateTo);
        toDate.setHours(23, 59, 59, 999);

        if (!isWithinInterval(arrivalDate, { start: fromDate, end: toDate })) {
          return false;
        }
      } else if (dateFrom) {
        const arrivalDate = parseISO(shipment.arrival_date);
        const fromDate = parseISO(dateFrom);
        if (arrivalDate < fromDate) return false;
      } else if (dateTo) {
        const arrivalDate = parseISO(shipment.arrival_date);
        const toDate = parseISO(dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (arrivalDate > toDate) return false;
      }

      // SKU / search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const items = shipment.inbound_items || [];
        const trackingMatch = shipment.tracking_no?.toLowerCase().includes(q);
        const skuMatch = items.some(item => {
          const product = products?.find(p => p.id === item.product_id);
          const skuCode = product?.sku_code?.toLowerCase() || '';
          const skuName = product?.sku_name?.toLowerCase() || '';
          const tempLabel = item.temp_sku_label?.toLowerCase() || '';
          return skuCode.includes(q) || skuName.includes(q) || tempLabel.includes(q);
        });
        if (!trackingMatch && !skuMatch) return false;
      }

      return true;
    })
    // Default sort: acknowledged first (latest DESC), then non-acknowledged at bottom
    .sort((a, b) => {
      const aAck = a.acknowledged_at;
      const bAck = b.acknowledged_at;
      if (aAck && !bAck) return -1;
      if (!aAck && bAck) return 1;
      if (aAck && bAck) return new Date(bAck).getTime() - new Date(aAck).getTime();
      // Both null — sort by created_at DESC
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [allShipments, statusFilter, targetUserFilter, dateFrom, dateTo, searchQuery, products]);

  // Helper to get product info from product_id
  const getProductDisplay = (item: InboundItem) => {
    if (item.product_id) {
      const product = products?.find(p => p.id === item.product_id);
      if (product) {
        return `${product.sku_code || ''} / ${product.sku_name}`.replace(/^\s*\/\s*/, '');
      }
    }
    return item.temp_sku_label || 'Unknown SKU';
  };

  // Generate items preview for list display
  const getItemsPreview = (shipment: InboundShipment) => {
    const items = shipment.inbound_items || [];
    if (items.length === 0) return '-';
    
    const previews = items.map(item => {
      const skuDisplay = getProductDisplay(item);
      return `${skuDisplay} x${item.qty_reported}`;
    });
    
    if (previews.length <= 2) {
      return previews.join(', ');
    }
    return `${previews.slice(0, 2).join(', ')} +${previews.length - 2}`;
  };

  const handleOpenDetail = (shipment: InboundShipment) => {
    setSelectedShipment(shipment);
    setDetailDialogOpen(true);
  };

  const columns: Column<InboundShipment>[] = [
    {
      key: 'arrival_date',
      header: 'Arrival Date',
      sortable: true,
      render: (s) => new Date(s.arrival_date).toLocaleDateString(),
    },
    {
      key: 'acknowledged_at',
      header: 'Acknowledge Date',
      sortable: true,
      render: (s) => s.acknowledged_at
        ? format(new Date(s.acknowledged_at), 'MMM dd, yyyy HH:mm')
        : '-',
    },
    {
      key: 'tracking_no',
      header: 'Tracking No',
      sortable: true,
    },
    {
      key: 'target_user',
      header: 'Target User',
      render: (s) => s.salesperson?.display_name || s.salesperson?.email || '-',
    },
    {
      key: 'runner',
      header: 'Runner',
      render: (s) => s.runner?.display_name || s.runner?.email || '-',
    },
    {
      key: 'items_preview',
      header: 'Items',
      render: (s) => (
        <span className="text-sm text-muted-foreground max-w-[200px] truncate block">
          {getItemsPreview(s)}
        </span>
      ),
    },
    {
      key: 'total_qty',
      header: 'Total Qty',
      render: (s) => s.inbound_items?.reduce((sum, i) => sum + i.qty_reported, 0) || 0,
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) => (
        <Badge className={statusColors[s.status]}>
          {s.status.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (shipment) => (
        <Button size="sm" variant="outline" onClick={() => handleOpenDetail(shipment)}>
          View
        </Button>
      ),
    },
  ];

  // Calculate summary stats
  const totalShipments = filteredShipments.length;
  const totalItems = filteredShipments.reduce((sum, s) => sum + (s.inbound_items?.length || 0), 0);
  const totalQty = filteredShipments.reduce(
    (sum, s) => sum + (s.inbound_items?.reduce((iSum, i) => iSum + i.qty_reported, 0) || 0),
    0
  );

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <History className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Inbound History</h1>
            <p className="text-muted-foreground">View historical inbound shipments</p>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Search by SKU / Tracking */}
              <div className="space-y-2">
                <Label>Search</Label>
                <Input
                  placeholder="SKU code, name, tracking..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Status Filter */}
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="ACKNOWLEDGED">Acknowledged</SelectItem>
                    <SelectItem value="PENDING_SP_ACK">Pending</SelectItem>
                    <SelectItem value="DISPUTE">Disputed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Target User Filter */}
              {targetUserOptions.length > 0 && (
                <div className="space-y-2">
                  <Label>Target User</Label>
                  <Select value={targetUserFilter} onValueChange={setTargetUserFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Users</SelectItem>
                      {targetUserOptions.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.display_name || u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Date From */}
              <div className="space-y-2">
                <Label>From Date</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>

              {/* Date To */}
              <div className="space-y-2">
                <Label>To Date</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{totalShipments}</div>
              <p className="text-sm text-muted-foreground">Shipments</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{totalItems}</div>
              <p className="text-sm text-muted-foreground">Line Items</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{totalQty}</div>
              <p className="text-sm text-muted-foreground">Total Units</p>
            </CardContent>
          </Card>
        </div>

        {/* Data Grid */}
        <DataGrid
          data={filteredShipments}
          columns={columns}
          loading={isLoading}
          keyField="id"
        />
      </div>

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Inbound Details - {selectedShipment?.tracking_no}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Shipment info */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Target User:</span>
                <p className="font-medium">{selectedShipment?.salesperson?.display_name || selectedShipment?.salesperson?.email || '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Runner:</span>
                <p className="font-medium">{selectedShipment?.runner?.display_name || selectedShipment?.runner?.email || '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Arrival:</span>
                <p className="font-medium">
                  {selectedShipment?.arrival_date && new Date(selectedShipment.arrival_date).toLocaleDateString()}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>
                <Badge className={statusColors[selectedShipment?.status || 'PENDING_SP_ACK']}>
                  {selectedShipment?.status?.replace('_', ' ')}
                </Badge>
              </div>
            </div>

            {selectedShipment?.acknowledged_at && (
              <div className="text-sm flex items-center gap-4">
                <div>
                  <span className="text-muted-foreground">Acknowledged:</span>{' '}
                  <span className="font-medium">{format(new Date(selectedShipment.acknowledged_at), 'MMM dd, yyyy HH:mm')}</span>
                </div>
                {selectedShipment.acknowledged_by_profile && (
                  <div>
                    <span className="text-muted-foreground">By:</span>{' '}
                    <span className="font-medium">{selectedShipment.acknowledged_by_profile.display_name || selectedShipment.acknowledged_by_profile.email}</span>
                  </div>
                )}
              </div>
            )}

            {selectedShipment?.notes && (
              <div className="text-sm">
                <span className="text-muted-foreground">Notes:</span>
                <p className="font-medium">{selectedShipment.notes}</p>
              </div>
            )}

            {/* Items */}
            <div className="space-y-4">
              <h3 className="font-semibold">Items ({selectedShipment?.inbound_items?.length || 0} lines)</h3>
              {selectedShipment?.inbound_items?.map((item, index) => (
                <Card key={item.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Badge variant="outline">#{index + 1}</Badge>
                      <span>{getProductDisplay(item)}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* Photo */}
                      <div className="space-y-1">
                        {item.photo_url ? (
                          <div>
                            <div
                              className="relative group cursor-pointer"
                              onClick={() => setLightboxImage({
                                url: item.photo_url,
                                alt: item.temp_sku_label || 'Item photo',
                                date: item.created_at,
                              })}
                            >
                              <img
                                src={item.photo_url}
                                alt={item.temp_sku_label || 'Item photo'}
                                className="h-24 w-full object-cover rounded border group-hover:opacity-80 transition-opacity"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.onerror = null;
                                  target.src = '/placeholder.svg';
                                }}
                              />
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="bg-background/80 rounded-full p-2">
                                  <ZoomIn className="h-5 w-5" />
                                </div>
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <Calendar className="h-3 w-3" />
                              <span>{format(new Date(item.created_at), 'MMM d, yyyy')}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="h-24 w-full bg-muted rounded border flex items-center justify-center">
                            <span className="text-muted-foreground text-sm">No photo</span>
                          </div>
                        )}
                      </div>

                      {/* Reported qty */}
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Reported Qty</Label>
                        <p className="text-2xl font-bold">{item.qty_reported}</p>
                      </div>

                      {/* Acknowledged qty */}
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Acknowledged Qty</Label>
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                          {item.qty_acknowledged ?? item.qty_reported}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      {lightboxImage && (
        <ImageLightbox
          imageUrl={lightboxImage.url}
          alt={lightboxImage.alt}
          uploadDate={lightboxImage.date}
          onClose={() => setLightboxImage(null)}
        />
      )}
    </AppLayout>
  );
}
