import { useState, useMemo, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useAuth } from '@/contexts/AuthContext';
import { useRunnerBoundUsers } from '@/hooks/useRunnerBoundUsers';
import { useProductsByOwner } from '@/hooks/useProductsByOwner';
import { useCreateInboundShipment, useCreateInboundItem, uploadInboundPhoto, useInboundShipments } from '@/hooks/useInboundShipments';
import { logAudit } from '@/hooks/useAuditLogs';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { 
  Package, Plus, Trash2, Upload, Check, ChevronsUpDown, 
  ArrowRight, User, Hash, CalendarDays, FileText, 
  PackageOpen, Clock, AlertCircle, ScanBarcode, AlertTriangle
} from 'lucide-react';
import capybaraImport from '@/assets/capybara-import.png';
import { PageHero } from '@/components/dashboard/PageHero';
import { InboundExcelImport } from '@/components/inbound/InboundExcelImport';

interface InboundItemDraft {
  id: string;
  product_id: string;
  qty_reported: number;
  photo_file: File | null;
  photo_preview: string | null;
}

export default function RunnerInbound({ runnerIdOverride }: { runnerIdOverride?: string } = {}) {
  const { user } = useAuth();
  const runnerScopeId = runnerIdOverride || user?.id;
  const { toast } = useToast();
  const { data: boundUsers = [], isLoading: boundUsersLoading } = useRunnerBoundUsers(runnerScopeId);
  const createShipment = useCreateInboundShipment();
  const createItem = useCreateInboundItem();

  // Fetch inbound stats
  const { data: allShipments = [] } = useInboundShipments({ runnerId: runnerScopeId });

  const [targetUserId, setTargetUserId] = useState('');
  const [trackingNo, setTrackingNo] = useState('');
  const [arrivalDate, setArrivalDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<InboundItemDraft[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const submitGuardRef = useRef(false);

  const { data: products = [], isLoading: productsLoading } = useProductsByOwner(targetUserId || null);

  // Stats
  const pendingShipments = allShipments.filter(s => s.status === 'PENDING_SP_ACK');
  const totalItemsWaiting = allShipments
    .filter(s => s.status === 'PENDING_SP_ACK')
    .reduce((acc, s) => acc + (s.inbound_items?.length || 0), 0);

  // Duplicate detection: check if there's already a pending shipment for the same target user
  const existingPendingForUser = useMemo(() => {
    if (!targetUserId) return [];
    return pendingShipments.filter(s => s.salesperson_id === targetUserId);
  }, [targetUserId, pendingShipments]);

  const handleTargetUserChange = (newTargetUserId: string) => {
    if (newTargetUserId !== targetUserId) setItems([]);
    setTargetUserId(newTargetUserId);
  };

  const addItem = () => {
    setItems([...items, {
      id: crypto.randomUUID(),
      product_id: '',
      qty_reported: 1,
      photo_file: null,
      photo_preview: null,
    }]);
  };

  const removeItem = (id: string) => setItems(items.filter(item => item.id !== id));

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
    if (!user || !runnerScopeId || !targetUserId || items.length === 0) {
      toast({ variant: 'destructive', title: 'Please fill all required fields and add at least one item' });
      return;
    }
    // Validate tracking number: if provided, must be a real value (not just dashes/spaces)
    const cleanedTracking = trackingNo.trim().replace(/^-+$/, '');
    if (cleanedTracking && cleanedTracking.length < 3) {
      toast({ variant: 'destructive', title: 'Tracking number must be at least 3 characters, or leave blank if not available' });
      return;
    }
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.product_id) {
        toast({ variant: 'destructive', title: `Item #${i + 1}: Please select a product` });
        return;
      }
      if (item.qty_reported <= 0) {
        toast({ variant: 'destructive', title: `Item #${i + 1}: Quantity must be greater than 0` });
        return;
      }
    }
    // Show confirmation dialog instead of submitting directly
    setShowConfirm(true);
  };

  const handleConfirmedSubmit = async () => {
    // Guard against double submission
    if (submitGuardRef.current) return;
    submitGuardRef.current = true;
    setShowConfirm(false);
    setIsSubmitting(true);
    try {
      // Clean tracking number: strip dashes-only and whitespace
      const finalTracking = trackingNo.trim().replace(/^-+$/, '') || '';
      const shipment = await createShipment.mutateAsync({
        runner_id: runnerScopeId,
        salesperson_id: targetUserId,
        tracking_no: finalTracking,
        arrival_date: arrivalDate,
        notes: notes || undefined,
      });
      for (const item of items) {
        let photoUrl = '';
        if (item.photo_file) photoUrl = await uploadInboundPhoto(item.photo_file, user!.id);
        const product = products.find(p => p.id === item.product_id);
        const tempSkuLabel = product ? `${product.sku_code || ''} ${product.sku_name}`.trim() : '';
        await createItem.mutateAsync({
          inbound_id: shipment.id,
          product_id: item.product_id,
          temp_sku_label: tempSkuLabel,
          qty_reported: item.qty_reported,
          photo_url: photoUrl,
        });
      }
      await logAudit({
        entity_type: 'inbound_shipment',
        entity_id: shipment.id,
        action: 'INBOUND_CREATED',
        after_json: { tracking_no: finalTracking, items_count: items.length },
      });
      toast({ title: 'Inbound shipment submitted successfully' });
      setTargetUserId('');
      setTrackingNo('');
      setArrivalDate(new Date().toISOString().split('T')[0]);
      setNotes('');
      setItems([]);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: (error as Error).message });
    } finally {
      setIsSubmitting(false);
      submitGuardRef.current = false;
    }
  };

  const canSubmit = items.length > 0 && targetUserId && items.every(item => item.product_id && item.qty_reported > 0);
  const selectedUser = boundUsers.find(u => u.id === targetUserId);

  return (
    <div className="space-y-6">
        {/* Hero Header */}
        <PageHero
          icon={<PackageOpen className="h-6 w-6 text-primary" />}
          title="Inbound Shipment"
          subtitle="Receive new inventory into warehouse"
          image={capybaraImport}
          imageAlt="Capybara receiving packages"
        />

        {runnerScopeId ? (
          <InboundExcelImport
            runnerId={runnerScopeId}
            boundUsers={boundUsers}
            disabled={boundUsersLoading || boundUsers.length === 0}
          />
        ) : null}

        {/* Workflow Steps Hint */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
          <Badge variant="outline" className="gap-1.5 py-1 px-3 rounded-full font-medium">
            <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">1</span>
            Create Shipment
          </Badge>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50" />
          <Badge variant="outline" className="gap-1.5 py-1 px-3 rounded-full font-medium">
            <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">2</span>
            Add Items
          </Badge>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50" />
          <Badge variant="outline" className="gap-1.5 py-1 px-3 rounded-full font-medium">
            <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">3</span>
            Submit
          </Badge>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-none shadow-sm bg-gradient-to-br from-primary/5 to-primary/10">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0">
                <Package className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{allShipments.length}</p>
                <p className="text-sm text-muted-foreground">Total Shipments</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/20 dark:to-amber-900/10">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-amber-500/15 flex items-center justify-center shrink-0">
                <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{pendingShipments.length}</p>
                <p className="text-sm text-muted-foreground">Pending Review</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/20 dark:to-blue-900/10">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-blue-500/15 flex items-center justify-center shrink-0">
                <AlertCircle className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{totalItemsWaiting}</p>
                <p className="text-sm text-muted-foreground">Items Waiting</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content - Form + Items */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* LEFT: Shipment Form as Step Cards */}
          <div className="lg:col-span-2 space-y-4">
            {/* Step 1: User */}
            <Card className="border shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-primary to-primary/30" />
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Step 1 — Select Owner</p>
                    <p className="text-xs text-muted-foreground">Choose the inventory owner</p>
                  </div>
                </div>
                <Select value={targetUserId} onValueChange={handleTargetUserChange} disabled={boundUsersLoading}>
                  <SelectTrigger className="rounded-xl h-11">
                    <SelectValue placeholder={boundUsersLoading ? "Loading..." : "Select user..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {boundUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            {(u.display_name || '?')[0].toUpperCase()}
                          </div>
                          <span>{u.display_name}</span>
                          <Badge variant="outline" className="text-xs capitalize ml-1">{u.role}</Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedUser && (
                  <div className="mt-3 p-3 rounded-xl bg-primary/5 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center text-sm font-bold text-primary">
                      {(selectedUser.display_name || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{selectedUser.display_name}</p>
                      <p className="text-xs text-muted-foreground">{selectedUser.email}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Step 2: Tracking */}
            <Card className="border shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-primary/60 to-primary/10" />
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Hash className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Step 2 — Tracking Number <span className="font-normal text-muted-foreground">(Optional)</span></p>
                    <p className="text-xs text-muted-foreground">Enter tracking ID if available</p>
                  </div>
                </div>
                <div className="relative">
                  <Input
                    value={trackingNo}
                    onChange={(e) => setTrackingNo(e.target.value)}
                    placeholder="Enter tracking number (optional)"
                    className="rounded-xl h-11 pr-10"
                  />
                  <ScanBarcode className="absolute right-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground/50" />
                </div>
              </CardContent>
            </Card>

            {/* Step 3: Date */}
            <Card className="border shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-primary/40 to-primary/5" />
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <CalendarDays className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Step 3 — Arrival Date</p>
                    <p className="text-xs text-muted-foreground">Expected arrival</p>
                  </div>
                </div>
                <Input
                  type="date"
                  value={arrivalDate}
                  onChange={(e) => setArrivalDate(e.target.value)}
                  className="rounded-xl h-11"
                />
              </CardContent>
            </Card>

            {/* Step 4: Notes */}
            <Card className="border shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-primary/20 to-transparent" />
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Step 4 — Notes</p>
                    <p className="text-xs text-muted-foreground">Optional description</p>
                  </div>
                </div>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any special instructions..."
                  rows={3}
                  className="rounded-xl"
                />
              </CardContent>
            </Card>
          </div>

          {/* RIGHT: Items Panel */}
          <div className="lg:col-span-3">
            <Card className="border shadow-sm h-full">
              <div className="flex items-center justify-between p-5 border-b">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Package className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">Items</p>
                    <p className="text-xs text-muted-foreground">{items.length} item{items.length !== 1 ? 's' : ''} added</p>
                  </div>
                </div>
                <Button
                  onClick={addItem}
                  size="sm"
                  disabled={!targetUserId || products.length === 0}
                  className="rounded-xl gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  Add Item
                </Button>
              </div>

              <CardContent className="p-5">
                {!targetUserId ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <img
                      src={capybaraImport}
                      alt="Select user"
                      className="h-28 w-28 object-contain mb-5 drop-shadow-md opacity-80"
                    />
                    <h3 className="text-lg font-semibold text-foreground mb-1">Select an Owner First</h3>
                    <p className="text-sm text-muted-foreground max-w-xs">
                      Choose a user in Step 1 to load their available product list
                    </p>
                  </div>
                ) : productsLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 animate-pulse">
                      <Package className="h-6 w-6 text-primary" />
                    </div>
                    <p className="text-sm text-muted-foreground">Loading products...</p>
                  </div>
                ) : products.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="h-12 w-12 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
                      <AlertCircle className="h-6 w-6 text-destructive" />
                    </div>
                    <h3 className="text-base font-semibold text-destructive mb-1">No Products Found</h3>
                    <p className="text-sm text-muted-foreground max-w-xs">
                      This user needs to create products first before you can submit inbound.
                    </p>
                  </div>
                ) : items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                      <Plus className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground mb-1">No Items Yet</h3>
                    <p className="text-sm text-muted-foreground max-w-xs mb-4">
                      Click "Add Item" to start adding products to this shipment
                    </p>
                    <Button onClick={addItem} variant="outline" className="rounded-xl gap-1.5">
                      <Plus className="h-4 w-4" />
                      Add First Item
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {items.map((item, index) => (
                      <InboundItemCard
                        key={item.id}
                        item={item}
                        index={index}
                        products={products}
                        productsLoading={productsLoading}
                        onUpdate={(updates) => updateItem(item.id, updates)}
                        onRemove={() => removeItem(item.id)}
                        onPhotoChange={(file) => handlePhotoChange(item.id, file)}
                      />
                    ))}
                    {items.length === 1 && (
                      <p className="text-xs text-center text-muted-foreground pt-1">
                        Multiple products? Click "Add Item" above to include all items in one shipment.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={isSubmitting || !canSubmit}
            className="rounded-xl gap-2 px-8 h-12 text-base shadow-lg shadow-primary/20"
          >
            <PackageOpen className="h-5 w-5" />
            {isSubmitting ? 'Submitting...' : 'Receive Shipment'}
          </Button>
        </div>

        {/* Confirmation Dialog */}
        <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PackageOpen className="h-5 w-5 text-primary" />
                Confirm Submission
              </DialogTitle>
              <DialogDescription>
                Review the shipment details before submitting.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              {existingPendingForUser.length > 0 && (
                <Alert variant="destructive" className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4 !text-amber-600" />
                  <AlertDescription className="text-sm">
                    <strong>Warning:</strong> This user already has {existingPendingForUser.length} pending shipment{existingPendingForUser.length > 1 ? 's' : ''} awaiting acknowledgment.
                    {existingPendingForUser.length <= 3 && (
                      <span className="block mt-1 text-xs text-muted-foreground">
                        Tracking: {existingPendingForUser.map(s => s.tracking_no).join(', ')}
                      </span>
                    )}
                    Are you sure this is not a duplicate?
                  </AlertDescription>
                </Alert>
              )}

              <div className="rounded-lg border p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Owner</span>
                  <span className="font-medium">{selectedUser?.display_name || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tracking</span>
                  <span className="font-mono font-medium">{trackingNo.trim().replace(/^-+$/, '') || 'Not provided'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Arrival Date</span>
                  <span>{arrivalDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Items</span>
                  <span className="font-medium">{items.length} item{items.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Qty</span>
                  <Badge variant="default">{items.reduce((sum, i) => sum + i.qty_reported, 0)}</Badge>
                </div>
              </div>

              {items.length > 0 && (
                <div className="rounded-lg border divide-y max-h-[200px] overflow-y-auto">
                  {items.map((item, idx) => {
                    const product = products.find(p => p.id === item.product_id);
                    return (
                      <div key={item.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs text-muted-foreground w-5">{idx + 1}.</span>
                          <span className="truncate">{product?.sku_code || product?.sku_name || 'Unknown'}</span>
                        </div>
                        <Badge variant="outline" className="ml-2 shrink-0">x{item.qty_reported}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowConfirm(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmedSubmit} disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Confirm & Submit'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
}

// Visual Item Card
interface InboundItemCardProps {
  item: InboundItemDraft;
  index: number;
  products: Array<{ id: string; sku_code: string | null; sku_name: string }>;
  productsLoading?: boolean;
  onUpdate: (updates: Partial<InboundItemDraft>) => void;
  onRemove: () => void;
  onPhotoChange: (file: File | null) => void;
}

function InboundItemCard({ item, index, products, productsLoading, onUpdate, onRemove, onPhotoChange }: InboundItemCardProps) {
  const [open, setOpen] = useState(false);
  const selectedProduct = products.find(p => p.id === item.product_id);

  return (
    <div className="rounded-xl border bg-card p-4 transition-all hover:shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
            {index + 1}
          </div>
          {selectedProduct ? (
            <div>
              <p className="text-sm font-medium">{selectedProduct.sku_name}</p>
              {selectedProduct.sku_code && (
                <p className="text-xs text-muted-foreground font-mono">{selectedProduct.sku_code}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select a product</p>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Product */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              className={cn("w-full justify-between text-left font-normal rounded-xl h-10", !item.product_id && "text-muted-foreground")}
            >
              <span className="truncate text-sm">
                {productsLoading ? 'Loading...' : selectedProduct ? `${selectedProduct.sku_code || ''} / ${selectedProduct.sku_name}`.replace(/^\s*\/\s*/, '') : 'Select product...'}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search products..." />
              <CommandList>
                <CommandEmpty>{productsLoading ? 'Loading...' : products.length === 0 ? 'No products found' : 'No product found.'}</CommandEmpty>
                <CommandGroup>
                  {products.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={`${p.sku_code || ''} ${p.sku_name}`}
                      onSelect={() => { onUpdate({ product_id: p.id }); setOpen(false); }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", item.product_id === p.id ? "opacity-100" : "opacity-0")} />
                      {p.sku_code && <span className="font-mono mr-1">{p.sku_code}</span>}
                      {p.sku_code && <span className="text-muted-foreground mr-1">/</span>}
                      {p.sku_name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Quantity */}
        <div>
          <Input
            type="number"
            min={1}
            value={item.qty_reported}
            onChange={(e) => onUpdate({ qty_reported: parseInt(e.target.value) || 1 })}
            placeholder="Qty"
            className="rounded-xl h-10"
          />
        </div>

        {/* Photo */}
        <div>
          {item.photo_preview ? (
            <div className="relative h-10 rounded-xl overflow-hidden border">
              <img src={item.photo_preview} alt="Preview" className="h-full w-full object-cover" />
              <Button
                variant="secondary"
                size="sm"
                className="absolute top-0.5 right-0.5 h-6 text-xs rounded-lg px-2"
                onClick={() => onUpdate({ photo_file: null, photo_preview: null })}
              >
                Change
              </Button>
            </div>
          ) : (
            <label className="flex items-center justify-center h-10 border-2 border-dashed rounded-xl cursor-pointer hover:bg-accent/50 transition-colors gap-2">
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onPhotoChange(e.target.files?.[0] || null)} />
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Photo</span>
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
