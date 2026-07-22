import type { Order, OrderItem } from '@/types/database';
import { sanitizePhoneForWhatsApp } from '@/lib/phone';

export const WHATSAPP_ORDER_TEMPLATE_KEY = 'customer_whatsapp_order_message';

export const DEFAULT_WHATSAPP_ORDER_TEMPLATE = `Hi @name, this is Logistic Admin from Tomu.

Delivery Info
Name: @name
Contact: @phone
Address: @address
Area: @area

Product:
@items

Total Qty: @qty
Price: @price

Delivery will be arranged according to runner route.
Runner will contact you before delivery.

Please choose payment:

COD

Bank Transfer (please inform us for drop-off)

BIBD: 00-008-01-0051019
Baiduri: 0300117734291
Tomu Enterprise`;

export const WHATSAPP_TEMPLATE_TAGS = [
  { tag: '@name', description: 'Customer name' },
  { tag: '@phone', description: 'Customer phone number' },
  { tag: '@address', description: 'Delivery address' },
  { tag: '@area', description: 'Delivery area' },
  { tag: '@ordercode', description: 'Order code' },
  { tag: '@productname', description: 'Product and SKU names' },
  { tag: '@qty', description: 'Total quantity' },
  { tag: '@price', description: 'Amount to collect' },
  { tag: '@items', description: 'One line per product with quantity' },
] as const;

/**
 * Sanitize phone number for WhatsApp.
 * Returns digits with country code.
 */
export function sanitizePhoneNumber(phone: string): string {
  return sanitizePhoneForWhatsApp(phone);
}

/**
 * Check if phone number is valid for WhatsApp.
 */
export function isValidWhatsAppPhone(phone: string): boolean {
  const local = sanitizePhoneNumber(phone);
  return local.length > 0;
}

function formatOrderItemsForWhatsApp(orderItems: OrderItem[] | undefined): string {
  if (!orderItems || orderItems.length === 0) {
    return 'Product x 1';
  }

  return orderItems
    .map(item => {
      const skuCode = item.product?.sku_code || item.sku_label || 'PRODUCT';
      const productName = item.product?.sku_name || 'Unknown';
      return `${skuCode}/${productName} x ${item.qty}`;
    })
    .join('\n');
}

function formatProductNames(orderItems: OrderItem[] | undefined): string {
  if (!orderItems || orderItems.length === 0) {
    return 'Product';
  }

  return orderItems
    .map(item => {
      const skuCode = item.product?.sku_code || item.sku_label || 'PRODUCT';
      const productName = item.product?.sku_name || 'Unknown';
      return `${skuCode}/${productName}`;
    })
    .join(', ');
}

function getTotalQty(orderItems: OrderItem[] | undefined): number {
  if (!orderItems || orderItems.length === 0) return 1;
  return orderItems.reduce((sum, item) => sum + (item.qty || 0), 0);
}

function replaceTemplateTags(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (message, [tag, value]) => message.replaceAll(tag, value),
    template,
  );
}

export function generateWhatsAppMessage(order: Order, templateBody?: string | null): string {
  const customerName = order.customer_name || 'Customer';
  const localPhone = sanitizePhoneNumber(order.phone);
  const displayPhone = localPhone ? `+${localPhone}` : (order.phone || '-');
  const address = order.address || 'Address not provided';
  const area = order.area || 'Area not specified';
  const productInfo = formatOrderItemsForWhatsApp(order.order_items);
  const totalQty = getTotalQty(order.order_items);
  const amount = Number(order.total_amount || 0).toFixed(2);
  const template = templateBody?.trim() || DEFAULT_WHATSAPP_ORDER_TEMPLATE;

  return replaceTemplateTags(template, {
    '@name': customerName,
    '@phone': displayPhone,
    '@address': address,
    '@area': area,
    '@ordercode': order.order_code || '',
    '@productname': formatProductNames(order.order_items),
    '@qty': String(totalQty),
    '@price': `BND ${amount}`,
    '@items': productInfo,
  });
}

export function generateWhatsAppUrl(order: Order, templateBody?: string | null): string | null {
  const phoneDigits = sanitizePhoneNumber(order.phone);

  if (!phoneDigits) {
    return null;
  }

  const message = generateWhatsAppMessage(order, templateBody);
  const encodedMessage = encodeURIComponent(message);

  return `https://api.whatsapp.com/send?phone=${phoneDigits}&text=${encodedMessage}`;
}

export function formatPhoneDisplay(phone: string): string {
  return phone || '-';
}
