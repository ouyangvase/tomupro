import type { Order, OrderItem } from '@/types/database';

const BRUNEI_COUNTRY_CODE = '673';

/**
 * Sanitize phone number following the exact formula logic:
 * - Remove all non-digits
 * - If starts with "673", strip first 3 digits
 * - Return local number
 */
export function sanitizePhoneNumber(phone: string): string {
  // Remove all non-digits
  let digits = (phone || '').replace(/\D/g, '');
  
  // If starts with "673", strip the first 3 digits
  if (digits.startsWith('673')) {
    digits = digits.slice(3);
  }
  
  return digits;
}

/**
 * Check if phone number is valid for WhatsApp
 */
export function isValidWhatsAppPhone(phone: string): boolean {
  const local = sanitizePhoneNumber(phone);
  return local.length > 0;
}

/**
 * Format order items for WhatsApp message
 * Returns format: "SKU/ProductName × Qty unit"
 */
function formatOrderItemsForWhatsApp(orderItems: OrderItem[] | undefined): string {
  if (!orderItems || orderItems.length === 0) {
    return 'Product × 1 unit';
  }

  const formattedItems = orderItems.map(item => {
    const skuCode = item.product?.sku_code || item.sku_label || 'PRODUCT';
    const productName = item.product?.sku_name || 'Unknown';
    return `${skuCode}/${productName} × ${item.qty} unit`;
  });

  return formattedItems.join('\n');
}

/**
 * Get total quantity from order items
 */
function getTotalQty(orderItems: OrderItem[] | undefined): number {
  if (!orderItems || orderItems.length === 0) return 1;
  return orderItems.reduce((sum, item) => sum + (item.qty || 0), 0);
}

/**
 * Generate WhatsApp message using the exact template from the formula
 */
export function generateWhatsAppMessage(order: Order): string {
  const customerName = order.customer_name || 'Customer';
  const localPhone = sanitizePhoneNumber(order.phone);
  const address = order.address || 'Address not provided';
  const area = order.area || 'Area not specified';
  const productInfo = formatOrderItemsForWhatsApp(order.order_items);
  const amount = Number(order.total_amount || 0).toFixed(0);

  // Exact template as specified
  const message = `Hi, this is runner Logistic Admin.

${customerName} - +${localPhone}

Address: ${address}

Area: ${area}

Product: ${productInfo}

Price: ${amount} BND

Can I arrange delivery for you TOMORROW?

Runner will deliver between 8am–5pm.

Before delivery, the runner will call to confirm.

Would you like COD or Bank Transfer?

If Transfer:

*BIBD BANK*
Tomu Enterprise
Acc: 00-008-01-0051019

*Baiduri Bank*
Tomu Enterprise
Acc: 0300117734291`;

  return message;
}

/**
 * Generate WhatsApp URL for an order
 * Uses api.whatsapp.com/send format as specified
 */
export function generateWhatsAppUrl(order: Order): string | null {
  const local = sanitizePhoneNumber(order.phone);
  
  if (!local) {
    return null;
  }
  
  const message = generateWhatsAppMessage(order);
  const encodedMessage = encodeURIComponent(message);
  
  return `https://api.whatsapp.com/send?phone=${BRUNEI_COUNTRY_CODE}${local}&text=${encodedMessage}`;
}

/**
 * Format phone for display (unchanged)
 */
export function formatPhoneDisplay(phone: string): string {
  return phone || '-';
}
