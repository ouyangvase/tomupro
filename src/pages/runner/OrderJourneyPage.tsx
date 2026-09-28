import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Clock3, ExternalLink, GitBranch, History, Image as ImageIcon, Loader2, Search, ShieldAlert, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { normalizeOrderCodes, useOrderJourney, type OrderJourney, type OrderJourneyRow } from '@/hooks/useOrderJourney';
import { useAttachments } from '@/hooks/useAttachments';
import { buildJourneyTimeline, orderLocation, type JourneyTimelineItem } from '@/lib/orderJourneyPresentation';
import { getSignedStorageUrl } from '@/lib/storageUrls';

const text = (value: unknown, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);

const dateParts = (value: unknown) => {
  if (!value) return { date: '—', time: '—' };
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return { date: String(value), time: '' };
  return {
    date: date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }),
    time: date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  };
};

const dateTime = (value: unknown) => {
  const parts = dateParts(value);
  return parts.time ? `${parts.date}, ${parts.time}` : parts.date;
};

const tabClass = (value: string | null | undefined) => {
  if (value === 'READY ORDER') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300';
  if (value === 'ACTION REQUIRED') return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300';
  if (value === 'BOOKING SALES') return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300';
  if (value === 'DELIVERED') return 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300';
  if (value === 'CANCELLED') return 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300';
  return 'border-border bg-muted/40 text-foreground';
};

function TabPill({ value, large = false }: { value: string | null | undefined; large?: boolean }) {
  return <span className={`inline-flex items-center rounded-full border px-3 py-1 font-semibold ${large ? 'text-sm' : 'text-xs'} ${tabClass(value)}`}>{text(value, 'NOT RECORDED')}</span>;
}

function Info({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold" title={text(value)}>{text(value)}</p>
    </div>
  );
}

function EventRow({ item }: { item: JourneyTimelineItem }) {
  const parts = dateParts(item.occurredAt);
  return (
    <div className="grid grid-cols-[76px_16px_minmax(0,1fr)] gap-3 md:grid-cols-[112px_20px_minmax(0,1fr)] md:gap-4">
      <div className="pt-3 text-right">
        <p className="text-xs font-semibold text-foreground">{parts.date}</p>
        <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">{parts.time}</p>
      </div>
      <div className="relative flex justify-center">
        <span className="z-10 mt-4 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
        <span className="absolute inset-y-0 w-px bg-primary/20" />
      </div>
      <div className="mb-4 rounded-2xl border bg-background p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-base font-bold">{item.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.kind}</p>
          </div>
          {item.tab && <TabPill value={item.tab} />}
        </div>

        {item.from && item.to && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-muted/35 px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Status changed</span>
            <TabPill value={item.from} />
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <TabPill value={item.to} />
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Operator" value={`${item.operator} · ${item.operatorRole}`} />
          <Info label="Driver" value={item.driver} />
          <Info label="Runner" value={item.runner} />
          <Info label="Order tab then" value={item.tab} />
        </div>

        {item.detail && <p className="mt-3 rounded-xl border border-dashed bg-muted/20 px-3 py-2 text-sm text-foreground/80"><span className="font-semibold">Note:</span> {item.detail}</p>}
      </div>
    </div>
  );
}

function DriverProofPhotos({ orderId, orderCode }: { orderId: string; orderCode: string }) {
  const { data: attachments = [], isLoading } = useAttachments({ orderId });
  const deliveryProofs = useMemo(
    () => attachments.filter((attachment) => attachment.type === 'delivery_photo'),
    [attachments],
  );
  const { data: signedProofs = [], error: signingError, isFetching: isSigning } = useQuery({
    queryKey: ['order-journey-delivery-proof-urls', orderId, deliveryProofs.map((proof) => proof.id)],
    queryFn: async () => Promise.all(deliveryProofs.map(async (proof) => ({
      id: proof.id,
      signedUrl: await getSignedStorageUrl(proof.url, 'delivery-photos'),
      uploadedAt: proof.uploaded_at,
    }))),
    enabled: deliveryProofs.length > 0,
    staleTime: 30_000,
  });

  return (
    <section className="rounded-2xl border bg-muted/10 p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary"><ImageIcon className="h-5 w-5" /></div>
        <div>
          <h4 className="font-semibold">Driver delivery photos</h4>
          <p className="mt-1 text-sm text-muted-foreground">Proof photos attached by the driver for {orderCode}.</p>
        </div>
      </div>

      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading driver photos…</p>}
      {!isLoading && deliveryProofs.length === 0 && <p className="mt-4 rounded-xl border border-dashed p-3 text-sm text-muted-foreground">No driver delivery photo attached.</p>}
      {signingError && <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Unable to open the driver photo: {signingError.message}</p>}
      {isSigning && <p className="mt-4 text-sm text-muted-foreground">Preparing driver photos…</p>}
      {signedProofs.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {signedProofs.map((proof, index) => (
            <a
              key={proof.id}
              href={proof.signedUrl}
              target="_blank"
              rel="noreferrer"
              className="group relative block aspect-square overflow-hidden rounded-xl border bg-muted"
              title={`Open driver delivery photo ${index + 1}`}
            >
              <img src={proof.signedUrl} alt={`Driver delivery proof ${index + 1} for ${orderCode}`} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-slate-950/75 px-2 py-1.5 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                <span>Photo {index + 1}</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function JourneyCard({ row }: { row: OrderJourneyRow }) {
  const journey = row.journey as OrderJourney;
  const order = journey.order || {};
  const summary = journey.summary || {};
  const anomalies = journey.anomalies || [];
  const timeline = buildJourneyTimeline(journey);
  const currentTab = orderLocation(summary.canonical_state || order.current_operational_state || order.status);
  const currentDriver = journey.current_driver?.name || summary.current_driver_id;
  const currentRunner = journey.current_runner?.name || summary.current_runner_id;
  const lastActivity = timeline[timeline.length - 1];
  const currentDriverAssignment = [...timeline].reverse().find((item) => item.kind === 'Driver assignment' && item.title === 'Driver assigned');

  return (
    <Card className="overflow-hidden">
      <div className="border-b bg-muted/20 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Order Journey</p>
            <h3 className="mt-1 text-2xl font-bold tracking-tight">{row.order_code}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{text(order.customer_name)} · {text(order.area)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Current tab</p>
            <div className="mt-1"><TabPill value={currentTab} large /></div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl bg-slate-950 p-4 text-white shadow-sm md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <span className="text-sm font-semibold">This order is now in</span>
              <span className="font-bold text-amber-300">{text(currentTab, 'UNKNOWN')}</span>
            </div>
            <p className="text-xs text-slate-300">Last activity: {lastActivity ? dateTime(lastActivity.occurredAt) : '—'}</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-white/10 p-3"><p className="text-[10px] uppercase tracking-[0.14em] text-slate-300">Current driver</p><p className="mt-1 font-semibold">{text(currentDriver, 'Unassigned')}</p>{currentDriverAssignment && <p className="mt-1 text-[11px] text-slate-300">Assigned at {dateTime(currentDriverAssignment.occurredAt)}</p>}</div>
            <div className="rounded-xl bg-white/10 p-3"><p className="text-[10px] uppercase tracking-[0.14em] text-slate-300">Current runner</p><p className="mt-1 font-semibold">{text(currentRunner, 'Unassigned')}</p></div>
            <div className="rounded-xl bg-white/10 p-3"><p className="text-[10px] uppercase tracking-[0.14em] text-slate-300">Driver status</p><p className="mt-1 font-semibold">{text(summary.driver_status || order.current_driver_status)}</p></div>
            <div className="rounded-xl bg-white/10 p-3"><p className="text-[10px] uppercase tracking-[0.14em] text-slate-300">Runner status</p><p className="mt-1 font-semibold">{text(summary.runner_status || order.runner_status)}</p></div>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-4 md:p-5">
        {journey.snapshot && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
            <p className="font-semibold">Viewing history up to {dateTime(journey.snapshot.at)}</p>
            {journey.snapshot.last_lifecycle_event && <p className="mt-1 text-muted-foreground">Last recorded update before that time: {dateTime((journey.snapshot.last_lifecycle_event as Record<string, unknown>).occurred_at)}</p>}
          </div>
        )}

        {anomalies.length > 0 && (
          <div className="rounded-xl border border-amber-300/60 bg-amber-50/70 p-3 dark:bg-amber-950/20">
            <div className="flex items-center gap-2 text-sm font-semibold"><ShieldAlert className="h-4 w-4 text-amber-600" /> Check needed</div>
            <div className="mt-2 space-y-1 text-sm text-amber-900 dark:text-amber-200">
              {anomalies.map((anomaly, index) => <p key={`${text(anomaly.code)}-${index}`}>{text(anomaly.message, 'This order has a history that needs review.')}</p>)}
            </div>
          </div>
        )}

        <DriverProofPhotos orderId={row.order_id} orderCode={row.order_code} />

        <div>
          <div className="mb-1 flex items-center gap-2"><History className="h-4 w-4 text-primary" /><h4 className="text-lg font-bold">What happened, in order</h4></div>
          <p className="mb-4 text-sm text-muted-foreground">Every line shows the exact time, action, person, driver, and order tab at that moment.</p>
          {timeline.length === 0 ? <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No history found in the selected date range.</p> : <div>{timeline.map((item) => <EventRow key={item.key} item={item} />)}</div>}
        </div>
      </div>
    </Card>
  );
}

export default function OrderJourneyPage() {
  const [input, setInput] = useState('');
  const [submittedCodes, setSubmittedCodes] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [snapshotAt, setSnapshotAt] = useState('');
  const codes = normalizeOrderCodes(input);
  const { data, error, isFetching } = useOrderJourney({
    orderCodes: submittedCodes,
    dateFrom,
    dateTo,
    snapshotAt,
    enabled: submittedCodes.length > 0,
  });

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2"><GitBranch className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">Order Journey</h2></div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">See exactly what happened, when it happened, who handled it, and where the order is now.</p>
      </div>

      <Card className="p-4 md:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Enter order codes, one per line (for example PP00015)"
              className="min-h-24 w-full resize-y rounded-xl border bg-background px-10 py-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="mt-1 text-xs text-muted-foreground">{codes.length}/50 orders ready.</p>
          </div>
          <Button type="button" onClick={() => setSubmittedCodes(codes)} disabled={codes.length === 0 || isFetching} className="h-11 rounded-xl lg:mt-0">
            {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />} Show journey
          </Button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-xs font-medium text-muted-foreground"><span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> From date</span><Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground"><span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> To date</span><Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground"><span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> View as at</span><Input type="datetime-local" value={snapshotAt} onChange={(event) => setSnapshotAt(event.target.value)} /></label>
        </div>
      </Card>

      {error && <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Unable to load this order journey: {error.message}</div>}
      {isFetching && submittedCodes.length > 0 && <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading journey…</div>}
      {!isFetching && submittedCodes.length > 0 && data && data.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No order history found for these codes.</div>}
      {!isFetching && data?.map((row) => <JourneyCard key={row.order_id} row={row} />)}
      {submittedCodes.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground"><UserRound className="mx-auto mb-2 h-5 w-5" />Enter an order code to see the full journey.</div>}
    </div>
  );
}
