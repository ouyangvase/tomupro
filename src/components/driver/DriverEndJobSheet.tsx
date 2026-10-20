import { useEffect, useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { AlertTriangle, Camera, CheckCircle2, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { formatBND } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MobileActionSheet } from '@/components/mobile/MobileActionSheet';
import {
  deleteEndJobPhoto,
  getEndJobPhotoUrl,
  uploadEndJobPhoto,
  useDriverEndJobContext,
  useUpsertDriverEndJob,
} from '@/hooks/useFinanceReconciliation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { calculateReconciliation } from '@/lib/financeReconciliation';

type EndJob = {
  id: string;
  job_date: string;
  accepted_cash_expected: number;
  cash_handed: number;
  cdm_amount: number;
  declared_total: number;
  difference: number;
  status: string;
  note?: string;
};

type EndJobPhoto = { id: string; storage_path: string; uploaded_at: string };

function dateKey(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

export type DriverEndJobSheetProps = {
  driverId?: string;
  initialDate?: string;
  readOnly?: boolean;
  compact?: boolean;
};

export function DriverEndJobSheet({ driverId, initialDate = dateKey(new Date()), readOnly = false, compact = false }: DriverEndJobSheetProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(initialDate);
  const [cash, setCash] = useState('0');
  const [cdm, setCdm] = useState('0');
  const [note, setNote] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const context = useDriverEndJobContext(driverId, date, Boolean(driverId));
  const submit = useUpsertDriverEndJob();
  const contextValue = (context.data || {}) as {
    expected_cash?: number;
    pending_review_cash?: number;
    accepted_cash?: number;
    pending_cash?: number;
    pending_cash_count?: number;
    editable?: boolean;
    end_job?: EndJob;
  };
  const job = contextValue.end_job && contextValue.end_job.id ? contextValue.end_job : undefined;
  const photos = useQuery({
    queryKey: ['finance-end-job-photos', job?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('finance_end_job_photos').select('id,storage_path,uploaded_at').eq('end_job_id', job?.id).is('deleted_at', null).order('uploaded_at');
      if (error) throw error;
      return (data || []) as EndJobPhoto[];
    },
    enabled: Boolean(job?.id),
  });
  const removePhoto = useMutation({
    mutationFn: deleteEndJobPhoto,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['finance-end-job-photos', job?.id] }),
  });

  useEffect(() => {
    const current = contextValue.end_job;
    setCash(String(current?.cash_handed ?? 0));
    setCdm(String(current?.cdm_amount ?? 0));
    setNote(current?.note || '');
  }, [date, context.data]);

  useEffect(() => {
    let cancelled = false;
    const loadUrls = async () => {
      const next: Record<string, string> = {};
      for (const photo of photos.data || []) {
        try { next[photo.id] = await getEndJobPhotoUrl(photo.storage_path); } catch { /* private object may have expired */ }
      }
      if (!cancelled) setPhotoUrls(next);
    };
    void loadUrls();
    return () => { cancelled = true; };
  }, [photos.data]);

  const expectedCash = Number(
    contextValue.pending_review_cash
      ?? contextValue.expected_cash
      ?? contextValue.accepted_cash
      ?? contextValue.pending_cash
      ?? 0,
  );
  const cashAmount = Math.max(Number(cash || 0), 0);
  const cdmAmount = Math.max(Number(cdm || 0), 0);
  const reconciliation = calculateReconciliation(expectedCash, cashAmount, cdmAmount);
  const declared = reconciliation.declared;
  const difference = reconciliation.difference;
  const editable = Boolean(contextValue.editable) && !readOnly;
  const latestDates = useMemo(() => [0, 1, 2].map((offset) => dateKey(subDays(new Date(), offset))), []);
  const dateOptions = useMemo(
    () => latestDates.includes(date) ? latestDates : [date, ...latestDates],
    [date, latestDates],
  );
  const status = job?.status || 'NOT_SUBMITTED';
  const canSubmit = editable && Math.abs(difference) <= 0.005 && !submit.isPending;
  const dateSelectionDisabled = readOnly;

  const handleSubmit = async () => {
    if (!driverId || !canSubmit) return false;
    try {
      const result = await submit.mutateAsync({ driverId, date, cashHanded: cashAmount, cdmAmount, note });
      const saved = (result as { end_job?: EndJob }).end_job;
      if (saved?.id && pendingFiles.length) {
        for (const file of pendingFiles) await uploadEndJobPhoto({ driverId, endJobId: saved.id, file });
        setPendingFiles([]);
        await queryClient.invalidateQueries({ queryKey: ['finance-end-job-photos', saved.id] });
      }
      toast.success('End Job saved');
      setOpen(false);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save End Job');
      return false;
    }
  };

  if (!driverId) return null;

  return <>
    <div className={`${compact ? 'rounded-xl p-3' : 'rounded-2xl p-4'} border ${status === 'NEEDS_UPDATE' ? 'border-amber-400/60 bg-amber-50/50' : 'border-primary/20 bg-card'} shadow-sm`}>
      <div className={`flex flex-col ${compact ? 'gap-2' : 'gap-3'} sm:flex-row sm:items-center sm:justify-between`}>
        <div>
          <p className={`${compact ? 'text-[11px]' : 'text-xs'} font-bold uppercase tracking-[0.18em] text-primary`}>End Job · {date}</p>
          <p className={`${compact ? 'text-xs' : 'text-sm'} mt-1 text-muted-foreground`}>Pending review cash <span className="font-bold text-foreground">{formatBND(expectedCash)}</span> · Status <span className="font-semibold text-foreground">{status.replaceAll('_', ' ')}</span></p>
          {status === 'NEEDS_UPDATE' && <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-amber-700"><AlertTriangle className="h-4 w-4" /> Pending review cash changed. Update your declaration.</p>}
          {Number(contextValue.pending_cash_count || 0) > 0 && <p className="mt-2 text-xs text-amber-700">{contextValue.pending_cash_count} cash order(s) are included from Runner review pending status.</p>}
        </div>
        {!readOnly && <Button size={compact ? 'sm' : 'default'} className={compact ? 'h-10' : undefined} onClick={() => setOpen(true)} disabled={!editable && status === 'NOT_SUBMITTED'}>{status === 'NOT_SUBMITTED' ? 'END JOB' : 'View / Edit End Job'}</Button>}
      </div>
      {job && <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground"><span>Cash {formatBND(job.cash_handed)}</span><span>CDM {formatBND(job.cdm_amount)}</span><span className={Math.abs(Number(job.difference)) <= 0.005 ? 'text-emerald-600' : 'text-amber-700'}>Difference {formatBND(job.difference)}</span></div>}
    </div>

    <MobileActionSheet open={open} onOpenChange={setOpen} title="End Job" description="Reconcile cash still pending Runner review before handing over physical cash." confirmLabel="Submit End Job" onConfirm={handleSubmit} isLoading={submit.isPending} confirmDisabled={!canSubmit} panelClassName="h-[min(760px,calc(100vh-2rem))] max-h-[min(760px,calc(100vh-2rem))] supports-[height:100dvh]:h-[min(760px,calc(100dvh-2rem))] supports-[height:100dvh]:max-h-[min(760px,calc(100dvh-2rem))]" compactActions nativeScroll>
      <div className="space-y-3 sm:space-y-4">
        <div className="grid gap-2"><Label id="end-job-date-label">Date</Label><div id="end-job-date" className="grid grid-cols-3 gap-1.5" role="group" aria-labelledby="end-job-date-label">{dateOptions.map((value) => <button key={value} type="button" onClick={() => setDate(value)} disabled={dateSelectionDisabled} aria-pressed={date === value} className={`min-w-0 rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${date === value ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-border/60 bg-background text-foreground hover:border-primary/60'}`}>{value}</button>)}</div><p className="text-xs text-muted-foreground">Only the latest 3 Brunei calendar days are editable.</p></div>
        <div className="rounded-xl bg-muted/40 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pending Runner Review Cash · read only</p><p className="mt-1 text-xl font-black sm:text-2xl">{formatBND(expectedCash)}</p></div>
        <div className="grid gap-2 sm:grid-cols-2"><div className="grid gap-1.5"><Label htmlFor="cash-handed">Cash handed over</Label><Input id="cash-handed" className="h-10" type="number" min="0" step="0.01" value={cash} onChange={(event) => setCash(event.target.value)} disabled={!editable} /></div><div className="grid gap-1.5"><Label htmlFor="cdm-amount">CDM deposit</Label><Input id="cdm-amount" className="h-10" type="number" min="0" step="0.01" value={cdm} onChange={(event) => setCdm(event.target.value)} disabled={!editable} /></div></div>
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border/50 p-3 text-sm"><div><p className="text-xs text-muted-foreground">Total declared</p><p className="mt-1 font-bold">{formatBND(declared)}</p></div><div><p className="text-xs text-muted-foreground">Difference</p><p className={`mt-1 font-bold ${Math.abs(difference) <= 0.005 ? 'text-emerald-600' : 'text-destructive'}`}>{formatBND(difference)}</p></div></div>
        {Math.abs(difference) > 0.005 && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">Cash handed over + CDM must equal Pending Runner Review Cash before submission.</p>}
        <div className="space-y-2"><Label>RECEIPT PHOTO</Label><Input type="file" accept="image/*" multiple capture="environment" onChange={(event) => setPendingFiles((current) => [...current, ...Array.from(event.target.files || [])])} disabled={!editable} /><p className="text-xs text-muted-foreground">Add multiple photos. Photos stay private to the permitted Driver, Runner or Admin.</p><div className="grid grid-cols-3 gap-2">{(photos.data || []).map((photo) => <div key={photo.id} className="relative overflow-hidden rounded-lg border border-border/50">{photoUrls[photo.id] ? <img src={photoUrls[photo.id]} alt="Receipt" className="aspect-square w-full object-cover" /> : <div className="aspect-square animate-pulse bg-muted" />}<button type="button" className="absolute right-1 top-1 rounded-full bg-background/90 p-1" onClick={() => removePhoto.mutate({ id: photo.id, storagePath: photo.storage_path })} disabled={!editable}><Trash2 className="h-3 w-3 text-destructive" /></button></div>)}{pendingFiles.map((file, index) => <div key={`${file.name}-${index}`} className="relative flex aspect-square items-center justify-center rounded-lg border border-dashed border-primary/50 bg-primary/5"><Camera className="h-5 w-5 text-primary" /><button type="button" className="absolute right-1 top-1 rounded-full bg-background/90 p-1" onClick={() => setPendingFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}><Trash2 className="h-3 w-3 text-destructive" /></button></div>)}<label className="flex aspect-square cursor-pointer items-center justify-center rounded-lg border border-dashed border-border/70"><Plus className="h-5 w-5 text-muted-foreground" /><input type="file" accept="image/*" multiple className="hidden" onChange={(event) => setPendingFiles((current) => [...current, ...Array.from(event.target.files || [])])} disabled={!editable} /></label></div></div>
        <div className="grid gap-2"><Label htmlFor="end-job-note">Note (optional)</Label><Textarea id="end-job-note" value={note} onChange={(event) => setNote(event.target.value)} disabled={!editable} placeholder="Add a note for the Runner" className="min-h-[80px]" /></div>
        {status === 'SUBMITTED' && <p className="flex items-center gap-2 text-xs text-emerald-600"><CheckCircle2 className="h-4 w-4" /> This End Job is currently reconciled.</p>}
      </div>
    </MobileActionSheet>
  </>;
}

export default DriverEndJobSheet;
