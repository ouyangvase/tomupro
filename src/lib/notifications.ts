import { supabase } from '@/integrations/supabase/client';

type NotificationType = 
  | 'BOOKING_DUE' 
  | 'RUNNER_ASSIGNED' 
  | 'DELIVERED' 
  | 'CLAIM_SUBMITTED' 
  | 'CLAIM_ACKED' 
  | 'DISPUTE' 
  | 'INBOUND_PENDING' 
  | 'INBOUND_ACKED' 
  | 'ORDER_READY'
  | 'DAILY_DIGEST';

type Priority = 'LOW' | 'MEDIUM' | 'HIGH';

interface CreateNotificationParams {
  recipientUserId?: string;
  recipientRole?: string;
  title: string;
  message: string;
  body?: string;
  type: NotificationType;
  entityType?: string;
  entityId?: string;
  priority?: Priority;
}

export async function createNotification(params: CreateNotificationParams) {
  const { 
    recipientUserId, 
    recipientRole, 
    title, 
    message, 
    body,
    type, 
    entityType, 
    entityId, 
    priority = 'MEDIUM' 
  } = params;

  // Must have either user ID or role
  if (!recipientUserId && !recipientRole) {
    console.error('createNotification: must provide recipientUserId or recipientRole');
    return null;
  }

  const { data, error } = await supabase.from('notifications').insert({
    user_id: recipientUserId || '00000000-0000-0000-0000-000000000000', // placeholder for role-based
    recipient_role: recipientRole,
    title,
    message,
    body,
    type,
    entity_type: entityType,
    reference_type: entityType,
    reference_id: entityId,
    priority,
    is_read: false,
  }).select().single();

  if (error) {
    console.error('Failed to create notification:', error);
    return null;
  }

  return data;
}

// Notify when order becomes READY and runner is assigned
export async function notifyRunnerAssigned(orderId: string, runnerId: string, customerName: string, area: string | null) {
  await createNotification({
    recipientUserId: runnerId,
    title: 'New Delivery Assigned',
    message: `New delivery assigned: ${customerName}${area ? ` (${area})` : ''}`,
    type: 'RUNNER_ASSIGNED',
    entityType: 'ORDER',
    entityId: orderId,
    priority: 'MEDIUM',
  });
}

// Notify salesperson when order is sent to runner
export async function notifyOrderSentToRunner(orderId: string, salespersonId: string, runnerName: string) {
  await createNotification({
    recipientUserId: salespersonId,
    title: 'Order Sent to Runner',
    message: `Order has been assigned to runner: ${runnerName}`,
    type: 'ORDER_READY',
    entityType: 'ORDER',
    entityId: orderId,
    priority: 'LOW',
  });
}

// Notify salesperson when order is delivered
export async function notifyOrderDelivered(orderId: string, salespersonId: string, customerName: string) {
  await createNotification({
    recipientUserId: salespersonId,
    title: 'Order Delivered',
    message: `Delivered: ${customerName}. Stock deducted from warehouse.`,
    type: 'DELIVERED',
    entityType: 'ORDER',
    entityId: orderId,
    priority: 'MEDIUM',
  });
}

// Notify admin when claim batch submitted
export async function notifyClaimBatchSubmitted(batchId: string, runnerName: string, orderCount: number, totalAmount: number) {
  // Notify all admins
  const { data: admins } = await supabase
    .from('user_directory')
    .select('id')
    .eq('role', 'admin');

  for (const admin of admins || []) {
    await createNotification({
      recipientUserId: admin.id,
      title: 'Claim Batch Submitted',
      message: `Runner ${runnerName} submitted claim batch: ${orderCount} orders, total RM${totalAmount.toLocaleString()}`,
      type: 'CLAIM_SUBMITTED',
      entityType: 'CLAIM_BATCH',
      entityId: batchId,
      priority: 'HIGH',
    });
  }
}

// Notify on dispute
export async function notifyDispute(orderId: string, reason: string, salespersonId: string, runnerId: string | null) {
  // Notify admins
  const { data: admins } = await supabase
    .from('user_directory')
    .select('id')
    .eq('role', 'admin');

  for (const admin of admins || []) {
    await createNotification({
      recipientUserId: admin.id,
      title: 'Dispute Raised',
      message: `Dispute raised: ${reason}`,
      type: 'DISPUTE',
      entityType: 'ORDER',
      entityId: orderId,
      priority: 'HIGH',
    });
  }

  // Notify salesperson
  await createNotification({
    recipientUserId: salespersonId,
    title: 'Order Dispute',
    message: `Dispute on order: ${reason}`,
    type: 'DISPUTE',
    entityType: 'ORDER',
    entityId: orderId,
    priority: 'HIGH',
  });

  // Notify runner if assigned
  if (runnerId) {
    await createNotification({
      recipientUserId: runnerId,
      title: 'Dispute Attention Required',
      message: `Dispute requires attention: ${reason}`,
      type: 'DISPUTE',
      entityType: 'ORDER',
      entityId: orderId,
      priority: 'MEDIUM',
    });
  }
}

// Notify salesperson when inbound shipment is pending
export async function notifyInboundPending(inboundId: string, salespersonId: string, trackingNo: string) {
  await createNotification({
    recipientUserId: salespersonId,
    title: 'Inbound Pending Acknowledgment',
    message: `Inbound pending your acknowledgment: Tracking ${trackingNo}`,
    type: 'INBOUND_PENDING',
    entityType: 'INBOUND',
    entityId: inboundId,
    priority: 'MEDIUM',
  });
}

// Notify runner when inbound is acknowledged
export async function notifyInboundAcknowledged(inboundId: string, runnerId: string) {
  await createNotification({
    recipientUserId: runnerId,
    title: 'Inbound Acknowledged',
    message: 'Inbound shipment has been acknowledged by salesperson.',
    type: 'INBOUND_ACKED',
    entityType: 'INBOUND',
    entityId: inboundId,
    priority: 'LOW',
  });
}
