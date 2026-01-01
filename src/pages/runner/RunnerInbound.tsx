import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useSalespersons } from '@/hooks/useUserDirectory';
import { useCreateInboundShipment, useCreateInboundItem, uploadInboundPhoto } from '@/hooks/useInboundShipments';
import { logAudit } from '@/hooks/useAuditLogs';
import { useToast } from '@/hooks/use-toast';
import { Package, Plus, Trash2, Upload, Image } from 'lucide-react';

interface InboundItemDraft {
  id: string;
  temp_sku_label: string;
  qty_reported: number;
  photo_file: File | null;
  photo_preview: string | null;
}

export default function RunnerInbound() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: salespersons = [] } = useSalespersons();
  const createShipment = useCreateInboundShipment();
  const createItem = useCreateInboundItem();

  const [salespersonId, setSalespersonId] = useState('');
  const [trackingNo, setTrackingNo] = useState('');
  const [arrivalDate, setArrivalDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<InboundItemDraft[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addItem = () => {
    setItems([
      ...items,
      {
        id: crypto.randomUUID(),
        temp_sku_label: '',
        qty_reported: 1,
        photo_file: null,
        photo_preview: null,
      },
    ]);
  };

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const updateItem = (id: string, updates: Partial<InboundItemDraft>) => {
    setItems(items.map(item => (item.id === id ? { ...item, ...updates } : item)));
  };

  const handlePhotoChange = (id: string, file: File | null) => {
    if (file) {
      const preview = URL.createObjectURL(file);
      updateItem(id, { photo_file: file, photo_preview: preview });
    }
  };

  const handleSubmit = async () => {
    if (!user || !salespersonId || !trackingNo || items.length === 0) {
      toast({ variant: 'destructive', title: 'Please fill all required fields and add at least one item' });
      return;
    }

    // Check all items have photos
    const missingPhotos = items.filter(i => !i.photo_file);
    if (missingPhotos.length > 0) {
      toast({ variant: 'destructive', title: 'All items require a photo' });
      return;
    }

    setIsSubmitting(true);

    try {
      // Create shipment
      const shipment = await createShipment.mutateAsync({
        runner_id: user.id,
        salesperson_id: salespersonId,
        tracking_no: trackingNo,
        arrival_date: arrivalDate,
        notes: notes || undefined,
      });

      // Upload photos and create items
      for (const item of items) {
        if (!item.photo_file) continue;

        const photoUrl = await uploadInboundPhoto(item.photo_file, user.id);

        await createItem.mutateAsync({
          inbound_id: shipment.id,
          temp_sku_label: item.temp_sku_label,
          qty_reported: item.qty_reported,
          photo_url: photoUrl,
        });
      }

      // Log audit
      await logAudit({
        entity_type: 'inbound_shipment',
        entity_id: shipment.id,
        action: 'INBOUND_CREATED',
        after_json: { tracking_no: trackingNo, items_count: items.length },
      });

      toast({ title: 'Inbound shipment submitted successfully' });

      // Reset form
      setSalespersonId('');
      setTrackingNo('');
      setArrivalDate(new Date().toISOString().split('T')[0]);
      setNotes('');
      setItems([]);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: (error as Error).message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Package className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Inbound Shipment</h1>
            <p className="text-muted-foreground">Create a new inbound stock shipment</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Shipment Details */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Shipment Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Salesperson *</Label>
                <Select value={salespersonId} onValueChange={setSalespersonId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select salesperson..." />
                  </SelectTrigger>
                  <SelectContent>
                    {salespersons.map((sp) => (
                      <SelectItem key={sp.id} value={sp.id}>
                        {sp.display_name} {sp.email ? `(${sp.email})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!salespersonId && (
                  <p className="text-xs text-destructive">Salesperson is required</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Tracking No *</Label>
                <Input
                  value={trackingNo}
                  onChange={(e) => setTrackingNo(e.target.value)}
                  placeholder="Enter tracking number"
                />
              </div>

              <div className="space-y-2">
                <Label>Arrival Date</Label>
                <Input
                  type="date"
                  value={arrivalDate}
                  onChange={(e) => setArrivalDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Items ({items.length})</CardTitle>
              <Button onClick={addItem} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add Item
              </Button>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Image className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No items added yet</p>
                  <p className="text-sm">Click "Add Item" to start</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {items.map((item, index) => (
                    <div key={item.id} className="border rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">Item #{index + 1}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeItem(item.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>SKU Label *</Label>
                          <Input
                            value={item.temp_sku_label}
                            onChange={(e) => updateItem(item.id, { temp_sku_label: e.target.value })}
                            placeholder="Product name/code"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Quantity *</Label>
                          <Input
                            type="number"
                            min={1}
                            value={item.qty_reported}
                            onChange={(e) => updateItem(item.id, { qty_reported: parseInt(e.target.value) || 1 })}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Photo *</Label>
                          {item.photo_preview ? (
                            <div className="relative">
                              <img
                                src={item.photo_preview}
                                alt="Preview"
                                className="h-20 w-full object-cover rounded border"
                              />
                              <Button
                                variant="secondary"
                                size="sm"
                                className="absolute top-1 right-1"
                                onClick={() => updateItem(item.id, { photo_file: null, photo_preview: null })}
                              >
                                Change
                              </Button>
                            </div>
                          ) : (
                            <label className="flex items-center justify-center h-20 border-2 border-dashed rounded cursor-pointer hover:bg-accent/50">
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handlePhotoChange(item.id, e.target.files?.[0] || null)}
                              />
                              <Upload className="h-6 w-6 text-muted-foreground" />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Submit */}
        <div className="flex justify-end">
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={isSubmitting || items.length === 0 || !salespersonId || !trackingNo}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Inbound'}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
