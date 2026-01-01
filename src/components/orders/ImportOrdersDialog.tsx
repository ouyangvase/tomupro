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
import { Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react';
import { parseCSV, downloadTemplate } from '@/lib/csv';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useProducts, useCreateProduct } from '@/hooks/useProducts';

interface ImportOrdersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedOrderLine {
  order_ref: string;
  order_date: string;
  customer_name: string;
  phone: string;
  address: string;
  area: string;
  channel: string;
  payment_method: string;
  expected_pickup_date: string;
  notes: string;
  sku_name_or_code: string;
  qty: string;
  price: string;
}

interface GroupedOrder {
  orderRef: string;
  orderData: {
    order_date: string;
    customer_name: string;
    phone: string;
    address: string;
    area: string;
    channel: string;
    payment_method: string;
    expected_pickup_date: string;
    notes: string;
  };
  items: {
    sku_name_or_code: string;
    qty: number;
    price: number;
  }[];
}

export function ImportOrdersDialog({ open, onOpenChange }: ImportOrdersDialogProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: products = [] } = useProducts();
  const createProduct = useCreateProduct();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [successCount, setSuccessCount] = useState(0);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setErrors([]);
    setSuccessCount(0);

    const text = await selectedFile.text();
    const rows = parseCSV(text);
    setPreview(rows.slice(0, 5));
  };

  const findOrCreateProduct = async (skuNameOrCode: string): Promise<string | null> => {
    if (!skuNameOrCode.trim()) return null;

    // Try to find by sku_code first
    let product = products.find(p => p.sku_code?.toLowerCase() === skuNameOrCode.toLowerCase());
    
    // Try to find by sku_name
    if (!product) {
      product = products.find(p => p.sku_name.toLowerCase() === skuNameOrCode.toLowerCase());
    }

    if (product) return product.id;

    // Create new product if user can create
    if (profile?.role === 'salesperson' || profile?.role === 'admin') {
      try {
        const newProduct = await createProduct.mutateAsync({
          sku_name: skuNameOrCode,
          created_by: profile.id,
        });
        return newProduct.id;
      } catch {
        return null;
      }
    }

    return null;
  };

  const handleImport = async () => {
    if (!file || !profile) return;

    setImporting(true);
    setErrors([]);
    setSuccessCount(0);

    try {
      const text = await file.text();
      const rows = parseCSV(text) as unknown as ParsedOrderLine[];

      // Group rows by order_ref
      const orderGroups = new Map<string, GroupedOrder>();
      
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const orderRef = row.order_ref?.trim() || `auto-${Date.now()}-${i}`;
        
        if (!orderGroups.has(orderRef)) {
          orderGroups.set(orderRef, {
            orderRef,
            orderData: {
              order_date: row.order_date || new Date().toISOString().split('T')[0],
              customer_name: row.customer_name || '',
              phone: row.phone || '',
              address: row.address || '',
              area: row.area || '',
              channel: row.channel || '',
              payment_method: row.payment_method || 'COD',
              expected_pickup_date: row.expected_pickup_date || '',
              notes: row.notes || '',
            },
            items: [],
          });
        }

        const group = orderGroups.get(orderRef)!;
        if (row.sku_name_or_code?.trim()) {
          group.items.push({
            sku_name_or_code: row.sku_name_or_code,
            qty: parseInt(row.qty) || 1,
            price: parseFloat(row.price) || 0,
          });
        }
      }

      const newErrors: string[] = [];
      let created = 0;

      for (const [orderRef, group] of orderGroups) {
        try {
          // Validate required fields
          if (!group.orderData.customer_name || !group.orderData.phone || !group.orderData.address) {
            newErrors.push(`Order ${orderRef}: Missing required fields (customer_name, phone, address)`);
            continue;
          }

          // Calculate totals
          let totalQty = 0;
          let totalAmount = 0;
          for (const item of group.items) {
            totalQty += item.qty;
            totalAmount += item.qty * item.price;
          }

          // Create order
          const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert({
              customer_name: group.orderData.customer_name,
              phone: group.orderData.phone,
              address: group.orderData.address,
              area: group.orderData.area || null,
              channel: group.orderData.channel || null,
              notes: group.orderData.notes || null,
              order_date: group.orderData.order_date || new Date().toISOString().split('T')[0],
              payment_method: (group.orderData.payment_method?.toUpperCase() === 'TRANSFER' ? 'TRANSFER' : 'COD') as 'COD' | 'TRANSFER',
              expected_pickup_date: group.orderData.expected_pickup_date || null,
              salesperson_id: profile.id,
              status: 'BOOKING',
              total_qty: totalQty,
              total_amount: totalAmount,
            })
            .select()
            .single();

          if (orderError) {
            newErrors.push(`Order ${orderRef}: ${orderError.message}`);
            continue;
          }

          // Create order items
          for (const item of group.items) {
            const productId = await findOrCreateProduct(item.sku_name_or_code);
            
            await supabase.from('order_items').insert({
              order_id: order.id,
              product_id: productId,
              sku_label: item.sku_name_or_code,
              qty: item.qty,
              price: item.price,
              line_total: item.qty * item.price,
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
        queryClient.invalidateQueries({ queryKey: ['products'] });
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Orders</DialogTitle>
          <DialogDescription>
            Import orders with multi-SKU lines from a CSV file. Each row represents one order item line.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload">Upload CSV</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-4">
                {file ? file.name : 'Drop a CSV file here or click to browse'}
              </p>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Select File
              </Button>
            </div>

            {preview.length > 0 && (
              <div className="space-y-2">
                <Label>Preview (first 5 rows)</Label>
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        {Object.keys(preview[0]).map((key) => (
                          <th key={key} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, i) => (
                        <tr key={i} className="border-t">
                          {Object.values(row).map((val, j) => (
                            <td key={j} className="px-3 py-2 max-w-[150px] truncate">
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
              <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
                <div className="flex items-center gap-2 text-primary mb-2">
                  <CheckCircle className="h-4 w-4" />
                  <span className="font-medium">Successfully imported {successCount} orders</span>
                </div>
              </div>
            )}

            {errors.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
                <div className="flex items-center gap-2 text-destructive mb-2">
                  <AlertCircle className="h-4 w-4" />
                  <span className="font-medium">Import Errors ({errors.length})</span>
                </div>
                <ul className="text-sm text-destructive space-y-1 max-h-32 overflow-y-auto">
                  {errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>

          <TabsContent value="templates" className="space-y-4">
            <div className="grid gap-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h4 className="font-medium">Order Lines Template (Recommended)</h4>
                  <p className="text-sm text-muted-foreground">
                    One row per SKU line. Group by order_ref to create multi-item orders.
                  </p>
                </div>
                <Button variant="outline" onClick={() => downloadTemplate('order_lines')}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h4 className="font-medium">Simple Orders Template</h4>
                  <p className="text-sm text-muted-foreground">
                    Basic order import without line items
                  </p>
                </div>
                <Button variant="outline" onClick={() => downloadTemplate('orders')}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>
            
            <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
              <h4 className="font-medium">Import Logic</h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Rows with the same <code className="bg-muted px-1 rounded">order_ref</code> are grouped into one order</li>
                <li>Products are matched by <code className="bg-muted px-1 rounded">sku_code</code> first, then <code className="bg-muted px-1 rounded">sku_name</code></li>
                <li>If no product match found, a new product is created automatically</li>
                <li>Order totals are calculated from line items</li>
              </ul>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!file || importing}>
            {importing ? 'Importing...' : 'Import Orders'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
