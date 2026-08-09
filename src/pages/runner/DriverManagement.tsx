import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  useRunnerDrivers,
  useAddDriverToRunner,
  useRemoveDriverFromRunner,
  useRunnerAcceptDelivery,
  useRunnerRejectDelivery,
  useBulkRunnerAcceptDelivery,
  useRunnerBatchReviewDriverDeliveries,
  useScheduleDriverFailedOrdersForTomorrow,
  useGenerateDriverCode,
  useChangeDriverFailedStatus,
} from '@/hooks/useDrivers';
import { useDriverAssignments } from '@/hooks/useDriverAssignments';
import { useReasons } from '@/hooks/useReasons';
import { useRunnerReviewOrder } from '@/hooks/useRunnerReview';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { useIsMobile } from '@/hooks/use-mobile';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Users,
  UserPlus,
  Truck,
  Check,
  X,
  CheckCircle,
  UserMinus,
  Key,
  Copy,
  Clock,
  Wifi,
  WifiOff,
  Eye,
  Image as ImageIcon,
  RefreshCw,
  ClipboardCheck,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatBND } from '@/lib/currency';
import { getSignedStorageUrl } from '@/lib/storageUrls';
import { sortFailedStatusReasons } from '@/lib/driverFailedStatus';
import { ChangeFailedStatusDialog, type ChangeFailedStatusValues } from '@/components/driver/ChangeFailedStatusDialog';
import {
  formatDriverActionDate,
  formatDriverActionDateTime,
  getDriverReportedPaymentComponents,
  getDriverActionTimestamp,
  groupDriverReviewOrdersByDate,
  isPendingDriverReviewOrder,
  type DriverReviewDateGroup,
} from '@/lib/driverReviewDateGroups';
import type { Order, OrderItem } from '@/types/database';

const DRIVER_CAPACITY = 40;

type DeliveryProof = {
  id: string;
  order_id: string;
  signedUrl: string;
  uploaded_at: string;
};

type DriverReviewGroup = {
  driverId: string;
  driverName: string;
  deliveredOrders: Order[];
  failedOrders: Order[];
  deliveredAmount: number;
  cashAmount: number;
  cashOrderCount: number;
  transferAmount: number;
  transferOrderCount: number;
  dateGroups: DriverReviewDateGroup<Order>[];
};

type DriverBatchScope = {
  driverId: string | null;
  driverName: string;
  deliveredOrders: Order[];
  failedOrders: Order[];
};

type DriverBatchStep = 'choose' | 'failed' | 'select';

function getDriverName(order: Order, fallbackUsers: Map<string, { display_name?: string | null }>) {
  if (!order.driver_id) return 'No driver';
  return order.driver?.display_name || fallbackUsers.get(order.driver_id)?.display_name || 'Unknown Driver';
}

function getOrderSkuText(order: Order) {
  const items = (order.order_items || []) as OrderItem[];
  if (!items.length) return `${order.total_qty || 0} item(s)`;
  return items
    .map((item) => {
      const skuCode = item.product?.sku_code || item.sku_label || 'UNKNOWN';
      const skuName = item.product?.sku_name || 'UNKNOWN';
      return `${skuCode}/${skuName} x ${item.qty}`;
    })
    .join(', ');
}

export default function DriverManagement({ runnerIdOverride }: { runnerIdOverride?: string | string[] } = {}) {
  const { profile } = useAuth();
  const runnerScopeIds = Array.isArray(runnerIdOverride)
    ? runnerIdOverride
    : [runnerIdOverride || profile?.id].filter((id): id is string => Boolean(id));
  const isMobile = useIsMobile();
  const { data: drivers = [] } = useRunnerDrivers(runnerScopeIds);
  const { data: users = [] } = useUserDirectory();
  const { data: assignments = [] } = useDriverAssignments({
    runnerIds: runnerScopeIds,
    includeItems: true,
  });

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const addDriver = useAddDriverToRunner();
  const removeDriver = useRemoveDriverFromRunner();
  const acceptDelivery = useRunnerAcceptDelivery();
  const bulkAcceptDelivery = useBulkRunnerAcceptDelivery();
  const rejectDelivery = useRunnerRejectDelivery();
  const changeFailedStatus = useChangeDriverFailedStatus();
  const reviewOrder = useRunnerReviewOrder();
  const batchReview = useRunnerBatchReviewDriverDeliveries();
  const scheduleFailedOrders = useScheduleDriverFailedOrdersForTomorrow();
  const generateCode = useGenerateDriverCode();
  const { data: failedReasons = [] } = useReasons('FAILED_DELIVERY');

  const [addDriverOpen, setAddDriverOpen] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectOrderId, setRejectOrderId] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [changeStatusOrderId, setChangeStatusOrderId] = useState<string | null>(null);
  const [openGroupIds, setOpenGroupIds] = useState<string[]>([]);
  const [openDateGroupIds, setOpenDateGroupIds] = useState<string[]>([]);
  const [openFailedDateGroupIds, setOpenFailedDateGroupIds] = useState<string[]>([]);
  const [driverSummaryOpen, setDriverSummaryOpen] = useState(false);
  const [batchScope, setBatchScope] = useState<DriverBatchScope | null>(null);
  const [batchStep, setBatchStep] = useState<DriverBatchStep>('choose');
  const [selectedBatchFailedIds, setSelectedBatchFailedIds] = useState<string[]>([]);
  const [batchFailedReasonFilter, setBatchFailedReasonFilter] = useState('ALL');
  const [batchScheduleConfirm, setBatchScheduleConfirm] = useState(false);
  const [batchRejectMode, setBatchRejectMode] = useState(false);
  const [batchRejectReason, setBatchRejectReason] = useState('');

  const availableDrivers = useMemo(() => {
    const assignedDriverIds = drivers.map((d) => d.driver_id);
    return users.filter((u) => u.role === 'driver' && !assignedDriverIds.includes(u.id));
  }, [users, drivers]);

  const pendingAcceptanceOrders = useMemo(() => (
    assignments.filter((order) => isPendingDriverReviewOrder(order, 'DRIVER_DELIVERED'))
  ), [assignments]);

  const failedReviewOrders = useMemo(() => (
    assignments.filter((order) => isPendingDriverReviewOrder(order, 'DRIVER_FAILED'))
  ), [assignments]);

  const orderedFailedReasons = useMemo(
    () => sortFailedStatusReasons(failedReasons),
    [failedReasons],
  );

  const pendingOrderIds = useMemo(
    () => [...pendingAcceptanceOrders, ...failedReviewOrders].map((order) => order.id),
    [pendingAcceptanceOrders, failedReviewOrders]
  );

  const { data: proofsByOrder = {}, isLoading: proofsLoading } = useQuery({
    queryKey: ['driver-management-delivery-proofs', pendingOrderIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attachments')
        .select('id, order_id, type, url, uploaded_at')
        .eq('type', 'delivery_photo')
        .in('order_id', pendingOrderIds)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;

      const proofs = await Promise.all((data || []).map(async (proof) => ({
        id: proof.id,
        order_id: proof.order_id as string,
        signedUrl: await getSignedStorageUrl(proof.url, 'delivery-photos'),
        uploaded_at: proof.uploaded_at,
      })));

      return proofs.reduce<Record<string, DeliveryProof[]>>((acc, proof) => {
        if (!acc[proof.order_id]) acc[proof.order_id] = [];
        acc[proof.order_id].push(proof);
        return acc;
      }, {});
    },
    enabled: pendingOrderIds.length > 0,
    staleTime: 30000,
  });

  const activeDriverWorkloads = useMemo(() => {
    const workloads: Record<string, { count: number; amount: number }> = {};
    assignments.forEach((order) => {
      if (!order.driver_id || order.assignment_state !== 'ACTIVE') return;
      const current = workloads[order.driver_id] || { count: 0, amount: 0 };
      workloads[order.driver_id] = {
        count: current.count + 1,
        amount: current.amount + Number(order.total_amount || 0),
      };
    });
    return workloads;
  }, [assignments]);

  const reviewGroups = useMemo(() => {
    const groups = new Map<string, DriverReviewGroup>();

    const ensureGroup = (order: Order) => {
      const driverId = order.driver_id || 'no-driver';
      const existing = groups.get(driverId) || {
        driverId,
        driverName: getDriverName(order, userById),
        deliveredOrders: [],
        failedOrders: [],
        deliveredAmount: 0,
        cashAmount: 0,
        cashOrderCount: 0,
        transferAmount: 0,
        transferOrderCount: 0,
        dateGroups: [],
      };
      return existing;
    };

    pendingAcceptanceOrders.forEach((order) => {
      const existing = ensureGroup(order);
      existing.deliveredOrders.push(order);
      const amount = Number(order.total_amount || 0);
      existing.deliveredAmount += amount;
      const payment = getDriverReportedPaymentComponents(order);
      existing.cashAmount += payment.cashAmount;
      existing.transferAmount += payment.transferAmount;
      if (payment.cashAmount > 0) existing.cashOrderCount += 1;
      if (payment.transferAmount > 0) existing.transferOrderCount += 1;
      groups.set(existing.driverId, existing);
    });

    failedReviewOrders.forEach((order) => {
      const existing = ensureGroup(order);
      existing.failedOrders.push(order);
      groups.set(existing.driverId, existing);
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        dateGroups: groupDriverReviewOrdersByDate([
          ...group.deliveredOrders,
          ...group.failedOrders,
        ]),
      }))
      .sort((a, b) => (
        (b.deliveredOrders.length + b.failedOrders.length) -
        (a.deliveredOrders.length + a.failedOrders.length)
      ) || a.driverName.localeCompare(b.driverName));
  }, [pendingAcceptanceOrders, failedReviewOrders, userById]);

  const pendingTotalAmount = useMemo(
    () => pendingAcceptanceOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0),
    [pendingAcceptanceOrders]
  );

  const pendingPaymentSummary = useMemo(() => reviewGroups.reduce((summary, group) => ({
    cashAmount: summary.cashAmount + group.cashAmount,
    cashOrderCount: summary.cashOrderCount + group.cashOrderCount,
    transferAmount: summary.transferAmount + group.transferAmount,
    transferOrderCount: summary.transferOrderCount + group.transferOrderCount,
  }), {
    cashAmount: 0,
    cashOrderCount: 0,
    transferAmount: 0,
    transferOrderCount: 0,
  }), [reviewGroups]);

  const activeAssignedCount = useMemo(
    () => Object.values(activeDriverWorkloads).reduce((sum, workload) => sum + workload.count, 0),
    [activeDriverWorkloads]
  );

  const detailOrder = useMemo(
    () => [...pendingAcceptanceOrders, ...failedReviewOrders].find((order) => order.id === detailOrderId) || null,
    [pendingAcceptanceOrders, failedReviewOrders, detailOrderId]
  );
  const detailProofs = detailOrder ? proofsByOrder[detailOrder.id] || [] : [];
  const changeStatusOrder = useMemo(
    () => failedReviewOrders.find((order) => order.id === changeStatusOrderId) || null,
    [changeStatusOrderId, failedReviewOrders],
  );

  const batchFilteredFailedOrders = useMemo(() => {
    if (!batchScope) return [];
    if (batchFailedReasonFilter === 'ALL') return batchScope.failedOrders;
    return batchScope.failedOrders.filter((order) => (
      (order.driver_failed_reason || 'Unspecified') === batchFailedReasonFilter
    ));
  }, [batchFailedReasonFilter, batchScope]);

  const batchFailedReasons = useMemo(() => {
    if (!batchScope) return [];
    return [...new Set(batchScope.failedOrders.map((order) => order.driver_failed_reason || 'Unspecified'))]
      .sort((a, b) => a.localeCompare(b));
  }, [batchScope]);

  const tomorrowDateLabel = useMemo(() => (
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kuala_Lumpur',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(Date.now() + 24 * 60 * 60 * 1000))
  ), []);

  const handleAddDriver = async () => {
    if (!selectedDriverId || !profile?.id) return;
    await addDriver.mutateAsync({ runnerId: profile.id, driverId: selectedDriverId });
    setAddDriverOpen(false);
    setSelectedDriverId('');
  };

  const handleRemoveDriver = async (id: string) => {
    await removeDriver.mutateAsync(id);
  };

  const handleAcceptOrders = async (orderIds: string[]) => {
    if (orderIds.length === 0) return;
    if (orderIds.length === 1) {
      await acceptDelivery.mutateAsync(orderIds[0]);
    } else {
      await bulkAcceptDelivery.mutateAsync(orderIds);
    }
    if (detailOrderId && orderIds.includes(detailOrderId)) setDetailOrderId(null);
  };

  const handleAcceptFailedOrders = async (failedOrders: Order[]) => {
    await Promise.all(failedOrders.map((order) => reviewOrder.mutateAsync({
      orderId: order.id,
      outcome: 'CONFIRM_FAILED',
      comment: order.driver_failed_remark || order.driver_failed_reason || 'Driver failed report accepted',
      currentRescheduleCycleNo: order.reschedule_cycle_no || 0,
      currentOperationalStatus: order.operational_status || undefined,
    })));
    if (detailOrderId && failedOrders.some((order) => order.id === detailOrderId)) {
      setDetailOrderId(null);
    }
  };

  const openBatchActions = (scope: DriverBatchScope) => {
    setBatchScope(scope);
    setBatchStep('choose');
    setSelectedBatchFailedIds(scope.failedOrders.map((order) => order.id));
    setBatchFailedReasonFilter('ALL');
    setBatchScheduleConfirm(false);
    setBatchRejectMode(false);
    setBatchRejectReason('');
  };

  const closeBatchActions = () => {
    setBatchScope(null);
    setBatchStep('choose');
    setSelectedBatchFailedIds([]);
    setBatchScheduleConfirm(false);
    setBatchRejectMode(false);
    setBatchRejectReason('');
  };

  const showBatchResult = (label: string, result: { processed: Array<{ orderId: string }>; failed: Array<{ orderId: string; error?: string }> }) => {
    if (result.failed.length === 0) {
      toast.success(`${label}: ${result.processed.length} order(s) processed`);
    } else {
      const failedLabels = result.failed.map((item) => {
        const order = assignments.find((candidate) => candidate.id === item.orderId);
        return `${order?.order_code || item.orderId}: ${item.error || 'Needs review'}`;
      });
      toast.error(`${label}: ${result.processed.length} processed; ${result.failed.length} need review — ${failedLabels.join(' | ')}`);
    }
    closeBatchActions();
  };

  const runBatchReview = async (orderIds: string[], label: string, accept: boolean, rejectReason?: string) => {
    if (!orderIds.length) return;
    const result = await batchReview.mutateAsync({ orderIds, accept, rejectReason });
    showBatchResult(label, result);
  };

  const handleBatchAcceptAll = () => {
    if (!batchScope) return;
    void runBatchReview(
      [...batchScope.deliveredOrders, ...batchScope.failedOrders].map((order) => order.id),
      'Accept All',
      true,
    );
  };

  const handleBatchAcceptDeliveredOnly = () => {
    if (!batchScope) return;
    void runBatchReview(
      batchScope.deliveredOrders.map((order) => order.id),
      'Accept Delivered Only',
      true,
    );
  };

  const handleBatchOriginalFailedReasons = () => {
    if (!batchScope) return;
    void runBatchReview(
      batchScope.failedOrders.map((order) => order.id),
      'Process by Original Reasons',
      true,
    );
  };

  const handleBatchScheduleTomorrow = (orderIds: string[]) => {
    if (!batchScope || !orderIds.length) return;
    if (!batchScheduleConfirm) {
      setBatchScheduleConfirm(true);
      return;
    }
    void scheduleFailedOrders.mutateAsync({ orderIds, driverId: batchScope.driverId }).then((result) => {
      const processed = (result.processed || []).map((item) => ({ orderId: item.order_id }));
      const failed = (result.skipped || []).map((item) => ({ orderId: item.order_id, error: item.reason }));
      showBatchResult('Schedule for Tomorrow', { processed, failed });
    });
  };

  const toggleBatchFailedOrder = (orderId: string) => {
    setSelectedBatchFailedIds((current) => (
      current.includes(orderId)
        ? current.filter((id) => id !== orderId)
        : [...current, orderId]
    ));
  };

  const handleBatchRejectSelected = () => {
    if (!selectedBatchFailedIds.length) return;
    if (!batchRejectMode) {
      setBatchRejectMode(true);
      return;
    }
    void runBatchReview(selectedBatchFailedIds, 'Reject Selected', false, batchRejectReason);
  };

  const handleOpenRejectDialog = (orderId: string) => {
    setRejectOrderId(orderId);
    setRejectReason('');
    setRejectDialogOpen(true);
  };

  const handleRejectDelivery = async () => {
    const reason = rejectReason.trim();
    if (!rejectOrderId || !reason) return;
    await rejectDelivery.mutateAsync({ orderId: rejectOrderId, reason });
    if (detailOrderId === rejectOrderId) setDetailOrderId(null);
    setRejectDialogOpen(false);
    setRejectOrderId('');
    setRejectReason('');
  };

  const handleOpenChangeStatus = (orderId: string) => {
    setChangeStatusOrderId(orderId);
  };

  const handleChangeFailedStatus = async ({ reason, nextDeliveryDate }: ChangeFailedStatusValues) => {
    if (!changeStatusOrderId) return;
    await changeFailedStatus.mutateAsync({
      orderId: changeStatusOrderId,
      reason,
      nextDeliveryDate,
    });
    setChangeStatusOrderId(null);
  };

  const toggleGroupOpen = (driverId: string) => {
    setOpenFailedDateGroupIds((prev) => prev.filter((id) => !id.startsWith(`${driverId}:`)));
    setOpenGroupIds((prev) => (
      prev.includes(driverId) ? prev.filter((id) => id !== driverId) : [...prev, driverId]
    ));
  };

  const toggleDateGroupOpen = (dateGroupId: string) => {
    setOpenFailedDateGroupIds((prev) => prev.filter((id) => id !== dateGroupId));
    setOpenDateGroupIds((prev) => (
      prev.includes(dateGroupId)
        ? prev.filter((id) => id !== dateGroupId)
        : [...prev, dateGroupId]
    ));
  };

  const toggleFailedDateGroupOpen = (dateGroupId: string) => {
    setOpenFailedDateGroupIds((prev) => (
      prev.includes(dateGroupId)
        ? prev.filter((id) => id !== dateGroupId)
        : [...prev, dateGroupId]
    ));
  };

  const isBatchProcessing = batchReview.isPending || scheduleFailedOrders.isPending;
  const isAccepting = acceptDelivery.isPending || bulkAcceptDelivery.isPending || reviewOrder.isPending || isBatchProcessing;

  const renderReviewOrderRow = (order: Order) => {
    const proofs = proofsByOrder[order.id] || [];
    const isDelivered = order.driver_status === 'DRIVER_DELIVERED';
    const actionTimestamp = getDriverActionTimestamp(order);
    const payment = getDriverReportedPaymentComponents(order);
    const paymentLabel = [
      payment.cashAmount > 0 ? `Cash ${formatBND(payment.cashAmount)}` : null,
      payment.transferAmount > 0 ? `Transfer ${formatBND(payment.transferAmount)}` : null,
    ].filter(Boolean).join(' + ') || order.driver_payment_method || order.payment_method;

    return (
      <div key={order.id} className="grid gap-3 p-3 sm:p-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-center">
        <button
          type="button"
          onClick={() => setDetailOrderId(order.id)}
          className="min-w-0 text-left"
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black">{order.order_code}</p>
            <Badge variant="outline" className="rounded-full">{order.area || 'No area'}</Badge>
            <Badge className={isDelivered ? 'rounded-full bg-amber-500/10 text-amber-700 hover:bg-amber-500/10' : 'rounded-full bg-red-500/10 text-red-700 hover:bg-red-500/10'}>
              {isDelivered ? 'Awaiting accept' : 'Failed delivery'}
            </Badge>
          </div>
          {actionTimestamp && (
            <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Clock className="h-3.5 w-3.5" />
              Driver clicked {isDelivered ? 'Delivered' : 'Failed'} - {formatDriverActionDateTime(actionTimestamp)}
            </p>
          )}
          <p className="mt-1 truncate text-sm font-semibold" title={order.customer_name}>{order.customer_name}</p>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{order.address}</p>
          <p className="mt-2 line-clamp-1 text-xs text-muted-foreground" title={getOrderSkuText(order)}>
            {getOrderSkuText(order)}
          </p>
          {!isDelivered && (order.driver_failed_reason || order.driver_failed_remark) && (
            <p className="mt-2 line-clamp-2 text-xs font-medium text-destructive">
              {order.driver_failed_reason}{order.driver_failed_remark ? ` / ${order.driver_failed_remark}` : ''}
            </p>
          )}
        </button>

        <div className="flex flex-col gap-2 md:items-end">
          <div className="flex w-full items-center justify-between gap-2 md:justify-end">
            <div className="text-left md:text-right">
              <p className="text-lg font-black tabular-nums">{formatBND(Number(order.total_amount || 0))}</p>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{paymentLabel}</p>
            </div>
            {isDelivered ? (
              <Button variant="outline" size="icon" className="h-10 w-10 rounded-full" onClick={() => setDetailOrderId(order.id)}>
                {proofs.length > 0 ? <ImageIcon className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-10 rounded-full px-3"
                onClick={() => handleOpenChangeStatus(order.id)}
                disabled={changeFailedStatus.isPending}
              >
                <RefreshCw className="mr-1.5 h-4 w-4" />
                Change Status
              </Button>
            )}
          </div>
          {isDelivered ? (
            <div className="grid grid-cols-2 gap-2 md:w-[220px]">
              <Button size="sm" onClick={() => handleAcceptOrders([order.id])} disabled={isAccepting} className="rounded-full">
                <Check className="mr-1.5 h-4 w-4" />
                Accept
              </Button>
              <Button variant="destructive" size="sm" onClick={() => handleOpenRejectDialog(order.id)} disabled={rejectDelivery.isPending} className="rounded-full">
                <X className="mr-1.5 h-4 w-4" />
                Reject
              </Button>
            </div>
          ) : (
            <div className="grid w-full grid-cols-2 gap-2 md:w-[220px]">
              <Button variant="outline" size="sm" onClick={() => setDetailOrderId(order.id)} className="rounded-full">
                <Eye className="mr-1.5 h-4 w-4" />
                View
              </Button>
              <Button size="sm" onClick={() => handleAcceptFailedOrders([order])} disabled={isAccepting} className="rounded-full">
                <Check className="mr-1.5 h-4 w-4" />
                Accept
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 rounded-[1.25rem] border bg-background/80 p-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full">Drivers</Badge>
              <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">Proof review</Badge>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight">Driver Operations</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Review driver-delivered orders, inspect proof photos, accept in bulk, and keep active driver workload clean.
            </p>
          </div>
          <Button onClick={() => setAddDriverOpen(true)} className="h-10 rounded-full px-4">
            <UserPlus className="mr-2 h-4 w-4" />
            Add Driver
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Waiting accept', value: String(pendingAcceptanceOrders.length), meta: `${formatBND(pendingTotalAmount)} delivered amount`, icon: Clock },
            { label: 'Cash amount', value: formatBND(pendingPaymentSummary.cashAmount), meta: `${pendingPaymentSummary.cashOrderCount} cash order(s)`, icon: ClipboardCheck },
            { label: 'Transfer amount', value: formatBND(pendingPaymentSummary.transferAmount), meta: `${pendingPaymentSummary.transferOrderCount} transfer order(s)`, icon: ClipboardCheck },
            { label: 'Active workload', value: String(activeAssignedCount), meta: `${drivers.length} driver(s) linked`, icon: Truck },
          ].map((metric) => (
            <Card key={metric.label} className="overflow-hidden border shadow-sm">
              <CardContent className="flex items-center gap-3 p-3 sm:p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <metric.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{metric.label}</p>
                  <p className="mt-0.5 text-xl font-black tabular-nums sm:text-2xl">{metric.value}</p>
                  <p className="truncate text-xs text-muted-foreground" title={metric.meta}>{metric.meta}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <Card className="overflow-hidden border shadow-sm">
              <div className="flex flex-col gap-3 border-b bg-secondary/20 p-3 sm:p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Driver review queue</p>
                  <h2 className="mt-1 text-lg font-black sm:text-xl">Delivered and failed by driver</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {pendingAcceptanceOrders.length} delivered waiting, {failedReviewOrders.length} failed report(s), {formatBND(pendingTotalAmount)} delivered amount.
                  </p>
                </div>
                <Button
                  onClick={() => openBatchActions({
                    driverId: null,
                    driverName: 'All Drivers',
                    deliveredOrders: pendingAcceptanceOrders,
                    failedOrders: failedReviewOrders,
                  })}
                  disabled={pendingOrderIds.length === 0 || isAccepting}
                  className="h-10 rounded-full px-4"
                >
                  <Check className="mr-2 h-4 w-4" />
                  Accept All
                </Button>
              </div>

              <CardContent className="space-y-3 p-3 sm:p-4">
                {reviewGroups.length > 0 ? (
                  reviewGroups.map((group) => {
                    const isOpen = openGroupIds.includes(group.driverId);
                    const reviewCount = group.deliveredOrders.length + group.failedOrders.length;

                    return (
                      <div key={group.driverId} className="rounded-2xl border bg-background shadow-sm">
                        <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                          <button
                            type="button"
                            onClick={() => toggleGroupOpen(group.driverId)}
                            className="flex min-w-0 items-start gap-3 text-left"
                          >
                            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-base font-black sm:text-lg">{group.driverName}</h3>
                                <Badge variant="secondary" className="rounded-full">{reviewCount} order(s)</Badge>
                                <Badge className="rounded-full bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10">
                                  {group.deliveredOrders.length} delivered
                                </Badge>
                                <Badge className="rounded-full bg-red-500/10 text-red-700 hover:bg-red-500/10">
                                  {group.failedOrders.length} failed
                                </Badge>
                              </div>
                              <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                                <div className="rounded-xl bg-secondary/40 p-2">
                                  <p className="text-[10px] uppercase text-muted-foreground">Delivered amount</p>
                                  <p className="font-black">{formatBND(group.deliveredAmount)}</p>
                                </div>
                                <div className="rounded-xl bg-secondary/40 p-2">
                                  <p className="text-[10px] uppercase text-muted-foreground">Cash amount</p>
                                  <p className="font-black">{formatBND(group.cashAmount)}</p>
                                  <p className="text-[10px] text-muted-foreground">{group.cashOrderCount} order(s)</p>
                                </div>
                                <div className="rounded-xl bg-secondary/40 p-2">
                                  <p className="text-[10px] uppercase text-muted-foreground">Transfer amount</p>
                                  <p className="font-black">{formatBND(group.transferAmount)}</p>
                                  <p className="text-[10px] text-muted-foreground">{group.transferOrderCount} order(s)</p>
                                </div>
                              </div>
                            </div>
                          </button>

                          <div className="grid grid-cols-2 gap-2 lg:w-[260px]">
                            <Button
                              variant="outline"
                              onClick={() => toggleGroupOpen(group.driverId)}
                              className="h-10 rounded-full"
                            >
                              {isOpen ? 'Hide' : 'Open'}
                            </Button>
                            <Button
                              onClick={() => openBatchActions({
                                driverId: group.driverId === 'no-driver' ? null : group.driverId,
                                driverName: group.driverName,
                                deliveredOrders: group.deliveredOrders,
                                failedOrders: group.failedOrders,
                              })}
                              disabled={reviewCount === 0 || isAccepting}
                              className="h-10 rounded-full"
                            >
                              <ClipboardCheck className="mr-2 h-4 w-4" />
                              Accept Batch
                            </Button>
                          </div>
                        </div>

                        {isOpen && (
                          <div className="space-y-2 border-t bg-secondary/10 p-2 sm:p-3">
                            {group.dateGroups.map((dateGroup) => {
                              const dateGroupId = `${group.driverId}:${dateGroup.dateKey}`;
                              const isDateOpen = openDateGroupIds.includes(dateGroupId);
                              const isFailedOpen = openFailedDateGroupIds.includes(dateGroupId);
                              const deliveredDateOrders = [...dateGroup.deliveredOrders].sort(
                                (a, b) => new Date(getDriverActionTimestamp(b) || 0).getTime()
                                  - new Date(getDriverActionTimestamp(a) || 0).getTime(),
                              );
                              const failedDateOrders = [...dateGroup.failedOrders].sort(
                                (a, b) => new Date(getDriverActionTimestamp(b) || 0).getTime()
                                  - new Date(getDriverActionTimestamp(a) || 0).getTime(),
                              );
                              const dateOrderCount = deliveredDateOrders.length + failedDateOrders.length;
                              const dateTotal = dateGroup.cashAmount + dateGroup.transferAmount;

                              return (
                                <div key={dateGroupId} className="overflow-hidden rounded-xl border bg-background">
                                  <button
                                    type="button"
                                    onClick={() => toggleDateGroupOpen(dateGroupId)}
                                    className="grid w-full gap-3 p-3 text-left sm:p-4 lg:grid-cols-[minmax(180px,0.8fr)_minmax(0,1.7fr)] lg:items-center"
                                    aria-expanded={isDateOpen}
                                  >
                                    <div className="flex min-w-0 items-center gap-3">
                                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                        {isDateOpen
                                          ? <ChevronDown className="h-4 w-4" />
                                          : <ChevronRight className="h-4 w-4" />}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="font-black">{formatDriverActionDate(dateGroup.latestActionAt)}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {dateOrderCount} order(s) - {isDateOpen ? 'Open' : 'Tap to open'}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                                      <div className="rounded-lg bg-amber-500/10 p-2">
                                        <p className="text-[10px] uppercase text-muted-foreground">Cash amount</p>
                                        <p className="font-black text-amber-700">{formatBND(dateGroup.cashAmount)}</p>
                                        <p className="text-[10px] text-muted-foreground">{dateGroup.cashOrderCount} order(s)</p>
                                      </div>
                                      <div className="rounded-lg bg-sky-500/10 p-2">
                                        <p className="text-[10px] uppercase text-muted-foreground">Transfer amount</p>
                                        <p className="font-black text-sky-700">{formatBND(dateGroup.transferAmount)}</p>
                                        <p className="text-[10px] text-muted-foreground">{dateGroup.transferOrderCount} order(s)</p>
                                      </div>
                                      <div className="rounded-lg bg-secondary/50 p-2">
                                        <p className="text-[10px] uppercase text-muted-foreground">Date total</p>
                                        <p className="font-black">{formatBND(dateTotal)}</p>
                                      </div>
                                      <div className="rounded-lg bg-secondary/50 p-2">
                                        <p className="text-[10px] uppercase text-muted-foreground">Orders</p>
                                        <p className="font-black">{dateOrderCount}</p>
                                      </div>
                                    </div>
                                  </button>

                                  {isDateOpen && (
                                    <div className="border-t">
                                      <div className="divide-y">
                                        {deliveredDateOrders.map(renderReviewOrderRow)}
                                      </div>
                                      {failedDateOrders.length > 0 && (
                                        <div className="border-t">
                                          <button
                                            type="button"
                                            onClick={() => toggleFailedDateGroupOpen(dateGroupId)}
                                            className="flex w-full items-center justify-between gap-3 bg-red-500/5 px-3 py-3 text-left sm:px-4"
                                            aria-expanded={isFailedOpen}
                                          >
                                            <div>
                                              <p className="text-sm font-black text-red-700">
                                                Failed deliveries ({failedDateOrders.length})
                                              </p>
                                              <p className="text-xs text-muted-foreground">
                                                {isFailedOpen ? 'Hide failed delivery reports' : 'Show failed delivery reports'}
                                              </p>
                                            </div>
                                            {isFailedOpen
                                              ? <ChevronDown className="h-4 w-4 shrink-0 text-red-700" />
                                              : <ChevronRight className="h-4 w-4 shrink-0 text-red-700" />}
                                          </button>
                                          {isFailedOpen && (
                                            <div className="divide-y border-t">
                                              {failedDateOrders.map(renderReviewOrderRow)}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-14 text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
                      <CheckCircle className="h-6 w-6" />
                    </div>
                    <h3 className="font-black">No driver deliveries waiting</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Driver-submitted deliveries will appear here with proof photos.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
            <Card className="border shadow-sm">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Driver summary</p>
                    <h2 className="mt-1 text-lg font-black">Workload by driver</h2>
                  </div>
                  {isMobile && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setDriverSummaryOpen((open) => !open)}
                      className="h-9 rounded-full px-3"
                      aria-expanded={driverSummaryOpen}
                    >
                      {driverSummaryOpen ? 'Hide' : 'Open'}
                      {driverSummaryOpen
                        ? <ChevronDown className="ml-1.5 h-4 w-4" />
                        : <ChevronRight className="ml-1.5 h-4 w-4" />}
                    </Button>
                  )}
                </div>
                {(!isMobile || driverSummaryOpen) && (drivers.length > 0 ? (
                  drivers.map((runnerDriver) => {
                    const driverData = runnerDriver.driver;
                    const driverName = driverData?.display_name || userById.get(runnerDriver.driver_id)?.display_name || 'Unknown';
                    const driverCode = driverData?.driver_code;
                    const email = driverData?.email || userById.get(runnerDriver.driver_id)?.email;
                    const workload = activeDriverWorkloads[runnerDriver.driver_id] || { count: 0, amount: 0 };
                    const pendingForDriver = reviewGroups.find((group) => group.driverId === runnerDriver.driver_id);

                    return (
                      <div key={runnerDriver.id} className="rounded-2xl border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-black" title={driverName}>{driverName}</p>
                            <p className="truncate text-xs text-muted-foreground" title={email || ''}>{email || 'No email'}</p>
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => handleRemoveDriver(runnerDriver.id)}>
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <div className="rounded-xl bg-secondary/40 p-2">
                            <p className="text-[10px] uppercase text-muted-foreground">Active</p>
                            <p className="font-black">{workload.count}</p>
                          </div>
                          <div className="rounded-xl bg-secondary/40 p-2">
                            <p className="text-[10px] uppercase text-muted-foreground">Amount</p>
                            <p className="font-black">{formatBND(workload.amount)}</p>
                          </div>
                          <div className="rounded-xl bg-amber-500/10 p-2">
                            <p className="text-[10px] uppercase text-muted-foreground">Delivered pending</p>
                            <p className="font-black">{pendingForDriver?.deliveredOrders.length || 0}</p>
                          </div>
                          <div className="rounded-xl bg-amber-500/10 p-2">
                            <p className="text-[10px] uppercase text-muted-foreground">Delivered amount</p>
                            <p className="font-black">{formatBND(pendingForDriver?.deliveredAmount || 0)}</p>
                          </div>
                          <div className="rounded-xl bg-red-500/10 p-2">
                            <p className="text-[10px] uppercase text-muted-foreground">Failed reports</p>
                            <p className="font-black">{pendingForDriver?.failedOrders.length || 0}</p>
                          </div>
                          <div className="rounded-xl bg-red-500/10 p-2">
                            <p className="text-[10px] uppercase text-muted-foreground">Failed amount</p>
                            <p className="font-black">{formatBND(pendingForDriver?.failedAmount || 0)}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between rounded-xl bg-muted/50 p-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <Key className="h-4 w-4 text-muted-foreground" />
                            <span className="truncate font-mono text-sm font-semibold">{driverCode || 'No code'}</span>
                          </div>
                          <div className="flex gap-1">
                            {driverCode && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { navigator.clipboard.writeText(driverCode); toast.success('Code copied'); }}>
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button variant="outline" size="sm" className="h-7 rounded-lg text-xs" onClick={() => generateCode.mutate(runnerDriver.driver_id)} disabled={generateCode.isPending}>
                              {driverCode ? 'Regenerate' : 'Generate'}
                            </Button>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                          {workload.count > 0 ? <Wifi className="h-3.5 w-3.5 text-emerald-600" /> : <WifiOff className="h-3.5 w-3.5" />}
                          {workload.count > 0 ? `${workload.count}/${DRIVER_CAPACITY} active order capacity` : 'No active delivery workload'}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed py-8 text-center text-sm text-muted-foreground">
                    No drivers linked yet.
                  </div>
                ))}
              </CardContent>
            </Card>
          </aside>
        </div>

        <Dialog open={Boolean(batchScope)} onOpenChange={(open) => !open && closeBatchActions()}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
            {batchScope && (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {batchStep === 'choose'
                      ? `Accept ${batchScope.driverName} Batch`
                      : batchStep === 'failed'
                        ? `Handle ${batchScope.failedOrders.length} Failed Orders`
                        : 'Review Failed Orders'}
                  </DialogTitle>
                  <DialogDescription>
                    {batchStep === 'choose'
                      ? 'Choose which pending Driver results to process. Every order is revalidated before the canonical review action runs.'
                      : batchStep === 'failed'
                        ? 'Keep each Driver-submitted reason, or intentionally release the current Driver and schedule the selected orders for tomorrow.'
                        : 'Select only the failed submissions you want to process. Stale or already-reviewed orders will be reported individually.'}
                  </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-3 gap-2 rounded-2xl border bg-secondary/20 p-3 text-center">
                  <div>
                    <p className="text-2xl font-black text-emerald-700">{batchScope.deliveredOrders.length}</p>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Delivered</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-red-700">{batchScope.failedOrders.length}</p>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Failed</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black">{batchScope.deliveredOrders.length + batchScope.failedOrders.length}</p>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total</p>
                  </div>
                </div>

                {batchStep === 'choose' && (
                  <div className="grid gap-2">
                    <Button onClick={handleBatchAcceptAll} disabled={isBatchProcessing} className="h-11 rounded-full">
                      <Check className="mr-2 h-4 w-4" />
                      Accept All
                    </Button>
                    <Button variant="outline" onClick={handleBatchAcceptDeliveredOnly} disabled={isBatchProcessing || batchScope.deliveredOrders.length === 0} className="h-11 rounded-full">
                      Accept Delivered Only
                    </Button>
                    <Button variant="outline" onClick={() => setBatchStep('failed')} disabled={batchScope.failedOrders.length === 0} className="h-11 rounded-full">
                      Handle Failed Orders
                    </Button>
                  </div>
                )}

                {batchStep === 'failed' && (
                  <div className="space-y-3">
                    {batchScheduleConfirm ? (
                      <div className="space-y-3 rounded-2xl border border-amber-400/60 bg-amber-500/10 p-4">
                        <p className="font-black">Schedule {batchScope.failedOrders.length} failed order(s) for tomorrow?</p>
                        <p className="text-sm text-muted-foreground">Tomorrow: <span className="font-bold text-foreground">{tomorrowDateLabel}</span>. The current Driver will be cleared, the order will remain in Ready/Runner Dispatch, and stock will not be duplicated.</p>
                        <div className="grid grid-cols-2 gap-2">
                          <Button variant="outline" onClick={() => setBatchScheduleConfirm(false)} disabled={scheduleFailedOrders.isPending} className="rounded-full">Back</Button>
                          <Button onClick={() => handleBatchScheduleTomorrow(batchScope.failedOrders.map((order) => order.id))} disabled={scheduleFailedOrders.isPending} className="rounded-full">
                            {scheduleFailedOrders.isPending ? 'Scheduling...' : 'Confirm Schedule'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-2">
                        <Button onClick={handleBatchOriginalFailedReasons} disabled={isBatchProcessing} className="h-11 rounded-full">
                          Process by Original Reasons
                        </Button>
                        <Button variant="outline" onClick={() => handleBatchScheduleTomorrow(batchScope.failedOrders.map((order) => order.id))} disabled={isBatchProcessing} className="h-11 rounded-full">
                          Schedule All for Tomorrow
                        </Button>
                        <Button variant="outline" onClick={() => setBatchStep('select')} className="h-11 rounded-full">
                          Review / Select Orders
                        </Button>
                      </div>
                    )}
                    <Button variant="ghost" onClick={() => setBatchStep('choose')} disabled={isBatchProcessing} className="w-full rounded-full">Back</Button>
                  </div>
                )}

                {batchStep === 'select' && (
                  <div className="space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <label className="flex items-center gap-2 text-sm font-semibold">
                        <Checkbox
                          checked={batchFilteredFailedOrders.length > 0 && batchFilteredFailedOrders.every((order) => selectedBatchFailedIds.includes(order.id))}
                          onCheckedChange={(checked) => setSelectedBatchFailedIds((current) => (
                            checked === true
                              ? [...new Set([...current, ...batchFilteredFailedOrders.map((order) => order.id)])]
                              : current.filter((id) => !batchFilteredFailedOrders.some((order) => order.id === id))
                          ))}
                        />
                        Select visible ({batchFilteredFailedOrders.length})
                      </label>
                      <Select value={batchFailedReasonFilter} onValueChange={setBatchFailedReasonFilter}>
                        <SelectTrigger className="h-9 rounded-full sm:w-[220px]">
                          <SelectValue placeholder="Filter by reason" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">All reasons</SelectItem>
                          {batchFailedReasons.map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="max-h-[38vh] space-y-2 overflow-y-auto pr-1">
                      {batchFilteredFailedOrders.map((order) => (
                        <label key={order.id} className="flex cursor-pointer gap-3 rounded-2xl border p-3 transition-colors hover:bg-secondary/30">
                          <Checkbox checked={selectedBatchFailedIds.includes(order.id)} onCheckedChange={() => toggleBatchFailedOrder(order.id)} className="mt-0.5" />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="font-black">{order.order_code}</span>
                              <Badge variant="outline" className="rounded-full">{order.driver_failed_reason || 'Unspecified'}</Badge>
                            </span>
                            <span className="mt-1 block truncate text-sm font-semibold">{order.customer_name}</span>
                            <span className="mt-1 block text-xs text-muted-foreground">{order.driver_failed_remark || 'No remark'} · {formatBND(Number(order.total_amount || 0))}</span>
                            <span className="mt-1 block text-xs text-muted-foreground">{getOrderSkuText(order)} · Stock remains with current Driver until returned/transferred.</span>
                            {order.driver_next_delivery_date && <span className="mt-1 block text-xs font-semibold text-primary">Reschedule date: {order.driver_next_delivery_date}</span>}
                          </span>
                        </label>
                      ))}
                      {batchFilteredFailedOrders.length === 0 && <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">No failed orders match this reason.</p>}
                    </div>

                    <p className="text-sm font-semibold text-muted-foreground">{selectedBatchFailedIds.length} selected</p>
                    {batchScheduleConfirm && (
                      <div className="space-y-3 rounded-2xl border border-amber-400/60 bg-amber-500/10 p-4">
                        <p className="font-black">Schedule {selectedBatchFailedIds.length} selected order(s) for tomorrow?</p>
                        <p className="text-sm text-muted-foreground">Tomorrow: <span className="font-bold text-foreground">{tomorrowDateLabel}</span>. Current Driver assignments will be removed without changing stock.</p>
                        <div className="grid grid-cols-2 gap-2">
                          <Button variant="outline" onClick={() => setBatchScheduleConfirm(false)} disabled={scheduleFailedOrders.isPending} className="rounded-full">Back</Button>
                          <Button onClick={() => handleBatchScheduleTomorrow(selectedBatchFailedIds)} disabled={scheduleFailedOrders.isPending || selectedBatchFailedIds.length === 0} className="rounded-full">
                            {scheduleFailedOrders.isPending ? 'Scheduling...' : 'Confirm Schedule'}
                          </Button>
                        </div>
                      </div>
                    )}
                    {batchRejectMode && (
                      <div className="space-y-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-3">
                        <Label htmlFor="driver-batch-reject-reason">Rejection reason <span className="text-destructive">*</span></Label>
                        <Textarea id="driver-batch-reject-reason" value={batchRejectReason} onChange={(event) => setBatchRejectReason(event.target.value)} placeholder="Explain what must be corrected..." className="rounded-xl" />
                      </div>
                    )}
                    {!batchScheduleConfirm && (
                      <div className="grid gap-2 sm:grid-cols-3">
                        <Button onClick={() => void runBatchReview(selectedBatchFailedIds, 'Accept Using Original Reasons', true)} disabled={isBatchProcessing || selectedBatchFailedIds.length === 0} className="rounded-full">Accept Original Reasons</Button>
                        <Button variant="outline" onClick={() => handleBatchScheduleTomorrow(selectedBatchFailedIds)} disabled={isBatchProcessing || selectedBatchFailedIds.length === 0} className="rounded-full">Schedule Selected</Button>
                        <Button variant="destructive" onClick={handleBatchRejectSelected} disabled={isBatchProcessing || selectedBatchFailedIds.length === 0 || (batchRejectMode && !batchRejectReason.trim())} className="rounded-full">{batchRejectMode ? 'Confirm Reject' : 'Reject Selected'}</Button>
                      </div>
                    )}
                    <Button variant="ghost" onClick={() => { setBatchStep('failed'); setBatchScheduleConfirm(false); setBatchRejectMode(false); }} disabled={isBatchProcessing} className="w-full rounded-full">Back</Button>
                  </div>
                )}

                {batchStep !== 'choose' && !batchScheduleConfirm && (
                  <DialogFooter>
                    <Button variant="outline" onClick={closeBatchActions} disabled={isBatchProcessing}>Cancel</Button>
                  </DialogFooter>
                )}
              </>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={!!detailOrder} onOpenChange={(open) => !open && setDetailOrderId(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{detailOrder?.driver_status === 'DRIVER_FAILED' ? 'Driver Failed Report' : 'Driver Delivery Proof'}</DialogTitle>
              <DialogDescription>
                {detailOrder?.driver_status === 'DRIVER_FAILED'
                  ? 'Review the failed-delivery reason, remark and uploaded proof.'
                  : 'Review the driver-submitted delivery before accepting it.'}
              </DialogDescription>
            </DialogHeader>
            {detailOrder && (
              <div className="space-y-4">
                <div className="grid gap-3 rounded-2xl border bg-secondary/20 p-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Order</p>
                    <p className="font-black">{detailOrder.order_code}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Driver</p>
                    <p className="font-black">{getDriverName(detailOrder, userById)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Customer</p>
                    <p className="font-black">{detailOrder.customer_name}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Amount</p>
                    <p className="font-black">{formatBND(Number(detailOrder.total_amount || 0))} ({detailOrder.payment_method})</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Address</p>
                    <p className="font-medium">{detailOrder.address}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">SKU</p>
                    <p className="font-medium">{getOrderSkuText(detailOrder)}</p>
                  </div>
                  {detailOrder.driver_status === 'DRIVER_FAILED' && (
                    <div className="sm:col-span-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Failed reason / remark</p>
                      <p className="mt-1 font-medium text-destructive">
                        {detailOrder.driver_failed_reason || 'No reason'}
                        {detailOrder.driver_failed_remark ? ` / ${detailOrder.driver_failed_remark}` : ''}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black">Uploaded photo</h3>
                    {proofsLoading && <span className="text-xs text-muted-foreground">Loading proof...</span>}
                  </div>
                  {detailProofs.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {detailProofs.map((proof) => (
                        <a key={proof.id} href={proof.signedUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border bg-muted">
                          <img src={proof.signedUrl} alt="Driver uploaded delivery proof" className="h-full max-h-[360px] w-full object-contain" />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                      <AlertTriangle className="h-4 w-4" />
                      No delivery photo uploaded for this order.
                    </div>
                  )}
                </div>
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              {detailOrder?.driver_status === 'DRIVER_DELIVERED' && (
                <>
                  <Button variant="outline" onClick={() => handleOpenRejectDialog(detailOrder.id)} disabled={rejectDelivery.isPending}>
                    <X className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                  <Button onClick={() => handleAcceptOrders([detailOrder.id])} disabled={isAccepting}>
                    <Check className="mr-2 h-4 w-4" />
                    Accept
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={addDriverOpen} onOpenChange={setAddDriverOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Driver</DialogTitle>
              <DialogDescription>Select a driver to add to your team.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Choose a driver..." />
                </SelectTrigger>
                <SelectContent>
                  {availableDrivers.map((driver) => (
                    <SelectItem key={driver.id} value={driver.id}>{driver.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableDrivers.length === 0 && (
                <p className="text-sm text-muted-foreground">No available drivers. Contact admin to create driver accounts.</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDriverOpen(false)}>Cancel</Button>
              <Button onClick={handleAddDriver} disabled={!selectedDriverId || addDriver.isPending}>
                {addDriver.isPending ? 'Adding...' : 'Add Driver'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ChangeFailedStatusDialog
          open={Boolean(changeStatusOrder)}
          onOpenChange={(open) => !open && setChangeStatusOrderId(null)}
          orderCode={changeStatusOrder?.order_code}
          initialReason={changeStatusOrder?.driver_failed_reason}
          initialNextDeliveryDate={changeStatusOrder?.driver_next_delivery_date}
          reasons={orderedFailedReasons}
          isPending={changeFailedStatus.isPending}
          onApply={handleChangeFailedStatus}
        />

        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Delivery</DialogTitle>
              <DialogDescription>This returns the order to the driver for correction or re-delivery. A reason is required.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="driver-management-reject-reason">Rejection reason <span className="text-destructive">*</span></Label>
              <Textarea
                id="driver-management-reject-reason"
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="Explain what must be corrected..."
                aria-required="true"
                className="rounded-xl"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleRejectDelivery} disabled={!rejectReason.trim() || rejectDelivery.isPending}>
                {rejectDelivery.isPending ? 'Rejecting...' : 'Reject'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
