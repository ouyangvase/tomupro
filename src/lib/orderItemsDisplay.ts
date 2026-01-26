// Helper utilities for displaying order items in a standardized format

import type { OrderItem } from '@/types/database';

/**
 * Get SKU code from order item - prefers product.sku_code, falls back to sku_label
 */
function getSkuCode(item: OrderItem): string {
  // First try the linked product's sku_code
  if (item.product?.sku_code) {
    return item.product.sku_code;
  }
  // Fall back to sku_label if available
  if (item.sku_label) {
    return item.sku_label;
  }
  return 'UNKNOWN';
}

/**
 * Get product name from order item
 */
function getProductName(item: OrderItem): string {
  // First try the linked product's sku_name
  if (item.product?.sku_name) {
    return item.product.sku_name;
  }
  // If sku_label exists and is different from sku_code, might be product name
  // Otherwise return UNKNOWN
  return 'UNKNOWN';
}

/**
 * Format a single order item for display
 * Returns format: "SKU_CODE/PRODUCT_NAME × QTY"
 */
function formatSingleItem(item: OrderItem): string {
  const skuCode = getSkuCode(item);
  const productName = getProductName(item);
  return `${skuCode}/${productName} × ${item.qty}`;
}

/**
 * Format order items for display in data grids
 * Returns format: "TY04/MACHINE × 1, TY03/CONDOM × 2" or with "+N more" for long lists
 */
export function formatOrderItemsDisplay(orderItems: OrderItem[] | undefined): {
  displayText: string;
  fullText: string;
  hasError: boolean;
  errorMessage?: string;
} {
  if (!orderItems || orderItems.length === 0) {
    return {
      displayText: 'No items',
      fullText: 'No items - order may need repair',
      hasError: true,
      errorMessage: 'This order has no items. Please edit and add items.',
    };
  }

  // Check for missing product data and log errors
  const itemsWithMissingData = orderItems.filter(
    item => !item.product?.sku_code || !item.product?.sku_name
  );
  
  if (itemsWithMissingData.length > 0) {
    console.warn('Order items missing product data:', itemsWithMissingData.map(i => ({
      id: i.id,
      product_id: i.product_id,
      sku_label: i.sku_label,
    })));
  }

  // Format all items in a single line, comma-separated
  const formattedItems = orderItems.map(item => formatSingleItem(item));
  const displayText = formattedItems.join(', ');

  return {
    displayText,
    fullText: displayText,
    hasError: itemsWithMissingData.length > 0,
    errorMessage: itemsWithMissingData.length > 0 
      ? `${itemsWithMissingData.length} item(s) missing product data`
      : undefined,
  };
}

/**
 * Get total quantity from order items
 */
export function getTotalQuantity(orderItems: OrderItem[] | undefined): number {
  if (!orderItems || orderItems.length === 0) return 0;
  return orderItems.reduce((sum, item) => sum + (item.qty || 0), 0);
}
