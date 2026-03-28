import { useState, useRef, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle, X, ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { parseCSVRaw, downloadTemplate } from '@/lib/csv';
import { useReasons } from '@/hooks/useReasons';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateOrderQueries } from '@/lib/invalidateOrderQueries';
import { logAudit } from '@/hooks/useAuditLogs';
import { cn } from '@/lib/utils';
import capybaraImport from '@/assets/capybara-import.png';

// --- Types ---

interface BulkImportDeliveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ImportStep = 'upload' | 'preview' | 'result';

interface ParsedRow {
  rowNum: number;
  orderCode: string;
  status: 'DELIVERED' | 'FAILED';
  remark: string;
}

interface ValidatedRow extends ParsedRow {
  orderId: string | null;
  orderFound: boolean;
  isAssignedToRunner: boolean;
  mappedFailedReason: string | null;
  validationError: string | null;
  customerName?: string;
  area?: string;
  currentRunnerStatus?: string;
}

interface ImportResult {
  row: ValidatedRow;
  success: boolean;
  error?: string;
}

// --- Header aliases for delivery result columns ---
const DELIVERY_HEADER_ALIASES: Record<string, string[]> = {
  order_code: ['order code', 'order_code', 'ordercode', 'order ref', 'order_ref', 'orderref', 'order reference', 'ref', 'reference', 'code'],
  status: ['status', 'delivery status', 'delivery_status', 'result', 'delivery result', 'delivery_result'],
  remark: ['remark', 'remarks', 'reason', 'note', 'notes', 'comment', 'comments', 'description', 'failed reason', 'failed_reason', 'failure reason', 'failure_reason'],
};

function normalizeDeliveryHeader(raw: string): string | null {
  const normalized = raw.toLowerCase().trim().replace(/[\s_-]+/g, ' ');
  for (const [key, aliases] of Object.entries(DELIVERY_HEADER_ALIASES)) {
    if (aliases.includes(normalized)) return key;
  }
  return null;
}

// --- Step Indicator ---

function StepIndicator({ current }: { current: ImportStep }) {
  const steps = [
    { id: 'upload' as const, label: 'Upload', num: 1 },
    { id: 'preview' as const, label: 'Preview', num: 2 },
    { id: 'result' as const, label: 'Result', num: 3 },
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

// --- Main Component ---

export function BulkImportDeliveryDialog({ open, onOpenChange }: BulkImportDeliveryDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>('upload');
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [validatedRows, setValidatedRows] = useState<ValidatedRow[]>([]);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const { data: failedReasons = [] } = useReasons('FAILED_DELIVERY', true);

  // Build a map of reason labels (lowercase) -> reason label (original case)
  const reasonMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of failedReasons) {
      map.set(r.label.toLowerCase().trim(), r.label);
    }
    return map;
  }, [failedReasons]);

  // --- Reset ---
  const resetState = useCallback(() => {
    setStep('upload');
    setFileName('');
    setParsedRows([]);
    setParseErrors([]);
    setValidatedRows([]);
    setValidating(false);
    setImporting(false);
    setImportResults([]);
    setIsDragging(false);
  }, []);

  const handleClose = useCallback((open: boolean) => {
    if (!open) resetState();
    onOpenChange(open);
  }, [onOpenChange, resetState]);

  // --- Validation against DB (must be before handleFile which depends on it) ---
  const validateRows = useCallback(async (rows: ParsedRow[]) => {
    if (!user?.id) return;
    setValidating(true);
    setStep('preview');

    try {
      // Fetch all order codes in one batch
      const orderCodes = rows.map(r => r.orderCode);
      const uniqueCodes = [...new Set(orderCodes)];

      // Batch fetch orders by order_code (up to 300 per .in() call)
      const IN_LIMIT = 300;
      const orderMap = new Map<string, { id: string; runner_id: string | null; customer_name: string; area: string | null; runner_status: string }>();

      for (let i = 0; i < uniqueCodes.length; i += IN_LIMIT) {
        const batch = uniqueCodes.slice(i, i + IN_LIMIT);
        const { data, error } = await supabase
          .from('orders')
          .select('id, order_code, runner_id, customer_name, area, runner_status, status')
          .in('order_code', batch)
          .eq('status', 'READY');

        if (error) {
          console.error('Validation fetch error:', error);
          continue;
        }

        data?.forEach(o => {
          orderMap.set(o.order_code, {
            id: o.id,
            runner_id: o.runner_id,
            customer_name: o.customer_name || '',
            area: o.area,
            runner_status: o.runner_status || '',
          });
        });
      }

      // Validate each row
      const validated: ValidatedRow[] = rows.map(row => {
        const order = orderMap.get(row.orderCode);
        if (!order) {
          return {
            ...row,
            orderId: null,
            orderFound: false,
            isAssignedToRunner: false,
            mappedFailedReason: null,
            validationError: 'Order not found or not in READY status',
          };
        }

        if (order.runner_id !== user.id) {
          return {
            ...row,
            orderId: order.id,
            orderFound: true,
            isAssignedToRunner: false,
            mappedFailedReason: null,
            validationError: 'Order not assigned to you',
            customerName: order.customer_name,
            area: order.area || undefined,
            currentRunnerStatus: order.runner_status,
          };
        }

        // Check if already delivered/failed
        if (order.runner_status === 'DELIVERED' || order.runner_status === 'FAILED_DELIVERY') {
          return {
            ...row,
            orderId: order.id,
            orderFound: true,
            isAssignedToRunner: true,
            mappedFailedReason: null,
            validationError: `Already ${order.runner_status === 'DELIVERED' ? 'delivered' : 'marked as failed'}`,
            customerName: order.customer_name,
            area: order.area || undefined,
            currentRunnerStatus: order.runner_status,
          };
        }

        // Auto-map failure reason
        let mappedReason: string | null = null;
        if (row.status === 'FAILED' && row.remark) {
          // Exact match first
          mappedReason = reasonMap.get(row.remark.toLowerCase().trim()) || null;
          // Partial match: check if remark contains a reason label
          if (!mappedReason) {
            const remarkLower = row.remark.toLowerCase();
            for (const [key, label] of reasonMap.entries()) {
              if (remarkLower.includes(key) || key.includes(remarkLower)) {
                mappedReason = label;
                break;
              }
            }
          }
        }
        // Always default to "Other" if no reason mapped for FAILED rows
        if (row.status === 'FAILED' && !mappedReason) {
          mappedReason = 'Other';
        }

        return {
          ...row,
          orderId: order.id,
          orderFound: true,
          isAssignedToRunner: true,
          mappedFailedReason: mappedReason,
          validationError: null,
          customerName: order.customer_name,
          area: order.area || undefined,
          currentRunnerStatus: order.runner_status,
        };
      });

      setValidatedRows(validated);
    } catch (err) {
      console.error('Validation error:', err);
      setParseErrors(['Failed to validate orders against database.']);
      setStep('upload');
    } finally {
      setValidating(false);
    }
  }, [user?.id, reasonMap]);

  // --- CSV Parsing ---
  const handleFile = useCallback((file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setParseErrors(['File too large. Maximum 5MB.']);
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text?.trim()) {
        setParseErrors(['File is empty.']);
        return;
      }

      const { headers, rows: rawRows } = parseCSVRaw(text);
      if (headers.length === 0) {
        setParseErrors(['No headers found in file.']);
        return;
      }

      // Map headers
      const headerMap: Record<string, number> = {};
      headers.forEach((h, i) => {
        const mapped = normalizeDeliveryHeader(h);
        if (mapped) headerMap[mapped] = i;
      });

      const errors: string[] = [];
      if (headerMap.order_code === undefined) errors.push('Missing required column: ORDER CODE');
      if (headerMap.status === undefined) errors.push('Missing required column: STATUS');

      if (errors.length > 0) {
        setParseErrors(errors);
        return;
      }

      // Parse rows
      const parsed: ParsedRow[] = [];
      const rowErrors: string[] = [];

      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        const values = Object.values(row);
        const orderCode = (values[headerMap.order_code] || '').trim();
        const statusRaw = (values[headerMap.status] || '').trim().toUpperCase();
        const remark = headerMap.remark !== undefined ? (values[headerMap.remark] || '').trim() : '';

        if (!orderCode) {
          rowErrors.push(`Row ${i + 2}: Missing order code`);
          continue;
        }

        if (statusRaw !== 'DELIVERED' && statusRaw !== 'FAILED') {
          rowErrors.push(`Row ${i + 2}: Invalid status "${statusRaw}" (must be DELIVERED or FAILED)`);
          continue;
        }

        if (statusRaw === 'FAILED' && !remark) {
          rowErrors.push(`Row ${i + 2}: FAILED status requires a remark`);
          continue;
        }

        parsed.push({
          rowNum: i + 2,
          orderCode,
          status: statusRaw as 'DELIVERED' | 'FAILED',
          remark,
        });
      }

      if (parsed.length === 0 && rowErrors.length > 0) {
        setParseErrors(rowErrors);
        return;
      }

      setParsedRows(parsed);
      setParseErrors(rowErrors);
      // Proceed to validation
      validateRows(parsed);
    };
    reader.readAsText(file);
  }, [validateRows]);

  // Counts for preview
  const validCount = validatedRows.filter(r => r.orderFound && r.isAssignedToRunner && !r.validationError?.startsWith('Already')).length;
  const errorCount = validatedRows.filter(r => r.validationError).length;

  // --- Import Execution ---
  const handleImport = useCallback(async () => {
    const importable = validatedRows.filter(r =>
      r.orderId && r.orderFound && r.isAssignedToRunner && !r.validationError
    );

    if (importable.length === 0) {
      toast({ variant: 'destructive', title: 'Nothing to import', description: 'No valid rows to process.' });
      return;
    }

    setImporting(true);
    setStep('result');
    const results: ImportResult[] = [];

    for (const row of importable) {
      try {
        if (row.status === 'DELIVERED') {
          const { error } = await supabase
            .from('orders')
            .update({
              runner_status: 'DELIVERED',
              delivered_at: new Date().toISOString(),
            })
            .eq('id', row.orderId!);

          if (error) throw error;

          await logAudit({
            entity_type: 'order',
            entity_id: row.orderId!,
            action: 'BULK_IMPORT_DELIVERED',
            before_json: { runner_status: row.currentRunnerStatus },
            after_json: { runner_status: 'DELIVERED' },
          });

          results.push({ row, success: true });

        } else if (row.status === 'FAILED') {
          const failedReason = row.mappedFailedReason || row.remark;
          const actionType = 'FOLLOWUP_CUSTOMER';

          const { error } = await supabase
            .from('orders')
            .update({
              runner_status: 'FAILED_DELIVERY',
              failed_reason: failedReason,
              failed_remark: row.remark,
              failed_next_step: 'SALESPERSON_CONTACT',
              next_delivery_date: null,
              salesperson_action_required: true,
              salesperson_action_type: actionType,
            })
            .eq('id', row.orderId!);

          if (error) throw error;

          await logAudit({
            entity_type: 'order',
            entity_id: row.orderId!,
            action: 'BULK_IMPORT_FAILED_DELIVERY',
            before_json: { runner_status: row.currentRunnerStatus },
            after_json: {
              runner_status: 'FAILED_DELIVERY',
              failed_reason: failedReason,
              failed_remark: row.remark,
            },
          });

          // Create notification for salesperson
          try {
            const { data: orderData } = await supabase
              .from('orders')
              .select('salesperson_id, customer_name')
              .eq('id', row.orderId!)
              .single();

            if (orderData?.salesperson_id) {
              const { createNotification } = await import('@/lib/notifications');
              await createNotification({
                recipientUserId: orderData.salesperson_id,
                type: 'FAILED_DELIVERY',
                title: 'Delivery Failed',
                message: `Failed delivery for ${orderData.customer_name}. Reason: ${failedReason}. (Bulk import)`,
                entityType: 'ORDER',
                entityId: row.orderId!,
                priority: 'HIGH',
              });
            }
          } catch {
            // Non-fatal: notification failure shouldn't fail the import
          }

          results.push({ row, success: true });
        }
      } catch (err) {
        results.push({
          row,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    // Add skipped rows as failures
    for (const row of validatedRows) {
      if (!importable.includes(row)) {
        results.push({
          row,
          success: false,
          error: row.validationError || 'Skipped',
        });
      }
    }

    setImportResults(results);
    setImporting(false);

    // Invalidate queries to refresh the inbox
    invalidateOrderQueries(queryClient);

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    toast({
      title: `Import complete: ${successCount} updated, ${failCount} skipped/failed`,
    });
  }, [validatedRows, queryClient, toast]);

  // --- Drag & Drop ---
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
      handleFile(file);
    } else {
      setParseErrors(['Please upload a CSV file.']);
    }
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }, [handleFile]);

  // --- Update mapped reason for a row ---
  const updateRowReason = useCallback((rowNum: number, newReason: string) => {
    setValidatedRows(prev => prev.map(r =>
      r.rowNum === rowNum
        ? { ...r, mappedFailedReason: newReason, validationError: null }
        : r
    ));
  }, []);

  // --- Render ---
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <img src={capybaraImport} alt="Import" className="h-12 w-12 object-contain" />
            <div className="flex-1">
              <h2 className="text-lg font-bold">Bulk Import Delivery Results</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Upload a CSV to mark multiple orders as Delivered or Failed
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => handleClose(false)} className="h-8 w-8 p-0 rounded-full">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-3">
            <StepIndicator current={step} />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {step === 'upload' && (
            <UploadStep
              parseErrors={parseErrors}
              isDragging={isDragging}
              fileInputRef={fileInputRef}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onFileInput={handleFileInput}
            />
          )}

          {step === 'preview' && (
            <PreviewStep
              validating={validating}
              validatedRows={validatedRows}
              parseErrors={parseErrors}
              validCount={validCount}
              errorCount={errorCount}
              failedReasons={failedReasons}
              onUpdateReason={updateRowReason}
            />
          )}

          {step === 'result' && (
            <ResultStep
              importing={importing}
              importResults={importResults}
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-3 flex items-center justify-between bg-background">
          {step === 'upload' && (
            <div className="flex items-center gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={() => handleClose(false)} className="rounded-full">
                Cancel
              </Button>
            </div>
          )}

          {step === 'preview' && (
            <>
              <Button variant="outline" size="sm" onClick={() => { resetState(); }} className="rounded-full">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button
                size="sm"
                onClick={handleImport}
                disabled={validating || validCount === 0}
                className="rounded-full"
              >
                {validating ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Validating...</>
                ) : (
                  <><ArrowRight className="h-4 w-4 mr-1" /> Import {validCount} Orders</>
                )}
              </Button>
            </>
          )}

          {step === 'result' && (
            <div className="flex items-center gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={() => handleClose(false)} className="rounded-full">
                Close
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Upload Step ---

function UploadStep({
  parseErrors, isDragging, fileInputRef, onDragOver, onDragLeave, onDrop, onFileInput,
}: {
  parseErrors: string[];
  isDragging: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Template download */}
      <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-xl border">
        <FileSpreadsheet className="h-8 w-8 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Download Template</p>
          <p className="text-xs text-muted-foreground">CSV with columns: ORDER CODE, STATUS, REMARK</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => downloadTemplate('delivery_result')} className="rounded-full shrink-0">
          <Download className="h-4 w-4 mr-1" /> Template
        </Button>
      </div>

      {/* Format guide */}
      <div className="text-xs text-muted-foreground space-y-1 p-3 bg-muted/50 rounded-lg">
        <p className="font-semibold text-foreground">Format rules:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li><strong>STATUS</strong>: must be <code className="bg-muted px-1 rounded">DELIVERED</code> or <code className="bg-muted px-1 rounded">FAILED</code></li>
          <li><strong>REMARK</strong>: required for FAILED status; auto-mapped to failure reason if possible</li>
          <li>Only orders assigned to you and in READY status will be processed</li>
        </ul>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'flex flex-col items-center justify-center gap-3 py-12 border-2 border-dashed rounded-xl cursor-pointer transition-all',
          isDragging
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : 'border-border hover:border-primary/50 hover:bg-muted/30'
        )}
      >
        <Upload className={cn('h-10 w-10', isDragging ? 'text-primary' : 'text-muted-foreground')} />
        <div className="text-center">
          <p className="text-sm font-semibold">{isDragging ? 'Drop file here' : 'Drag & drop CSV file'}</p>
          <p className="text-xs text-muted-foreground mt-1">or click to browse (max 5MB)</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onFileInput}
          className="hidden"
        />
      </div>

      {/* Parse errors */}
      {parseErrors.length > 0 && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg space-y-1">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="text-sm font-semibold">Errors found</span>
          </div>
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {parseErrors.map((err, i) => (
              <p key={i} className="text-xs text-destructive/80">{err}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Preview Step ---

function PreviewStep({
  validating, validatedRows, parseErrors, validCount, errorCount, failedReasons, onUpdateReason,
}: {
  validating: boolean;
  validatedRows: ValidatedRow[];
  parseErrors: string[];
  validCount: number;
  errorCount: number;
  failedReasons: { id: string; label: string }[];
  onUpdateReason: (rowNum: number, reason: string) => void;
}) {
  if (validating) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Validating orders...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="bg-[hsl(var(--status-success)/0.1)] text-[hsl(var(--status-success))] border-[hsl(var(--status-success)/0.2)]">
          <CheckCircle className="h-3 w-3 mr-1" /> {validCount} ready to import
        </Badge>
        {errorCount > 0 && (
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
            <AlertCircle className="h-3 w-3 mr-1" /> {errorCount} errors
          </Badge>
        )}
      </div>

      {/* Parse errors from CSV step */}
      {parseErrors.length > 0 && (
        <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-xs text-destructive font-semibold mb-1">Parse errors (skipped):</p>
          {parseErrors.map((err, i) => (
            <p key={i} className="text-xs text-destructive/80">{err}</p>
          ))}
        </div>
      )}

      {/* Preview table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="max-h-[350px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Row</th>
                <th className="text-left px-3 py-2 font-semibold">Order Code</th>
                <th className="text-left px-3 py-2 font-semibold">Customer</th>
                <th className="text-left px-3 py-2 font-semibold">Status</th>
                <th className="text-left px-3 py-2 font-semibold">Reason / Remark</th>
                <th className="text-left px-3 py-2 font-semibold">Result</th>
              </tr>
            </thead>
            <tbody>
              {validatedRows.map((row) => {
                const hasError = !!row.validationError;

                return (
                  <tr
                    key={row.rowNum}
                    className={cn(
                      'border-t',
                      hasError && 'bg-destructive/5'
                    )}
                  >
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.rowNum}</td>
                    <td className="px-3 py-2 font-mono font-semibold">{row.orderCode}</td>
                    <td className="px-3 py-2 truncate max-w-[120px]">{row.customerName || '-'}</td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] px-1.5 py-0',
                          row.status === 'DELIVERED'
                            ? 'bg-[hsl(var(--status-success)/0.1)] text-[hsl(var(--status-success))] border-[hsl(var(--status-success)/0.2)]'
                            : 'bg-destructive/10 text-destructive border-destructive/20'
                        )}
                      >
                        {row.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 max-w-[180px]">
                      {row.status === 'FAILED' && !hasError ? (
                        <div className="space-y-1">
                          <Select value={row.mappedFailedReason || 'Other'} onValueChange={(v) => onUpdateReason(row.rowNum, v)}>
                            <SelectTrigger className="h-6 text-[10px] w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {failedReasons.map(r => (
                                <SelectItem key={r.id} value={r.label} className="text-xs">{r.label}</SelectItem>
                              ))}
                              {/* Always include "Other" if not already in the list */}
                              {!failedReasons.some(r => r.label === 'Other') && (
                                <SelectItem value="Other" className="text-xs">Other</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          <p className="text-[10px] text-muted-foreground truncate">{row.remark}</p>
                        </div>
                      ) : row.status === 'FAILED' && hasError ? (
                        <p className="text-[10px] text-muted-foreground truncate">{row.remark}</p>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {hasError ? (
                        <span className="text-[10px] text-destructive">{row.validationError}</span>
                      ) : (
                        <CheckCircle className="h-3.5 w-3.5 text-[hsl(var(--status-success))]" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- Result Step ---

function ResultStep({
  importing, importResults,
}: {
  importing: boolean;
  importResults: ImportResult[];
}) {
  const successResults = importResults.filter(r => r.success);
  const failedResults = importResults.filter(r => !r.success);

  if (importing) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          Processing {importResults.length > 0 ? `${importResults.length} orders...` : 'orders...'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant="outline" className="bg-[hsl(var(--status-success)/0.1)] text-[hsl(var(--status-success))] border-[hsl(var(--status-success)/0.2)] text-sm px-3 py-1">
          <CheckCircle className="h-4 w-4 mr-1.5" /> {successResults.length} updated
        </Badge>
        {failedResults.length > 0 && (
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-sm px-3 py-1">
            <AlertCircle className="h-4 w-4 mr-1.5" /> {failedResults.length} skipped/failed
          </Badge>
        )}
      </div>

      {/* Successful updates */}
      {successResults.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-foreground">Updated:</p>
          <div className="border rounded-lg overflow-hidden max-h-[180px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-1.5 font-semibold">Order</th>
                  <th className="text-left px-3 py-1.5 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {successResults.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-1.5 font-mono font-semibold">{r.row.orderCode}</td>
                    <td className="px-3 py-1.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] px-1.5 py-0',
                          r.row.status === 'DELIVERED'
                            ? 'bg-[hsl(var(--status-success)/0.1)] text-[hsl(var(--status-success))]'
                            : 'bg-destructive/10 text-destructive'
                        )}
                      >
                        {r.row.status}
                      </Badge>
                      {r.row.status === 'FAILED' && r.row.mappedFailedReason && (
                        <span className="ml-2 text-muted-foreground">{r.row.mappedFailedReason}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Failed/skipped */}
      {failedResults.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-destructive">Skipped/Failed:</p>
          <div className="border border-destructive/20 rounded-lg overflow-hidden max-h-[180px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-destructive/5 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-1.5 font-semibold">Order</th>
                  <th className="text-left px-3 py-1.5 font-semibold">Reason</th>
                </tr>
              </thead>
              <tbody>
                {failedResults.map((r, i) => (
                  <tr key={i} className="border-t border-destructive/10">
                    <td className="px-3 py-1.5 font-mono font-semibold">{r.row.orderCode}</td>
                    <td className="px-3 py-1.5 text-destructive/80">{r.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
