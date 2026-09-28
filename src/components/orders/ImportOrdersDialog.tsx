import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle, X, ArrowLeft, ArrowRight, Users, FileText, Package, Check, MapPin } from 'lucide-react';
import { groupImportPayments } from '@/lib/orderImportGroups';
import { compressImage } from '@/lib/imageCompression';
import { callSupabaseRpc } from '@/lib/supabaseRpc';
import { formatBND } from '@/lib/currency';
import { parseCSVRaw, downloadTemplate, HEADER_ALIASES } from '@/lib/csv';
import { validateOrderLines, type ValidatedOrderLine } from '@/lib/csvValidation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateOrderQueries } from '@/lib/invalidateOrderQueries';
import { useOrderOwnerProducts } from '@/hooks/useProductsByOwner';
import { useInventoryOrderSources } from '@/hooks/useWarehouseSharing';
import { useValidAreas } from '@/hooks/useValidAreas';
import { toUpperLatin } from '@/lib/uppercase';
import { ColumnMappingStep, areRequiredFieldsMapped, applyColumnMapping } from './ColumnMappingStep';
import { cn } from '@/lib/utils';
import capybaraImport from '@/assets/capybara-import.png';
import capybaraEmpty from '@/assets/capybara-empty.png';

interface ImportOrdersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultStatus?: 'BOOKING' | 'READY';
}

type ImportStep = 'upload' | 'mapping' | 'preview';

/* ─── Step Indicator ─── */
function StepIndicator({ current }: { current: ImportStep }) {
  const steps = [
    { id: 'upload' as const, label: 'Upload File', num: 1 },
    { id: 'mapping' as const, label: 'Map Columns', num: 2 },
    { id: 'preview' as const, label: 'Import Orders', num: 3 },
  ];
  const currentIdx = steps.findIndex(s => s.id === current);

  return (
    <div className="flex items-center justify-center gap-0">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-center">
          <div className="flex items-center gap-2">
            <div className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-300",
              i <= currentIdx
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground"
            )}>
              {i < currentIdx ? <Check className="h-4 w-4" /> : step.num}
            </div>
            <span className={cn(
              "text-xs font-medium hidden sm:inline transition-colors",
              i <= currentIdx ? "text-foreground" : "text-muted-foreground"
            )}>
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={cn(
              "w-8 sm:w-12 h-0.5 mx-2 rounded-full transition-colors",
              i < currentIdx ? "bg-primary" : "bg-border"
            )} />
          )}
        </div>
      ))}
    </div>
  );
}

function ReceiptFilePreview({ file }: { file: File }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const value = URL.createObjectURL(file); setUrl(value); return () => URL.revokeObjectURL(value); }, [file]);
  return url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Selected transfer receipt" className="max-h-40 rounded-lg object-contain" /></a> : null;
}

export function ImportOrdersDialog({ open, onOpenChange, defaultStatus = 'BOOKING' }: ImportOrdersDialogProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: validAreas = [] } = useValidAreas();
  const { data: inventorySources = [] } = useInventoryOrderSources();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const [orderOwnerId, setOrderOwnerId] = useState<string>(profile?.id || '');
  const [fulfillmentWarehouseId, setFulfillmentWarehouseId] = useState('');
  const { data: ownerProducts = [] } = useOrderOwnerProducts(orderOwnerId);

  const [file, setFile] = useState<File | null>(null);
  const [rawData, setRawData] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [step, setStep] = useState<ImportStep>('upload');
  const [receiptFiles, setReceiptFiles] = useState<Record<string, File>>({});
  const requestIds = useRef<Record<string, string>>({});
  const receiptUrls = useRef<Record<string, { file: File; url: string }>>({});
  const completed = useRef(new Set<string>());
  const importLock = useRef(false);
  const [importing, setImporting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [successCount, setSuccessCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (open && profile?.id) {
      setOrderOwnerId(profile.id);
      setFulfillmentWarehouseId('');
    }
  }, [open, profile?.id]);

  useEffect(() => {
    if (!open || fulfillmentWarehouseId || inventorySources.length === 0) return;
    const defaultSource = inventorySources.find(source => source.owner_user_id === profile?.id)
      || inventorySources[0];
    if (defaultSource) {
      setOrderOwnerId(defaultSource.owner_user_id);
      setFulfillmentWarehouseId(defaultSource.warehouse_id);
    }
  }, [open, fulfillmentWarehouseId, inventorySources, profile?.id]);

  const suggestMappings = (headers: string[]): Record<string, string> => {
    const mapping: Record<string, string> = {};
    for (const header of headers) {
      const normalized = header.toLowerCase().trim().replace(/[\s_-]+/g, ' ').replace(/\s+/g, ' ');
      for (const [standardName, aliases] of Object.entries(HEADER_ALIASES)) {
        const aliasArray = aliases as string[];
        const matched = aliasArray.some(alias =>
          alias === normalized ||
          alias === normalized.replace(/\s/g, '_') ||
          alias === normalized.replace(/\s/g, '')
        );
        if (matched && !Object.values(mapping).includes(standardName)) {
          mapping[header] = standardName;
          break;
        }
      }
    }
    return mapping;
  };

  const clearErrors = () => {
    setErrors([]);
    setFile(null);
    setReceiptFiles({}); receiptUrls.current = {}; requestIds.current = {}; completed.current.clear();
    setRawData(null);
    setColumnMapping({});
    setStep('upload');
    setSuccessCount(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processFile = useCallback(async (selectedFile: File) => {
    if (selectedFile.size > 5 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Maximum file size is 5MB' });
      return;
    }
    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      toast({ variant: 'destructive', title: 'Invalid format', description: 'Please upload a CSV file' });
      return;
    }

    requestIds.current = {}; receiptUrls.current = {}; completed.current.clear(); setReceiptFiles({});
    setFile(selectedFile);
    setErrors([]);
    setSuccessCount(0);

    const text = await selectedFile.text();
    const parsed = parseCSVRaw(text);

    if (parsed.rows.length > 10000) { toast({ variant: 'destructive', title: 'Maximum 10,000 rows per file' }); return; }
    if (parsed.headers.length === 0) {
      toast({ variant: 'destructive', title: 'Invalid CSV', description: 'No headers found in file' });
      return;
    }

    setRawData(parsed);
    const suggestedMapping = suggestMappings(parsed.headers);
    setColumnMapping(suggestedMapping);
    setStep('mapping');
  }, [toast]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) processFile(selectedFile);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) processFile(droppedFile);
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleBackToUpload = () => { setStep('upload'); setErrors([]); };

  const handleProceedToPreview = () => {
    if (!rawData || !areRequiredFieldsMapped(columnMapping)) {
      toast({ variant: 'destructive', title: 'Missing required fields', description: 'Please map all required fields' });
      return;
    }
    const mappedRows = applyColumnMapping(rawData.rows, columnMapping);
    const validation = validateOrderLines(mappedRows);
    if (validation.errors.length > 0) {
      setErrors(validation.errors.map(e => `Row ${e.row}: ${e.message}`));
    } else {
      setErrors([]);
    }
    setStep('preview');
  };

  const handleBackToMapping = () => { setStep('mapping'); setErrors([]); };

  const mappedPreview = useMemo(() => {
    if (!rawData) return [];
    return applyColumnMapping(rawData.rows.slice(0, 5), columnMapping);
  }, [rawData, columnMapping]);

  const validateSkuOwnership = (
    validatedRows: ValidatedOrderLine[],
    ownerProductsList: typeof ownerProducts
  ): { valid: boolean; errors: string[] } => {
    const skuErrors: string[] = [];
    for (let i = 0; i < validatedRows.length; i++) {
      const row = validatedRows[i];
      const csvRowNum = i + 2;
      const skuValue = row.sku_name_or_code?.trim();
      if (!skuValue) continue;
      const codeMatches = ownerProductsList.filter((p: any) => p.sku_code?.toLowerCase() === skuValue.toLowerCase());
      if (codeMatches.length === 1) continue;
      if (codeMatches.length > 1) {
        skuErrors.push(`Row ${csvRowNum}: Multiple products with sku_code="${skuValue}"; please use unique sku_code`);
        continue;
      }
      const nameMatches = ownerProductsList.filter((p: any) => p.sku_name.toLowerCase() === skuValue.toLowerCase());
      if (nameMatches.length === 0) {
        skuErrors.push(`Row ${csvRowNum}: SKU not found in the selected owner's product list (sku_name_or_code="${skuValue}")`);
      } else if (nameMatches.length > 1) {
        skuErrors.push(`Row ${csvRowNum}: SKU name is ambiguous (${nameMatches.length} matches); please use sku_code (sku_name="${skuValue}")`);
      }
    }
    return { valid: skuErrors.length === 0, errors: skuErrors };
  };

  const findProductId = (skuNameOrCode: string): string | null => {
    if (!skuNameOrCode.trim()) return null;
    let product = ownerProducts.find((p: any) => p.sku_code?.toLowerCase() === skuNameOrCode.toLowerCase());
    if (!product) product = ownerProducts.find((p: any) => p.sku_name.toLowerCase() === skuNameOrCode.toLowerCase());
    return product?.id || null;
  };

  const handleImport = async () => {
    if (!rawData || !profile || importLock.current) return;
    importLock.current = true;
    setImporting(true);
    setErrors([]);
    setSuccessCount(0);

    try {
      const mappedRows = applyColumnMapping(rawData.rows, columnMapping);
      const validation = validateOrderLines(mappedRows);
      if (validation.errors.length > 0) {
        setErrors(validation.errors.map(e => `Row ${e.row}: ${e.message}`));
        setImporting(false);
        return;
      }
      if (validation.valid.length === 0) {
        setErrors(['No valid rows found in the file']);
        setImporting(false);
        return;
      }

      const payments = groupImportPayments(validation.valid);
      for (const [ref, payment] of payments) {
        if (payment.transfer > 0 && !receiptFiles[ref] && !payment.row.transfer_receipt_url) throw new Error('Order ' + ref + ': Upload a transfer receipt before importing.');
      }
      const skuValidation = validateSkuOwnership(validation.valid, ownerProducts);
      if (!skuValidation.valid) {
        setErrors(['Import FAILED: Invalid SKUs found. No orders were imported.', '', ...skuValidation.errors]);
        setImporting(false);
        return;
      }

      // Area validation: check all areas against valid list
      if (validAreas.length > 0) {
        const areaErrors: string[] = [];
        const orderRefToRows = new Map<number, ValidatedOrderLine>();
        validation.valid.forEach((row, i) => orderRefToRows.set(i + 2, row));
        
        for (let i = 0; i < validation.valid.length; i++) {
          const row = validation.valid[i];
          const areaValue = toUpperLatin(row.area?.trim() || '');
          if (areaValue && !validAreas.some(a => a.toUpperCase() === areaValue.toUpperCase())) {
            areaErrors.push(`Row ${i + 2}: Area "${areaValue}" does not exist in TOMUPRO. Replace with a valid area from the area list.`);
          }
        }
        if (areaErrors.length > 0) {
          setErrors(['Import FAILED: Invalid area values detected. No orders were imported.', '', ...areaErrors]);
          setImporting(false);
          return;
        }
      }

      const orderGroups = new Map<string, {
        orderRef: string;
        orderData: ValidatedOrderLine;
        items: { sku_name_or_code: string; qty: number; price: number; productId: string | null }[];
      }>();
      const duplicateSkuErrors: string[] = [];

      for (const row of validation.valid) {
        const orderRef = toUpperLatin(row.order_ref.trim());
        const skuValue = row.sku_name_or_code?.trim();
        if (!skuValue) {
          duplicateSkuErrors.push(`Order ${orderRef}: SKU code is required for all order items.`);
          continue;
        }
        const productId = findProductId(skuValue);
        if (!productId) {
          duplicateSkuErrors.push(`Order ${orderRef}: SKU "${skuValue}" not found in product list.`);
          continue;
        }
        if (!orderGroups.has(orderRef)) {
          orderGroups.set(orderRef, { orderRef, orderData: row, items: [] });
        }
        const group = orderGroups.get(orderRef)!;
        if (row.transfer_amount !== group.orderData.transfer_amount || row.transfer_receipt_url !== group.orderData.transfer_receipt_url) {
          duplicateSkuErrors.push(`Order ${orderRef}: Transfer amount and receipt must match on every item row.`);
        }
        const existingItem = group.items.find(i => i.productId === productId);
        if (existingItem) {
          duplicateSkuErrors.push(`Order ${orderRef}: Duplicate SKU detected - "${skuValue}" appears more than once.`);
          continue;
        }
        group.items.push({ sku_name_or_code: skuValue, qty: row.qty, price: row.price, productId });
      }

      if (duplicateSkuErrors.length > 0) {
        setErrors(['Import FAILED: Validation errors found. No orders were imported.', '', ...duplicateSkuErrors]);
        setImporting(false);
        return;
      }

      for (const [orderRef, group] of orderGroups) {
        if (group.items.length === 0) {
          duplicateSkuErrors.push(`Order ${orderRef}: No valid SKU items found.`);
        }
      }
      if (duplicateSkuErrors.length > 0) {
        setErrors(['Import FAILED: Orders without valid items. No orders were imported.', '', ...duplicateSkuErrors]);
        setImporting(false);
        return;
      }

      const newErrors: string[] = [];
      let created = 0;

      for (const [orderRef, group] of orderGroups) {
        try {
          let totalQty = 0;
          let totalAmount = 0;
          for (const item of group.items) {
            totalQty += item.qty;
            totalAmount += Math.round(item.price * 100); // price IS the final sales amount per SKU, summed in cents
          }
          totalAmount /= 100;

          const orderData = {
              order_code: toUpperLatin(orderRef),
              customer_name: toUpperLatin(group.orderData.customer_name),
              phone: group.orderData.phone,
              address: toUpperLatin(group.orderData.address),
              area: toUpperLatin(group.orderData.area) || null,
              channel: toUpperLatin(group.orderData.channel) || null,
              notes: group.orderData.notes || null,
              order_date: group.orderData.order_date || new Date().toISOString().split('T')[0],
              payment_method: group.orderData.payment_method === 'TRANSFER' ? 'TRANSFER' : 'COD',
              expected_pickup_date: group.orderData.expected_pickup_date || null,
              salesperson_id: profile.id,
              order_owner_id: orderOwnerId,
              fulfillment_warehouse_id: fulfillmentWarehouseId || null,
              status: defaultStatus,
              total_qty: totalQty,
              total_amount: totalAmount,
            };
          if (completed.current.has(orderRef)) continue;
          const id = requestIds.current[orderRef] ||= crypto.randomUUID();
          const payment = payments.get(orderRef)!;
          let receiptUrl = payment.row.transfer_receipt_url || null;
          const receiptFile = receiptFiles[orderRef];
          if (payment.transfer > 0 && receiptFile) {
            if (receiptUrls.current[orderRef]?.file !== receiptFile) {
              const { blob, extension } = await compressImage(receiptFile, { maxWidth: 1000, quality: 0.8 });
              const path = 'receipts/' + id + '/' + crypto.randomUUID() + '.' + extension;
              const { error } = await supabase.storage.from('receipts').upload(path, blob, { contentType: blob.type });
              if (error) throw error;
              const { data } = supabase.storage.from('receipts').getPublicUrl(path);
              receiptUrls.current[orderRef] = { file: receiptFile, url: data.publicUrl };
            }
            receiptUrl = receiptUrls.current[orderRef].url;
          }
          await callSupabaseRpc('import_order_with_payment', {
            p_order: { ...orderData, id, receipt_url: receiptUrl },
            p_transfer_amount: payment.transfer,
            p_items: group.items.map(item => ({ product_id: item.productId, sku_label: item.sku_name_or_code, qty: item.qty, line_total: item.price })),
          });
          completed.current.add(orderRef);
          created++;
        } catch (err: any) {
          newErrors.push(`Order ${orderRef}: ${err.message}`);
        }
      }

      setErrors(newErrors);
      setSuccessCount(completed.current.size);

      if (created > 0) {
        toast({
          title: 'Import Complete',
          description: `Successfully imported ${created} order(s)${newErrors.length > 0 ? ` with ${newErrors.length} error(s)` : ''}`,
        });
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        invalidateOrderQueries(queryClient);
      }

      if (newErrors.length === 0) {
        onOpenChange(false);
        clearErrors();
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Import Failed', description: err.message });
    } finally {
      importLock.current = false;
      setImporting(false);
    }
  };

  const paymentPreview = useMemo(() => {
    if (!rawData) return { groups: [], error: '' };
    const validation = validateOrderLines(applyColumnMapping(rawData.rows, columnMapping));
    if (validation.errors.length) return { groups: [], error: validation.errors.map(e => 'Row ' + e.row + ': ' + e.message).join('; ') };
    try { return { groups: Array.from(groupImportPayments(validation.valid).entries()), error: '' }; }
    catch (error) { return { groups: [], error: (error as Error).message }; }
  }, [rawData, columnMapping]);
  const missingReceipts = paymentPreview.groups.some(([ref, payment]) => payment.transfer > 0 && !receiptFiles[ref] && !payment.row.transfer_receipt_url);
  const canProceedToPreview = areRequiredFieldsMapped(columnMapping);
  const selectedSource = inventorySources.find(source => source.warehouse_id === fulfillmentWarehouseId);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) clearErrors(); onOpenChange(isOpen); }}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90dvh] flex flex-col gap-0 p-0 overflow-hidden rounded-2xl border-border/40">
        {/* ─── Hero Header ─── */}
        <div className="relative px-6 pt-6 pb-5 bg-gradient-to-br from-primary/8 via-primary/4 to-transparent border-b border-border/40">
          <div className="flex items-start gap-4">
            <img
              src={capybaraImport}
              alt="Import Assistant"
              className="h-16 w-16 object-contain drop-shadow-md flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl font-bold text-foreground tracking-tight">Import Orders from CSV</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-0.5">Upload a spreadsheet and automatically create orders</DialogDescription>
            </div>
          </div>

          {/* Step Indicator */}
          <div className="mt-5">
            <StepIndicator current={step} />
          </div>
        </div>

        {/* ─── Content ─── */}
        <div className="min-h-0 overflow-y-auto px-6 py-5">
          {/* ═══ Step: Upload ═══ */}
          {step === 'upload' && (
            <div className="space-y-5">
              {/* Owner Selection Card */}
              {inventorySources.length > 0 && (
                <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                      <Users className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Inventory Source</h3>
                      <p className="text-[11px] text-muted-foreground">Products and delivered stock deduction use this warehouse</p>
                    </div>
                  </div>
                  <Select
                    value={fulfillmentWarehouseId}
                    onValueChange={(warehouseId) => {
                      const source = inventorySources.find(item => item.warehouse_id === warehouseId);
                      setFulfillmentWarehouseId(warehouseId);
                      if (source) setOrderOwnerId(source.owner_user_id);
                    }}
                  >
                    <SelectTrigger className="h-11 rounded-xl bg-background border-border/60">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-bold">
                          {(selectedSource?.owner_display_name || 'U')[0].toUpperCase()}
                        </div>
                        <SelectValue placeholder="Select inventory source" />
                      </div>
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {inventorySources.map(source => (
                        <SelectItem key={source.warehouse_id} value={source.warehouse_id} className="rounded-lg">
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                              {source.owner_display_name[0].toUpperCase()}
                            </div>
                            {source.owner_display_name} · {source.warehouse_name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Upload Zone */}
              <div
                ref={dropZoneRef}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={cn(
                  "relative rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-300 cursor-pointer",
                  isDragging
                    ? "border-primary bg-primary/5 scale-[1.01]"
                    : file
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/60 bg-muted/20 hover:border-primary/30 hover:bg-muted/40"
                )}
                onClick={() => !file && fileInputRef.current?.click()}
              >
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {file ? (
                  /* File Uploaded State */
                  <div className="space-y-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mx-auto">
                      <CheckCircle className="h-7 w-7 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{file.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {rawData ? `${rawData.rows.length} rows detected` : 'Processing...'}
                      </p>
                      {rawData && (
                        <p className="text-xs text-primary font-medium mt-0.5">✓ Ready for column mapping</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearErrors();
                      }}
                    >
                      <X className="h-3.5 w-3.5 mr-1.5" />
                      Remove & re-upload
                    </Button>
                  </div>
                ) : (
                  /* Empty Upload State */
                  <div className="space-y-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60 mx-auto">
                      <Upload className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {isDragging ? 'Drop your file here!' : 'Drag your CSV file here'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">or click to select a file</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                    >
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                      Select File
                    </Button>
                    <div className="flex items-center justify-center gap-4 text-[11px] text-muted-foreground/60 pt-1">
                      <span>CSV (UTF-8)</span>
                      <span className="h-3 w-px bg-border" />
                      <span>Max 10,000 rows</span>
                      <span className="h-3 w-px bg-border" />
                      <span>Max 5MB</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Template Cards */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Download Template</h3>
                <div className="grid grid-cols-1 gap-3">
                  <div className="rounded-xl border border-border/50 bg-card p-4 hover:border-border hover:shadow-sm transition-all">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent flex-shrink-0">
                        <Package className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-foreground">Multi-SKU Template</h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                          One row per SKU. Includes payment, transfer amount, order notes and line totals. Upload receipts in the review step.
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 h-7 px-2.5 text-xs text-primary hover:text-primary hover:bg-primary/10 rounded-lg"
                          onClick={() => downloadTemplate('order_lines')}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Download
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ Step: Column Mapping ═══ */}
          {step === 'mapping' && rawData && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3 flex items-center gap-3">
                <FileSpreadsheet className="h-4 w-4 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{file?.name}</p>
                  <p className="text-[11px] text-muted-foreground">{rawData.headers.length} columns · {rawData.rows.length} rows</p>
                </div>
              </div>

              <ColumnMappingStep
                csvHeaders={rawData.headers}
                columnMapping={columnMapping}
                onMappingChange={setColumnMapping}
                sampleData={rawData.rows.slice(0, 3)}
              />
            </div>
          )}

          {/* ═══ Step: Preview & Import ═══ */}
          {step === 'preview' && (
            <div className="space-y-4">
              {mappedPreview.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Data Preview</Label>
                  <div className="border border-border/50 rounded-xl overflow-x-auto">
                    <table className="w-full min-w-[400px] text-xs">
                      <thead className="bg-muted/40">
                        <tr>
                          {Object.keys(mappedPreview[0]).slice(0, 6).map((key) => (
                            <th key={key} className="px-3 py-2 text-left font-semibold text-foreground whitespace-nowrap">{key}</th>
                          ))}
                          {Object.keys(mappedPreview[0]).length > 6 && (
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                              +{Object.keys(mappedPreview[0]).length - 6} more
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {mappedPreview.slice(0, 3).map((row, i) => (
                          <tr key={i} className="border-t border-border/30">
                            {Object.values(row).slice(0, 6).map((val, j) => (
                              <td key={j} className="px-3 py-2 max-w-[100px] truncate text-foreground">
                                {val || <span className="text-muted-foreground italic">—</span>}
                              </td>
                            ))}
                            {Object.keys(row).length > 6 && (
                              <td className="px-3 py-2 text-muted-foreground">…</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-muted-foreground text-center">
                    Showing {Math.min(3, rawData?.rows.length || 0)} of {rawData?.rows.length} total rows
                  </p>
                </div>
              )}

              <section className="space-y-3" aria-label="Payment and receipt review">
                <h3 className="font-semibold">Payments & transfer receipts</h3>
                <p className="text-sm text-muted-foreground">Line totals include all units in each SKU row. Example: 42 + 30 = BND72; transfer BND30 leaves expected COD BND42 after confirmation. Pending transfer still means Driver collects BND72.</p>
                {paymentPreview.error && <p role="alert" className="text-sm text-destructive">{paymentPreview.error}</p>}
                {paymentPreview.groups.filter(([, payment]) => payment.transfer > 0).map(([ref, payment]) => (
                  <div key={ref} className="rounded-xl border p-4 space-y-2">
                    <p className="font-semibold">{ref}</p>
                    <p className="text-sm">Total {formatBND(payment.total)} · Transfer submitted {formatBND(payment.transfer)} · Expected COD {formatBND(payment.total - payment.transfer)}</p>
                    <p className="text-xs text-muted-foreground">Receipt will be pending confirmation.</p>
                    <Label htmlFor={'receipt-' + ref}>Transfer receipt</Label>
                    <Input id={'receipt-' + ref} type="file" accept="image/*" disabled={importing || completed.current.has(ref)} onChange={event => {
                      const file = event.target.files?.[0];
                      if (file && (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024)) { toast({ variant: 'destructive', title: 'Choose an image up to 10MB' }); event.target.value = ''; return; }
                      setReceiptFiles(current => { const next = { ...current }; if (file) next[ref] = file; else delete next[ref]; return next; });
                    }} />
                    {receiptFiles[ref] ? <div><p className="text-xs">Selected: {receiptFiles[ref].name}</p><ReceiptFilePreview file={receiptFiles[ref]} /></div> : payment.row.transfer_receipt_url ? <a className="text-sm underline" href={payment.row.transfer_receipt_url} target="_blank" rel="noreferrer">View existing receipt</a> : <p className="text-xs text-destructive">Receipt required</p>}
                  </div>
                ))}
              </section>
              {successCount > 0 && (
                <div className="rounded-xl bg-primary/8 border border-primary/20 p-4 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <CheckCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Successfully imported {successCount} orders</p>
                    <p className="text-xs text-muted-foreground">Orders are now ready in your inbox</p>
                  </div>
                </div>
              )}

              {errors.length > 0 && (
                <div className="rounded-xl bg-destructive/8 border border-destructive/20 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <span className="font-semibold text-sm">Errors ({errors.filter(e => e.trim()).length})</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg"
                      onClick={clearErrors}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Reset
                    </Button>
                  </div>
                  <ul className="text-xs text-destructive/90 space-y-1 max-h-28 overflow-y-auto">
                    {errors.filter(e => e.trim()).slice(0, 10).map((err, i) => (
                      <li key={i} className="break-words leading-relaxed pl-1">• {err}</li>
                    ))}
                    {errors.filter(e => e.trim()).length > 10 && (
                      <li className="text-destructive/60 italic pl-1">+{errors.filter(e => e.trim()).length - 10} more errors</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Footer Actions ─── */}
        <div className="shrink-0 border-t border-border/40 px-6 py-4 bg-card flex items-center justify-between gap-3">
          <div>
            {step === 'upload' && (
              <Button variant="outline" onClick={() => onOpenChange(false)} className="h-10 rounded-xl">
                Cancel
              </Button>
            )}
            {step === 'mapping' && (
              <Button variant="outline" onClick={handleBackToUpload} className="h-10 rounded-xl">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back
              </Button>
            )}
            {step === 'preview' && (
              <Button variant="outline" onClick={handleBackToMapping} className="h-10 rounded-xl">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back
              </Button>
            )}
          </div>

          <div>
            {step === 'upload' && file && rawData && (
              <Button onClick={() => setStep('mapping')} className="h-10 rounded-xl font-semibold">
                Continue to Column Mapping
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            )}
            {step === 'mapping' && (
              <Button onClick={handleProceedToPreview} disabled={!canProceedToPreview} className="h-10 rounded-xl font-semibold">
                Review & Import
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            )}
            {step === 'preview' && (
              <Button onClick={handleImport} disabled={importing || !!paymentPreview.error || missingReceipts} className="h-10 rounded-xl font-semibold">
                {importing ? 'Importing...' : `Import ${paymentPreview.groups.length} Orders`}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
