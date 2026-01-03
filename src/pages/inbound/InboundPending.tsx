import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useInboundShipments, useUpdateInboundShipment, useUpdateInboundItem } from '@/hooks/useInboundShipments';
import { useProducts, useCreateProduct } from '@/hooks/useProducts';
import { useWarehouses } from '@/hooks/useInventory';
import { useCreateBulkStockMovements } from '@/hooks/useStockMovements';
import { logAudit } from '@/hooks/useAuditLogs';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { InboundShipment, InboundItem, InboundStatus } from '@/types/database';
import { Package, CheckCircle, AlertTriangle, ZoomIn, Check, ChevronsUpDown, Plus, X, Calendar, Image as ImageIcon } from 'lucide-react';
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

interface InboundProductComboboxProps {
  products: { id: string; sku_code: string | null; sku_name: string }[];
  value: string;
  newProductName?: string;
  defaultNewName: string;
  onChange: (productId: string, newProductName?: string) => void;
}

function InboundProductCombobox({ products, value, newProductName, defaultNewName, onChange }: InboundProductComboboxProps) {
  const [open, setOpen] = useState(false);
  
  const selectedProduct = products.find(p => p.id === value);
  const isCreatingNew = value === '' && newProductName !== undefined;
  
  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between text-left font-normal"
          >
            <span className="truncate">
              {isCreatingNew
                ? '+ Create New Product'
                : selectedProduct
                ? `${selectedProduct.sku_name}${selectedProduct.sku_code ? ` (${selectedProduct.sku_code})` : ''}`
                : 'Select product...'}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search products..." />
            <CommandList>
              <CommandEmpty>No product found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="__create_new__"
                  onSelect={() => {
                    onChange('', defaultNewName);
                    setOpen(false);
                  }}
                >
                  <Plus className={cn("mr-2 h-4 w-4", isCreatingNew ? "opacity-100" : "opacity-50")} />
                  + Create New Product
                </CommandItem>
                {products.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`${p.sku_code || ''} ${p.sku_name}`}
                    onSelect={() => {
                      onChange(p.id, undefined);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === p.id ? "opacity-100" : "opacity-0")} />
                    {p.sku_name}{p.sku_code && ` (${p.sku_code})`}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      
      {isCreatingNew && (
        <Input
          placeholder="New product name"
          value={newProductName || ''}
          onChange={(e) => onChange('', e.target.value)}
        />
      )}
    </div>
  );
}

export default function InboundPending() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: shipments, isLoading } = useInboundShipments({
    salespersonId: user?.id,
    status: 'PENDING_SP_ACK',
  });
  const { data: products } = useProducts();
  const { data: warehouses } = useWarehouses();
  const updateShipment = useUpdateInboundShipment();
  const updateItem = useUpdateInboundItem();
  const createProduct = useCreateProduct();
  const createStockMovements = useCreateBulkStockMovements();

  const [selectedShipment, setSelectedShipment] = useState<InboundShipment | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [disputeDialogOpen, setDisputeDialogOpen] = useState(false);
  const [disputeNotes, setDisputeNotes] = useState('');
  const [itemAcks, setItemAcks] = useState<Record<string, { qty: number; productId: string; newProductName?: string }>>({});
  const [lightboxImage, setLightboxImage] = useState<{ url: string; alt: string; date?: string } | null>(null);

  // Get salesperson's warehouse
  const myWarehouse = warehouses?.find(w => w.owner_user_id === user?.id && w.warehouse_type === 'SALESPERSON');

  const handleOpenDetail = (shipment: InboundShipment) => {
    setSelectedShipment(shipment);
    // Initialize item acknowledgements
    const acks: Record<string, { qty: number; productId: string }> = {};
    shipment.inbound_items?.forEach((item) => {
      acks[item.id] = {
        qty: item.qty_reported,
        productId: item.product_id || '',
      };
    });
    setItemAcks(acks);
    setDetailDialogOpen(true);
  };

  const handleAcknowledge = async () => {
    if (!selectedShipment || !myWarehouse) return;

    // Validate all items have product mapping
    const items = selectedShipment.inbound_items || [];
    for (const item of items) {
      const ack = itemAcks[item.id];
      if (!ack?.productId && !ack?.newProductName) {
        toast({ variant: 'destructive', title: 'All items must have a product selected or created' });
        return;
      }
    }

    try {
      // Process each item
      const stockMovements = [];

      for (const item of items) {
        const ack = itemAcks[item.id];
        let productId = ack.productId;

        // Create new product if needed
        if (!productId && ack.newProductName) {
          const newProduct = await createProduct.mutateAsync({
            sku_name: ack.newProductName,
          });
          productId = newProduct.id;
        }

        // Update inbound item
        await updateItem.mutateAsync({
          id: item.id,
          qty_acknowledged: ack.qty,
          product_id: productId,
        });

        // Prepare stock movement
        stockMovements.push({
          warehouse_id: myWarehouse.id,
          product_id: productId,
          movement_type: 'INBOUND' as const,
          qty_change: ack.qty,
          reference_type: 'INBOUND_ITEM' as const,
          reference_id: item.id,
        });
      }

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
        after_json: { status: 'ACKNOWLEDGED', items_count: items.length },
      });

      toast({ title: 'Inbound acknowledged and stock added' });
      setDetailDialogOpen(false);
      setSelectedShipment(null);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: (error as Error).message });
    }
  };

  const handleDispute = async () => {
    if (!selectedShipment) return;

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
      key: 'items_count',
      header: 'Items',
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
            <div className="grid grid-cols-3 gap-4 text-sm">
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

            {/* Items */}
            <div className="space-y-4">
              <h3 className="font-semibold">Items</h3>
              {selectedShipment?.inbound_items?.map((item, index) => (
                <Card key={item.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      Item #{index + 1}: {item.temp_sku_label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                                className="h-32 w-full object-cover rounded border group-hover:opacity-80 transition-opacity"
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
                          <div className="h-32 w-full bg-muted rounded border flex items-center justify-center">
                            <span className="text-muted-foreground text-sm">No photo</span>
                          </div>
                        )}
                      </div>

                      {/* Reported qty */}
                      <div className="space-y-2">
                        <Label>Reported Qty</Label>
                        <p className="text-lg font-bold">{item.qty_reported}</p>
                      </div>

                      {/* Acknowledged qty */}
                      <div className="space-y-2">
                        <Label>Acknowledged Qty *</Label>
                        <Input
                          type="number"
                          min={0}
                          value={itemAcks[item.id]?.qty || 0}
                          onChange={(e) =>
                            setItemAcks({
                              ...itemAcks,
                              [item.id]: {
                                ...itemAcks[item.id],
                                qty: parseInt(e.target.value) || 0,
                              },
                            })
                          }
                        />
                      </div>

                      {/* Product mapping with searchable combobox */}
                      <div className="space-y-2">
                        <Label>Product *</Label>
                        <InboundProductCombobox
                          products={products || []}
                          value={itemAcks[item.id]?.productId || ''}
                          newProductName={itemAcks[item.id]?.newProductName}
                          defaultNewName={item.temp_sku_label || ''}
                          onChange={(productId, newProductName) =>
                            setItemAcks({
                              ...itemAcks,
                              [item.id]: {
                                ...itemAcks[item.id],
                                productId,
                                newProductName,
                              },
                            })
                          }
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="destructive"
              onClick={() => setDisputeDialogOpen(true)}
            >
              <AlertTriangle className="h-4 w-4 mr-1" />
              Dispute
            </Button>
            <Button onClick={handleAcknowledge}>
              <CheckCircle className="h-4 w-4 mr-1" />
              Acknowledge & Add Stock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispute Dialog */}
      <Dialog open={disputeDialogOpen} onOpenChange={setDisputeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dispute Inbound</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Enter dispute notes..."
              value={disputeNotes}
              onChange={(e) => setDisputeNotes(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDispute}>
              Submit Dispute
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
