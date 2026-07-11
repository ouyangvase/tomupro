// Custom types for the application
export type AppRole = 'admin' | 'manager' | 'salesperson' | 'runner' | 'driver' | 'user' | 'finance_viewer' | 'runner_assistant';

// Finance Workspace types
export type FinanceClaimStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'paid' | 'voided';
export type FinanceClaimCategory = 'fuel' | 'packaging' | 'toll' | 'parking' | 'equipment' | 'other';
export type CompanyMemberRole = 'owner' | 'admin' | 'runner' | 'viewer';
export type CompanyMemberStatus = 'pending' | 'active' | 'suspended';
export type FinanceTransactionType = 'income' | 'expense' | 'transfer';
export type FinanceTransactionStatus = 'pending' | 'confirmed' | 'voided';
export type FinanceReportStatus = 'draft' | 'closed';

export interface Company {
  id: string;
  company_name: string;
  owner_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface CompanyMember {
  id: string;
  company_id: string;
  user_id: string;
  role: CompanyMemberRole;
  invited_by: string | null;
  status: CompanyMemberStatus;
  created_at: string;
  // Joined
  user?: Profile;
  company?: Company;
}

export interface FinanceClaim {
  id: string;
  company_id: string;
  claim_no: string;
  runner_user_id: string;
  tracking_number: string | null;
  order_id: string | null;
  claim_date: string;
  category: FinanceClaimCategory;
  description: string;
  amount: number;
  payment_method: string | null;
  receipt_url: string | null;
  notes: string | null;
  status: FinanceClaimStatus;
  admin_note: string | null;
  approved_by: string | null;
  approved_at: string | null;
  paid_by: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  runner?: Profile;
  approver?: Profile;
}

export interface FinanceTransaction {
  id: string;
  company_id: string;
  source_type: string;
  source_id: string | null;
  transaction_date: string;
  type: FinanceTransactionType;
  category: string;
  description: string;
  amount: number;
  status: FinanceTransactionStatus;
  created_by: string;
  approved_by: string | null;
  created_at: string;
  // Joined
  creator?: Profile;
}

export interface FinanceMonthlyReport {
  id: string;
  company_id: string;
  report_month: string;
  total_income: number;
  total_expense: number;
  net_profit: number;
  gross_profit: number;
  profit_margin: number;
  closed_by: string | null;
  closed_at: string | null;
  status: FinanceReportStatus;
  // Joined
  closer?: Profile;
}

export interface FinanceAuditLog {
  id: string;
  company_id: string;
  user_id: string;
  action: string;
  module: string;
  record_id: string | null;
  before_data: any;
  after_data: any;
  created_at: string;
  // Joined
  user?: Profile;
}
export type WarehouseType = 'SALESPERSON' | 'RUNNER' | 'MANAGER';
export type PaymentMethod = 'COD' | 'TRANSFER';
export type OrderStatus = 'BOOKING' | 'READY' | 'CANCELLED';
export type RunnerStatus = 'UNASSIGNED' | 'ASSIGNED' | 'TAKEN' | 'DELIVERED' | 'FAILED_DELIVERY';
export type DriverStatus = 'UNASSIGNED' | 'ASSIGNED' | 'OUT_FOR_DELIVERY' | 'DRIVER_DELIVERED' | 'DRIVER_FAILED' | 'RETURN_REQUIRED';
export type RunnerAcceptStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';
export type ReceiptStatus = 'pending' | 'confirmed' | 'rejected';
export type FailedNextStep = 'RESCHEDULE' | 'SALESPERSON_CONTACT';

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  sku_label: string | null;
  qty: number;
  price: number;
  line_total: number;
  notes: string | null;
  created_at: string;
}
export type ReconciliationStatus = 'NOT_CLAIMED' | 'CLAIMED' | 'SP_ACK_PENDING' | 'ADMIN_ACK_PENDING' | 'SETTLED' | 'DISPUTE';
export type ClaimMethod = 'TRANSFER' | 'CASH' | 'OTHER';
export type InboundStatus = 'PENDING_SP_ACK' | 'ACKNOWLEDGED' | 'DISPUTE';
export type MovementType = 'INBOUND' | 'SALE_DEDUCT' | 'ADJUSTMENT' | 'RETURN' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'DRIVER_ALLOCATE_PREDEDUCT' | 'DRIVER_RETURN';
export type ReferenceType = 'INBOUND_ITEM' | 'ORDER_ITEM' | 'MANUAL';
export type AttachmentType = 'transfer_proof' | 'receipt_photo' | 'chat_screenshot' | 'delivery_photo' | 'inbound_photo' | 'other';
export type ClaimBatchStatus = 'ADMIN_ACK_PENDING' | 'CLAIMED';
export type PickupStatus = 'PENDING_DRIVER_ACK' | 'DRIVER_ACKED' | 'CANCELLED';

// Runner Driver relationship
export interface RunnerDriver {
  id: string;
  runner_id: string;
  driver_id: string;
  is_active: boolean;
  created_at: string;
  driver?: Profile;
  runner?: Profile;
}

export interface RunnerAssistant {
  id: string;
  runner_id: string;
  assistant_id: string;
  can_deliver: boolean;
  can_confirm_receipt: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  runner?: Profile;
  assistant?: Profile;
}

export interface Profile {
  id: string;
  role: AppRole;
  display_name: string;
  email: string;
  is_active: boolean;
  avatar_url: string | null;
  theme_preference: 'dark' | 'light' | null;
  created_at: string;
  updated_at: string | null;
  manager_id: string | null;
  manager?: Profile;
}

export interface Warehouse {
  id: string;
  warehouse_type: WarehouseType;
  owner_user_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  sku_code: string | null;
  sku_name: string;
  owner_user_id: string;
  created_by: string;
  created_at: string;
  updated_at: string | null;
  is_active: boolean;
}

export interface Order {
  id: string;
  order_code: string;
  order_date: string;
  customer_name: string;
  phone: string;
  address: string;
  area: string | null;
  channel: string | null;
  notes: string | null;
  remark: string | null;
  payment_method: PaymentMethod;
  salesperson_id: string;
  runner_id: string | null;
  driver_id: string | null;
  status: OrderStatus;
  expected_pickup_date: string | null;
  total_qty: number;
  total_amount: number;
  runner_status: RunnerStatus;
  driver_status: DriverStatus | null;
  runner_accept_status: RunnerAcceptStatus | null;
  driver_delivered_at: string | null;
  driver_failed_reason: string | null;
  driver_failed_remark: string | null;
  driver_next_delivery_date: string | null;
  failed_reason: string | null;
  failed_remark: string | null;
  failed_next_step: FailedNextStep | null;
  next_delivery_date: string | null;
  reconciliation_status: ReconciliationStatus;
  dispute_reason: string | null;
  dispute_notes: string | null;
  fulfillment_warehouse_id: string | null;
  stock_deducted: boolean;
  cancel_reason: string | null;
  cancel_notes: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  delivered_at: string | null;
  // Runner review fields
  runner_review_status: string | null;
  runner_final_outcome: string | null;
  runner_failed_reason_id: string | null;
  runner_comment: string | null;
  runner_reviewed_at: string | null;
  runner_reviewed_by: string | null;
  salesperson_action_required: boolean | null;
  salesperson_action_type: string | null;
  salesperson_action_due_date: string | null;
  last_status_note: string | null;
  reschedule_flag: boolean | null;
  // Receipt verification fields
  receipt_url: string | null;
  receipt_status: ReceiptStatus | null;
  receipt_confirmed_by: string | null;
  receipt_confirmed_at: string | null;
  receipt_rejected_reason: string | null;
  // Operational tracking fields
  operational_status: string;
  reschedule_cycle_no: number;
  reopened_at: string | null;
  rescheduled_from_status: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  salesperson?: Profile;
  runner?: Profile;
  driver?: Profile;
  order_items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  sku_label: string | null;
  qty: number;
  price: number;
  line_total: number;
  notes: string | null;
  created_at: string;
  product?: Product;
}

export interface Binding {
  id: string;
  salesperson_id: string;
  runner_id: string;
  active: boolean;
  created_by: string;
  created_at: string;
  salesperson?: Profile;
  runner?: Profile;
}

export interface Claim {
  id: string;
  order_id: string;
  amount: number;
  gross_amount?: number;
  delivery_fee?: number;
  net_claim_amount?: number;
  method: ClaimMethod | null;
  note: string | null;
  proof_url: string | null;
  created_by: string;
  created_at: string;
}

export interface ClaimBatch {
  id: string;
  runner_id: string;
  total_amount: number;
  total_bnd: number | null;
  exchange_rate_to_rm: number | null;
  total_rm: number | null;
  // New breakdown fields
  gross_bnd: number | null;
  delivery_charges_bnd: number | null;
  net_bnd: number | null;
  gross_rm: number | null;
  delivery_charges_rm: number | null;
  net_rm: number | null;
  status: ClaimBatchStatus;
  submitted_at: string;
  admin_ack_at: string | null;
  admin_ack_by: string | null;
  note: string | null;
  // Joined fields
  runner?: Profile;
  items?: ClaimBatchItem[];
}

export interface ClaimBatchItem {
  id: string;
  batch_id: string;
  order_id: string;
  created_at: string;
  // Joined fields
  order?: Order;
}

export interface InboundShipment {
  id: string;
  runner_id: string;
  salesperson_id: string;
  tracking_no: string;
  arrival_date: string;
  status: InboundStatus;
  notes: string | null;
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  runner?: Profile;
  salesperson?: Profile;
  acknowledged_by_profile?: Profile;
  inbound_items?: InboundItem[];
}

export interface InboundItem {
  id: string;
  inbound_id: string;
  product_id: string | null;
  temp_sku_label: string | null;
  qty_reported: number;
  qty_acknowledged: number | null;
  photo_url: string;
  created_at: string;
  product?: Product;
}

export interface StockMovement {
  id: string;
  warehouse_id: string;
  product_id: string;
  movement_type: MovementType;
  qty_change: number;
  reference_type: ReferenceType;
  reference_id: string | null;
  created_by: string;
  created_at: string;
}

export interface StockBalance {
  warehouse_id: string;
  warehouse_name: string;
  owner_user_id: string;
  owner_name: string;
  product_id: string;
  sku_code: string | null;
  sku_name: string;
  balance_qty: number;
  last_movement_time: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  priority?: string;
  recipient_role?: string;
  reference_type: string | null;
  reference_id: string | null;
  entity_type?: string;
  status_from?: string;
  status_to?: string;
  is_read: boolean;
  created_at: string;
}

export interface CancelReason {
  id: string;
  reason: string;
  is_active: boolean;
  created_at: string;
}

export interface FailedReason {
  id: string;
  reason: string;
  is_active: boolean;
  created_at: string;
}

// Driver Pickup types
export interface DriverPickup {
  id: string;
  pickup_date: string;
  runner_id: string;
  driver_id: string;
  status: PickupStatus;
  notes: string | null;
  created_at: string;
  acknowledged_at: string | null;
  runner?: Profile;
  driver?: Profile;
  items?: DriverPickupItem[];
}

export interface DriverPickupItem {
  id: string;
  pickup_id: string;
  product_id: string;
  qty: number;
  required_qty: number | null;
  buffer_qty: number;
  created_at: string;
  product?: Product;
}

export interface DriverAllocatedStock {
  driver_id: string;
  product_id: string;
  sku_name: string;
  sku_code: string | null;
  allocated_qty: number;
  delivered_qty: number;
  pending_qty: number;
}

// Driver order remarks (private notes per order)
export interface DriverOrderRemark {
  id: string;
  order_id: string;
  driver_user_id: string;
  remark_type: string;
  remark_text: string | null;
  created_at: string;
  updated_at: string;
}

// Driver order priority (manual sorting)
export interface DriverOrderPriority {
  id: string;
  driver_user_id: string;
  order_id: string;
  priority_number: number;
  updated_at: string;
}
