import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileWarning,
  History,
  Loader2,
  RotateCcw,
  Search,
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  type InboundImportRow,
  type InboundImportResult,
  useConfirmInboundImport,
  useInboundImportBatches,
  useInboundImportProducts,
  useInboundImportRows,
  usePrepareInboundImport,
  useUpdateInboundImportRow,
} from '@/hooks/useInboundImport';
import {
  downloadInboundTemplate,
  matchInboundProduct,
  parseInboundWorkbook,
  prepareInboundRows,
  sha256File,
} from '@/lib/inboundExcelImport';
import { downloadXlsx } from '@/lib/xlsxExport';
import { cn } from '@/lib/utils';
import type { BoundUser } from '@/hooks/useRunnerBoundUsers';

type ReviewFilter = 'all' | 'valid' | 'review' | 'invalid' | 'duplicate' | 'excluded';

interface InboundExcelImportProps {
  runnerId: string;
  boundUsers: BoundUser[];
  disabled?: boolean;
}

function stateBadge(row: InboundImportRow) {
  if (row.validation_state === 'VALID') {
    const isExact = row.user_match_state === 'Exact' && row.product_match_state === 'Exact';
    return (
      <Badge className={cn(
        isExact
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50'
          : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50',
      )}>
        {isExact ? 'Exact' : 'Suggested'}
      </Badge>
    );
  }
  if (row.validation_state === 'DUPLICATE') {
    return <Badge className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">Duplicate</Badge>;
  }
  if (row.validation_state === 'EXCLUDED') {
    return <Badge variant="secondary">Excluded</Badge>;
  }
  if (row.validation_state === 'NEEDS_REVIEW') {
    return <Badge className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">Suggested</Badge>;
  }
  return <Badge variant="destructive">Invalid</Badge>;
}

function confidenceLabel(state: string, score: number) {
  if (state === 'Exact') return 'Exact';
  if (state === 'No Match' || state === 'Invalid') return 'No match';
  return `${score}%`;
}

function MatchPicker({
  value,
  placeholder,
  searchPlaceholder,
  options,
  onChange,
}: {
  value: string | null;
  placeholder: string;
  searchPlaceholder: string;
  options: Array<{ id: string; label: string; sublabel?: string }>;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn(
            'h-9 w-full min-w-0 justify-between px-2 text-left text-xs font-normal',
            !selected && 'text-muted-foreground',
          )}
        >
          <span className="truncate">{selected?.label || placeholder}</span>
          <Search className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(360px,calc(100vw-32px))] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>No matching option.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={`${option.label} ${option.sublabel || ''}`}
                  onSelect={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', option.id === value ? 'opacity-100' : 'opacity-0')} />
                  <span className="min-w-0">
                    <span className="block truncate">{option.label}</span>
                    {option.sublabel ? (
                      <span className="block truncate text-xs text-muted-foreground">{option.sublabel}</span>
                    ) : null}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function InboundExcelImport({ runnerId, boundUsers, disabled }: InboundExcelImportProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ownerIds = useMemo(() => boundUsers.map((user) => user.id), [boundUsers]);
  const { data: products = [], isLoading: productsLoading } = useInboundImportProducts(ownerIds);
  const { data: batches = [], isLoading: historyLoading } = useInboundImportBatches(runnerId);
  const prepareImport = usePrepareInboundImport();
  const updateRow = useUpdateInboundImportRow();
  const confirmImport = useConfirmInboundImport();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [view, setView] = useState<'upload' | 'review' | 'history' | 'result'>('upload');
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [processingFile, setProcessingFile] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<InboundImportResult | null>(null);
  const [dragging, setDragging] = useState(false);

  const { data: rows = [], isLoading: rowsLoading } = useInboundImportRows(activeBatchId);
  const activeBatch = batches.find((batch) => batch.id === activeBatchId);

  const counts = useMemo(() => ({
    total: rows.length,
    valid: rows.filter((row) => row.validation_state === 'VALID').length,
    review: rows.filter((row) => row.validation_state === 'NEEDS_REVIEW').length,
    invalid: rows.filter((row) => row.validation_state === 'INVALID').length,
    duplicate: rows.filter((row) => row.validation_state === 'DUPLICATE').length,
    excluded: rows.filter((row) => row.validation_state === 'EXCLUDED').length,
  }), [rows]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesFilter =
        filter === 'all'
        || (filter === 'valid' && row.validation_state === 'VALID')
        || (filter === 'review' && row.validation_state === 'NEEDS_REVIEW')
        || (filter === 'invalid' && row.validation_state === 'INVALID')
        || (filter === 'duplicate' && row.validation_state === 'DUPLICATE')
        || (filter === 'excluded' && row.validation_state === 'EXCLUDED');
      const matchesQuery = !normalizedQuery || [
        row.username_raw,
        row.sku_raw,
        row.reference_number,
        row.remark,
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
      return matchesFilter && matchesQuery;
    });
  }, [filter, query, rows]);

  const userOptions = useMemo(() => boundUsers.map((user) => ({
    id: user.id,
    label: user.display_name,
    sublabel: user.email || undefined,
  })), [boundUsers]);

  const productOptions = (userId: string | null) => products
    .filter((product) => product.owner_user_id === userId)
    .map((product) => ({
      id: product.id,
      label: `${product.sku_code || 'No code'} / ${product.sku_name}`,
    }));

  const openUpload = () => {
    setView('upload');
    setActiveBatchId(null);
    setResult(null);
    setSelectedRows(new Set());
    setDialogOpen(true);
  };

  const openHistory = () => {
    setView('history');
    setDialogOpen(true);
  };

  const processFile = async (file?: File) => {
    if (!file) return;
    setProcessingFile(true);
    try {
      const parsedRows = await parseInboundWorkbook(file);
      const preparedRows = prepareInboundRows(parsedRows, boundUsers, products);
      const fileHash = await sha256File(file);
      const prepared = await prepareImport.mutateAsync({
        runnerId,
        fileName: file.name,
        fileHash,
        rows: preparedRows,
      });
      setActiveBatchId(prepared.batch_id);
      setSelectedRows(new Set());
      if (prepared.status === 'CONFIRMED' && prepared.confirmation_result) {
        setResult(prepared.confirmation_result);
        setView('result');
      } else {
        setView('review');
      }
      toast({
        title: prepared.reused ? 'Existing import opened' : 'Workbook ready for review',
        description: `${prepared.row_count} row(s), ${prepared.valid_count} ready.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Unable to read workbook',
        description: (error as Error).message,
      });
    } finally {
      setProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const changeRow = async (
    row: InboundImportRow,
    userId: string | null,
    productId: string | null,
    excluded = row.excluded,
  ) => {
    try {
      await updateRow.mutateAsync({ rowId: row.id, userId, productId, excluded });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Correction failed', description: (error as Error).message });
    }
  };

  const changeUser = (row: InboundImportRow, userId: string) => {
    const ownerProducts = products.filter((product) => product.owner_user_id === userId);
    const productMatch = matchInboundProduct(row.sku_raw, ownerProducts);
    const productId = productMatch.matchedId;
    return changeRow(row, userId, productId);
  };

  const applySuggested = async () => {
    const targets = rows.filter((row) => selectedRows.has(row.id));
    if (targets.length === 0) return;
    for (const row of targets) {
      const userId = row.matched_user_id || row.suggested_user_id;
      if (!userId) continue;
      const ownerProducts = products.filter((product) => product.owner_user_id === userId);
      const productId = row.matched_product_id
        || row.suggested_product_id
        || matchInboundProduct(row.sku_raw, ownerProducts).suggestedId;
      await changeRow(row, userId, productId);
    }
    setSelectedRows(new Set());
  };

  const setExcludedForSelected = async (excluded: boolean) => {
    const targets = rows.filter((row) => selectedRows.has(row.id));
    for (const row of targets) {
      await changeRow(row, row.matched_user_id, row.matched_product_id, excluded);
    }
    setSelectedRows(new Set());
  };

  const toggleSelected = (rowId: string, checked: boolean) => {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (checked) next.add(rowId);
      else next.delete(rowId);
      return next;
    });
  };

  const exportErrors = () => {
    const errorRows = rows.filter((row) => !['VALID', 'EXCLUDED'].includes(row.validation_state));
    downloadXlsx([
      ['Row', 'Username', 'SKU Code', 'Quantity', 'Inbound Date', 'Reference Number', 'Status', 'Errors'],
      ...errorRows.map((row) => [
        row.row_number,
        row.username_raw,
        row.sku_raw,
        row.quantity_raw,
        row.inbound_date_raw,
        row.reference_number,
        row.validation_state,
        row.validation_errors.join('; '),
      ]),
    ], `TOMUPRO-Inbound-Errors-${activeBatchId?.slice(0, 8) || 'review'}.xlsx`, 'Import Errors');
  };

  const confirmBatch = async () => {
    if (!activeBatchId) return;
    try {
      const confirmation = await confirmImport.mutateAsync(activeBatchId);
      setResult(confirmation);
      setConfirmOpen(false);
      setView('result');
      toast({
        title: confirmation.already_processed ? 'Import already completed' : 'Inbound import completed',
        description: `${confirmation.shipments_created} shipment(s), ${confirmation.items_created} item row(s).`,
      });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Import blocked', description: (error as Error).message });
    }
  };

  const canConfirm = counts.valid > 0
    && counts.review === 0
    && counts.invalid === 0
    && counts.duplicate === 0
    && activeBatch?.status === 'STAGED';

  const renderRowControls = (row: InboundImportRow) => {
    const effectiveUserId = row.matched_user_id || row.suggested_user_id;
    return (
      <>
        <div className="space-y-1">
          <MatchPicker
            value={row.matched_user_id}
            placeholder={row.suggested_user_id ? 'Confirm suggestion' : 'Select user'}
            searchPlaceholder="Search user or email..."
            options={userOptions}
            onChange={(userId) => changeUser(row, userId)}
          />
          <p className="text-[11px] text-muted-foreground">
            {confidenceLabel(row.user_match_state, row.user_match_score)}
          </p>
        </div>
        <div className="space-y-1">
          <MatchPicker
            value={row.matched_product_id}
            placeholder={row.suggested_product_id ? 'Confirm suggestion' : 'Select product'}
            searchPlaceholder="Search SKU or product..."
            options={productOptions(effectiveUserId)}
            onChange={(productId) => changeRow(row, effectiveUserId, productId)}
          />
          <p className="text-[11px] text-muted-foreground">
            {confidenceLabel(row.product_match_state, row.product_match_score)}
          </p>
        </div>
      </>
    );
  };

  return (
    <>
      <div className="flex flex-col gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            <p className="font-semibold">Excel bulk inbound</p>
            <Badge variant="outline">Up to 2,000 rows</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload, match, review, then create pending inbound records in one transaction.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={downloadInboundTemplate}>
            <Download className="mr-2 h-4 w-4" />
            Template
          </Button>
          <Button variant="outline" size="sm" onClick={openHistory}>
            <History className="mr-2 h-4 w-4" />
            History
          </Button>
          <Button size="sm" onClick={openUpload} disabled={disabled || productsLoading}>
            {productsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Upload Excel
          </Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex h-[92vh] w-[96vw] max-w-[1400px] flex-col overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Runner Inbound Excel Import
            </DialogTitle>
            <DialogDescription>
              Stock is not changed by this screen. Confirmed rows enter the normal pending acknowledgement flow.
            </DialogDescription>
          </DialogHeader>

          {view === 'upload' ? (
            <div className="flex flex-1 items-center justify-center overflow-y-auto p-5">
              <div className="w-full max-w-2xl space-y-5">
                <div
                  className={cn(
                    'flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 text-center transition-colors',
                    dragging ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
                  )}
                  onClick={() => fileInputRef.current?.click()}
                  onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    processFile(event.dataTransfer.files[0]);
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={(event) => processFile(event.target.files?.[0])}
                  />
                  {processingFile ? (
                    <>
                      <Loader2 className="mb-4 h-10 w-10 animate-spin text-primary" />
                      <p className="font-semibold">Validating workbook...</p>
                    </>
                  ) : (
                    <>
                      <Upload className="mb-4 h-10 w-10 text-primary" />
                      <p className="text-lg font-semibold">Drop an .xlsx workbook here</p>
                      <p className="mt-2 text-sm text-muted-foreground">Maximum 5MB and 2,000 data rows.</p>
                      <Button className="mt-5" type="button">Choose workbook</Button>
                    </>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border p-3 text-sm">
                    <ShieldCheck className="mb-2 h-5 w-5 text-emerald-600" />
                    No records are created before confirmation.
                  </div>
                  <div className="rounded-lg border p-3 text-sm">
                    <Search className="mb-2 h-5 w-5 text-blue-600" />
                    Users and SKUs require confidence or review.
                  </div>
                  <div className="rounded-lg border p-3 text-sm">
                    <FileWarning className="mb-2 h-5 w-5 text-amber-600" />
                    Duplicates and invalid rows are blocked.
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {view === 'history' ? (
            <div className="flex-1 overflow-y-auto p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Recent import batches</h3>
                  <p className="text-sm text-muted-foreground">Open a staged review or inspect a completed result.</p>
                </div>
                <Button onClick={() => setView('upload')}>
                  <Upload className="mr-2 h-4 w-4" />
                  New import
                </Button>
              </div>
              {historyLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : batches.length === 0 ? (
                <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">No Excel imports yet.</div>
              ) : (
                <div className="divide-y rounded-lg border">
                  {batches.map((batch) => (
                    <button
                      key={batch.id}
                      type="button"
                      className="flex w-full flex-col gap-2 p-4 text-left hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                      onClick={() => {
                        setActiveBatchId(batch.id);
                        setResult(batch.confirmation_result);
                        setView(batch.status === 'CONFIRMED' ? 'result' : 'review');
                      }}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{batch.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(batch.created_at).toLocaleString()} - {batch.id.slice(0, 8)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={batch.status === 'CONFIRMED' ? 'default' : 'outline'}>{batch.status}</Badge>
                        <span className="text-sm text-muted-foreground">{batch.row_count} rows</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {view === 'review' ? (
            <>
              <div className="space-y-3 border-b px-4 py-3">
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {[
                    ['Rows', counts.total, 'text-foreground'],
                    ['Ready', counts.valid, 'text-emerald-700'],
                    ['Review', counts.review, 'text-blue-700'],
                    ['Invalid', counts.invalid, 'text-red-700'],
                    ['Duplicate', counts.duplicate, 'text-amber-700'],
                    ['Excluded', counts.excluded, 'text-muted-foreground'],
                  ].map(([label, value, color]) => (
                    <div key={label as string} className="rounded-lg border px-3 py-2">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className={cn('text-xl font-bold', color)}>{value}</p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                  <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search user, SKU, reference, or remark..." className="pl-9" />
                  </div>
                  <Select value={filter} onValueChange={(value) => setFilter(value as ReviewFilter)}>
                    <SelectTrigger className="w-full lg:w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All rows</SelectItem>
                      <SelectItem value="valid">Ready</SelectItem>
                      <SelectItem value="review">Needs review</SelectItem>
                      <SelectItem value="invalid">Invalid</SelectItem>
                      <SelectItem value="duplicate">Duplicates</SelectItem>
                      <SelectItem value="excluded">Excluded</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={applySuggested} disabled={selectedRows.size === 0 || updateRow.isPending}>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Apply suggestions
                  </Button>
                  <Button variant="outline" onClick={() => setExcludedForSelected(true)} disabled={selectedRows.size === 0 || updateRow.isPending}>
                    <XCircle className="mr-2 h-4 w-4" />
                    Exclude
                  </Button>
                  <Button variant="outline" onClick={() => setExcludedForSelected(false)} disabled={selectedRows.size === 0 || updateRow.isPending}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Restore
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-auto">
                {rowsLoading ? (
                  <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : (
                  <>
                    <div className="hidden min-w-[1180px] md:block">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-background">
                          <TableRow>
                            <TableHead className="w-10" />
                            <TableHead className="w-16">Row</TableHead>
                            <TableHead className="w-44">Source</TableHead>
                            <TableHead className="w-56">Receiving user</TableHead>
                            <TableHead className="w-56">Product</TableHead>
                            <TableHead className="w-20">Qty</TableHead>
                            <TableHead className="w-32">Date</TableHead>
                            <TableHead className="w-36">Reference</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-24">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredRows.map((row) => (
                            <TableRow key={row.id} className={cn(row.excluded && 'opacity-55')} style={{ contentVisibility: 'auto', containIntrinsicSize: '72px' }}>
                              <TableCell>
                                <Checkbox checked={selectedRows.has(row.id)} onCheckedChange={(checked) => toggleSelected(row.id, checked === true)} />
                              </TableCell>
                              <TableCell className="font-mono text-xs">{row.row_number}</TableCell>
                              <TableCell>
                                <p className="truncate text-sm font-medium">{row.username_raw || 'Missing user'}</p>
                                <p className="truncate font-mono text-xs text-muted-foreground">{row.sku_raw || 'Missing SKU'}</p>
                              </TableCell>
                              {renderRowControls(row)}
                              <TableCell>{row.quantity_raw || '-'}</TableCell>
                              <TableCell className="text-xs">{row.inbound_date_raw || '-'}</TableCell>
                              <TableCell className="truncate text-xs">{row.reference_number || '-'}</TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  {stateBadge(row)}
                                  {row.validation_errors.length > 0 ? (
                                    <p className="max-w-48 text-[11px] text-destructive">{row.validation_errors.join('; ')}</p>
                                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => changeRow(row, row.matched_user_id, row.matched_product_id, !row.excluded)}
                                >
                                  {row.excluded ? 'Restore' : 'Exclude'}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="space-y-3 p-3 md:hidden">
                      {filteredRows.map((row) => (
                        <div key={row.id} className={cn('space-y-3 rounded-lg border p-3', row.excluded && 'opacity-55')}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Checkbox checked={selectedRows.has(row.id)} onCheckedChange={(checked) => toggleSelected(row.id, checked === true)} />
                              <div>
                                <p className="font-semibold">Row {row.row_number}</p>
                                <p className="text-xs text-muted-foreground">{row.username_raw} - {row.sku_raw}</p>
                              </div>
                            </div>
                            {stateBadge(row)}
                          </div>
                          {renderRowControls(row)}
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div><span className="text-muted-foreground">Qty</span><p>{row.quantity_raw || '-'}</p></div>
                            <div><span className="text-muted-foreground">Date</span><p>{row.inbound_date_raw || '-'}</p></div>
                            <div><span className="text-muted-foreground">Ref</span><p className="truncate">{row.reference_number || '-'}</p></div>
                          </div>
                          {row.validation_errors.length > 0 ? (
                            <p className="text-xs text-destructive">{row.validation_errors.join('; ')}</p>
                          ) : null}
                          <Button variant="outline" size="sm" className="w-full" onClick={() => changeRow(row, row.matched_user_id, row.matched_product_id, !row.excluded)}>
                            {row.excluded ? 'Restore row' : 'Exclude row'}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <DialogFooter className="border-t px-4 py-3">
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setView('history')}>History</Button>
                    <Button variant="outline" onClick={exportErrors} disabled={counts.review + counts.invalid + counts.duplicate === 0}>
                      <Download className="mr-2 h-4 w-4" />
                      Error file
                    </Button>
                  </div>
                  <div className="flex items-center gap-3">
                    {!canConfirm ? (
                      <p className="hidden text-xs text-muted-foreground sm:block">
                        Resolve or exclude all blocked rows.
                      </p>
                    ) : null}
                    <Button onClick={() => setConfirmOpen(true)} disabled={!canConfirm || confirmImport.isPending}>
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Confirm {counts.valid} row(s)
                    </Button>
                  </div>
                </div>
              </DialogFooter>
            </>
          ) : null}

          {view === 'result' ? (
            <div className="flex flex-1 items-center justify-center overflow-y-auto p-5">
              <div className="w-full max-w-2xl rounded-lg border p-6">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-emerald-100 p-2 text-emerald-700"><CheckCircle2 className="h-6 w-6" /></div>
                  <div>
                    <h3 className="text-xl font-semibold">Import completed</h3>
                    <p className="text-sm text-muted-foreground">
                      Pending inbound records were created. Stock will change only after recipient acknowledgement.
                    </p>
                  </div>
                </div>
                <div className="mt-6 grid grid-cols-3 gap-3">
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Shipments</p><p className="text-2xl font-bold">{result?.shipments_created ?? 0}</p></div>
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Item rows</p><p className="text-2xl font-bold">{result?.items_created ?? 0}</p></div>
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Total qty</p><p className="text-2xl font-bold">{result?.total_qty ?? 0}</p></div>
                </div>
                <div className="mt-5 rounded-lg bg-muted p-3">
                  <p className="text-xs font-medium text-muted-foreground">Batch ID</p>
                  <p className="break-all font-mono text-sm">{result?.batch_id || activeBatchId}</p>
                  {result?.shipment_ids?.length ? (
                    <>
                      <p className="mt-3 text-xs font-medium text-muted-foreground">Inbound shipment IDs</p>
                      {result.shipment_ids.map((id) => <p key={id} className="break-all font-mono text-xs">{id}</p>)}
                    </>
                  ) : null}
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setView('history')}>View history</Button>
                  <Button onClick={openUpload}>New import</Button>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Confirm inbound import
            </DialogTitle>
            <DialogDescription>
              This creates {counts.valid} pending inbound row(s) in one transaction. It does not directly update Stock Balance.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            Confirming the same batch twice is safe; the server returns the original result without creating duplicates.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Go back</Button>
            <Button onClick={confirmBatch} disabled={confirmImport.isPending}>
              {confirmImport.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Confirm import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
