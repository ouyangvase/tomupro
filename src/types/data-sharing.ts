export interface UserDataShare {
  id: string;
  viewer_user_id: string;
  subject_user_id: string;
  scope_orders: boolean;
  scope_products: boolean;
  scope_stock_balance: boolean;
  scope_inbound: boolean;
  can_operate: boolean;
  active: boolean;
  created_by_admin_id: string;
  created_at: string;
  updated_at: string;
  viewer?: { id: string; display_name: string; email: string | null; role: string };
  subject?: { id: string; display_name: string; email: string | null; role: string };
  created_by?: { id: string; display_name: string };
}

export interface AccessAuditLog {
  id: string;
  actor_user_id: string;
  subject_user_id: string | null;
  action_type: string;
  resource_type: string;
  resource_id: string | null;
  share_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor?: { id: string; display_name: string };
  subject?: { id: string; display_name: string };
}

export type DataScope = 'orders' | 'products' | 'stock' | 'inbound';
export type DataViewMode = 'my_data' | 'shared' | 'all_accessible';

export interface SharedAccessInfo {
  subjectId: string;
  subjectName: string;
  canOperate: boolean;
  scopes: {
    orders: boolean;
    products: boolean;
    stock: boolean;
    inbound: boolean;
  };
}
