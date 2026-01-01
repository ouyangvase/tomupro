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
import { Upload, Download, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { parseCSV, downloadTemplate } from '@/lib/csv';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

interface ImportOrdersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportOrdersDialog({ open, onOpenChange }: ImportOrdersDialogProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setErrors([]);

    const text = await selectedFile.text();
    const rows = parseCSV(text);
    setPreview(rows.slice(0, 5));
  };

  const handleImport = async () => {
    if (!file || !profile) return;

    setImporting(true);
    setErrors([]);

    try {
      const text = await file.text();
      const rows = parseCSV(text);

      const newErrors: string[] = [];
      let successCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          // Validate required fields
          if (!row.customer_name || !row.phone || !row.address) {
            newErrors.push(`Row ${i + 2}: Missing required fields (customer_name, phone, address)`);
            continue;
          }

          // Create order
          const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert({
              customer_name: row.customer_name,
              phone: row.phone,
              address: row.address,
              area: row.area || null,
              channel: row.channel || null,
              notes: row.notes || null,
              payment_method: (row.payment_method?.toUpperCase() === 'TRANSFER' ? 'TRANSFER' : 'COD') as 'COD' | 'TRANSFER',
              expected_pickup_date: row.expected_pickup_date || null,
              salesperson_id: profile.id,
              status: 'BOOKING',
              total_qty: parseInt(row.qty || '0') || 0,
              total_amount: parseFloat(row.amount || '0') || 0,
            })
            .select()
            .single();

          if (orderError) {
            newErrors.push(`Row ${i + 2}: ${orderError.message}`);
            continue;
          }

          // If sku_label/qty/price provided, create order item
          if (row.sku_label && row.qty) {
            const qty = parseInt(row.qty) || 1;
            const price = parseFloat(row.price || '0') || 0;
            
            await supabase.from('order_items').insert({
              order_id: order.id,
              sku_label: row.sku_label,
              qty,
              price,
              line_total: qty * price,
            });
          }

          successCount++;
        } catch (err: any) {
          newErrors.push(`Row ${i + 2}: ${err.message}`);
        }
      }

      setErrors(newErrors);

      if (successCount > 0) {
        toast({
          title: 'Import Complete',
          description: `Successfully imported ${successCount} order(s)${newErrors.length > 0 ? ` with ${newErrors.length} error(s)` : ''}`,
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Orders</DialogTitle>
          <DialogDescription>
            Import orders from a CSV file. Download a template to see the expected format.
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
                          <th key={key} className="px-3 py-2 text-left font-medium">
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

            {errors.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
                <div className="flex items-center gap-2 text-destructive mb-2">
                  <AlertCircle className="h-4 w-4" />
                  <span className="font-medium">Import Errors</span>
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
                  <h4 className="font-medium">Orders Template</h4>
                  <p className="text-sm text-muted-foreground">
                    Basic order import with customer info
                  </p>
                </div>
                <Button variant="outline" onClick={() => downloadTemplate('orders')}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h4 className="font-medium">Order Items Template</h4>
                  <p className="text-sm text-muted-foreground">
                    Multi-SKU import with external reference
                  </p>
                </div>
                <Button variant="outline" onClick={() => downloadTemplate('order_items')}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
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
