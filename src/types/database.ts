// Custom types for the application
export type AppRole = 'admin' | 'manager' | 'salesperson' | 'runner';
export type WarehouseType = 'SALESPERSON' | 'RUNNER';
export type PaymentMethod = 'COD' | 'TRANSFER';
export type OrderStatus = 'BOOKING' | 'READY' | 'CANCELLED';
export type RunnerStatus = 'UNASSIGNED' | 'ASSIGNED' | 'TAKEN' | 'DELIVERED' | 'FAILED_DELIVERY';
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
export type MovementType = 'INBOUND' | 'SALE_DEDUCT' | 'ADJUSTMENT' | 'RETURN';
export type ReferenceType = 'INBOUND_ITEM' | 'ORDER_ITEM' | 'MANUAL';
export type AttachmentType = 'transfer_proof' | 'receipt_photo' | 'chat_screenshot' | 'delivery_photo' | 'inbound_photo' | 'other';
export type ClaimBatchStatus = 'ADMIN_ACK_PENDING' | 'CLAIMED';

export interface Profile {
  id: string;
  role: AppRole;
  display_name: string;
  email: string;
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string | null;
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
  payment_method: PaymentMethod;
  salesperson_id: string;
  runner_id: string | null;
  status: OrderStatus;
  expected_pickup_date: string | null;
  total_qty: number;
  total_amount: number;
  runner_status: RunnerStatus;
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
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  salesperson?: Profile;
  runner?: Profile;
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
  runner?: Profile;
  salesperson?: Profile;
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
