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
      <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl">Import Orders</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Import orders with multi-SKU lines from a CSV file. order_ref is required.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload" className="text-xs sm:text-sm">Upload CSV</TabsTrigger>
            <TabsTrigger value="templates" className="text-xs sm:text-sm">Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-3 sm:space-y-4">
            <div className="border-2 border-dashed rounded-lg p-4 sm:p-8 text-center">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <FileSpreadsheet className="h-8 w-8 sm:h-12 sm:w-12 mx-auto text-muted-foreground mb-3 sm:mb-4" />
              <p className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4 break-all">
                {file ? file.name : 'Drop a CSV file here or click to browse'}
              </p>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                Select File
              </Button>
            </div>

            {preview.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">Preview (first 5 rows)</Label>
                <div className="border rounded-lg overflow-x-auto -mx-2 sm:mx-0">
                  <table className="w-full text-xs sm:text-sm min-w-[600px]">
                    <thead className="bg-muted/50">
                      <tr>
                        {Object.keys(preview[0]).map((key) => (
                          <th key={key} className="px-2 sm:px-3 py-1.5 sm:py-2 text-left font-medium whitespace-nowrap text-xs">
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, i) => (
                        <tr key={i} className="border-t">
                          {Object.values(row).map((val, j) => (
                            <td key={j} className="px-2 sm:px-3 py-1.5 sm:py-2 max-w-[100px] sm:max-w-[150px] truncate text-xs">
                              {val}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {successCount > 0 && (
              <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 sm:p-4">
                <div className="flex items-center gap-2 text-primary">
                  <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                  <span className="font-medium text-xs sm:text-sm">Successfully imported {successCount} orders</span>
                </div>
              </div>
            )}

            {errors.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 sm:p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                    <span className="font-medium text-xs sm:text-sm">Import Errors ({errors.filter(e => e.trim()).length})</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-destructive hover:text-destructive hover:bg-destructive/20"
                    onClick={clearErrors}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Clear & Retry
                  </Button>
                </div>
                <ul className="text-xs sm:text-sm text-destructive space-y-1 max-h-32 sm:max-h-40 overflow-y-auto">
                  {errors.filter(e => e.trim()).map((err, i) => (
                    <li key={i} className="break-words">{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>

          <TabsContent value="templates" className="space-y-3 sm:space-y-4">
            <div className="grid gap-3 sm:gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 p-3 sm:p-4 border rounded-lg">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm">Order Lines Template</h4>
                  <p className="text-xs text-muted-foreground">
                    One row per SKU line. Group by order_ref (required).
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => downloadTemplate('order_lines')} className="shrink-0">
                  <Download className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  Download
                </Button>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 p-3 sm:p-4 border rounded-lg">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm">Simple Orders Template</h4>
                  <p className="text-xs text-muted-foreground">
                    Basic order import without line items
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => downloadTemplate('orders')} className="shrink-0">
                  <Download className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  Download
                </Button>
              </div>
            </div>
            
            <div className="bg-muted/50 rounded-lg p-3 sm:p-4 text-xs sm:text-sm space-y-2">
              <h4 className="font-medium text-sm">Import Logic</h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground text-xs">
                <li><strong>order_ref is REQUIRED</strong> - system will not auto-generate</li>
                <li>Rows with same <code className="bg-muted px-1 rounded">order_ref</code> grouped into one order</li>
                <li>Products matched by <code className="bg-muted px-1 rounded">sku_code</code> then <code className="bg-muted px-1 rounded">sku_name</code></li>
                <li><strong>Salesperson:</strong> Only your own products are allowed; invalid SKUs will fail entire import</li>
                <li>Dates accept multiple formats (M/D/YYYY, D/M/YYYY, YYYY-MM-DD)</li>
              </ul>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button size="sm" onClick={handleImport} disabled={!file || importing || errors.length > 0} className="w-full sm:w-auto">
            {importing ? 'Importing...' : 'Import Orders'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}