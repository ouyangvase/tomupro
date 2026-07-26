import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import capybaraEmpty from '@/assets/capybara-empty.png';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useRunnerDriverOrders, useMyDrivers, useRunnerAcceptDelivery, useRunnerRejectDelivery, useBulkRunnerAcceptDelivery } from '@/hooks/useDrivers';
import {
  useApplyDriverAssignmentBatch,
  useCorrectOrderDeliveryArea,
  useDeliveryAreas,
  useRunnerDispatchDriverWorkloads,
  type DeliveryArea,
  type DispatchAreaOrderId,
  type DispatchAreaSummary,
  type DispatchDriverWorkload,
} from '@/hooks/useRunnerDispatchAutomation';
import { useManualReopenOrder } from '@/hooks/useRescheduleHistory';
import { useRevertDelivery } from '@/hooks/useRevertDelivery';
import {
  fetchDriverAssignments,
  summarizeDriverAssignments,
  type DriverAssignment,
} from '@/hooks/useDriverAssignments';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowRight,
  ClipboardCheck,
  Download,
  ExternalLink,
  History,
  Loader2,
  MapPin,
  Phone,
  BarChart3,
  CalendarDays,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  Undo2,
} from 'lucide-react';
import { RunnerReviewModal } from '@/components/runner/RunnerReviewModal';
import { RevertDeliveryDialog } from '@/components/admin/RevertDeliveryDialog';
import { toast } from 'sonner';
import { formatOrderItemsDisplay } from '@/lib/orderItemsDisplay';
import { formatBND } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { downloadXlsx } from '@/lib/xlsxExport';
import {
  getDriverOperationalDateKey,
  getTodayDateKey,
  isDriverWorkloadOrder,
  isStaleActiveDriverAssignment,
} from '@/lib/driverOrderScope';
import type { Order } from '@/types/database';

const NORMAL_AREAS: DeliveryArea[] = [
  { code: 'BELAIT', name: 'Belait', district: 'Belait', is_special: false, active: true, display_order: 10 },
  { code: 'TUTONG', name: 'Tutong', district: 'Tutong', is_special: false, active: true, display_order: 20 },
  { code: 'TEMBURONG', name: 'Temburong', district: 'Temburong', is_special: false, active: true, display_order: 30 },
  { code: 'BM_GADONG_RIMBA', name: 'Gadong / Rimba', district: 'Brunei-Muara', is_special: false, active: true, display_order: 40 },
  { code: 'BM_BERAKAS_LAMBAK', name: 'Berakas / Lambak', district: 'Brunei-Muara', is_special: false, active: true, display_order: 50 },
  { code: 'BM_MENTIRI_MUARA', name: 'Mentiri / Muara', district: 'Brunei-Muara', is_special: false, active: true, display_order: 60 },
  { code: 'BM_JERUDONG_SENGKURONG', name: 'Jerudong / Sengkurong', district: 'Brunei-Muara', is_special: false, active: true, display_order: 70 },
  { code: 'BM_SOUTHWEST', name: 'Southwest BM', district: 'Brunei-Muara', is_special: false, active: true, display_order: 80 },
  { code: 'BM_BANDAR_LUMAPAS', name: 'Bandar / Lumapas', district: 'Brunei-Muara', is_special: false, active: true, display_order: 90 },
];

const SPECIAL_AREAS: DeliveryArea[] = [
  { code: 'NEEDS_REVIEW', name: 'Needs Review', district: null, is_special: true, active: true, display_order: 920 },
  { code: 'SELF_PICKUP', name: 'Self Pickup', district: null, is_special: true, active: true, display_order: 900 },
  { code: 'CANCELLED', name: 'Cancelled', district: null, is_special: true, active: true, display_order: 910 },
];

const LOCALITY_RULES: Array<{ code: string; name: string; terms: string[] }> = [
  { code: 'BELAIT', name: 'Belait', terms: ['KUALA BELAIT', 'SERIA', 'LUMUT', 'PANAGA', 'PANDAN', 'MUMONG', 'SUNGAI LIANG', 'LIANG'] },
  { code: 'TUTONG', name: 'Tutong', terms: ['TUTONG', 'BUKIT BERUANG', 'KUPANG', 'LAMUNIN', 'KIUDANG', 'PENANJONG', 'LUGU'] },
  { code: 'TEMBURONG', name: 'Temburong', terms: ['TEMBURONG', 'BANGAR', 'BATANG DURI', 'SIBUT'] },
  { code: 'BM_GADONG_RIMBA', name: 'Gadong / Rimba', terms: ['GADONG', 'RIMBA', 'MATA MATA', 'MATA-MATA', 'BERIBI', 'KIARONG', 'KIULAP', 'TUNGKU', 'KATOK'] },
  { code: 'BM_BERAKAS_LAMBAK', name: 'Berakas / Lambak', terms: ['BERAKAS', 'LAMBAK', 'AIRPORT', 'MADANG', 'PANCHA DELIMA', 'SERUSOP', 'SUNGAI TILONG'] },
  { code: 'BM_MENTIRI_MUARA', name: 'Mentiri / Muara', terms: ['MENTIRI', 'TANAH JAMBU', 'MENGKUBAU', 'MERAGANG', 'MUARA', 'SERASA', 'SALAMBIGAR'] },
  { code: 'BM_JERUDONG_SENGKURONG', name: 'Jerudong / Sengkurong', terms: ['JERUDONG', 'SENGKURONG', 'KILANAS', 'TANJONG BUNUT', 'TANJUNG BUNUT', 'TANJONG NANGKA', 'SELAYUN', 'MULAUT'] },
  { code: 'BM_SOUTHWEST', name: 'Southwest BM', terms: ['BENGKURONG', 'MASIN', 'BUNUT', 'MADEWA', 'SINARUBAI', 'PENGKALAN BATU', 'BATONG', 'BEBULOH'] },
  { code: 'BM_BANDAR_LUMAPAS', name: 'Bandar / Lumapas', terms: ['BANDAR SERI BEGAWAN', 'KAMPONG AYER', 'TAMOI', 'SETIA', 'LUMAPAS', 'JUNJONGAN', 'KASAT', 'BATU SATU'] },
];

const driverStatusColors: Record<string, string> = {
  UNASSIGNED: 'bg-muted text-muted-foreground',
  ASSIGNED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  OUT_FOR_DELIVERY: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  DRIVER_DELIVERED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  DRIVER_FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  RETURN_REQUIRED: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
};

type RunnerOrder = Order & {
  driver?: { id: string; display_name: string; email: string | null } | null;
};

type AssignmentAction = 'ASSIGN' | 'REASSIGN';
type DriverPerformancePeriod = 'day' | 'month' | 'year';

type DriverPerformanceOrder = DriverAssignment;

type DriverPerformanceStats = {
  total: number;
  delivered: number;
  failed: number;
  pending: number;
  deliveryRate: number;
};

type DriverWorkloadView = {
  driver_id: string;
  name: string;
  orderCount: number;
  collectAmount: number;
  areaNames: string[];
  isAvailable: boolean;
  capacity: number | null;
  remainingCapacity: number | null;
  notificationStatus: string | null;
  performanceTotal: number;
  deliveredCount: number;
  failedCount: number;
  pendingCount: number;
  deliveryRate: number;
};

type LocalityGroupView = {
  label: string;
  orders: RunnerOrder[];
  unassigned: RunnerOrder[];
  totalOrders: number;
  assignedOrders: number;
  unassignedOrders: number;
  collectAmount: number;
  assignedCollectAmount: number;
  unassignedCollectAmount: number;
};

function normalizeText(value?: string | null) {
  return (value || '')
    .toUpperCase()
    .replace(/[,.;:/\\-]+/g, ' ')
    .replace(/\b(KG|KPG)\b/g, 'KAMPONG')
    .replace(/\bJLN\b/g, 'JALAN')
    .replace(/\bSPG\b/g, 'SIMPANG')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCollectAmount(order: RunnerOrder) {
  // Production collection amount is COD-only: orders.total_amount when payment_method is COD.
  return order.payment_method === 'COD' ? Number(order.total_amount || 0) : 0;
}

function getDateRange(anchorDate: string, period: DriverPerformancePeriod) {
  const anchor = new Date(`${anchorDate}T00:00:00`);
  if (Number.isNaN(anchor.getTime())) {
    const today = new Date();
    return getDateRange(format(today, 'yyyy-MM-dd'), period);
  }

  const start = new Date(anchor);
  const end = new Date(anchor);

  if (period === 'day') {
    end.setDate(start.getDate());
  } else if (period === 'month') {
    start.setDate(1);
    end.setMonth(start.getMonth() + 1, 0);
  } else {
    start.setMonth(0, 1);
    end.setFullYear(start.getFullYear(), 11, 31);
  }

  return {
    start: format(start, 'yyyy-MM-dd'),
    end: format(end, 'yyyy-MM-dd'),
  };
}

function getPerformanceLabel(anchorDate: string, period: DriverPerformancePeriod) {
  const anchor = new Date(`${anchorDate}T00:00:00`);
  if (Number.isNaN(anchor.getTime())) return 'Selected period';
  if (period === 'day') return format(anchor, 'dd MMM yyyy');
  if (period === 'month') return format(anchor, 'MMMM yyyy');
  return format(anchor, 'yyyy');
}

function buildPerformanceStats(orders: DriverPerformanceOrder[]) {
  const summary = summarizeDriverAssignments(orders);
  return {
    total: summary.assigned,
    delivered: summary.delivered,
    failed: summary.failed,
    pending: summary.pending,
    deliveryRate: Number(summary.deliveryRate.toFixed(1)),
  };
}

function inferAreaFromOrder(order: RunnerOrder) {
  if (order.status === 'CANCELLED') return 'CANCELLED';
  if (order.delivery_area_code) return order.delivery_area_code;

  const normalized = normalizeText(order.address);
  const legacyArea = normalizeText(order.area);
  const skuText = normalizeText(formatOrderItemsDisplay(order.order_items || []).displayText);

  if (!normalized || ['-', '.', 'NA', 'N A'].includes(normalized)) return 'NEEDS_REVIEW';
  if (normalized.includes('CANCEL FEE') || skuText.includes('CANCEL FEE') || legacyArea === 'CF') return 'CANCELLED';
  if (normalized.includes('PICK UP') || normalized.includes('PICKUP') || normalized.includes('SELF PICK') || legacyArea === 'PICKUP' || legacyArea === 'PU') return 'SELF_PICKUP';

  for (const rule of LOCALITY_RULES) {
    if (rule.terms.some((term) => normalized.includes(term))) return rule.code;
  }

  if (legacyArea === 'TEMB') return 'TEMBURONG';
  if (legacyArea === 'TTG') return 'TUTONG';
  if (legacyArea === 'KB') return 'BELAIT';
  if (NORMAL_AREAS.some((area) => area.code === legacyArea)) return legacyArea;

  return 'NEEDS_REVIEW';
}

function getAreaLabel(areaCode: string, deliveryAreas: DeliveryArea[]) {
  return deliveryAreas.find((area) => area.code === areaCode)?.name || areaCode.replace(/^BM_/, '').replace(/_/g, ' / ');
}

function isNormalArea(areaCode: string) {
  return !['NEEDS_REVIEW', 'SELF_PICKUP', 'CANCELLED'].includes(areaCode);
}

function isActivelyAssigned(order: RunnerOrder, targetDateKey = getTodayDateKey()) {
  return isDriverWorkloadOrder(order, targetDateKey);
}

function isAssignedForAreaSummary(order: RunnerOrder, targetDateKey: string) {
  return isActivelyAssigned(order, targetDateKey) || isStaleActiveDriverAssignment(order, targetDateKey);
}

function isActiveQueueUnassigned(order: RunnerOrder, targetDateKey: string) {
  return !isAssignedForAreaSummary(order, targetDateKey);
}

function getLocalityLabel(order: RunnerOrder, areaCode: string) {
  const normalized = order.normalized_locality || normalizeText(order.address);
  for (const rule of LOCALITY_RULES.find((candidate) => candidate.code === areaCode)?.terms || []) {
    if (normalized.includes(rule)) return rule.replace(/\b\w/g, (char) => char.toUpperCase());
  }
  return getAreaLabel(areaCode, [...NORMAL_AREAS, ...SPECIAL_AREAS]);
}

function makeEmptySummary(area: DeliveryArea): DispatchAreaSummary {
  return {
    area_code: area.code,
    area_name: area.name,
    district: area.district,
    is_special: area.is_special,
    total_orders: 0,
    assigned_orders: 0,
    unassigned_orders: 0,
    assignment_percentage: 0,
    total_collect_amount: 0,
    assigned_collect_amount: 0,
    unassigned_collect_amount: 0,
    needs_review_orders: 0,
    active_driver_count: 0,
    driver_names: [],
  };
}

function buildLocalAreaSummary(queueOrders: RunnerOrder[], areas: DeliveryArea[], targetDateKey: string): DispatchAreaSummary[] {
  return areas.map((area) => {
    const areaOrders = queueOrders.filter((order) => inferAreaFromOrder(order) === area.code);
    const assigned = area.is_special ? [] : areaOrders.filter((order) => isAssignedForAreaSummary(order, targetDateKey));
    const unassigned = area.is_special ? [] : areaOrders.filter((order) => isActiveQueueUnassigned(order, targetDateKey));
    const totalCollect = areaOrders.reduce((sum, order) => sum + getCollectAmount(order), 0);
    const assignedCollect = assigned.reduce((sum, order) => sum + getCollectAmount(order), 0);
    const unassignedCollect = unassigned.reduce((sum, order) => sum + getCollectAmount(order), 0);
    const driverNames = Array.from(new Set(assigned.map((order) => order.driver?.display_name).filter(Boolean))) as string[];

    return {
      ...makeEmptySummary(area),
      total_orders: areaOrders.length,
      assigned_orders: assigned.length,
      unassigned_orders: unassigned.length,
      assignment_percentage: !area.is_special && areaOrders.length ? Number(((assigned.length / areaOrders.length) * 100).toFixed(1)) : 0,
      total_collect_amount: totalCollect,
      assigned_collect_amount: assignedCollect,
      unassigned_collect_amount: unassignedCollect,
      needs_review_orders: area.code === 'NEEDS_REVIEW' ? areaOrders.length : 0,
      active_driver_count: driverNames.length,
      driver_names: driverNames,
    };
  });
}

function OrderCardRow({
  order,
  areaLabel,
  locality,
  isSelected,
  selectable,
  onSelect,
  actions,
}: {
  order: RunnerOrder;
  areaLabel: string;
  locality: string;
  isSelected?: boolean;
  selectable?: boolean;
  onSelect?: (checked: boolean) => void;
  actions?: React.ReactNode;
}) {
  const { displayText } = formatOrderItemsDisplay(order.order_items);

  return (
    <div
      className={cn(
        'rounded-xl border bg-card transition-all',
        'hover:shadow-sm hover:border-primary/20',
        isSelected && 'ring-2 ring-primary/20 border-primary/30 bg-primary/[0.03]',
      )}
    >
      <div className="space-y-3 p-3 md:p-4">
        <div className="flex items-start gap-3">
          {selectable && (
            <div className="shrink-0 pt-1" onClick={(event) => event.stopPropagation()}>
              <Checkbox checked={isSelected} onCheckedChange={onSelect} className="h-5 w-5" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-base font-bold text-foreground md:text-sm">{order.order_code}</span>
              <Badge variant="outline" className="rounded-full text-[11px]">{areaLabel}</Badge>
              <Badge variant="secondary" className="rounded-full text-[11px]">{locality}</Badge>
              {order.driver_status && (
                <Badge className={cn(driverStatusColors[order.driver_status] || 'bg-muted', 'rounded-full text-[11px]')}>
                  {order.driver_status.replace(/_/g, ' ')}
                </Badge>
              )}
            </div>

            <div className="mt-2 grid gap-2 text-sm md:grid-cols-[1.4fr_1fr_1fr]">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{order.customer_name || 'No name'}</p>
                {order.phone && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    {order.phone}
                  </p>
                )}
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{order.address || 'No address'}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Items</p>
                <p className="mt-1 line-clamp-2 text-sm text-foreground">{displayText || '-'}</p>
              </div>
              <div className="flex items-start justify-between gap-3 md:block md:text-right">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Collect</p>
                  <p className="mt-1 font-bold tabular-nums">{formatBND(getCollectAmount(order))}</p>
                  <p className="text-[11px] text-muted-foreground">{order.payment_method}</p>
                </div>
                <div className="md:mt-2">
                  {order.driver?.display_name ? (
                    <Badge variant="outline" className="rounded-full">
                      <UserDotLabel name={order.driver.display_name} />
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="rounded-full">No Driver</Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {actions && (
          <div className="flex flex-wrap justify-end gap-2 border-t pt-3" onClick={(event) => event.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

function UserDotLabel({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
        {name.charAt(0).toUpperCase()}
      </span>
      {name}
    </span>
  );
}

type RunnerDriverInboxProps = {
  runnerIdOverride?: string;
  workloadOnly?: boolean;
};

export default function RunnerDriverInbox({ runnerIdOverride, workloadOnly = false }: RunnerDriverInboxProps = {}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const runnerScopeId = runnerIdOverride || profile?.id;
  const hasDelegatedRunnerScope = Boolean(runnerIdOverride);
  const canUseDbDriverWorkloads =
    profile?.role === 'runner' ||
    profile?.role === 'admin' ||
    hasDelegatedRunnerScope;
  const hasRunnerScopeAccess =
    profile?.role === 'runner' ||
    profile?.role === 'admin' ||
    hasDelegatedRunnerScope;
  const { data: orders = [], isLoading } = useRunnerDriverOrders(runnerIdOverride);
  const { data: myDrivers = [] } = useMyDrivers(runnerIdOverride);
  const { data: dbDeliveryAreas = [] } = useDeliveryAreas();
  const acceptDelivery = useRunnerAcceptDelivery();
  const rejectDelivery = useRunnerRejectDelivery();
  const bulkAcceptDelivery = useBulkRunnerAcceptDelivery();
  const manualReopen = useManualReopenOrder();
  const revertDelivery = useRevertDelivery();
  const applyBatch = useApplyDriverAssignmentBatch();
  const correctArea = useCorrectOrderDeliveryArea();

  const todayDateKey = useMemo(() => getTodayDateKey(), []);
  const activeQueueScopeDate = todayDateKey;
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [selectedAreaOrderSnapshots, setSelectedAreaOrderSnapshots] = useState<DispatchAreaOrderId[]>([]);
  const [selectedPendingRows, setSelectedPendingRows] = useState<string[]>([]);
  const [targetDriver, setTargetDriver] = useState<string>('');
  const [assignmentOrderLimit, setAssignmentOrderLimit] = useState(0);
  const [assignmentAction, setAssignmentAction] = useState<AssignmentAction>('ASSIGN');
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [areaCorrectionDialogOpen, setAreaCorrectionDialogOpen] = useState(false);
  const [correctionAreaCode, setCorrectionAreaCode] = useState('');
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectOrderId, setRejectOrderId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewOrder, setReviewOrder] = useState<RunnerOrder | null>(null);
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const [revertOrderData, setRevertOrderData] = useState<RunnerOrder | null>(null);
  const [driverFilter, setDriverFilter] = useState<string>('all');
  const [driverStatusFilter, setDriverStatusFilter] = useState<string>('all');
  const [areaFilter, setAreaFilter] = useState<string>('all');
  const [reviewStatusFilter, setReviewStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeAreaCode, setActiveAreaCode] = useState<string>('all');
  const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'assigned' | 'unassigned'>('unassigned');
  const [performancePeriod, setPerformancePeriod] = useState<DriverPerformancePeriod>('month');
  const [performanceAnchorDate, setPerformanceAnchorDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [driverSearch, setDriverSearch] = useState('');
  const [driverAvailabilityFilter, setDriverAvailabilityFilter] = useState<'all' | 'available' | 'unavailable'>('all');
  const [driverSort, setDriverSort] = useState<'workload' | 'collect' | 'delivery-rate' | 'capacity' | 'name'>('workload');
  const [workloadExportOpen, setWorkloadExportOpen] = useState(false);
  const [workloadExportMonth, setWorkloadExportMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [workloadExportDriverId, setWorkloadExportDriverId] = useState('all');
  const [workloadExporting, setWorkloadExporting] = useState(false);

  const { data: dbDriverWorkloads = [], isFetching: driverWorkloadFetching } = useRunnerDispatchDriverWorkloads(activeQueueScopeDate);
  const performanceRange = useMemo(() => getDateRange(performanceAnchorDate, performancePeriod), [performanceAnchorDate, performancePeriod]);
  const { data: performanceOrders = [], isFetching: performanceFetching } = useQuery({
    queryKey: ['runner-driver-performance-orders', runnerScopeId, performancePeriod, performanceRange.start, performanceRange.end],
    enabled: Boolean(runnerScopeId),
    queryFn: async () => {
      if (!runnerScopeId) return [];
      return fetchDriverAssignments({
        runnerId: runnerScopeId,
        dateFrom: performanceRange.start,
        dateTo: performanceRange.end,
        includeItems: false,
      });
    },
  });

  const deliveryAreas = useMemo(() => {
    const merged = dbDeliveryAreas.length ? dbDeliveryAreas : [...NORMAL_AREAS, ...SPECIAL_AREAS];
    const hasNeedsReview = merged.some((area) => area.code === 'NEEDS_REVIEW');
    return hasNeedsReview ? merged : [...merged, ...SPECIAL_AREAS];
  }, [dbDeliveryAreas]);

  const normalAreas = useMemo(() => deliveryAreas.filter((area) => !area.is_special), [deliveryAreas]);

  const allRunnerOrders = useMemo(() => orders as RunnerOrder[], [orders]);
  const dayOrders = useMemo(
    () => allRunnerOrders.filter((order) => getDriverOperationalDateKey(order) === todayDateKey),
    [allRunnerOrders, todayDateKey],
  );
  const staleActiveAssignments = useMemo(
    () => allRunnerOrders.filter((order) => isStaleActiveDriverAssignment(order, todayDateKey)),
    [allRunnerOrders, todayDateKey],
  );
  const dispatchAreaOrders = allRunnerOrders;
  const staleActiveCollect = useMemo(
    () => staleActiveAssignments.reduce((sum, order) => sum + getCollectAmount(order), 0),
    [staleActiveAssignments],
  );

  const localAreaSummary = useMemo(
    () => buildLocalAreaSummary(dispatchAreaOrders, deliveryAreas, todayDateKey),
    [deliveryAreas, dispatchAreaOrders, todayDateKey],
  );
  const areaSummary = localAreaSummary;

  const globalSummary = useMemo(() => {
    const normal = areaSummary.filter((area) => !area.is_special);
    const needsReview = areaSummary.find((area) => area.area_code === 'NEEDS_REVIEW');
    const selfPickup = areaSummary.find((area) => area.area_code === 'SELF_PICKUP');
    const cancelled = areaSummary.find((area) => area.area_code === 'CANCELLED');
    const assigned = normal.reduce((sum, area) => sum + area.assigned_orders, 0);
    const total = normal.reduce((sum, area) => sum + area.total_orders, 0);
    return {
      assigned,
      total,
      unassigned: normal.reduce((sum, area) => sum + area.unassigned_orders, 0),
      totalCollect: normal.reduce((sum, area) => sum + area.total_collect_amount, 0),
      unassignedCollect: normal.reduce((sum, area) => sum + area.unassigned_collect_amount, 0),
      needsReview: needsReview?.total_orders || 0,
      selfPickup: selfPickup?.total_orders || 0,
      cancelled: cancelled?.total_orders || 0,
      activeDrivers: canUseDbDriverWorkloads && dbDriverWorkloads.length
        ? dbDriverWorkloads.filter((driver) => driver.is_available).length
        : new Set(dispatchAreaOrders.map((order) => order.driver_id).filter(Boolean)).size,
      percentage: total ? Number(((assigned / total) * 100).toFixed(1)) : 0,
    };
  }, [areaSummary, canUseDbDriverWorkloads, dbDriverWorkloads, dispatchAreaOrders]);

  const areaOrderPool = useMemo(() => {
    return dispatchAreaOrders.filter((order) => {
      const code = inferAreaFromOrder(order);
      if (activeAreaCode !== 'all' && code !== activeAreaCode) return false;
      if (driverFilter !== 'all' && order.driver_id !== driverFilter) return false;
      return true;
    });
  }, [dispatchAreaOrders, activeAreaCode, driverFilter]);

  const visibleAssignmentOrders = useMemo(() => {
    let filtered = areaOrderPool.filter((order) => {
      const code = inferAreaFromOrder(order);
      if (!isNormalArea(code)) return true;
      if (assignmentFilter === 'assigned') return isAssignedForAreaSummary(order, todayDateKey);
      if (assignmentFilter === 'unassigned') return isActiveQueueUnassigned(order, todayDateKey);
      return true;
    });

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((order) =>
        order.order_code?.toLowerCase().includes(query) ||
        order.customer_name?.toLowerCase().includes(query) ||
        order.area?.toLowerCase().includes(query) ||
        order.phone?.includes(query) ||
        order.address?.toLowerCase().includes(query) ||
        formatOrderItemsDisplay(order.order_items || []).displayText.toLowerCase().includes(query)
      );
    }

    return filtered.sort((a, b) => {
      const assignedDiff = Number(isAssignedForAreaSummary(a, todayDateKey)) - Number(isAssignedForAreaSummary(b, todayDateKey));
      if (assignedDiff !== 0) return assignedDiff;
      return (a.order_code || '').localeCompare(b.order_code || '');
    });
  }, [areaOrderPool, assignmentFilter, searchQuery, todayDateKey]);

  const displayedAssignmentOrders = useMemo(() => visibleAssignmentOrders.slice(0, 300), [visibleAssignmentOrders]);

  const localityGroups = useMemo<LocalityGroupView[]>(() => {
    const grouped = new Map<string, RunnerOrder[]>();
    areaOrderPool.forEach((order) => {
      const code = inferAreaFromOrder(order);
      const label = getLocalityLabel(order, code);
      grouped.set(label, [...(grouped.get(label) || []), order]);
    });
    return Array.from(grouped.entries())
      .map(([label, groupOrders]) => ({
        label,
        orders: groupOrders,
        unassigned: groupOrders.filter((order) => isActiveQueueUnassigned(order, todayDateKey)),
        totalOrders: groupOrders.length,
        assignedOrders: groupOrders.filter((order) => isAssignedForAreaSummary(order, todayDateKey)).length,
        unassignedOrders: groupOrders.filter((order) => isActiveQueueUnassigned(order, todayDateKey)).length,
        collectAmount: groupOrders.reduce((sum, order) => sum + getCollectAmount(order), 0),
        assignedCollectAmount: groupOrders.filter((order) => isAssignedForAreaSummary(order, todayDateKey)).reduce((sum, order) => sum + getCollectAmount(order), 0),
        unassignedCollectAmount: groupOrders.filter((order) => isActiveQueueUnassigned(order, todayDateKey)).reduce((sum, order) => sum + getCollectAmount(order), 0),
      }))
      .sort((a, b) => b.unassignedOrders - a.unassignedOrders || a.label.localeCompare(b.label));
  }, [areaOrderPool, todayDateKey]);

  const dispatchOrderById = useMemo(() => {
    const byId = new Map<string, RunnerOrder>();
    dispatchAreaOrders.forEach((order) => byId.set(order.id, order));
    return byId;
  }, [dispatchAreaOrders]);

  const selectedSnapshotById = useMemo(() => {
    const byId = new Map<string, DispatchAreaOrderId>();
    selectedAreaOrderSnapshots.forEach((order) => byId.set(order.order_id, order));
    return byId;
  }, [selectedAreaOrderSnapshots]);

  const selectedOrders = useMemo(() => {
    return selectedRows
      .map((orderId) => dispatchOrderById.get(orderId))
      .filter((order): order is RunnerOrder => Boolean(order));
  }, [dispatchOrderById, selectedRows]);

  const getSelectedCollectAmount = useCallback((orderId: string) => {
    const order = dispatchOrderById.get(orderId);
    if (order) return getCollectAmount(order);
    return Number(selectedSnapshotById.get(orderId)?.collect_amount || 0);
  }, [dispatchOrderById, selectedSnapshotById]);

  const getSelectedAreaCode = useCallback((orderId: string) => {
    const order = dispatchOrderById.get(orderId);
    if (order) return inferAreaFromOrder(order);
    return selectedSnapshotById.get(orderId)?.delivery_area_code || 'NEEDS_REVIEW';
  }, [dispatchOrderById, selectedSnapshotById]);

  const getSelectedAreaLabel = useCallback((orderId: string) => {
    const order = dispatchOrderById.get(orderId);
    if (order) return getAreaLabel(inferAreaFromOrder(order), deliveryAreas);
    const snapshot = selectedSnapshotById.get(orderId);
    if (!snapshot) return 'Unknown';
    return snapshot.delivery_area_name || getAreaLabel(snapshot.delivery_area_code, deliveryAreas);
  }, [dispatchOrderById, deliveryAreas, selectedSnapshotById]);

  const assignmentAreaUnassignedOrders = useMemo(() => {
    if (!isNormalArea(activeAreaCode)) return [];
    return dispatchAreaOrders.filter((order) => (
      inferAreaFromOrder(order) === activeAreaCode
      && isActiveQueueUnassigned(order, todayDateKey)
    ));
  }, [activeAreaCode, dispatchAreaOrders, todayDateKey]);

  const assignmentAreaLocalityGroups = useMemo(() => {
    const grouped = new Map<string, RunnerOrder[]>();
    assignmentAreaUnassignedOrders.forEach((order) => {
      const label = getLocalityLabel(order, activeAreaCode);
      grouped.set(label, [...(grouped.get(label) || []), order]);
    });
    return Array.from(grouped.entries())
      .map(([label, orders]) => ({ label, orders }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [activeAreaCode, assignmentAreaUnassignedOrders]);

  const assignmentAreaStaleOrders = useMemo(() => {
    if (!isNormalArea(activeAreaCode)) return [];
    return staleActiveAssignments.filter((order) => inferAreaFromOrder(order) === activeAreaCode);
  }, [activeAreaCode, staleActiveAssignments]);

  const selectedTotalCollect = selectedRows.reduce((sum, orderId) => sum + getSelectedCollectAmount(orderId), 0);
  const cappedAssignmentLimit = selectedRows.length ? Math.min(Math.max(assignmentOrderLimit || selectedRows.length, 1), selectedRows.length) : 0;
  const assignmentOrderIds = selectedRows.slice(0, cappedAssignmentLimit);
  const assignmentTotalCollect = assignmentOrderIds.reduce((sum, orderId) => sum + getSelectedCollectAmount(orderId), 0);
  const selectedHasAssigned = selectedRows.some((orderId) => {
    const order = dispatchOrderById.get(orderId);
    return order ? isAssignedForAreaSummary(order, todayDateKey) : false;
  });
  const selectedHasSpecial = selectedRows.some((orderId) => !isNormalArea(getSelectedAreaCode(orderId)));

  const performanceByDriver = useMemo(() => {
    const grouped = new Map<string, DriverPerformanceOrder[]>();
    performanceOrders.forEach((order) => {
      if (!order.driver_id) return;
      grouped.set(order.driver_id, [...(grouped.get(order.driver_id) || []), order]);
    });
    return grouped;
  }, [performanceOrders]);

  const teamPerformance = useMemo(() => buildPerformanceStats(performanceOrders), [performanceOrders]);

  const assignmentOrdersByDriver = useMemo(() => {
    const grouped = new Map<string, RunnerOrder[]>();
    dayOrders.forEach((order) => {
      if (!order.driver_id || !isDriverWorkloadOrder(order, todayDateKey)) return;
      grouped.set(order.driver_id, [...(grouped.get(order.driver_id) || []), order]);
    });
    return grouped;
  }, [dayOrders, todayDateKey]);

  const driverWorkloads = useMemo<DriverWorkloadView[]>(() => {
    if (canUseDbDriverWorkloads && dbDriverWorkloads.length) {
      return dbDriverWorkloads.map((driver: DispatchDriverWorkload) => {
        const capacity = driver.capacity ?? null;
        const orderCount = Number(driver.assigned_order_count || 0);
        const collectAmount = Number(driver.collect_amount || 0);
        const areaNames = driver.area_names || [];
        const performance = buildPerformanceStats(performanceByDriver.get(driver.driver_id) || []);
        return {
          driver_id: driver.driver_id,
          name: driver.driver_name || 'Unknown Driver',
          orderCount,
          collectAmount,
          areaNames,
          isAvailable: driver.is_available,
          capacity,
          remainingCapacity: capacity === null ? driver.remaining_capacity : Math.max(capacity - orderCount, 0),
          notificationStatus: driver.notification_status,
          performanceTotal: performance.total,
          deliveredCount: performance.delivered,
          failedCount: performance.failed,
          pendingCount: performance.pending,
          deliveryRate: performance.deliveryRate,
        };
      });
    }

    return myDrivers.map((link) => {
      const driverOrders = assignmentOrdersByDriver.get(link.driver_id) || [];
      const collectAmount = driverOrders.reduce((sum, order) => sum + getCollectAmount(order), 0);
      const areaNames = Array.from(new Set(driverOrders.map((order) => getAreaLabel(inferAreaFromOrder(order), deliveryAreas))));
      const performance = buildPerformanceStats(performanceByDriver.get(link.driver_id) || []);
      return {
        driver_id: link.driver_id,
        name: link.driver?.display_name || 'Unknown Driver',
        orderCount: driverOrders.length,
        collectAmount,
        areaNames,
        isAvailable: Boolean(link.is_active && link.driver?.is_active !== false),
        capacity: null,
        remainingCapacity: null,
        notificationStatus: null,
        performanceTotal: performance.total,
        deliveredCount: performance.delivered,
        failedCount: performance.failed,
        pendingCount: performance.pending,
        deliveryRate: performance.deliveryRate,
      };
    });
  }, [assignmentOrdersByDriver, canUseDbDriverWorkloads, dbDriverWorkloads, deliveryAreas, myDrivers, performanceByDriver]);

  const visibleDriverWorkloads = useMemo(() => {
    const query = driverSearch.trim().toLowerCase();
    return [...driverWorkloads]
      .filter((driver) => {
        if (query && !driver.name.toLowerCase().includes(query)) return false;
        if (driverAvailabilityFilter === 'available') return driver.isAvailable;
        if (driverAvailabilityFilter === 'unavailable') return !driver.isAvailable;
        return true;
      })
      .sort((a, b) => {
        if (driverSort === 'name') return a.name.localeCompare(b.name);
        if (driverSort === 'collect') return b.collectAmount - a.collectAmount;
        if (driverSort === 'delivery-rate') return b.deliveryRate - a.deliveryRate;
        if (driverSort === 'capacity') return (b.remainingCapacity ?? -1) - (a.remainingCapacity ?? -1);
        return b.orderCount - a.orderCount;
      });
  }, [driverWorkloads, driverSearch, driverAvailabilityFilter, driverSort]);

  const targetDriverWorkload = driverWorkloads.find((driver) => driver.driver_id === targetDriver);
  const selectedAreasLabel = Array.from(new Set(selectedRows.map(getSelectedAreaLabel))).join(', ');
  const assignmentAreasLabel = Array.from(new Set(assignmentOrderIds.map(getSelectedAreaLabel))).join(', ');
  const performanceLabel = getPerformanceLabel(performanceAnchorDate, performancePeriod);
  const performanceInputType = performancePeriod === 'year' ? 'number' : performancePeriod === 'month' ? 'month' : 'date';
  const performanceInputValue = performancePeriod === 'year'
    ? performanceAnchorDate.slice(0, 4)
    : performancePeriod === 'month'
      ? performanceAnchorDate.slice(0, 7)
      : performanceAnchorDate;
  const handlePerformanceAnchorChange = (value: string) => {
    if (!value) return;
    if (performancePeriod === 'year') {
      setPerformanceAnchorDate(`${value}-01-01`);
      return;
    }
    if (performancePeriod === 'month') {
      setPerformanceAnchorDate(`${value}-01`);
      return;
    }
    setPerformanceAnchorDate(value);
  };

  const openWorkloadExport = () => {
    setWorkloadExportMonth(performanceAnchorDate.slice(0, 7));
    setWorkloadExportDriverId(driverFilter !== 'all' ? driverFilter : 'all');
    setWorkloadExportOpen(true);
  };

  const handleExportWorkload = async () => {
    if (!runnerScopeId || !workloadExportMonth) return;

    setWorkloadExporting(true);
    try {
      const range = getDateRange(`${workloadExportMonth}-01`, 'month');
      const exportOrders = await fetchDriverAssignments({
        runnerId: runnerScopeId,
        driverId: workloadExportDriverId === 'all' ? null : workloadExportDriverId,
        dateFrom: range.start,
        dateTo: range.end,
        includeItems: true,
      });
      const includedStates = new Set(['DELIVERED', 'FAILED', 'PENDING_ACCEPTANCE']);
      const filteredExportOrders = exportOrders.filter((order) => includedStates.has(order.assignment_state));

      if (filteredExportOrders.length === 0) {
        toast.info('No delivered, failed, or pending accept orders for this selection.');
        return;
      }

      const statusLabel: Record<string, string> = {
        DELIVERED: 'Delivered',
        FAILED: 'Failed',
        PENDING_ACCEPTANCE: 'Pending Accept',
      };
      const headers = [
        'Month',
        'Delivery Date',
        'Driver',
        'Order Code',
        'Customer',
        'Phone',
        'Address',
        'Area',
        'Products / SKU',
        'Total Qty',
        'Payment Method',
        'Order Amount (BND)',
        'Collect Amount (BND)',
        'Status',
        'Failed Reason',
        'Runner Reviewed At',
      ];
      const rows = filteredExportOrders
        .sort((left, right) => (
          left.operational_date.localeCompare(right.operational_date)
          || left.driver_name.localeCompare(right.driver_name)
          || (left.order_code || '').localeCompare(right.order_code || '')
        ))
        .map((order) => [
          workloadExportMonth,
          order.operational_date,
          order.driver_name || '',
          order.order_code || '',
          order.customer_name || '',
          order.phone || '',
          order.address || '',
          order.delivery_area_name || order.area || '',
          formatOrderItemsDisplay(order.order_items || []).displayText,
          Number(order.total_qty || 0),
          order.payment_method || '',
          Number(order.total_amount || 0),
          Number(order.collect_amount || 0),
          statusLabel[order.assignment_state] || order.assignment_state,
          order.driver_failed_reason || order.failed_reason || '',
          order.runner_reviewed_at || '',
        ]);
      const driverName = workloadExportDriverId === 'all'
        ? 'all-drivers'
        : (driverWorkloads.find((driver) => driver.driver_id === workloadExportDriverId)?.name || 'driver')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

      downloadXlsx(
        [headers, ...rows],
        `driver-workload_${workloadExportMonth}_${driverName}.xlsx`,
        'Driver Workload',
      );
      setWorkloadExportOpen(false);
      toast.success(`Exported ${filteredExportOrders.length} orders.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to export Driver workload.');
    } finally {
      setWorkloadExporting(false);
    }
  };

  const driverUpdatesOrders = useMemo(() => {
    let filtered = dayOrders.filter((order) => order.driver_id !== null && order.status !== 'CANCELLED');
    if (driverFilter !== 'all') filtered = filtered.filter((order) => order.driver_id === driverFilter);
    if (driverStatusFilter !== 'all') filtered = filtered.filter((order) => order.driver_status === driverStatusFilter);
    if (areaFilter !== 'all') filtered = filtered.filter((order) => inferAreaFromOrder(order) === areaFilter);
    if (reviewStatusFilter !== 'all') {
      if (reviewStatusFilter === 'REVIEWED') filtered = filtered.filter((order) => order.runner_review_status === 'REVIEWED');
      else if (reviewStatusFilter === 'PENDING') filtered = filtered.filter((order) => !order.runner_review_status || order.runner_review_status === 'NOT_REVIEWED');
    }
    return filtered;
  }, [dayOrders, driverFilter, driverStatusFilter, areaFilter, reviewStatusFilter]);

  const pendingAcceptanceOrders = useMemo(() => {
    return dayOrders.filter((order) => order.driver_status === 'DRIVER_DELIVERED' && order.runner_accept_status === 'PENDING');
  }, [dayOrders]);

  useEffect(() => {
    setAssignmentOrderLimit(selectedRows.length);
  }, [selectedRows.length]);

  const clearSelection = () => {
    setSelectedRows([]);
    setSelectedAreaOrderSnapshots([]);
    setAssignmentOrderLimit(0);
  };

  const selectOrders = (orderIds: string[], snapshots: DispatchAreaOrderId[] = []) => {
    const uniqueIds = Array.from(new Set(orderIds));
    const selectedIds = new Set(uniqueIds);
    setSelectedRows(uniqueIds);
    setSelectedAreaOrderSnapshots(snapshots.filter((snapshot) => selectedIds.has(snapshot.order_id)));
    setAssignmentOrderLimit(uniqueIds.length);
  };

  const handleSelectStaleAssignments = () => {
    if (staleActiveAssignments.length === 0) return;
    selectOrders(staleActiveAssignments.map((order) => order.id));
    setAssignmentAction('REASSIGN');
    setTargetDriver('');
    setAssignmentDialogOpen(true);
  };

  const handleSelectVisible = (checked: boolean) => {
    if (!checked) {
      clearSelection();
      return;
    }
    selectOrders(visibleAssignmentOrders.map((order) => order.id));
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    setSelectedAreaOrderSnapshots([]);
    setSelectedRows((previous) => checked ? [...new Set([...previous, id])] : previous.filter((rowId) => rowId !== id));
  };

  const handleAreaFilterChange = (areaCode: string) => {
    setActiveAreaCode(areaCode);
    clearSelection();
  };

  const handleAssignmentFilterChange = (value: 'all' | 'assigned' | 'unassigned') => {
    setAssignmentFilter(value);
    clearSelection();
  };

  const handleDriverFilterChange = (value: string) => {
    setDriverFilter(value);
    clearSelection();
  };

  const handleAssignRemaining = (areaCode: string) => {
    if (!isNormalArea(areaCode)) return;
    setActiveAreaCode(areaCode);
    setAssignmentFilter('unassigned');
    const remainingOrders = dispatchAreaOrders.filter((order) =>
      inferAreaFromOrder(order) === areaCode
      && isActiveQueueUnassigned(order, todayDateKey)
    );

    if (remainingOrders.length === 0) {
      toast.error('No unassigned orders in this area');
      return;
    }

    const snapshots: DispatchAreaOrderId[] = remainingOrders.map((order) => ({
      order_id: order.id,
      order_code: order.order_code || null,
      delivery_area_code: areaCode,
      delivery_area_name: getAreaLabel(areaCode, deliveryAreas),
      collect_amount: getCollectAmount(order),
    }));

    selectOrders(remainingOrders.map((order) => order.id), snapshots);
    setAssignmentOrderLimit(remainingOrders.length);
    setAssignmentAction('ASSIGN');
    setTargetDriver('');
    setAssignmentDialogOpen(true);
  };

  const handleSelectGroup = (ordersToSelect: RunnerOrder[], unassignedOnly = false) => {
    const selected = (unassignedOnly ? ordersToSelect.filter((order) => isActiveQueueUnassigned(order, todayDateKey)) : ordersToSelect)
      .filter((order) => isNormalArea(inferAreaFromOrder(order)))
      .map((order) => order.id);
    selectOrders(selected);
  };

  const selectAssignmentSubset = (orders: RunnerOrder[], action: AssignmentAction) => {
    if (!orders.length) return;
    selectOrders(orders.map((order) => order.id));
    setAssignmentOrderLimit(orders.length);
    setAssignmentAction(action);
    setTargetDriver('');
  };

  const handleAssignmentLimitChange = (value: string) => {
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue)) {
      setAssignmentOrderLimit(1);
      return;
    }
    setAssignmentOrderLimit(Math.min(Math.max(Math.trunc(nextValue), 1), selectedRows.length));
  };

  const openAssignmentDialog = (action: AssignmentAction) => {
    if (selectedRows.length === 0) {
      toast.error('Select orders first');
      return;
    }
    if (selectedHasSpecial) {
      toast.error('Resolve Needs Review, Self Pickup, or Cancelled orders before assigning');
      return;
    }
    if (action === 'ASSIGN' && selectedHasAssigned) {
      toast.error('Some selected orders already have a driver. Use Reassign.');
      return;
    }
    setAssignmentOrderLimit(selectedRows.length);
    setAssignmentAction(action);
    setAssignmentDialogOpen(true);
  };

  const handleConfirmAssignment = () => {
    if (!targetDriver || assignmentOrderIds.length === 0) return;
    applyBatch.mutate({
      orderIds: assignmentOrderIds,
      driverId: targetDriver,
      operationalDate: activeQueueScopeDate,
      action: assignmentAction,
    }, {
      onSuccess: () => {
        clearSelection();
        setAssignmentDialogOpen(false);
      },
    });
  };

  const handleOpenAreaCorrection = () => {
    if (selectedRows.length === 0) {
      toast.error('Select orders first');
      return;
    }
    setCorrectionAreaCode(normalAreas[0]?.code || '');
    setAreaCorrectionDialogOpen(true);
  };

  const handleConfirmAreaCorrection = async () => {
    if (!correctionAreaCode || selectedRows.length === 0) return;
    try {
      await Promise.all(selectedRows.map((orderId) => correctArea.mutateAsync({
        orderId,
        deliveryAreaCode: correctionAreaCode,
        saveExact: true,
      })));
      clearSelection();
      setAreaCorrectionDialogOpen(false);
    } catch {
      // Individual mutation toast already reports the error.
    }
  };

  const handleSelectAllPending = (checked: boolean) => setSelectedPendingRows(checked ? pendingAcceptanceOrders.map((order) => order.id) : []);
  const handleSelectPendingRow = (id: string, checked: boolean) => setSelectedPendingRows((previous) => checked ? [...previous, id] : previous.filter((rowId) => rowId !== id));
  const handleBulkAccept = () => {
    if (selectedPendingRows.length === 0) return;
    bulkAcceptDelivery.mutate(selectedPendingRows, { onSuccess: () => setSelectedPendingRows([]) });
  };
  const handleAccept = (orderId: string) => acceptDelivery.mutate(orderId);
  const handleOpenRejectDialog = (orderId: string) => {
    setRejectOrderId(orderId);
    setRejectReason('');
    setRejectDialogOpen(true);
  };
  const handleSubmitReject = () => {
    if (!rejectOrderId || !rejectReason.trim()) return;
    rejectDelivery.mutate({ orderId: rejectOrderId, reason: rejectReason }, { onSuccess: () => setRejectDialogOpen(false) });
  };
  const handleOpenReviewModal = (order: RunnerOrder) => {
    setReviewOrder(order);
    setReviewModalOpen(true);
  };
  const handleManualReopen = useCallback((orderId: string) => {
    manualReopen.mutate(orderId, {
      onSuccess: () => toast.success('Order reopened and ready for assignment'),
      onError: (error) => toast.error(`Failed to reopen: ${error.message}`),
    });
  }, [manualReopen]);
  const handleOpenRevertDialog = (order: RunnerOrder) => {
    setRevertOrderData(order);
    setRevertDialogOpen(true);
  };
  const handleRevertConfirm = (reason: string) => {
    if (!revertOrderData) return;
    revertDelivery.mutate({ orderId: revertOrderData.id, reason }, {
      onSuccess: () => {
        setRevertDialogOpen(false);
        setRevertOrderData(null);
      },
    });
  };

  const renderOrderActions = useCallback((order: RunnerOrder) => {
    return (
      <div className="flex items-center gap-1">
        {order.reschedule_cycle_no && order.reschedule_cycle_no > 0 && (
          <Badge variant="outline" className="text-[10px]">
            <History className="mr-0.5 h-3 w-3" />{order.reschedule_cycle_no}x
          </Badge>
        )}
        {order.runner_review_status === 'REVIEWED' && (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-[10px]">
            <ClipboardCheck className="mr-0.5 h-3 w-3" />Done
          </Badge>
        )}
        {(order.operational_status === 'RESCHEDULED' ||
          (order.runner_review_status === 'REVIEWED' && order.runner_final_outcome === 'RESCHEDULE' && order.next_delivery_date)) && (
          <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => handleManualReopen(order.id)} disabled={manualReopen.isPending}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
        {isAdmin && (order.driver_status === 'DRIVER_DELIVERED' || order.runner_status === 'DELIVERED') && (
          <Button variant="outline" size="sm" className="h-8 px-2 border-orange-300 text-orange-600 hover:bg-orange-50" onClick={() => handleOpenRevertDialog(order)} disabled={revertDelivery.isPending}>
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
        )}
        {(!order.runner_review_status || order.runner_review_status === 'NOT_REVIEWED') && (
          <Button size="sm" className="h-8 px-3" onClick={() => handleOpenReviewModal(order)}>
            NEXT <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => navigate(`/order/${order.id}`)}>
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }, [handleManualReopen, isAdmin, manualReopen.isPending, navigate, revertDelivery.isPending]);

  if (!hasRunnerScopeAccess) {
    return (
      <AppLayout>
        <div className="mx-auto flex max-w-lg flex-col items-center justify-center gap-3 py-20 text-center">
          <ShieldAlert className="h-10 w-10 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Runner Access Required</h2>
          <p className="text-sm text-muted-foreground">Driver assignment is only available to Runner dispatch users.</p>
        </div>
      </AppLayout>
    );
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading area dispatch...</span>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4 pb-28 xl:pb-8">
        <section className="rounded-[1.5rem] border border-[#1f2937]/10 bg-[#f3eee6] p-1 shadow-[0_18px_48px_rgba(17,16,14,0.08)]">
          <div className="rounded-[calc(1.5rem-0.25rem)] bg-white px-4 py-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.85)] md:px-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#17120c] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
                    {workloadOnly ? 'Driver Workload' : 'Driver Inbox'}
                  </span>
                  <span className="rounded-full border border-[#decfb7] bg-[#fbf6ee] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#9b6420]">
                    Active queue
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e4dbcf] bg-[#fbfaf7] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7d7468]">
                    {(driverWorkloadFetching || performanceFetching) && <Loader2 className="h-3 w-3 animate-spin" />}
                    Updated {format(new Date(), 'HH:mm')}
                  </span>
                </div>
                <h1 className="mt-2 text-2xl font-black leading-tight text-[#171717] md:text-3xl">
                  {workloadOnly ? 'Driver Workload' : 'Driver Inbox'}
                </h1>
                <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-[#6f6a62]">
                  {workloadOnly
                    ? 'Monitor Driver workload and delivery performance from the shared assignment source.'
                    : 'Assign delivery orders by area, balance Driver workloads, and monitor delivery performance.'}
                </p>
              </div>

              <div className="grid gap-2 text-sm sm:grid-cols-2 xl:w-[660px] xl:grid-cols-4">
                {[
                  { label: 'Assigned', value: `${globalSummary.assigned}/${globalSummary.total}`, meta: `${globalSummary.unassigned} unassigned` },
                  { label: 'Collect', value: formatBND(globalSummary.totalCollect), meta: `${formatBND(globalSummary.unassignedCollect)} open` },
                  { label: 'Review', value: String(globalSummary.needsReview), meta: `${globalSummary.selfPickup} self pickup` },
                  { label: 'Drivers', value: String(globalSummary.activeDrivers), meta: `${globalSummary.percentage}% assigned` },
                ].map((metric) => (
                  <div key={metric.label} className="min-w-0 rounded-[1rem] border border-[#e4dbcf] bg-[#fbfaf7] px-3 py-2 shadow-[inset_0_1px_1px_rgba(255,255,255,0.72)]">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#9b9080]">{metric.label}</p>
                    <p className="mt-1 break-words text-base font-black leading-tight tabular-nums text-[#171717] md:text-lg">{metric.value}</p>
                    <p className="break-words text-[11px] font-semibold leading-snug text-[#766e63]">{metric.meta}</p>
                    {metric.label === 'Assigned' && <Progress value={globalSummary.percentage} className="mt-2 h-1 bg-[#ebe2d6]" />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4" aria-label="Area-based driver assignment workspace">
            <div className={cn('grid min-w-0 gap-4', workloadOnly ? 'mx-auto max-w-3xl' : 'xl:grid-cols-[minmax(0,1fr)_330px] 2xl:grid-cols-[minmax(0,1fr)_360px]')}>
              {!workloadOnly && <div className="min-w-0 space-y-4">
                <div className="rounded-[1.5rem] border border-[#1f2937]/8 bg-[#f2eee7] p-1 shadow-[0_18px_46px_rgba(17,16,14,0.06)]">
                  <div className="rounded-[calc(1.5rem-0.25rem)] bg-white p-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] md:p-4">
                    <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#b07727]">Assignment progress by area</p>
                        <h2 className="mt-1 text-lg font-black text-[#151515] md:text-xl">Select area, then assign in bulk</h2>
                      </div>
                      <div className="rounded-full border border-[#1f2937]/10 bg-[#f8f5ef] px-3 py-2 text-xs font-semibold text-[#6f6a62]">
                        {globalSummary.unassigned} unassigned - {formatBND(globalSummary.unassignedCollect)} open collect
                      </div>
                    </div>

                    {staleActiveAssignments.length > 0 && (
                      <div className="mb-3 rounded-[1rem] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0">
                            <p className="font-bold">Previous-day assignments need reassignment</p>
                            <p className="text-xs font-medium text-amber-800">
                              {staleActiveAssignments.length} active order(s) are still assigned from earlier dates - {formatBND(staleActiveCollect)} open collect.
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={handleSelectStaleAssignments}
                            className="shrink-0 rounded-full border-amber-300 bg-white"
                          >
                            Reassign old orders
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                      <div
                        className={cn(
                          'rounded-[1.55rem] bg-[#ece5da] p-1 transition-all duration-500 md:col-span-2 2xl:col-span-1',
                          activeAreaCode === 'all' && 'bg-[#c78b2f]',
                        )}
                      >
                        <div className="h-full rounded-[calc(1.55rem-0.25rem)] bg-[#11100e] p-4 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]">
                          <button type="button" onClick={() => setActiveAreaCode('all')} className="w-full text-left">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/48">All areas</p>
                                <p className="mt-1 text-base font-black leading-tight md:text-lg">Normal Delivery</p>
                              </div>
                              <Badge className="shrink-0 whitespace-nowrap rounded-full bg-[#c78b2f] px-3 py-1 text-[#16110a]">{globalSummary.unassigned} left</Badge>
                            </div>
                            <div className="mt-4 grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-end gap-4">
                              <div className="min-w-0">
                                <p className="whitespace-nowrap text-2xl font-black tabular-nums">{globalSummary.assigned}/{globalSummary.total}</p>
                                <p className="text-xs leading-5 text-white/55">{globalSummary.percentage}% assigned</p>
                              </div>
                              <div className="min-w-0 space-y-1 text-right text-xs text-white/55">
                                <p className="flex flex-wrap justify-end gap-x-1"><span>Total</span><span className="whitespace-nowrap font-semibold text-white/78">{formatBND(globalSummary.totalCollect)}</span></p>
                                <p className="flex flex-wrap justify-end gap-x-1"><span>Open</span><span className="whitespace-nowrap font-semibold text-white/78">{formatBND(globalSummary.unassignedCollect)}</span></p>
                              </div>
                            </div>
                            <Progress value={globalSummary.percentage} className="mt-3 h-1.5 bg-white/12" />
                          </button>
                        </div>
                      </div>

                      {areaSummary.map((area) => {
                        const driverNames = area.driver_names || [];
                        return (
                          <div
                            key={area.area_code}
                            className={cn(
                              'rounded-[1.55rem] bg-[#ece5da] p-1 transition-all duration-500 hover:-translate-y-0.5',
                              activeAreaCode === area.area_code && 'bg-[#c78b2f]',
                            )}
                          >
                            <div className="flex h-full flex-col rounded-[calc(1.55rem-0.25rem)] bg-white p-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.75)]">
                              <button type="button" onClick={() => handleAreaFilterChange(area.area_code)} className="flex-1 text-left">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-base font-black leading-tight text-[#171717]">{area.area_name}</p>
                                    <p className="mt-1 text-xs font-medium leading-4 text-[#8a8174]">
                                      {area.district || (area.is_special ? 'Special category' : 'Operational area')}
                                    </p>
                                  </div>
                                  {area.is_special ? (
                                    <Badge variant="outline" className="shrink-0 whitespace-nowrap rounded-full border-[#d9d1c5] px-3 py-1">{area.total_orders}</Badge>
                                  ) : (
                                    <Badge className="shrink-0 whitespace-nowrap rounded-full bg-[#c78b2f] px-3 py-1 text-[#16110a]">{area.unassigned_orders} left</Badge>
                                  )}
                                </div>

                                {area.is_special ? (
                                  <div className="mt-3 rounded-[1.1rem] border border-dashed border-[#d8cbbb] bg-[#fbf7ef] p-3 text-sm text-[#6f6a62]">
                                    {area.total_orders} order(s) are separated from normal Driver assignment.
                                  </div>
                                ) : (
                                  <>
                                    <div className="mt-4 grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] items-end gap-4">
                                      <div className="min-w-0">
                                        <p className="whitespace-nowrap text-2xl font-black tabular-nums text-[#171717]">{area.assigned_orders}/{area.total_orders}</p>
                                        <p className="text-xs font-medium leading-5 text-[#8a8174]">{area.assignment_percentage}% assigned</p>
                                      </div>
                                      <div className="min-w-0 space-y-1 text-right text-xs font-medium text-[#6f6a62]">
                                        <p className="flex flex-wrap justify-end gap-x-1"><span>Total</span><span className="whitespace-nowrap">{formatBND(area.total_collect_amount)}</span></p>
                                        <p className="flex flex-wrap justify-end gap-x-1"><span>Assigned</span><span className="whitespace-nowrap">{formatBND(area.assigned_collect_amount)}</span></p>
                                        <p className="flex flex-wrap justify-end gap-x-1 text-[#a66618]"><span>Open</span><span className="whitespace-nowrap">{formatBND(area.unassigned_collect_amount)}</span></p>
                                      </div>
                                    </div>
                                    <Progress value={area.assignment_percentage} className="mt-3 h-1.5 bg-[#eee7dd]" />
                                    <p className="mt-3 text-[11px] font-medium leading-4 text-[#81786d]">
                                      Drivers: {driverNames.length ? driverNames.join(', ') : 'None yet'}
                                    </p>
                                  </>
                                )}
                              </button>

                              {!area.is_special && area.unassigned_orders > 0 && (
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => handleAssignRemaining(area.area_code)}
                                  className="mt-3 h-9 rounded-full bg-[#171717] px-4 text-white hover:bg-[#2b2b2b] active:scale-[0.98]"
                                >
                                  Assign {area.unassigned_orders} Remaining
                                  <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-[#1f2937]/8 bg-[#f2eee7] p-1 shadow-[0_14px_38px_rgba(17,16,14,0.05)]">
                  <div className="space-y-3 rounded-[calc(1.5rem-0.25rem)] bg-white p-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                      <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a8174]" />
                        <Input
                          placeholder="Search order, customer, phone, address, SKU..."
                          value={searchQuery}
                          onChange={(event) => setSearchQuery(event.target.value)}
                          className="h-12 rounded-full border-[#e3ddd4] bg-[#fbfaf7] pl-11 text-base shadow-[inset_0_1px_1px_rgba(17,16,14,0.04)]"
                        />
                      </div>
                      <Select value={assignmentFilter} onValueChange={(value: 'all' | 'assigned' | 'unassigned') => handleAssignmentFilterChange(value)}>
                        <SelectTrigger className="h-12 rounded-full border-[#e3ddd4] bg-[#fbfaf7] lg:w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned first</SelectItem>
                          <SelectItem value="assigned">Assigned only</SelectItem>
                          <SelectItem value="all">All assignments</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={driverFilter} onValueChange={handleDriverFilterChange}>
                        <SelectTrigger className="h-12 rounded-full border-[#e3ddd4] bg-[#fbfaf7] lg:w-[180px]">
                          <SelectValue placeholder="All Drivers" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Drivers</SelectItem>
                          {driverWorkloads.map((driver) => (
                            <SelectItem key={driver.driver_id} value={driver.driver_id}>
                              {driver.name} ({driver.orderCount})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleSelectVisible(true)} disabled={visibleAssignmentOrders.length === 0} className="rounded-full border-[#d8cbbb]">
                        Select visible ({visibleAssignmentOrders.length})
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const selected = visibleAssignmentOrders
                            .filter((order) => isNormalArea(inferAreaFromOrder(order)) && isActiveQueueUnassigned(order, todayDateKey))
                            .map((order) => order.id);
                          selectOrders(selected);
                        }}
                        disabled={visibleAssignmentOrders.length === 0}
                        className="rounded-full border-[#d8cbbb]"
                      >
                        Select unassigned
                      </Button>
                      <Button variant="ghost" size="sm" onClick={clearSelection} disabled={selectedRows.length === 0} className="rounded-full">
                        Clear
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Showing {displayedAssignmentOrders.length} of {visibleAssignmentOrders.length}; selected {selectedRows.length}
                      </span>
                    </div>
                  </div>
                </div>

                {localityGroups.length > 0 && activeAreaCode !== 'all' && isNormalArea(activeAreaCode) && (
                  <div className="rounded-[1.5rem] border border-[#1f2937]/8 bg-[#f2eee7] p-1 shadow-[0_14px_38px_rgba(17,16,14,0.05)]">
                    <div className="rounded-[calc(1.5rem-0.25rem)] bg-white p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#b07727]">Locality groups</p>
                          <h3 className="text-lg font-black text-[#171717]">Select nearby orders together</h3>
                        </div>
                        <Badge variant="outline" className="rounded-full border-[#d8cbbb]">{localityGroups.length} groups</Badge>
                      </div>
                      <div className="grid min-w-0 gap-2 lg:grid-cols-2 2xl:grid-cols-3">
                    {localityGroups.map((group) => (
                      <div key={group.label} className="min-w-0 rounded-[1.35rem] bg-[#f7f4ee] p-1">
                        <div className="rounded-[calc(1.35rem-0.25rem)] bg-white p-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.75)]">
                          <div className="flex min-w-0 flex-col gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-black text-[#171717]" title={group.label}>{group.label}</p>
                              <p className="mt-1 text-xs font-medium leading-5 text-[#8a8174]">
                                {group.assignedOrders} / {group.totalOrders} assigned, {group.unassignedOrders} unassigned
                              </p>
                              <p className="mt-1 break-words text-xs font-medium leading-5 text-[#6f6a62]">
                                Total {formatBND(group.collectAmount)} - Open {formatBND(group.unassignedCollectAmount)}
                              </p>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <Button variant="outline" size="sm" onClick={() => handleSelectGroup(group.orders, false)} disabled={group.orders.length === 0} className="min-w-0 rounded-full border-[#d8cbbb]">Select</Button>
                              <Button variant="ghost" size="sm" onClick={() => handleSelectGroup(group.orders, true)} disabled={group.unassigned.length === 0} className="min-w-0 rounded-full">Unassigned</Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {displayedAssignmentOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-16">
                      <img src={capybaraEmpty} alt="No orders" className="h-20 w-20 object-contain opacity-60" />
                      <p className="text-sm font-semibold">No orders match this dispatch view</p>
                      <p className="text-xs text-muted-foreground">Try another area, date, assignment status, or search.</p>
                    </div>
                  ) : (
                    displayedAssignmentOrders.map((order) => {
                      const areaCode = inferAreaFromOrder(order);
                      return (
                        <OrderCardRow
                          key={order.id}
                          order={order}
                          areaLabel={getAreaLabel(areaCode, deliveryAreas)}
                          locality={getLocalityLabel(order, areaCode)}
                          isSelected={selectedRows.includes(order.id)}
                          selectable
                          onSelect={(checked) => handleSelectRow(order.id, !!checked)}
                          actions={
                            !isNormalArea(areaCode) ? (
                              <Button size="sm" variant="outline" onClick={() => {
                                selectOrders([order.id]);
                                handleOpenAreaCorrection();
                              }}>
                                <AlertTriangle className="mr-1 h-3.5 w-3.5" /> Resolve Area
                              </Button>
                            ) : undefined
                          }
                        />
                      );
                    })
                  )}
                </div>
              </div>}

              <aside className="min-w-0 space-y-3">
                <div className="rounded-[1.5rem] border border-[#1f2937]/8 bg-[#11100e] p-1 text-white shadow-[0_18px_52px_rgba(17,16,14,0.16)] xl:sticky xl:top-4">
                  <div className="max-h-none space-y-3 rounded-[calc(1.5rem-0.25rem)] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.035))] p-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#c78b2f]">Drivers and performance</p>
                        <h3 className="mt-1 text-lg font-black">Driver Workload</h3>
                        <p className="text-xs text-white/50">Accepted workload plus {performanceLabel} delivery rate.</p>
                      </div>
                      {(driverWorkloadFetching || performanceFetching) && <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-[#c78b2f]" />}
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={openWorkloadExport}
                      className="h-10 w-full rounded-full border-white/15 bg-white/[0.07] text-white hover:bg-white/[0.12] hover:text-white"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Export Excel
                    </Button>

                    <div className="rounded-[1.1rem] border border-white/10 bg-white/[0.065] p-3">
                      <div className="flex items-center gap-2 text-xs text-white/58">
                        <BarChart3 className="h-3.5 w-3.5 text-[#c78b2f]" />
                        <span>Team performance - {performanceLabel}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-xl font-black tabular-nums">{teamPerformance.delivered}/{teamPerformance.total}</p>
                          <p className="text-[11px] text-white/48">Delivered</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-black tabular-nums">{teamPerformance.deliveryRate}%</p>
                          <p className="text-[11px] text-white/48">Rate</p>
                        </div>
                        <div className="rounded-[0.85rem] bg-white/[0.06] p-2 text-xs">
                          <p className="font-bold text-white">{teamPerformance.failed}</p>
                          <p className="text-white/45">Failed</p>
                        </div>
                        <div className="rounded-[0.85rem] bg-white/[0.06] p-2 text-xs">
                          <p className="font-bold text-white">{teamPerformance.pending}</p>
                          <p className="text-white/45">Pending</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 rounded-[1.1rem] border border-white/10 bg-white/[0.05] p-2">
                      <div className="grid grid-cols-3 gap-1">
                        {(['day', 'month', 'year'] as DriverPerformancePeriod[]).map((period) => (
                          <button
                            key={period}
                            type="button"
                            onClick={() => setPerformancePeriod(period)}
                            className={cn(
                              'rounded-full px-2 py-1.5 text-xs font-bold capitalize transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
                              performancePeriod === period
                                ? 'bg-[#c78b2f] text-[#17120c]'
                                : 'bg-white/[0.06] text-white/60 hover:bg-white/[0.10]',
                            )}
                          >
                            {period}
                          </button>
                        ))}
                      </div>
                      <div className="relative">
                        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
                        <Input
                          type={performanceInputType}
                          min={performancePeriod === 'year' ? '2020' : undefined}
                          max={performancePeriod === 'year' ? '2099' : undefined}
                          value={performanceInputValue}
                          onChange={(event) => handlePerformanceAnchorChange(event.target.value)}
                          className="h-9 rounded-full border-white/10 bg-white/[0.07] pl-9 text-sm font-semibold text-white [color-scheme:dark]"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Input
                        value={driverSearch}
                        onChange={(event) => setDriverSearch(event.target.value)}
                        placeholder="Search Driver..."
                        className="h-10 rounded-full border-white/10 bg-white/[0.07] text-white placeholder:text-white/35"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Select value={driverAvailabilityFilter} onValueChange={(value: 'all' | 'available' | 'unavailable') => setDriverAvailabilityFilter(value)}>
                          <SelectTrigger className="h-9 rounded-full border-white/10 bg-white/[0.07] text-xs text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All status</SelectItem>
                            <SelectItem value="available">Available</SelectItem>
                            <SelectItem value="unavailable">Unavailable</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={driverSort} onValueChange={(value: 'workload' | 'collect' | 'delivery-rate' | 'capacity' | 'name') => setDriverSort(value)}>
                          <SelectTrigger className="h-9 rounded-full border-white/10 bg-white/[0.07] text-xs text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="workload">Most orders</SelectItem>
                            <SelectItem value="collect">Collect amount</SelectItem>
                            <SelectItem value="delivery-rate">Delivery rate</SelectItem>
                            <SelectItem value="capacity">Capacity left</SelectItem>
                            <SelectItem value="name">Name</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {visibleDriverWorkloads.length === 0 ? (
                      <div className="rounded-[1.1rem] border border-dashed border-white/18 bg-white/[0.04] p-4 text-sm text-white/58">No Driver matches this filter.</div>
                    ) : (
                      visibleDriverWorkloads.map((driver) => {
                        const canAssignSelected = selectedRows.length > 0 && !selectedHasSpecial && driver.isAvailable;
                        return (
                          <div
                            key={driver.driver_id}
                            className={cn(
                              'rounded-[1.1rem] border border-white/10 bg-white/[0.065] p-3 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:bg-white/[0.095]',
                              driverFilter === driver.driver_id && 'border-[#c78b2f] bg-[#c78b2f]/15',
                              targetDriver === driver.driver_id && 'ring-1 ring-[#c78b2f]/70',
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => handleDriverFilterChange(driverFilter === driver.driver_id ? 'all' : driver.driver_id)}
                              className="w-full text-left"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate font-bold">{driver.name}</p>
                                  <p className="mt-0.5 truncate text-xs text-white/48" title={driver.areaNames.join(', ') || 'No area assigned'}>
                                    {driver.areaNames.length ? driver.areaNames.join(', ') : 'No area assigned'}
                                  </p>
                                </div>
                                <Badge className={cn('rounded-full', driver.isAvailable ? 'bg-white text-[#171717]' : 'bg-red-200 text-red-900')}>
                                  {driver.isAvailable ? 'Available' : 'Off'}
                                </Badge>
                              </div>

                              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-[0.85rem] bg-white/[0.06] p-2">
                                  <p className="font-black tabular-nums text-white">{driver.orderCount}</p>
                                  <p className="text-white/45">Accepted orders</p>
                                </div>
                                <div className="rounded-[0.85rem] bg-white/[0.06] p-2">
                                  <p className="break-words font-black leading-tight tabular-nums text-white">{formatBND(driver.collectAmount)}</p>
                                  <p className="text-white/45">Accepted collect</p>
                                </div>
                              </div>

                              <div className="mt-3 rounded-[0.95rem] border border-white/10 bg-black/10 p-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-semibold text-white/50">{performanceLabel}</span>
                                  <span className="text-xs font-black text-white">{driver.deliveryRate}%</span>
                                </div>
                                <Progress value={driver.deliveryRate} className="mt-2 h-1 bg-white/10" />
                                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-white/52">
                                  <span><b className="text-white">{driver.deliveredCount}/{driver.performanceTotal}</b> delivered</span>
                                  <span><b className="text-white">{driver.failedCount}</b> failed</span>
                                  <span><b className="text-white">{driver.pendingCount}</b> pending</span>
                                </div>
                              </div>

                              <div className="mt-2 flex items-center justify-between text-[11px] text-white/45">
                                <span>{driver.capacity !== null ? `${driver.remainingCapacity ?? 0} capacity left` : 'No capacity limit'}</span>
                                <span>{driver.notificationStatus || 'No notification'}</span>
                              </div>
                            </button>

                            <Button
                              type="button"
                              size="sm"
                              disabled={!canAssignSelected}
                              onClick={() => {
                                setTargetDriver(driver.driver_id);
                                openAssignmentDialog(selectedHasAssigned ? 'REASSIGN' : 'ASSIGN');
                              }}
                              className="mt-3 h-9 w-full rounded-full bg-[#c78b2f] text-[#17120c] hover:bg-[#d99b3d] disabled:bg-white/10 disabled:text-white/35"
                            >
                              {selectedRows.length > 0 ? `Assign Selected (${selectedRows.length})` : 'Select orders first'}
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </aside>
            </div>
        </section>

        <Dialog open={workloadExportOpen} onOpenChange={setWorkloadExportOpen}>
          <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle>Export Driver Workload</DialogTitle>
              <DialogDescription>
                Export delivered, failed, and pending accept orders from the shared assignment source.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="workload-export-month">Month</Label>
                <Input
                  id="workload-export-month"
                  type="month"
                  value={workloadExportMonth}
                  onChange={(event) => setWorkloadExportMonth(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Driver</Label>
                <Select value={workloadExportDriverId} onValueChange={setWorkloadExportDriverId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Drivers</SelectItem>
                    {driverWorkloads.map((driver) => (
                      <SelectItem key={driver.driver_id} value={driver.driver_id}>
                        {driver.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setWorkloadExportOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleExportWorkload}
                disabled={!workloadExportMonth || workloadExporting}
              >
                {workloadExporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Export
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={assignmentDialogOpen} onOpenChange={setAssignmentDialogOpen}>
          <DialogContent className="bottom-0 top-auto max-h-[88dvh] w-screen max-w-none translate-y-0 gap-3 overflow-y-auto overflow-x-hidden rounded-b-none rounded-t-[1.5rem] border-[#e2d8c8] bg-white p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] text-[#171717] shadow-[0_-22px_70px_rgba(17,16,14,0.22)] backdrop-blur-0 sm:bottom-auto sm:top-[50%] sm:max-h-[92dvh] sm:w-[min(92vw,32rem)] sm:max-w-lg sm:translate-y-[-50%] sm:rounded-2xl sm:p-6">
            <DialogHeader className="space-y-1 pr-8 text-left">
              <DialogTitle className="text-lg leading-tight sm:text-xl">{assignmentAction === 'REASSIGN' ? 'Reassign Orders' : 'Assign Orders'}</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">Review workload and collection before applying this batch.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/20 p-3 text-sm">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Selected orders</p>
                  <p className="text-lg font-bold tabular-nums">{selectedRows.length}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Selected collect</p>
                  <p className="break-words text-lg font-bold leading-tight tabular-nums">{formatBND(selectedTotalCollect)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs uppercase text-muted-foreground">Area(s)</p>
                  <p className="break-words font-medium">{selectedAreasLabel || '-'}</p>
                </div>
              </div>

              {isNormalArea(activeAreaCode) && (
                <div className="space-y-3 rounded-xl border border-[#e3ddd4] bg-[#fbfaf7] p-3">
                  <div>
                    <p className="text-sm font-semibold">Choose a smaller area</p>
                    <p className="text-xs text-muted-foreground">
                      Assign every remaining order together, or select one locality.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => selectAssignmentSubset(assignmentAreaUnassignedOrders, 'ASSIGN')}
                    >
                      All remaining ({assignmentAreaUnassignedOrders.length})
                    </Button>
                    {assignmentAreaLocalityGroups.map((group) => (
                      <Button
                        key={group.label}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => selectAssignmentSubset(group.orders, 'ASSIGN')}
                      >
                        {group.label} ({group.orders.length})
                      </Button>
                    ))}
                  </div>

                  {assignmentAreaStaleOrders.length > 0 && (
                    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="text-sm font-medium text-amber-950">
                        {assignmentAreaStaleOrders.length} previous-day order(s) still assigned
                      </p>
                      <p className="text-xs text-amber-900/75">
                        They remain in this area's assigned total until completed or moved to another Driver.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => selectAssignmentSubset(assignmentAreaStaleOrders, 'REASSIGN')}
                        >
                          Reassign previous-day ({assignmentAreaStaleOrders.length})
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => selectAssignmentSubset(
                            [...assignmentAreaUnassignedOrders, ...assignmentAreaStaleOrders],
                            'REASSIGN',
                          )}
                        >
                          Move all ({assignmentAreaUnassignedOrders.length + assignmentAreaStaleOrders.length})
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-[#e3ddd4] bg-[#fbfaf7] p-3">
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <Label htmlFor="assignment-order-limit">Orders to assign now</Label>
                    <p className="mt-1 hidden text-xs text-muted-foreground sm:block">
                      Adjust this when an area has 12 orders but you only want to assign 11 in this batch.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 shrink-0 rounded-full"
                      onClick={() => setAssignmentOrderLimit(Math.max(1, cappedAssignmentLimit - 1))}
                      disabled={cappedAssignmentLimit <= 1}
                    >
                      -
                    </Button>
                    <Input
                      id="assignment-order-limit"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={selectedRows.length}
                      value={cappedAssignmentLimit}
                      onChange={(event) => handleAssignmentLimitChange(event.target.value)}
                      className="h-10 w-20 rounded-full text-center text-base font-bold tabular-nums"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 shrink-0 rounded-full"
                      onClick={() => setAssignmentOrderLimit(Math.min(selectedRows.length, cappedAssignmentLimit + 1))}
                      disabled={cappedAssignmentLimit >= selectedRows.length}
                    >
                      +
                    </Button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-white p-2">
                    <p className="text-xs uppercase text-muted-foreground">This batch</p>
                    <p className="text-sm font-bold">{cappedAssignmentLimit} orders</p>
                    <p className="break-words text-xs font-semibold leading-tight text-muted-foreground">{formatBND(assignmentTotalCollect)}</p>
                  </div>
                  <div className="rounded-lg bg-white p-2">
                    <p className="text-xs uppercase text-muted-foreground">Left selected</p>
                    <p className="font-bold">{selectedRows.length - cappedAssignmentLimit} orders</p>
                  </div>
                </div>
              </div>

              <div>
                <Label>Driver</Label>
                <Select value={targetDriver} onValueChange={setTargetDriver}>
                  <SelectTrigger className="mt-1 min-w-0 rounded-lg [&>span]:truncate">
                    <SelectValue placeholder="Select a Driver..." />
                  </SelectTrigger>
                  <SelectContent>
                    {driverWorkloads.map((driver) => (
                      <SelectItem key={driver.driver_id} value={driver.driver_id}>
                        {driver.name} - {driver.orderCount} orders - {formatBND(driver.collectAmount)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {targetDriverWorkload && (
                <div className="rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{targetDriverWorkload.name}</p>
                      <p className="truncate text-xs text-muted-foreground" title={targetDriverWorkload.areaNames.join(', ') || 'No active area yet'}>
                        {targetDriverWorkload.areaNames.join(', ') || 'No active area yet'}
                      </p>
                    </div>
                    <Badge variant="outline">Preview</Badge>
                  </div>
                  <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Current workload</p>
                      <p className="font-semibold">{targetDriverWorkload.orderCount} orders - {formatBND(targetDriverWorkload.collectAmount)}</p>
                      {targetDriverWorkload.capacity !== null && (
                        <p className="mt-1 text-xs text-muted-foreground">{targetDriverWorkload.remainingCapacity ?? 0} capacity remaining</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">After assignment</p>
                      <p className="font-semibold">{targetDriverWorkload.orderCount + cappedAssignmentLimit} orders - {formatBND(targetDriverWorkload.collectAmount + assignmentTotalCollect)}</p>
                      {targetDriverWorkload.capacity !== null && targetDriverWorkload.orderCount + cappedAssignmentLimit > targetDriverWorkload.capacity && (
                        <p className="mt-1 text-xs text-destructive">This exceeds the configured Driver capacity.</p>
                      )}
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-xs uppercase text-muted-foreground">Applied area(s)</p>
                      <p className="break-words font-medium">{assignmentAreasLabel || '-'}</p>
                    </div>
                    <div className="md:col-span-2 rounded-lg bg-muted/40 p-2">
                      <p className="text-xs uppercase text-muted-foreground">{performanceLabel} delivery rate</p>
                      <p className="font-semibold">
                        {targetDriverWorkload.deliveredCount} / {targetDriverWorkload.performanceTotal} delivered - {targetDriverWorkload.deliveryRate}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {targetDriverWorkload.failedCount} failed - {targetDriverWorkload.pendingCount} pending
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter className="gap-2 pt-2 sm:gap-3 sm:pt-4">
              <Button variant="outline" onClick={() => setAssignmentDialogOpen(false)} className="h-11 rounded-full">Cancel</Button>
              <Button onClick={handleConfirmAssignment} disabled={!targetDriver || assignmentOrderIds.length === 0 || applyBatch.isPending} className="h-11 rounded-full">
                {applyBatch.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                Confirm {cappedAssignmentLimit} {assignmentAction === 'REASSIGN' ? 'Reassignment' : 'Assignment'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={areaCorrectionDialogOpen} onOpenChange={setAreaCorrectionDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Correct Delivery Area</DialogTitle>
              <DialogDescription>Move selected orders out of Needs Review or into the correct operational area.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-xl border bg-muted/20 p-3 text-sm">
                <p className="font-semibold">{selectedRows.length} order(s) selected</p>
                <p className="text-muted-foreground">
                  Exact-address learning is saved automatically. Future orders with the same normalized address will use this area.
                </p>
              </div>
              <div>
                <Label>Normal delivery area</Label>
                <Select value={correctionAreaCode} onValueChange={setCorrectionAreaCode}>
                  <SelectTrigger className="mt-1 rounded-lg">
                    <SelectValue placeholder="Select area..." />
                  </SelectTrigger>
                  <SelectContent>
                    {normalAreas.map((area) => (
                      <SelectItem key={area.code} value={area.code}>{area.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAreaCorrectionDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleConfirmAreaCorrection} disabled={!correctionAreaCode || correctArea.isPending}>
                {correctArea.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <MapPin className="mr-1 h-4 w-4" />}
                Save Area
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Delivery</DialogTitle>
              <DialogDescription>Please provide a reason for rejecting this delivery.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Rejection Reason *</Label>
                <Textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Enter reason..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleSubmitReject} disabled={!rejectReason.trim() || rejectDelivery.isPending}>
                {rejectDelivery.isPending ? 'Rejecting...' : 'Reject'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <RunnerReviewModal open={reviewModalOpen} onOpenChange={setReviewModalOpen} order={reviewOrder} />
        <RevertDeliveryDialog open={revertDialogOpen} onOpenChange={setRevertDialogOpen} order={revertOrderData} onConfirm={handleRevertConfirm} isPending={revertDelivery.isPending} />
      </div>
    </AppLayout>
  );
}
