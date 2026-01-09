// Helper utilities for displaying order items in a standardized format

import type { OrderItem } from '@/types/database';

/**
 * Get SKU code from order item - prefers product.sku_code, falls back to sku_label
 */
function getSkuCode(item: OrderItem): string | null {
  // First try the linked product's sku_code
  if (item.product?.sku_code) {
    return item.product.sku_code;
  }
  // Fall back to sku_label if it looks like a SKU code (not a product name)
  if (item.sku_label) {
    return item.sku_label;
  }
  return null;
}

/**
 * Format order items for display in data grids
 * Returns format: "TY03 × 1, TY02 × 2" or appropriate error/placeholder
 */
export function formatOrderItemsDisplay(orderItems: OrderItem[] | undefined): {
  displayText: string;
  hasError: boolean;
  errorMessage?: string;
} {
  if (!orderItems || orderItems.length === 0) {
    return {
      displayText: 'No items',
      hasError: false,
    };
  }

  // Check for missing SKU codes
  const missingSkuItems = orderItems.filter(item => !getSkuCode(item));

  if (missingSkuItems.length > 0) {
    console.error('Order items missing SKU code:', missingSkuItems);
    return {
      displayText: `${orderItems.length} item(s) - SKU missing`,
      hasError: true,
      errorMessage: `${missingSkuItems.length} item(s) missing SKU code`,
    };
  }

  // Format: "TY03 × 1, TY02 × 2"
  const formattedItems = orderItems.map(item => {
    const skuCode = getSkuCode(item) || 'Unknown';
    return `${skuCode} × ${item.qty}`;
  });

  return {
    displayText: formattedItems.join(', '),
    hasError: false,
  };
}

/**
 * Get total quantity from order items
 */
export function getTotalQuantity(orderItems: OrderItem[] | undefined): number {
  if (!orderItems || orderItems.length === 0) return 0;
  return orderItems.reduce((sum, item) => sum + (item.qty || 0), 0);
}
