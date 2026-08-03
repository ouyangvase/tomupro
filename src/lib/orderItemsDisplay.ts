// Helper utilities for displaying order items in a standardized format

import type { OrderItem } from '@/types/database';

/**
 * Get SKU code from order item - prefers product.sku_code, falls back to sku_label
 */
function getSkuCode(item: OrderItem): string {
  return item.product?.sku_code || item.sku_label || 'UNKNOWN';
}

/**
 * Get product name from order item
 */
function getProductName(item: OrderItem): string {
  return item.product?.sku_name || 'UNKNOWN';
}

/**
 * Format a single order item for display
 * Returns format: "SKU_CODE/PRODUCT_NAME x QTY"
 */
function formatSingleItem(item: OrderItem): string {
  const skuCode = getSkuCode(item);
  const productName = getProductName(item);
  const label = productName === 'UNKNOWN' || productName === skuCode
    ? skuCode
    : `${skuCode}/${productName}`;

  return `${label} x ${item.qty}`;
}

/**
 * Format order items for display in data grids
 * Returns format: "TY04/MACHINE x 1, TY03/CONDOM x 2"
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
      fullText: 'No items',
      hasError: false,
    };
  }

  // The saved SKU label is the immutable order snapshot when product access is unavailable.
  const itemsWithMissingData = orderItems.filter(
    item => !item.product?.sku_code && !item.sku_label
  );

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
