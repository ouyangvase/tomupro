// Stock visibility types
export interface ManagerGroup {
  id: string;
  name: string;
  manager_user_id: string;
  created_at: string;
  manager?: {
    id: string;
    display_name: string;
    email: string;
  };
  members?: GroupMember[];
}

export interface GroupMember {
  id: string;
  group_id: string;
  member_user_id: string;
  created_at: string;
  member?: {
    id: string;
    display_name: string;
    email: string;
    role: string;
  };
}

export interface StockVisibilityOverride {
  id: string;
  viewer_user_id: string;
  owner_user_id: string;
  can_view: boolean;
  created_by: string;
  created_at: string;
  viewer?: {
    id: string;
    display_name: string;
    email: string;
  };
  owner?: {
    id: string;
    display_name: string;
    email: string;
  };
}

export type TransferStatus = 'draft' | 'pending_manager_approval' | 'approved' | 'rejected' | 'applied' | 'cancelled';

export interface StockTransfer {
  id: string;
  from_owner_id: string;
  to_owner_id: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  // New approval workflow fields
  status: TransferStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  offboarding_transfer: boolean;
  from_owner?: {
    id: string;
    display_name: string;
  };
  to_owner?: {
    id: string;
    display_name: string;
  };
  from_warehouse?: {
    id: string;
    name: string;
  };
  to_warehouse?: {
    id: string;
    name: string;
  };
  items?: StockTransferItem[];
}

export interface StockTransferItem {
  id: string;
  transfer_id?: string;
  product_id: string;
  qty: number;
  created_at?: string;
  product?: {
    id: string;
    sku_code: string | null;
    sku_name: string;
  };
}

export interface TransferItemInput {
  product_id: string;
  qty: number;
}
