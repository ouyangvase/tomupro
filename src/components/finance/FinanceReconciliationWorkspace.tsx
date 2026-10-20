import { useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Download,
  Filter,
  Loader2,
  Save,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { calculateClaimGross } from '@/lib/financeReconciliation';
import { downloadXlsxWorkbook } from '@/lib/xlsxExport';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  getEndJobPhotoUrl,
  useDailyCashConfirmation,
  useFinanceEndJobPhotos,
  useFinanceReconciliationWorkspace,
  useReviewEndJobPhoto,
  useSaveClaimReconciliation,
  useSaveFinanceReceipt,
  type FinanceEndJobPhoto,
  type FinanceRecord,
} from '@/hooks/useFinanceReconciliation';
import { useQuery } from '@tanstack/react-query';

type WorkspaceTab = 'daily' | 'records' | 'claims';
type FilterType = 'ALL' | 'COD' | 'RECEIPT';
type CheckedFilter = 'ALL' | 'CHECKED' | 'UNCHECKED';

const money = (value: unknown) => `BND ${Number(value || 0).toFixed(2)}`;
const todayKey = () => format(new Date(), 'yyyy-MM-dd');

function displayDate(value: string) {
  if (!value) return 'Select date';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : format(date, 'd MMM yyyy');
}

function SummaryCard({
  label,
  value,
  tone = 'default',
  className = '',
}: {
  label: string;
  value: unknown;
  tone?: 'default' | 'warning' | 'success';
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border/50 bg-background/70 p-2.5 sm:p-4 ${className}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:text-[11px] sm:tracking-[0.16em]">{label}</p>
      <p className={`mt-1 text-base font-black sm:mt-2 sm:text-xl ${tone === 'warning' ? 'text-amber-600' : tone === 'success' ? 'text-emerald-600' : 'text-foreground'}`}>
        {typeof value === 'number' ? money(value) : value}
      </p>
    </div>
  );
}

function ReceiptRow({ record }: { record: FinanceRecord }) {
  const save = useSaveFinanceReceipt();
  const [expanded, setExpanded] = useState(false);
  const [checked, setChecked] = useState(Boolean(record.checked));
  const [note, setNote] = useState(record.note || '');
  const [bank, setBank] = useState(record.bank || '');
  const [depositDate, setDepositDate] = useState(record.transfer_deposit_date || '');

  const persist = (next?: Partial<{ checked: boolean; note: string; bank: string; transferDepositDate: string }>) => {
    const values = { checked, note, bank, transferDepositDate: depositDate, ...next };
    save.mutate({ id: record.id, ...values }, {
      onError: (error) => toast.error(error.message),
    });
  };

  return (
    <div className="border-b border-border/40 px-3 py-3 sm:px-4 sm:py-4">
      <div className="grid gap-2 md:grid-cols-[100px_110px_minmax(120px,1fr)_120px_80px_minmax(120px,1fr)_140px] md:items-center">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground sm:text-sm">
          <span>{displayDate(record.date)}</span>
          <button type="button" className="rounded-md p-1 md:hidden" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-label={`${expanded ? 'Hide' : 'Show'} receipt details`}>
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
        <Badge variant="outline" className="w-fit text-[10px] sm:text-xs">{record.type}</Badge>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold sm:text-base">{record.reference}</p>
          <p className="truncate text-xs text-muted-foreground">{record.name}</p>
        </div>
        <div className="text-sm font-semibold sm:text-base">{money(record.amount_bnd)}</div>
        <div className="flex items-center gap-2">
          <Checkbox
            checked={checked}
            onCheckedChange={(value) => {
              const next = value === true;
              setChecked(next);
              persist({ checked: next });
            }}
            aria-label={`Mark ${record.reference} as checked`}
          />
          <span className="text-xs text-muted-foreground">{checked ? 'Checked' : 'Open'}</span>
        </div>
        <div className={`${expanded ? 'grid' : 'hidden'} gap-2 sm:grid-cols-3 md:col-span-2 md:grid`}>
          <Input value={note} onChange={(event) => setNote(event.target.value)} onBlur={() => persist()} placeholder="Note" />
          <Input value={bank} onChange={(event) => setBank(event.target.value)} onBlur={() => persist()} placeholder="Bank" />
          <Input type="date" value={depositDate} onChange={(event) => setDepositDate(event.target.value)} onBlur={() => persist()} aria-label="Transfer or deposit date" />
        </div>
        {save.isPending && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
      </div>
    </div>
  );
}

function EndJobPhotoCard({ photo }: { photo: FinanceEndJobPhoto }) {
  const review = useReviewEndJobPhoto();
  const photoUrl = useQuery({
    queryKey: ['finance-end-job-photo-url', photo.storage_path],
    queryFn: () => getEndJobPhotoUrl(photo.storage_path),
    staleTime: 9 * 60_000,
  });

  return (
    <div className="overflow-hidden rounded-lg border border-border/50 bg-background">
      {photoUrl.data ? (
        <a href={photoUrl.data} target="_blank" rel="noreferrer" className="block" aria-label={`View receipt photo uploaded ${photo.uploaded_at}`}>
          <img src={photoUrl.data} alt="Driver receipt" className="aspect-square w-full object-cover transition-opacity hover:opacity-80" />
        </a>
      ) : (
        <div className="flex aspect-square items-center justify-center bg-muted/40">
          {photoUrl.isError ? <span className="px-2 text-center text-[10px] text-muted-foreground">Photo unavailable</span> : <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      )}
      <label className="flex items-center gap-1.5 p-1.5 text-[11px] text-muted-foreground">
        <Checkbox
          checked={photo.confirmed}
          disabled={review.isPending}
          onCheckedChange={(value) => review.mutate({ photoId: photo.id, confirmed: value === true }, { onError: (error) => toast.error(error.message) })}
          aria-label={`${photo.confirmed ? 'Unconfirm' : 'Confirm'} receipt photo`}
        />
        <span className={photo.confirmed ? 'font-semibold text-emerald-600' : ''}>{photo.confirmed ? 'Confirmed' : 'Confirm photo'}</span>
      </label>
    </div>
  );
}

export default function FinanceReconciliationWorkspace() {
  const { profile, role } = useAuth();
  const [tab, setTab] = useState<WorkspaceTab>('daily');
  const [dateFrom, setDateFrom] = useState(todayKey());
  const [dateTo, setDateTo] = useState(todayKey());
  const [type, setType] = useState<FilterType>('ALL');
  const [checked, setChecked] = useState<CheckedFilter>('ALL');
  const [bank, setBank] = useState('');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [claimsOpen, setClaimsOpen] = useState(false);
  const [claimsSearch, setClaimsSearch] = useState('');
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
  const [selectedClaims, setSelectedClaims] = useState<string[]>([]);
  const [outAmount, setOutAmount] = useState('0');
  const workspace = useFinanceReconciliationWorkspace({
    dateFrom, dateTo, runnerId: role === 'runner' ? profile?.id : undefined, type, checked, bank, search,
  });
  const endJobPhotos = useFinanceEndJobPhotos({
    dateFrom,
    dateTo,
    runnerId: role === 'runner' ? profile?.id : undefined,
  }, tab === 'daily');
  const confirmCash = useDailyCashConfirmation();
  const saveClaim = useSaveClaimReconciliation();
  const data = workspace.data;
  const summary = data?.summary || {};
  const records = data?.records || [];
  const daily = data?.daily || [];
  const claims = data?.claims || [];
  const selectedTotal = useMemo(
    () => claims.filter((claim) => selectedClaims.includes(claim.id)).reduce((total, claim) => total + Number(claim.total_bnd || 0), 0),
    [claims, selectedClaims],
  );
  const selectedRunnerId = claims.find((claim) => selectedClaims.includes(claim.id))?.runner_id;
  const filteredClaims = claims.filter((claim) => claim.batch_code.toLowerCase().includes(claimsSearch.trim().toLowerCase()));
  const activeFilterCount = [
    dateFrom !== dateTo,
    type !== 'ALL',
    checked !== 'ALL',
    Boolean(bank.trim()),
    Boolean(search.trim()),
  ].filter(Boolean).length;

  const exportWorkbook = () => {
    downloadXlsxWorkbook([
      {
        name: 'Receipt Log',
        rows: [
          ['DATE', 'TYPE', 'REFERENCE', 'AMOUNT BND', 'CHECKED', 'NAME', 'NOTE', 'BANK', 'T/D', 'SOURCE'],
          ...records.map((row) => [row.date, row.type, row.reference, row.amount_bnd, row.checked ? 'YES' : 'NO', row.name, row.note, row.bank || '', row.transfer_deposit_date || '', row.source]),
        ],
      },
      {
        name: 'Daily Summary',
        rows: [
          ['DATE', 'EXPECTED ACCEPTED CASH', 'SUBMITTED COD', 'CASH HANDED', 'CDM', 'TRANSFER RECEIPTS', 'CHECKED TRANSFERS', 'UNCHECKED TRANSFERS', 'UNCHECKED COUNT', 'TOTAL COLLECTION', 'STATUS'],
          ...daily.map((row) => [row.job_date, row.expected_cash, row.submitted_cod, row.cash_handed, row.cdm_amount, row.transfer_total, row.checked_transfer, row.unchecked_transfer, row.unchecked_count, row.total_collection, row.status]),
        ],
      },
      {
        name: 'Claim Batches',
        rows: [
          ['BATCH CODE', 'TOTAL BND', 'RUNNER', 'SUBMITTED'],
          ...claims.map((claim) => [claim.batch_code, claim.total_bnd, claim.runner_id, claim.submitted_at]),
        ],
      },
    ], `finance-reconciliation-${dateFrom}-${dateTo}.xlsx`);
  };

  const setLatestThreeDays = () => {
    setDateFrom(format(subDays(new Date(), 2), 'yyyy-MM-dd'));
    setDateTo(todayKey());
  };

  const resetFilters = () => {
    setDateFrom(todayKey());
    setDateTo(todayKey());
    setType('ALL');
    setChecked('ALL');
    setBank('');
    setSearch('');
  };

  return (
    <div className="space-y-3 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:space-y-5 sm:pb-0">
      <Card className="overflow-hidden border-primary/20">
        <CardHeader className="border-b border-border/40 bg-gradient-to-r from-primary/10 via-background to-background p-3 sm:pb-5">
          <div className="hidden items-start justify-between gap-4 md:flex">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Daily Finance Control</p>
              <CardTitle className="mt-2 text-2xl">Reconciliation Workspace</CardTitle>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Transfer receipts, driver End Jobs, physical cash confirmation and claim batch reconciliation in BND.</p>
            </div>
            <Button variant="outline" className="w-fit" onClick={exportWorkbook} disabled={!records.length && !daily.length}>
              <Download className="mr-2 h-4 w-4" /> Export XLSX
            </Button>
          </div>
          <div className="flex items-center justify-between gap-2 md:hidden">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Finance Workspace</p>
              <CardTitle className="mt-0.5 text-xl">Reconciliation</CardTitle>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={exportWorkbook} disabled={!records.length && !daily.length} aria-label="Export XLSX">
                <Download className="h-4 w-4" />
              </Button>
              <Button variant="outline" className="h-9 gap-1.5 px-2.5 text-xs" onClick={() => setFiltersOpen(true)}>
                <Filter className="h-3.5 w-3.5" /> Filters{activeFilterCount > 0 && ` ${activeFilterCount}`}
              </Button>
            </div>
          </div>
          <div className="mt-3 md:hidden">
            <button type="button" onClick={() => setDateOpen(true)} className="flex h-10 w-full items-center justify-between rounded-lg border border-border/60 bg-background px-3 text-sm font-semibold">
              <span className="flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" />{dateFrom === dateTo ? displayDate(dateFrom) : `${displayDate(dateFrom)} – ${displayDate(dateTo)}`}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <div className="relative mt-2 md:hidden">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="finance-search-mobile" className="h-10 pl-9 text-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tab === 'daily' ? 'Search driver' : tab === 'records' ? 'Search order / customer' : 'Search claim batch'} />
          </div>
          <div className="mt-5 hidden gap-3 sm:grid-cols-2 lg:grid-cols-4 md:grid">
            <div className="grid gap-1"><Label htmlFor="finance-from">From</Label><Input id="finance-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></div>
            <div className="grid gap-1"><Label htmlFor="finance-to">To</Label><Input id="finance-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div>
            <div className="grid gap-1"><Label htmlFor="finance-search">Search</Label><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="finance-search" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Order, customer, driver" /></div></div>
            <div className="grid gap-1"><Label htmlFor="finance-bank">Bank</Label><Input id="finance-bank" value={bank} onChange={(event) => setBank(event.target.value)} placeholder="All banks" /></div>
          </div>
          <div className="mt-3 hidden flex-wrap gap-2 md:flex">
            <select aria-label="Record type" className="h-10 rounded-lg border border-border/60 bg-background px-3 text-sm" value={type} onChange={(event) => setType(event.target.value as FilterType)}><option value="ALL">All types</option><option value="COD">COD</option><option value="RECEIPT">Receipt</option></select>
            <select aria-label="Checked filter" className="h-10 rounded-lg border border-border/60 bg-background px-3 text-sm" value={checked} onChange={(event) => setChecked(event.target.value as CheckedFilter)}><option value="ALL">All checked status</option><option value="CHECKED">Checked</option><option value="UNCHECKED">Unchecked</option></select>
            <Button variant="ghost" size="sm" onClick={setLatestThreeDays}>Latest 3 days</Button>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-4">
          {workspace.isLoading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : workspace.isError ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><span>Finance data could not be loaded. {workspace.error instanceof Error ? workspace.error.message : 'Please retry.'}</span><Button variant="outline" size="sm" onClick={() => void workspace.refetch()} disabled={workspace.isFetching}>Retry</Button></div> : (
            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
              <SummaryCard label="Expected cash" value={Number(summary.expected_cash || 0)} />
              <SummaryCard label="Cash handed" value={Number(summary.cash_handed || 0)} />
              <SummaryCard label="CDM" value={Number(summary.cdm_total || 0)} />
              <SummaryCard label="Collection" value={Number(summary.total_collection || 0)} tone={Number(summary.unchecked_count || 0) > 0 ? 'warning' : 'success'} />
              <SummaryCard label="Transfers" value={Number(summary.transfer_total || 0)} />
              <SummaryCard label="Unchecked" value={`${money(summary.unchecked_transfer)} · ${Number(summary.unchecked_count || 0)}`} tone={Number(summary.unchecked_count || 0) > 0 ? 'warning' : 'default'} />
              <SummaryCard label="Checked transfers" value={Number(summary.checked_transfer || 0)} tone="success" className="hidden sm:block" />
              <SummaryCard label="Submitted COD" value={Number(summary.submitted_cod || 0)} className="hidden sm:block" />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-border/50 bg-card p-1.5">
        {([['daily', 'Daily Summary', 'Daily'], ['records', 'Receipt & Collection Log', 'Receipts'], ['claims', 'Claim Reconciliation', 'Claims']] as const).map(([value, label, shortLabel]) => (
          <button key={value} type="button" onClick={() => setTab(value)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition sm:px-4 sm:text-sm ${tab === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}><span className="sm:hidden">{shortLabel}</span><span className="hidden sm:inline">{label}</span></button>
        ))}
      </div>

      {tab === 'daily' && <Card><CardHeader className="p-3 sm:p-6"><CardTitle className="text-base sm:text-lg">Daily cash summary</CardTitle></CardHeader><CardContent className="space-y-2 p-3 pt-0 sm:space-y-3 sm:p-6 sm:pt-0">
        {daily.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No reconciliation data for this range.</p>}
        {daily.map((row) => {
          const date = String(row.job_date || '');
          const drivers = Array.isArray(row.drivers) ? row.drivers as Array<Record<string, unknown>> : [];
          const open = Boolean(expandedDates[date]);
          const isRunner = role === 'runner' && profile?.id;
          const driverCount = drivers.length || Number(row.expected_driver_count || 0);
          return <div key={date} className="overflow-hidden rounded-xl border border-border/50">
            <div className="p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <button type="button" className="flex min-w-0 items-center gap-2 text-left" onClick={() => setExpandedDates((current) => ({ ...current, [date]: !open }))}>
                  {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <span className="font-bold">{displayDate(date)}</span>
                  <Badge variant={row.status === 'OK' ? 'secondary' : 'destructive'} className="text-[10px]">{String(row.status || 'CHECK')}</Badge>
                </button>
                <span className="text-xs text-muted-foreground">{driverCount} driver{driverCount === 1 ? '' : 's'}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground sm:grid-cols-5 sm:gap-x-4">
                <span>Accepted <strong className="font-semibold text-foreground">{money(row.expected_cash)}</strong></span>
                <span>Cash <strong className="font-semibold text-foreground">{money(row.cash_handed)}</strong></span>
                <span>CDM <strong className="font-semibold text-foreground">{money(row.cdm_amount)}</strong></span>
                <span>Transfer <strong className="font-semibold text-foreground">{money(row.transfer_total)}</strong></span>
                <span>Total <strong className="font-semibold text-foreground">{money(row.total_collection)}</strong></span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/40 pt-2 text-xs">
                <span className={row.physical_cash_received ? 'text-emerald-600' : 'text-muted-foreground'}>{row.physical_cash_received ? 'Cash received' : 'Cash not confirmed'}</span>
                {isRunner && <label className="flex items-center gap-2"><Checkbox checked={Boolean(row.physical_cash_received)} onCheckedChange={(value) => confirmCash.mutate({ runnerId: profile.id, date, received: value === true }, { onError: (error) => toast.error(error.message) })} /><span>Received</span></label>}
              </div>
            </div>
            {open && <div className="border-t border-border/40 bg-muted/20 p-3"><div className="hidden grid-cols-5 gap-2 px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid"><span>Driver</span><span>Accepted</span><span>Cash</span><span>CDM</span><span>Status</span></div>{drivers.length === 0 ? <p className="px-2 py-3 text-sm text-muted-foreground">No submitted End Job for this date.</p> : drivers.map((driver) => {
              const driverPhotos = (endJobPhotos.data || []).filter((photo) => photo.job_date === date && photo.driver_id === String(driver.driver_id));
              return <div key={String(driver.driver_id)} className="border-t border-border/30 px-2 py-2.5 text-sm sm:py-3"><div className="grid gap-1.5 sm:grid-cols-5 sm:gap-2"><span className="font-medium">{String(driver.driver_name)}</span><span><span className="mr-2 text-xs text-muted-foreground sm:hidden">Accepted</span>{money(driver.accepted_cash)}</span><span><span className="mr-2 text-xs text-muted-foreground sm:hidden">Cash</span>{money(driver.cash_handed)}</span><span><span className="mr-2 text-xs text-muted-foreground sm:hidden">CDM</span>{money(driver.cdm_amount)}</span><span><span className="mr-2 text-xs text-muted-foreground sm:hidden">Status</span><span className={Number(driver.difference || 0) === 0 ? 'text-emerald-600' : 'text-amber-600'}>{String(driver.status)}</span></span></div><div className="mt-2 rounded-lg border border-border/40 bg-background/60 p-2"><div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><span>End Job receipt photos</span><span>{driverPhotos.length ? `${driverPhotos.length} uploaded` : 'None uploaded'}</span></div>{driverPhotos.length > 0 && <div className="mt-2 grid grid-cols-3 gap-2">{driverPhotos.map((photo) => <EndJobPhotoCard key={photo.id} photo={photo} />)}</div>}</div></div>;
            })}</div>}
          </div>;
        })}
      </CardContent></Card>}

      {tab === 'records' && <Card><CardHeader className="p-3 sm:p-6"><CardTitle className="text-base sm:text-lg">Receipt & collection log</CardTitle></CardHeader><CardContent className="p-0"><div className="hidden grid-cols-7 gap-3 border-b border-border/40 bg-muted/30 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:grid"><span>Date</span><span>Type</span><span>Reference / name</span><span>Amount</span><span>Checked</span><span>Note / Bank / T-D</span><span /></div>{records.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No rows match the filters.</p> : records.map((record) => record.type === 'RECEIPT' ? <ReceiptRow key={`${record.type}-${record.id}`} record={record} /> : <div key={`${record.type}-${record.id}`} className="grid gap-2 border-b border-border/40 px-3 py-3 text-sm sm:px-4 sm:py-4 md:grid-cols-[100px_110px_minmax(120px,1fr)_120px_80px_minmax(120px,1fr)] md:items-center"><div className="text-xs text-muted-foreground sm:text-sm">{displayDate(record.date)}</div><Badge variant="outline" className="w-fit text-[10px]">COD</Badge><div><p className="font-semibold">{record.reference}</p><p className="text-xs text-muted-foreground">Driver End Job</p></div><div className="font-semibold">{money(record.amount_bnd)}</div><div className="text-xs text-muted-foreground">{record.checked ? 'Matched' : 'Open'}</div><div className="text-xs text-muted-foreground">Cash {money(record.cash_handed)} · CDM {money(record.cdm_amount)}</div></div>)}</CardContent></Card>}

      {tab === 'claims' && <Card><CardHeader className="p-3 sm:p-6"><CardTitle className="text-base sm:text-lg">Claim batch reconciliation</CardTitle><p className="hidden text-sm text-muted-foreground sm:block">Select available claim batches, enter OUT, and GROSS is calculated from the selected BND total.</p></CardHeader><CardContent className="space-y-3 p-3 sm:space-y-4 sm:p-6">
        <div className="flex items-center gap-2 overflow-x-auto md:hidden">
          {selectedClaims.map((id) => { const claim = claims.find((item) => item.id === id); return claim ? <Badge key={id} variant="secondary" className="shrink-0">{claim.batch_code}</Badge> : null; })}
          <Button type="button" variant="outline" className="h-9 shrink-0 text-xs" onClick={() => setClaimsOpen(true)}>+ Select</Button>
        </div>
        <div className="hidden space-y-2 md:block">{claims.length === 0 ? <p className="rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground">No available claim batches.</p> : claims.map((claim) => <label key={claim.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 p-3"><span className="flex items-center gap-3"><Checkbox checked={selectedClaims.includes(claim.id)} onCheckedChange={(value) => setSelectedClaims((current) => value === true ? [...current, claim.id] : current.filter((id) => id !== claim.id))} /><span className="font-semibold">{claim.batch_code}</span></span><span className="text-sm font-semibold">{money(claim.total_bnd)}</span></label>)}</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><div><Label>Selected total</Label><p className="mt-1 font-bold sm:mt-2">{money(selectedTotal)}</p></div><div><Label htmlFor="claim-out">OUT</Label><Input id="claim-out" type="number" min="0" step="0.01" value={outAmount} onChange={(event) => setOutAmount(event.target.value)} /></div><div><Label>GROSS</Label><p className="mt-1 font-bold text-emerald-600 sm:mt-2">{money(calculateClaimGross(selectedTotal, Number(outAmount || 0)) ?? 0)}</p></div></div>
        <Button className="h-10" disabled={!selectedRunnerId || selectedClaims.length === 0 || calculateClaimGross(selectedTotal, Number(outAmount || 0)) === null || saveClaim.isPending} onClick={() => saveClaim.mutate({ runnerId: selectedRunnerId!, claimBatchIds: selectedClaims, outAmount: Number(outAmount || 0) }, { onSuccess: () => { toast.success('Claim reconciliation saved'); setSelectedClaims([]); setOutAmount('0'); }, onError: (error) => toast.error(error.message) })}><Save className="mr-2 h-4 w-4" /> Save reconciliation</Button><p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" /> One claim batch can be reconciled only once.</p>
      </CardContent></Card>}

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-3xl pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <SheetHeader className="text-left"><SheetTitle>Finance filters</SheetTitle><SheetDescription>Choose filters for the selected workspace date.</SheetDescription></SheetHeader>
          <div className="mt-4 grid gap-3">
            <div className="grid gap-1"><Label htmlFor="finance-filter-search">Search</Label><Input id="finance-filter-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Order, customer, driver" /></div>
            <div className="grid gap-1"><Label htmlFor="finance-filter-bank">Bank</Label><Input id="finance-filter-bank" value={bank} onChange={(event) => setBank(event.target.value)} placeholder="All banks" /></div>
            <div className="grid grid-cols-2 gap-2"><div className="grid gap-1"><Label htmlFor="finance-filter-type">Type</Label><select id="finance-filter-type" className="h-10 rounded-lg border border-border/60 bg-background px-3 text-sm" value={type} onChange={(event) => setType(event.target.value as FilterType)}><option value="ALL">All types</option><option value="COD">COD</option><option value="RECEIPT">Receipt</option></select></div><div className="grid gap-1"><Label htmlFor="finance-filter-checked">Checked</Label><select id="finance-filter-checked" className="h-10 rounded-lg border border-border/60 bg-background px-3 text-sm" value={checked} onChange={(event) => setChecked(event.target.value as CheckedFilter)}><option value="ALL">All</option><option value="CHECKED">Checked</option><option value="UNCHECKED">Unchecked</option></select></div></div>
            <button type="button" onClick={() => { setFiltersOpen(false); setDateOpen(true); }} className="flex h-10 items-center justify-between rounded-lg border border-border/60 px-3 text-sm"><span>{dateFrom === dateTo ? displayDate(dateFrom) : `${displayDate(dateFrom)} – ${displayDate(dateTo)}`}</span><Calendar className="h-4 w-4 text-primary" /></button>
            <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1" onClick={resetFilters}>Reset</Button><Button type="button" className="flex-1" onClick={() => setFiltersOpen(false)}>Apply</Button></div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={dateOpen} onOpenChange={setDateOpen}>
        <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-3xl pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <SheetHeader className="text-left"><SheetTitle>Select date</SheetTitle><SheetDescription>Use a quick range or choose custom dates.</SheetDescription></SheetHeader>
          <div className="mt-4 grid grid-cols-2 gap-2"><Button type="button" variant="outline" onClick={() => { setDateFrom(todayKey()); setDateTo(todayKey()); }}>Today</Button><Button type="button" variant="outline" onClick={() => { const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd'); setDateFrom(yesterday); setDateTo(yesterday); }}>Yesterday</Button><Button type="button" variant="outline" onClick={setLatestThreeDays}>Last 3 days</Button><Button type="button" variant="outline" onClick={() => { setDateFrom(format(subDays(new Date(), 6), 'yyyy-MM-dd')); setDateTo(todayKey()); }}>This week</Button></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="grid gap-1"><Label htmlFor="finance-mobile-from">From</Label><Input id="finance-mobile-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></div><div className="grid gap-1"><Label htmlFor="finance-mobile-to">To</Label><Input id="finance-mobile-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div></div>
          <Button type="button" className="mt-4 w-full" onClick={() => setDateOpen(false)}>Apply dates</Button>
        </SheetContent>
      </Sheet>

      <Sheet open={claimsOpen} onOpenChange={setClaimsOpen}>
        <SheetContent side="bottom" className="flex max-h-[88dvh] min-h-0 flex-col overflow-hidden rounded-t-3xl p-0">
          <div className="shrink-0 px-6 pb-2 pt-6">
            <SheetHeader className="pr-8 text-left"><SheetTitle>Select claim batches</SheetTitle><SheetDescription>{selectedClaims.length} selected · {money(selectedTotal)}</SheetDescription></SheetHeader>
            <div className="relative mt-4"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={claimsSearch} onChange={(event) => setClaimsSearch(event.target.value)} placeholder="Search claim batch" /></div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-4 [-webkit-overflow-scrolling:touch]">
            <div className="space-y-2">{filteredClaims.length === 0 ? <p className="rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground">No available claim batches.</p> : filteredClaims.map((claim) => <label key={claim.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 p-3"><span className="flex items-center gap-3"><Checkbox checked={selectedClaims.includes(claim.id)} onCheckedChange={(value) => setSelectedClaims((current) => value === true ? [...current, claim.id] : current.filter((id) => id !== claim.id))} /><span className="font-semibold">{claim.batch_code}</span></span><span className="text-sm font-semibold">{money(claim.total_bnd)}</span></label>)}</div>
          </div>
          <div className="shrink-0 border-t bg-background/95 px-6 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
            <Button type="button" className="w-full" onClick={() => setClaimsOpen(false)}>Confirm</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
