import type { Order, OrderItem } from '@/types/database';
import { sanitizePhoneForWhatsApp, isScientificNotation } from '@/lib/phone';

const BRUNEI_COUNTRY_CODE = '673';

/**
 * Sanitize phone number following the exact formula logic:
 * - Remove all non-digits
 * - If starts with "673", strip first 3 digits
 * - Return local number
 * - If scientific notation detected, return empty (corrupted value)
 */
export function sanitizePhoneNumber(phone: string): string {
  return sanitizePhoneForWhatsApp(phone);
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
 * Generate WhatsApp message using the exact template
 */
export function generateWhatsAppMessage(order: Order): string {
  const customerName = order.customer_name || 'Customer';
  const localPhone = sanitizePhoneNumber(order.phone);
  const address = order.address || 'Address not provided';
  const area = order.area || 'Area not specified';
  const productInfo = formatOrderItemsForWhatsApp(order.order_items);
  const amount = Number(order.total_amount || 0).toFixed(0);

  // Updated template with emojis and new format
  const message = `Hi ${customerName} 👋
This is Logistic Admin from Tomu.

📦 Delivery Info
Name: ${customerName}
Contact: +673${localPhone}
Address: ${address}
Area: ${area}

Product: ${productInfo}
Price: BND ${amount}

✅ Delivery will be arranged according to runner route.
📞 Runner will contact you 1 hour before delivery.

💰 Please choose payment:

COD

Bank Transfer (please inform us for drop-off)

BIBD: 00-008-01-0051019
Baiduri: 0300117734291
Tomu Enterprise`;

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
