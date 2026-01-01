import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle, X } from 'lucide-react';
import { parseCSV, downloadTemplate } from '@/lib/csv';
import { validateOrderLines, type ValidatedOrderLine } from '@/lib/csvValidation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useProducts } from '@/hooks/useProducts';

interface ImportOrdersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultStatus?: 'BOOKING' | 'READY';
}

export function ImportOrdersDialog({ open, onOpenChange, defaultStatus = 'BOOKING' }: ImportOrdersDialogProps) {
  const { profile, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: allProducts = [] } = useProducts();
  // Filter products for salespersons - only show their own products
  const products = role === 'salesperson' 
    ? allProducts.filter((p: any) => p.owner_user_id === profile?.id)
    : allProducts;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [successCount, setSuccessCount] = useState(0);

  // Clear all state and reset file input
  const clearErrors = () => {
    setErrors([]);
    setFile(null);
    setPreview([]);
    setSuccessCount(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file size (max 5MB)
    if (selectedFile.size > 5 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Maximum file size is 5MB' });
      return;
    }

    setFile(selectedFile);
    // Clear errors when user selects a new file
    setErrors([]);
    setSuccessCount(0);

    const text = await selectedFile.text();
    const rows = parseCSV(text);
    
    // Validate rows and show preview
    const validation = validateOrderLines(rows);
    if (validation.errors.length > 0) {
      setErrors(validation.errors.map(e => `Row ${e.row}: ${e.message}`));
    }
    
    setPreview(rows.slice(0, 5));
  };

  /**
   * Validates SKU ownership for a salesperson - ALL-OR-NOTHING approach
   * Returns { valid: boolean, errors: string[] }
   */
  const validateSkuOwnership = (
    validatedRows: ValidatedOrderLine[],
    salespersonProducts: typeof products
  ): { valid: boolean; errors: string[] } => {
    const skuErrors: string[] = [];

    for (let i = 0; i < validatedRows.length; i++) {
      const row = validatedRows[i];
      const csvRowNum = i + 2; // +2 for header row + 1-indexed
      const skuValue = row.sku_name_or_code?.trim();

      // Skip if no SKU provided (custom item)
      if (!skuValue) continue;

      // Try to find by sku_code first (exact match)
      const codeMatches = salespersonProducts.filter(
        (p: any) => p.sku_code?.toLowerCase() === skuValue.toLowerCase()
      );

      if (codeMatches.length === 1) {
        // Found exactly one by sku_code - valid
        continue;
      }

      if (codeMatches.length > 1) {
        skuErrors.push(`Row ${csvRowNum}: Multiple products with sku_code="${skuValue}"; please use unique sku_code`);
        continue;
      }

      // No code match, try to find by sku_name
      const nameMatches = salespersonProducts.filter(
        (p: any) => p.sku_name.toLowerCase() === skuValue.toLowerCase()
      );

      if (nameMatches.length === 0) {
        skuErrors.push(`Row ${csvRowNum}: SKU not found in your product list (sku_name_or_code="${skuValue}")`);
      } else if (nameMatches.length > 1) {
        skuErrors.push(`Row ${csvRowNum}: SKU name is ambiguous (${nameMatches.length} matches); please use sku_code (sku_name="${skuValue}")`);
      }
      // If exactly one name match, it's valid
    }

    return {
      valid: skuErrors.length === 0,
      errors: skuErrors,
    };
  };

  /**
   * Find product ID by SKU (already validated)
   */
  const findProductId = (skuNameOrCode: string): string | null => {
    if (!skuNameOrCode.trim()) return null;

    // Try to find by sku_code first
    let product = products.find((p: any) => p.sku_code?.toLowerCase() === skuNameOrCode.toLowerCase());
    
    // Try to find by sku_name
    if (!product) {
      product = products.find((p: any) => p.sku_name.toLowerCase() === skuNameOrCode.toLowerCase());
    }

    return product?.id || null;
  };

  const handleImport = async () => {
    if (!file || !profile) return;

    setImporting(true);
    setErrors([]);
    setSuccessCount(0);

    try {
      const text = await file.text();
      const rows = parseCSV(text);
      
      // Step 1: Validate all rows with zod schema (includes order_ref required check)
      const validation = validateOrderLines(rows);
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

      // Step 2: Validate SKU ownership (ALL-OR-NOTHING for salesperson)
      if (role === 'salesperson') {
        const skuValidation = validateSkuOwnership(validation.valid, products);
        if (!skuValidation.valid) {
          setErrors([
            'Import FAILED: Invalid SKUs found. No orders were imported.',
            '',
            ...skuValidation.errors,
          ]);
          setImporting(false);
          return;
        }
      }

      // Step 3: Group validated rows by order_ref
      const orderGroups = new Map<string, {
        orderRef: string;
        orderData: ValidatedOrderLine;
        items: { sku_name_or_code: string; qty: number; price: number }[];
      }>();
      
      for (let i = 0; i < validation.valid.length; i++) {
        const row = validation.valid[i];
        const orderRef = row.order_ref.trim();
        
        if (!orderGroups.has(orderRef)) {
          orderGroups.set(orderRef, {
            orderRef,
            orderData: row,
            items: [],
          });
        }

        const group = orderGroups.get(orderRef)!;
        if (row.sku_name_or_code?.trim()) {
          group.items.push({
            sku_name_or_code: row.sku_name_or_code,
            qty: row.qty,
            price: row.price,
          });
        }
      }

      // Step 4: Create orders and items
      const newErrors: string[] = [];
      let created = 0;

      for (const [orderRef, group] of orderGroups) {
        try {
          // Calculate totals - price IS the line amount (no multiplication by qty)
          let totalQty = 0;
          let totalAmount = 0;
          for (const item of group.items) {
            totalQty += item.qty;
            totalAmount += item.price; // price = line amount directly
          }

          // Create order with user-provided order_ref as order_code
          const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert([{
              order_code: orderRef,
              customer_name: group.orderData.customer_name,
              phone: group.orderData.phone,
              address: group.orderData.address,
              area: group.orderData.area || null,
              channel: group.orderData.channel || null,
              notes: group.orderData.notes || null,
              order_date: group.orderData.order_date || new Date().toISOString().split('T')[0],
              payment_method: group.orderData.payment_method as 'COD' | 'TRANSFER',
              expected_pickup_date: group.orderData.expected_pickup_date || null,
              salesperson_id: profile.id,
              status: defaultStatus,
              total_qty: totalQty,
              total_amount: totalAmount,
            }])
            .select()
            .single();

          if (orderError) {
            newErrors.push(`Order ${orderRef}: ${orderError.message}`);
            continue;
          }

          // Create order items
          for (const item of group.items) {
            const productId = findProductId(item.sku_name_or_code);
            
            await supabase.from('order_items').insert({
              order_id: order.id,
              product_id: productId,
              sku_label: item.sku_name_or_code,
              qty: item.qty,
              price: item.price,
              line_total: item.price, // price = line amount directly
            });
          }

          created++;
        } catch (err: any) {
          newErrors.push(`Order ${orderRef}: ${err.message}`);
        }
      }

      setErrors(newErrors);
      setSuccessCount(created);

      if (created > 0) {
        toast({
          title: 'Import Complete',
          description: `Successfully imported ${created} order(s)${newErrors.length > 0 ? ` with ${newErrors.length} error(s)` : ''}`,
        });
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      }

      if (newErrors.length === 0) {
        onOpenChange(false);
        setFile(null);
        setPreview([]);
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Import Failed',
        description: err.message,
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[85vh] overflow-y-auto p-3 sm:p-6">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-base sm:text-lg">Import Orders</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm leading-relaxed">
            Upload a CSV file with orders. Accepts various header formats (e.g., "Order Ref", "order_ref", "OrderRef").
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-8 sm:h-9">
            <TabsTrigger value="upload" className="text-xs sm:text-sm">Upload CSV</TabsTrigger>
            <TabsTrigger value="templates" className="text-xs sm:text-sm">Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-3 mt-3">
            <div className="border-2 border-dashed rounded-lg p-4 sm:p-6 text-center">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <FileSpreadsheet className="h-6 w-6 sm:h-10 sm:w-10 mx-auto text-muted-foreground mb-2 sm:mb-3" />
              <p className="text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3 break-all px-2">
                {file ? file.name : 'Select a CSV file to import'}
              </p>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="h-8">
                <Upload className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5" />
                <span className="text-xs sm:text-sm">Select File</span>
              </Button>
            </div>

            {preview.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Preview (first 5 rows)</Label>
                <div className="border rounded-lg overflow-x-auto text-xs">
                  <table className="w-full min-w-[400px]">
                    <thead className="bg-muted/50">
                      <tr>
                        {Object.keys(preview[0]).slice(0, 6).map((key) => (
                          <th key={key} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                            {key}
                          </th>
                        ))}
                        {Object.keys(preview[0]).length > 6 && (
                          <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                            +{Object.keys(preview[0]).length - 6} more
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.slice(0, 3).map((row, i) => (
                        <tr key={i} className="border-t">
                          {Object.values(row).slice(0, 6).map((val, j) => (
                            <td key={j} className="px-2 py-1.5 max-w-[80px] truncate">
                              {val || <span className="text-muted-foreground italic">empty</span>}
                            </td>
                          ))}
                          {Object.keys(row).length > 6 && (
                            <td className="px-2 py-1.5 text-muted-foreground">...</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.length > 3 && (
                  <p className="text-xs text-muted-foreground text-center">
                    +{preview.length - 3} more rows in preview
                  </p>
                )}
              </div>
            )}

            {successCount > 0 && (
              <div className="bg-primary/10 border border-primary/30 rounded-lg p-2.5 sm:p-3">
                <div className="flex items-center gap-2 text-primary">
                  <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="font-medium text-xs sm:text-sm">Imported {successCount} orders</span>
                </div>
              </div>
            )}

            {errors.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-2.5 sm:p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="font-medium text-xs sm:text-sm">Errors ({errors.filter(e => e.trim()).length})</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/20"
                    onClick={clearErrors}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Clear
                  </Button>
                </div>
                <ul className="text-xs text-destructive space-y-0.5 max-h-24 overflow-y-auto">
                  {errors.filter(e => e.trim()).slice(0, 10).map((err, i) => (
                    <li key={i} className="break-words leading-relaxed">{err}</li>
                  ))}
                  {errors.filter(e => e.trim()).length > 10 && (
                    <li className="text-destructive/70 italic">+{errors.filter(e => e.trim()).length - 10} more errors</li>
                  )}
                </ul>
              </div>
            )}
          </TabsContent>

          <TabsContent value="templates" className="space-y-3 mt-3">
            <div className="grid gap-2.5">
              <div className="flex items-center justify-between gap-3 p-2.5 sm:p-3 border rounded-lg">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-xs sm:text-sm">Order Lines Template</h4>
                  <p className="text-xs text-muted-foreground truncate">
                    Multi-SKU per order (group by order_ref)
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => downloadTemplate('order_lines')} className="shrink-0 h-7 sm:h-8">
                  <Download className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  <span className="text-xs">Download</span>
                </Button>
              </div>
              <div className="flex items-center justify-between gap-3 p-2.5 sm:p-3 border rounded-lg">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-xs sm:text-sm">Simple Orders Template</h4>
                  <p className="text-xs text-muted-foreground truncate">
                    Basic orders without items
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => downloadTemplate('orders')} className="shrink-0 h-7 sm:h-8">
                  <Download className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  <span className="text-xs">Download</span>
                </Button>
              </div>
            </div>
            
            <div className="bg-muted/50 rounded-lg p-2.5 sm:p-3 space-y-1.5">
              <h4 className="font-medium text-xs sm:text-sm">Accepted Headers</h4>
              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>order_ref:</strong> "Order Ref", "order_ref", "Reference", etc.</p>
                <p><strong>customer_name:</strong> "Customer Name", "customer", "Name", etc.</p>
                <p><strong>phone:</strong> "Phone", "Tel", "Mobile", "Contact", etc.</p>
                <p><strong>sku:</strong> "SKU", "Product", "sku_code", "sku_name", etc.</p>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex-row gap-2 pt-2 sm:pt-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none h-8">
            Cancel
          </Button>
          <Button size="sm" onClick={handleImport} disabled={!file || importing || errors.length > 0} className="flex-1 sm:flex-none h-8">
            {importing ? 'Importing...' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}