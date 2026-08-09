export type DeliveryChargeStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface DeliveryCharge {
  id: string;
  runner_id: string;
  area: string;
  charge_amount: number;
  status: DeliveryChargeStatus;
  proposed_by: string;
  approved_by: string | null;
  approved_at: string | null;
  rejection_remark: string | null;
  superseded_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  runner?: {
    id: string;
    display_name: string;
  };
  proposer?: {
    id: string;
    display_name: string;
  };
  approver?: {
    id: string;
    display_name: string;
  };
}
