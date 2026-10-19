import { useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Download, Loader2, Save, Search, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { calculateClaimGross } from '@/lib/financeReconciliation';
import { downloadXlsxWorkbook } from '@/lib/xlsxExport';
import {
  useDailyCashConfirmation,
  useFinanceReconciliationWorkspace,
  useSaveClaimReconciliation,
  useSaveFinanceReceipt,
  type FinanceRecord,
} from '@/hooks/useFinanceReconciliation';

type WorkspaceTab = 'daily' | 'records' | 'claims';

const money = (value: unknown) => `BND ${Number(value || 0).toFixed(2)}`;
const todayKey = () => format(new Date(), 'yyyy-MM-dd');

function SummaryCard({ label, value, tone = 'default' }: { label: string; value: unknown; tone?: 'default' | 'warning' | 'success' }) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/70 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className={`mt-2 text-xl font-black ${tone === 'warning' ? 'text-amber-600' : tone === 'success' ? 'text-emerald-600' : 'text-foreground'}`}>
        {typeof value === 'number' ? money(value) : value}
      </p>
    </div>
  );
}

function ReceiptRow({ record }: { record: FinanceRecord }) {
  const save = useSaveFinanceReceipt();
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
    <div className="grid gap-3 border-b border-border/40 px-4 py-4 md:grid-cols-[100px_110px_minmax(120px,1fr)_120px_80px_minmax(120px,1fr)_140px] md:items-center">
      <div className="text-sm text-muted-foreground">{record.date}</div>
      <Badge variant="outline" className="w-fit">{record.type}</Badge>
      <div className="min-w-0">
        <p className="truncate font-semibold">{record.reference}</p>
        <p className="truncate text-xs text-muted-foreground">{record.name}</p>
      </div>
      <div className="font-semibold">{money(record.amount_bnd)}</div>
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
        <span className="text-xs text-muted-foreground">{checked ? 'Received' : 'Open'}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3 md:col-span-2">
        <Input value={note} onChange={(event) => setNote(event.target.value)} onBlur={() => persist()} placeholder="Note" />
        <Input value={bank} onChange={(event) => setBank(event.target.value)} onBlur={() => persist()} placeholder="Bank" />
        <Input type="date" value={depositDate} onChange={(event) => setDepositDate(event.target.value)} onBlur={() => persist()} aria-label="Transfer or deposit date" />
      </div>
      {save.isPending && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
    </div>
  );
}

export default function FinanceReconciliationWorkspace() {
  const { profile, role } = useAuth();
  const [tab, setTab] = useState<WorkspaceTab>('daily');
  const [dateFrom, setDateFrom] = useState(todayKey());
  const [dateTo, setDateTo] = useState(todayKey());
  const [type, setType] = useState<'ALL' | 'COD' | 'RECEIPT'>('ALL');
  const [checked, setChecked] = useState<'ALL' | 'CHECKED' | 'UNCHECKED'>('ALL');
  const [bank, setBank] = useState('');
  const [search, setSearch] = useState('');
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
  const [selectedClaims, setSelectedClaims] = useState<string[]>([]);
  const [outAmount, setOutAmount] = useState('0');
  const workspace = useFinanceReconciliationWorkspace({
    dateFrom, dateTo, runnerId: role === 'runner' ? profile?.id : undefined, type, checked, bank, search,
  });
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

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-primary/20">
        <CardHeader className="border-b border-border/40 bg-gradient-to-r from-primary/10 via-background to-background pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Daily Finance Control</p>
              <CardTitle className="mt-2 text-2xl">Reconciliation Workspace</CardTitle>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Transfer receipts, driver End Jobs, physical cash confirmation and claim batch reconciliation in BND.</p>
            </div>
            <Button variant="outline" className="w-fit" onClick={exportWorkbook} disabled={!records.length && !daily.length}>
              <Download className="mr-2 h-4 w-4" /> Export XLSX
            </Button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="grid gap-1"><Label htmlFor="finance-from">From</Label><Input id="finance-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></div>
            <div className="grid gap-1"><Label htmlFor="finance-to">To</Label><Input id="finance-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div>
            <div className="grid gap-1"><Label htmlFor="finance-search">Search</Label><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="finance-search" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Order, customer, driver" /></div></div>
            <div className="grid gap-1"><Label htmlFor="finance-bank">Bank</Label><Input id="finance-bank" value={bank} onChange={(event) => setBank(event.target.value)} placeholder="All banks" /></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <select aria-label="Record type" className="h-10 rounded-lg border border-border/60 bg-background px-3 text-sm" value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="ALL">All types</option><option value="COD">COD</option><option value="RECEIPT">Receipt</option></select>
            <select aria-label="Checked filter" className="h-10 rounded-lg border border-border/60 bg-background px-3 text-sm" value={checked} onChange={(event) => setChecked(event.target.value as typeof checked)}><option value="ALL">All checked status</option><option value="CHECKED">Checked</option><option value="UNCHECKED">Unchecked</option></select>
            <Button variant="ghost" size="sm" onClick={() => { setDateFrom(format(subDays(new Date(), 2), 'yyyy-MM-dd')); setDateTo(todayKey()); setType('ALL'); setChecked('ALL'); setBank(''); setSearch(''); }}>Latest 3 days</Button>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {workspace.isLoading ? <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : workspace.isError ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><span>Finance data could not be loaded. {workspace.error instanceof Error ? workspace.error.message : 'Please retry.'}</span><Button variant="outline" size="sm" onClick={() => void workspace.refetch()} disabled={workspace.isFetching}>Retry</Button></div> : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard label="Expected accepted cash" value={Number(summary.expected_cash || 0)} />
                <SummaryCard label="Cash handed" value={Number(summary.cash_handed || 0)} />
                <SummaryCard label="CDM total" value={Number(summary.cdm_total || 0)} />
                <SummaryCard label="Total collection" value={Number(summary.total_collection || 0)} tone={Number(summary.unchecked_count || 0) > 0 ? 'warning' : 'success'} />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard label="Transfer receipts" value={Number(summary.transfer_total || 0)} />
                <SummaryCard label="Checked transfers" value={Number(summary.checked_transfer || 0)} tone="success" />
                <SummaryCard label="Unchecked transfers" value={`${money(summary.unchecked_transfer)} · ${Number(summary.unchecked_count || 0)} orders`} tone={Number(summary.unchecked_count || 0) > 0 ? 'warning' : 'default'} />
                <SummaryCard label="Submitted COD" value={Number(summary.submitted_cod || 0)} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 rounded-xl border border-border/50 bg-card p-2">
        {([['daily', 'Daily Summary'], ['records', 'Receipt & Collection Log'], ['claims', 'Claim Reconciliation']] as const).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>{label}</button>
        ))}
      </div>

      {tab === 'daily' && <Card><CardHeader><CardTitle className="text-lg">Daily cash summary</CardTitle></CardHeader><CardContent className="space-y-3">
        {daily.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No reconciliation data for this range.</p>}
        {daily.map((row) => {
          const date = String(row.job_date || '');
          const drivers = Array.isArray(row.drivers) ? row.drivers as Array<Record<string, unknown>> : [];
          const open = Boolean(expandedDates[date]);
          const isRunner = role === 'runner' && profile?.id;
          return <div key={date} className="overflow-hidden rounded-xl border border-border/50">
            <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
              <button type="button" className="flex items-center gap-2 text-left" onClick={() => setExpandedDates((current) => ({ ...current, [date]: !open }))}>{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}<span className="font-bold">{date}</span><Badge variant={row.status === 'OK' ? 'secondary' : 'destructive'}>{String(row.status || 'CHECK')}</Badge></button>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4"><span>Accepted {money(row.expected_cash)}</span><span>Cash {money(row.cash_handed)}</span><span>CDM {money(row.cdm_amount)}</span><span>Total {money(row.total_collection)}</span></div>
              {isRunner && <label className="flex items-center gap-2 text-sm"><Checkbox checked={Boolean(row.physical_cash_received)} onCheckedChange={(value) => confirmCash.mutate({ runnerId: profile.id, date, received: value === true }, { onError: (error) => toast.error(error.message) })} /><span>Physical cash received</span></label>}
            </div>
            {open && <div className="border-t border-border/40 bg-muted/20 p-3"><div className="hidden grid-cols-5 gap-2 px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid"><span>Driver</span><span>Accepted</span><span>Cash</span><span>CDM</span><span>Status</span></div>{drivers.length === 0 ? <p className="px-2 py-3 text-sm text-muted-foreground">No submitted End Job for this date.</p> : drivers.map((driver) => <div key={String(driver.driver_id)} className="grid gap-2 border-t border-border/30 px-2 py-3 text-sm sm:grid-cols-5"><span className="font-medium">{String(driver.driver_name)}</span><span><span className="mr-2 text-xs text-muted-foreground sm:hidden">Accepted</span>{money(driver.accepted_cash)}</span><span><span className="mr-2 text-xs text-muted-foreground sm:hidden">Cash</span>{money(driver.cash_handed)}</span><span><span className="mr-2 text-xs text-muted-foreground sm:hidden">CDM</span>{money(driver.cdm_amount)}</span><span><span className="mr-2 text-xs text-muted-foreground sm:hidden">Status</span><span className={Number(driver.difference || 0) === 0 ? 'text-emerald-600' : 'text-amber-600'}>{String(driver.status)}</span></span></div>)}</div>}
          </div>;
        })}
      </CardContent></Card>}

      {tab === 'records' && <Card><CardHeader><CardTitle className="text-lg">Receipt & collection log</CardTitle></CardHeader><CardContent className="p-0"><div className="hidden grid-cols-7 gap-3 border-b border-border/40 bg-muted/30 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:grid"><span>Date</span><span>Type</span><span>Reference / name</span><span>Amount</span><span>Checked</span><span>Note / Bank / T-D</span><span /></div>{records.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No rows match the filters.</p> : records.map((record) => record.type === 'RECEIPT' ? <ReceiptRow key={`${record.type}-${record.id}`} record={record} /> : <div key={`${record.type}-${record.id}`} className="grid gap-3 border-b border-border/40 px-4 py-4 md:grid-cols-[100px_110px_minmax(120px,1fr)_120px_80px_minmax(120px,1fr)] md:items-center"><div className="text-sm text-muted-foreground">{record.date}</div><Badge variant="outline" className="w-fit">COD</Badge><div><p className="font-semibold">{record.reference}</p><p className="text-xs text-muted-foreground">Driver End Job</p></div><div className="font-semibold">{money(record.amount_bnd)}</div><div className="text-xs text-muted-foreground">{record.checked ? 'Received' : 'Open'}</div><div className="text-xs text-muted-foreground">Cash {money(record.cash_handed)} · CDM {money(record.cdm_amount)}</div></div>)}</CardContent></Card>}

      {tab === 'claims' && <Card><CardHeader><CardTitle className="text-lg">Claim batch reconciliation</CardTitle><p className="text-sm text-muted-foreground">Select available claim batches, enter OUT, and GROSS is calculated from the selected BND total.</p></CardHeader><CardContent className="space-y-4"><div className="space-y-2">{claims.length === 0 ? <p className="rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground">No available claim batches.</p> : claims.map((claim) => <label key={claim.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 p-3"><span className="flex items-center gap-3"><Checkbox checked={selectedClaims.includes(claim.id)} onCheckedChange={(value) => setSelectedClaims((current) => value === true ? [...current, claim.id] : current.filter((id) => id !== claim.id))} /><span className="font-semibold">{claim.batch_code}</span></span><span className="text-sm font-semibold">{money(claim.total_bnd)}</span></label>)}</div><div className="grid gap-3 sm:grid-cols-3"><div><Label>Selected total</Label><p className="mt-2 font-bold">{money(selectedTotal)}</p></div><div><Label htmlFor="claim-out">OUT</Label><Input id="claim-out" type="number" min="0" step="0.01" value={outAmount} onChange={(event) => setOutAmount(event.target.value)} /></div><div><Label>GROSS</Label><p className="mt-2 font-bold text-emerald-600">{money(calculateClaimGross(selectedTotal, Number(outAmount || 0)) ?? 0)}</p></div></div><Button disabled={!selectedRunnerId || selectedClaims.length === 0 || calculateClaimGross(selectedTotal, Number(outAmount || 0)) === null || saveClaim.isPending} onClick={() => saveClaim.mutate({ runnerId: selectedRunnerId!, claimBatchIds: selectedClaims, outAmount: Number(outAmount || 0) }, { onSuccess: () => { toast.success('Claim reconciliation saved'); setSelectedClaims([]); setOutAmount('0'); }, onError: (error) => toast.error(error.message) })}><Save className="mr-2 h-4 w-4" /> Save reconciliation</Button><p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" /> One claim batch can be reconciled only once.</p></CardContent></Card>}
    </div>
  );
}
