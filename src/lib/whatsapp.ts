import type { Order } from '@/types/database';
import { format, parseISO } from 'date-fns';

const BRUNEI_COUNTRY_CODE = '673';

/**
 * Get the day name from a date string
 */
function getDayName(dateString: string): string {
  try {
    const date = parseISO(dateString);
    return format(date, 'EEEE'); // Monday, Tuesday, etc.
  } catch {
    return dateString;
  }
}

/**
 * Format product items for WhatsApp message
 */
function formatProductItems(order: Order): string {
  const items = order.order_items || [];
  if (items.length === 0) {
    return 'Product     1 unit';
  }

  // Join multiple products with comma
  const productNames = items
    .map(item => item.sku_label || 'Product')
    .join(', ');
  
  const totalQty = items.reduce((sum, item) => sum + (item.qty || 1), 0);
  
  return `${productNames}     ${totalQty} unit`;
}

/**
 * Generate WhatsApp message for an order following the exact Excel format
 */
export function generateWhatsAppMessage(order: Order): string {
  const customerName = order.customer_name || '';
  const customerPhone = order.phone || '';
  const address = order.address || '';
  const area = order.area || '';
  const productInfo = formatProductItems(order);
  const amount = Number(order.total_amount || 0).toFixed(0);
  
  // Get delivery day - use day name if expected_pickup_date exists, otherwise raw date
  const deliveryDay = order.expected_pickup_date 
    ? getDayName(order.expected_pickup_date)
    : order.next_delivery_date 
      ? getDayName(order.next_delivery_date)
      : 'your preferred day';

  // Build the message following the Excel CHAR(10) line break format
  const message = `Hi

${customerName}  ${customerPhone}

${address}     ${area}

${productInfo}     ${amount} bnd

This is TOMU admin.

Can we arrange delivery on ${deliveryDay}?`;

  return message;
}

/**
 * Generate WhatsApp URL for an order (Runner only)
 */
export function generateWhatsAppUrl(order: Order): string {
  const phone = (order.phone || '').replace(/\D/g, ''); // Remove non-digits
  const message = generateWhatsAppMessage(order);
  const encodedMessage = encodeURIComponent(message);
  
  return `https://wa.me/${BRUNEI_COUNTRY_CODE}${phone}?text=${encodedMessage}`;
}

/**
 * Clean phone number for display
 */
export function formatPhoneDisplay(phone: string): string {
  return phone || '-';
}
