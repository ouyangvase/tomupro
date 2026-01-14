import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useInboundShipments, useUpdateInboundShipment } from '@/hooks/useInboundShipments';
import { supabase } from '@/integrations/supabase/client';
import { useProducts } from '@/hooks/useProducts';
import { useWarehouses } from '@/hooks/useInventory';
import { useCreateBulkStockMovements } from '@/hooks/useStockMovements';
import { logAudit } from '@/hooks/useAuditLogs';
import { useToast } from '@/hooks/use-toast';
import { findProductBySkuCode } from '@/hooks/useProductsBySalesperson';
import type { InboundShipment, InboundItem, InboundStatus } from '@/types/database';
import { Package, CheckCircle, AlertTriangle, ZoomIn, X, Calendar, Image as ImageIcon } from 'lucide-react';
import { format } from 'date-fns';

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

export default function InboundPending() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  
  // For manager, we don't pass salespersonId filter to let RLS handle team visibility
  // For salesperson, filter to their own shipments
  const shipmentFilters = role === 'salesperson' 
    ? { salespersonId: user?.id, status: 'PENDING_SP_ACK' as const }
    : { status: 'PENDING_SP_ACK' as const }; // Admin/Manager see all their visible shipments via RLS
  
  const { data: shipments, isLoading } = useInboundShipments(shipmentFilters);
  const { data: products } = useProducts();
  const { data: warehouses } = useWarehouses();
  const updateShipment = useUpdateInboundShipment();
  const createStockMovements = useCreateBulkStockMovements();

  const [selectedShipment, setSelectedShipment] = useState<InboundShipment | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [disputeDialogOpen, setDisputeDialogOpen] = useState(false);
  const [disputeNotes, setDisputeNotes] = useState('');
  const [lightboxImage, setLightboxImage] = useState<{ url: string; alt: string; date?: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Get salesperson's warehouse - for manager, we'll get the warehouse based on the shipment's salesperson
  const myWarehouse = warehouses?.find(w => w.owner_user_id === user?.id && w.warehouse_type === 'SALESPERSON');

  const handleOpenDetail = (shipment: InboundShipment) => {
    setSelectedShipment(shipment);
    setDetailDialogOpen(true);
  };

  // Helper to get product info from product_id
  const getProductDisplay = (item: InboundItem) => {
    if (item.product_id) {
      const product = products?.find(p => p.id === item.product_id);
      if (product) {
        return `${product.sku_code || ''} / ${product.sku_name}`.replace(/^\s*\/\s*/, '');
      }
    }
    // Fallback to temp_sku_label
    return item.temp_sku_label || 'Unknown SKU';
  };

  // Generate items preview for list display (e.g., "SKU1 x10, SKU2 x10")
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

  const handleAcknowledge = async () => {
    if (!selectedShipment) {
      toast({ variant: 'destructive', title: 'No shipment selected' });
      return;
    }

    // For manager acknowledging team member's shipment, use the shipment's salesperson's warehouse
    const targetWarehouse = role === 'manager' 
      ? warehouses?.find(w => w.owner_user_id === selectedShipment.salesperson_id && w.warehouse_type === 'SALESPERSON')
      : myWarehouse;

    if (!targetWarehouse) {
      toast({ variant: 'destructive', title: 'No warehouse found for this salesperson' });
      return;
    }

    // Check if already acknowledged
    if (selectedShipment.status === 'ACKNOWLEDGED') {
      toast({ variant: 'destructive', title: 'Already acknowledged' });
      return;
    }

    const items = selectedShipment.inbound_items || [];
    
    setIsProcessing(true);

    try {
      // Resolve product_id for items that don't have it (using SKU code matching)
      const resolvedItems: Array<{ id: string; product_id: string; qty_reported: number; temp_sku_label: string | null }> = [];
      const unresolvedSkus: string[] = [];
      
      for (const item of items) {
        if (item.product_id) {
          // Already has product_id
          resolvedItems.push({
            id: item.id,
            product_id: item.product_id,
            qty_reported: item.qty_reported,
            temp_sku_label: item.temp_sku_label,
          });
        } else if (item.temp_sku_label) {
          // Try to resolve by SKU code
          const product = await findProductBySkuCode(
            selectedShipment.salesperson_id,
            item.temp_sku_label
          );
          
          if (product) {
            // Update the item with the resolved product_id
            const { error } = await supabase
              .from('inbound_items')
              .update({ product_id: product.id })
              .eq('id', item.id);
            
            if (error) throw error;
            
            resolvedItems.push({
              id: item.id,
              product_id: product.id,
              qty_reported: item.qty_reported,
              temp_sku_label: item.temp_sku_label,
            });
          } else {
            unresolvedSkus.push(item.temp_sku_label);
          }
        } else {
          unresolvedSkus.push(`Item #${items.indexOf(item) + 1} (no SKU)`);
        }
      }
      
      // If any items couldn't be resolved, show error
      if (unresolvedSkus.length > 0) {
        toast({ 
          variant: 'destructive', 
          title: 'Missing product mapping',
          description: `SKU(s) not found for this salesperson: ${unresolvedSkus.join(', ')}. Create products first or contact runner to resubmit.`
        });
        setIsProcessing(false);
        return;
      }

      // Create stock movements using EXACT reported_qty per item (no transformation)
      const stockMovements = resolvedItems.map(item => ({
        warehouse_id: targetWarehouse.id,
        product_id: item.product_id,
        movement_type: 'INBOUND' as const,
        qty_change: item.qty_reported, // Use exact reported qty
        reference_type: 'INBOUND_ITEM' as const,
        reference_id: item.id,
      }));

      // Create all stock movements
      await createStockMovements.mutateAsync(stockMovements);

      // Update shipment status
      await updateShipment.mutateAsync({
        id: selectedShipment.id,
        status: 'ACKNOWLEDGED',
      });

      // Log audit
      await logAudit({
        entity_type: 'inbound_shipment',
        entity_id: selectedShipment.id,
        action: 'INBOUND_ACKNOWLEDGED',
        before_json: { status: 'PENDING_SP_ACK' },
        after_json: { 
          status: 'ACKNOWLEDGED', 
          items_count: items.length,
          stock_added: stockMovements.map(m => ({ product_id: m.product_id, qty: m.qty_change }))
        },
      });

      toast({ title: 'Inbound acknowledged and stock added' });
      setDetailDialogOpen(false);
      setSelectedShipment(null);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: (error as Error).message });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDispute = async () => {
    if (!selectedShipment) return;

    setIsProcessing(true);

    try {
      await updateShipment.mutateAsync({
        id: selectedShipment.id,
        status: 'DISPUTE',
        notes: disputeNotes,
      });

      await logAudit({
        entity_type: 'inbound_shipment',
        entity_id: selectedShipment.id,
        action: 'INBOUND_DISPUTED',
        before_json: { status: 'PENDING_SP_ACK' },
        after_json: { status: 'DISPUTE', notes: disputeNotes },
      });

      toast({ title: 'Inbound marked as disputed' });
      setDisputeDialogOpen(false);
      setDetailDialogOpen(false);
      setSelectedShipment(null);
      setDisputeNotes('');
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: (error as Error).message });
    } finally {
      setIsProcessing(false);
    }
  };

  const columns: Column<InboundShipment>[] = [
    {
      key: 'arrival_date',
      header: 'Arrival Date',
      sortable: true,
      render: (s) => new Date(s.arrival_date).toLocaleDateString(),
    },
    {
      key: 'tracking_no',
      header: 'Tracking No',
      sortable: true,
    },
    {
      key: 'runner',
      header: 'Runner',
      render: (s) => s.runner?.display_name || '-',
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
      key: 'items_count',
      header: 'Lines',
      render: (s) => s.inbound_items?.length || 0,
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
        <Button size="sm" onClick={() => handleOpenDetail(shipment)}>
          Review
        </Button>
      ),
    },
  ];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Package className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Inbound Pending</h1>
            <p className="text-muted-foreground">Review and acknowledge runner inbound shipments</p>
          </div>
        </div>

        <DataGrid
          data={shipments || []}
          columns={columns}
          loading={isLoading}
          keyField="id"
        />
      </div>

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Inbound - {selectedShipment?.tracking_no}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Shipment info */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Runner:</span>
                <p className="font-medium">{selectedShipment?.runner?.display_name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Arrival:</span>
                <p className="font-medium">
                  {selectedShipment?.arrival_date && new Date(selectedShipment.arrival_date).toLocaleDateString()}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Notes:</span>
                <p className="font-medium">{selectedShipment?.notes || '-'}</p>
              </div>
            </div>

            {/* Items - Read-only display */}
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

                      {/* Reported qty - Read only */}
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Reported Qty</Label>
                        <p className="text-2xl font-bold">{item.qty_reported}</p>
                      </div>

                      {/* Stock will be added - Read only display */}
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Stock to Add</Label>
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                          +{item.qty_reported}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Summary */}
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Total items to add to stock:</span>
                <span className="text-xl font-bold">
                  {selectedShipment?.inbound_items?.reduce((sum, i) => sum + i.qty_reported, 0) || 0} units
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="destructive"
              onClick={() => setDisputeDialogOpen(true)}
              disabled={isProcessing}
            >
              <AlertTriangle className="h-4 w-4 mr-1" />
              Reject / Dispute
            </Button>
            <Button onClick={handleAcknowledge} disabled={isProcessing}>
              <CheckCircle className="h-4 w-4 mr-1" />
              {isProcessing ? 'Processing...' : 'Acknowledge & Add Stock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispute Dialog */}
      <Dialog open={disputeDialogOpen} onOpenChange={setDisputeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject / Dispute Inbound</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label>Reason for dispute</Label>
            <Textarea
              placeholder="Enter dispute notes..."
              value={disputeNotes}
              onChange={(e) => setDisputeNotes(e.target.value)}
              rows={4}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeDialogOpen(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDispute} disabled={isProcessing}>
              {isProcessing ? 'Processing...' : 'Submit Dispute'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox for full-screen image viewing */}
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
