// CSV Import/Export utilities

export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  columns: { key: string; header: string; forceText?: boolean }[],
  filename: string
) {
  if (data.length === 0) return;

  const headers = columns.map(c => c.header);
  const rows = data.map(item =>
    columns.map(col => {
      const value = item[col.key];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value).replace(/"/g, '""');
      return String(value).replace(/"/g, '""');
    })
  );

  // Build CSV with forceText support for phone-like columns.
  // forceText columns output as ="value" which Excel interprets as a text formula,
  // preserving leading zeros and + signs.
  const csvContent = [
    headers.map(h => `"${h}"`).join(','),
    ...rows.map(row =>
      row.map((cell, i) => {
        if (columns[i]?.forceText && cell !== '') {
          // Output: "=""value""" — Excel evaluates ="" as formula returning text
          return `"=""${cell}"""`;
        }
        return `"${cell}"`;
      }).join(',')
    )
  ].join('\n');

  // Add UTF-8 BOM so Excel correctly detects encoding
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
}

// Header normalization map - accepts various formats for each field
export const HEADER_ALIASES: Record<string, string[]> = {
  order_ref: ['order_ref', 'orderref', 'order ref', 'order reference', 'orderreference', 'ref', 'reference'],
  order_date: ['order_date', 'orderdate', 'order date', 'date'],
  customer_name: ['customer_name', 'customername', 'customer name', 'customer', 'name', 'cust_name', 'custname'],
  phone: ['phone', 'phone_number', 'phonenumber', 'phone number', 'tel', 'telephone', 'mobile', 'contact'],
  address: ['address', 'delivery_address', 'deliveryaddress', 'delivery address', 'addr'],
  area: ['area', 'region', 'zone', 'district', 'location'],
  channel: ['channel', 'sales_channel', 'saleschannel', 'sales channel', 'source'],
  payment_method: ['payment_method', 'paymentmethod', 'payment method', 'payment', 'pay_method', 'paymethod'],
  expected_pickup_date: ['expected_pickup_date', 'expectedpickupdate', 'expected pickup date', 'pickup_date', 'pickupdate', 'pickup date', 'delivery_date', 'deliverydate', 'delivery date'],
  notes: ['notes', 'note', 'remarks', 'remark', 'comment', 'comments'],
  sku_name_or_code: ['sku_name_or_code', 'skunameorcode', 'sku name or code', 'sku', 'sku_code', 'skucode', 'sku code', 'sku_name', 'skuname', 'sku name', 'product', 'product_code', 'productcode', 'product code', 'item'],
  qty: ['qty', 'quantity', 'count', 'amount', 'units'],
  price: ['price', 'unit_price', 'unitprice', 'unit price', 'line_amount', 'lineamount', 'line amount', 'total', 'line_total', 'linetotal', 'line total'],
};

function normalizeHeader(header: string): string {
  const normalized = header.toLowerCase().trim().replace(/[\s_-]+/g, ' ').replace(/\s+/g, ' ');
  
  for (const [standardName, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some(alias => alias === normalized || alias === normalized.replace(/\s/g, '_') || alias === normalized.replace(/\s/g, ''))) {
      return standardName;
    }
  }
  
  // Default: convert to snake_case
  return normalized.replace(/\s+/g, '_');
}

/**
 * RFC-4180 compliant CSV parser that handles:
 * - Quoted fields with embedded newlines
 * - Escaped quotes (doubled quotes)
 * - Mixed quoted/unquoted fields
 */
function parseCSVContent(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];
    
    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote ""
          currentField += '"';
          i++;
        } else {
          // End of quoted field
          inQuotes = false;
        }
      } else {
        // Any character inside quotes (including newlines)
        currentField += char;
      }
    } else {
      if (char === '"') {
        // Start of quoted field
        inQuotes = true;
      } else if (char === ',') {
        // Field separator
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        // Row separator (handle \r\n)
        if (char === '\r') i++; // Skip \n in \r\n
        currentRow.push(currentField.trim());
        if (currentRow.length > 0 && currentRow.some(f => f)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else if (char !== '\r') {
        // Regular character (ignore lone \r)
        currentField += char;
      }
    }
  }
  
  // Handle last field/row if file doesn't end with newline
  currentRow.push(currentField.trim());
  if (currentRow.length > 0 && currentRow.some(f => f)) {
    rows.push(currentRow);
  }
  
  return rows;
}

export function parseCSV(csvText: string): Record<string, string>[] {
  const allRows = parseCSVContent(csvText);
  if (allRows.length < 2) return [];

  const rawHeaders = allRows[0];
  const headers = rawHeaders.map(normalizeHeader);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < allRows.length; i++) {
    const values = allRows[i];
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    rows.push(row);
  }

  return rows;
}

// Parse CSV without normalizing headers - returns raw headers and rows
export function parseCSVRaw(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  const allRows = parseCSVContent(csvText);
  if (allRows.length < 2) return { headers: [], rows: [] };

  const headers = allRows[0];
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < allRows.length; i++) {
    const values = allRows[i];
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    rows.push(row);
  }

  return { headers, rows };
}

// Keep for single-line parsing (used in exports)
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

export function downloadTemplate(type: 'orders' | 'order_lines' | 'delivery_result') {
  const templates = {
    orders: 'order_ref,customer_name,phone,address,area,channel,payment_method,expected_pickup_date,notes\n"ORD-001","John Doe","555-1234","123 Main St","Downtown","Website","COD","2024-01-15","Rush order"',
    order_lines: 'order_ref,order_date,customer_name,phone,address,area,channel,payment_method,expected_pickup_date,notes,sku_name_or_code,qty,price\n"ORD-001","2024-01-15","John Doe","555-1234","123 Main St","Downtown","Website","COD","2024-01-20","","Widget A",2,29.99\n"ORD-001","2024-01-15","John Doe","555-1234","123 Main St","Downtown","Website","COD","2024-01-20","","Widget B",1,49.99\n"ORD-002","2024-01-15","Jane Smith","555-5678","456 Oak Ave","Uptown","Social","TRANSFER","2024-01-21","Gift order","Premium Pack",1,99.99',
    delivery_result: 'ORDER CODE,STATUS,REMARK\n"ORD-001","DELIVERED",""\n"ORD-002","FAILED","Customer not at home"\n"ORD-003","DELIVERED",""\n"ORD-004","FAILED","Wrong address"',
  };

  const blob = new Blob([templates[type]], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${type}_template.csv`;
  link.click();
}

// Export order lines (one row per order item) - with extended fields for salesperson/runner
export interface OrderLineExport {
  order_ref: string;
  order_id: string;
  order_date: string;
  imported_timestamp: string;
  customer_name: string;
  phone: string;
  address: string;
  area: string;
  channel: string;
  payment_method: string;
  expected_pickup_date: string;
  notes: string;
  salesperson_name: string;
  runner_name: string;
  status: string;
  runner_status: string;
  reconciliation_status: string;
  failed_reason: string;
  failed_remark: string;
  next_delivery_date: string;
  sku_code: string;
  sku_name: string;
  item_qty: number;
  item_unit_price: number;
  item_line_total: number;
  order_total: number;
  delivered_timestamp: string;
  driver_name: string;
}

export function exportOrderLines(
  orders: any[],
  filename: string
) {
  const lines: OrderLineExport[] = [];
  
  for (const order of orders) {
    const orderItems = order.order_items || [];
    
    if (orderItems.length === 0) {
      // Export order with empty item line
      // Use salesperson display name from profile, fall back to snapshot if missing
      const salespersonName = order.salesperson?.display_name || order.created_by_name_snapshot || 'Deleted User';
      lines.push({
        order_ref: order.order_code || '',
        order_id: order.id,
        order_date: order.order_date || '',
        imported_timestamp: order.created_at || '',
        customer_name: order.customer_name || '',
        phone: order.phone || '',
        address: order.address || '',
        area: order.area || '',
        channel: order.channel || '',
        payment_method: order.payment_method || '',
        expected_pickup_date: order.expected_pickup_date || '',
        notes: order.notes || '',
        salesperson_name: salespersonName,
        runner_name: order.runner?.display_name || '',
        driver_name: order.driver?.display_name || '',
        status: order.status || '',
        runner_status: order.runner_status || '',
        reconciliation_status: order.reconciliation_status || '',
        failed_reason: order.failed_reason || '',
        failed_remark: order.failed_remark || '',
        next_delivery_date: order.next_delivery_date || '',
        delivered_timestamp: order.delivered_at || order.driver_delivered_at || '',
        sku_code: '',
        sku_name: '',
        item_qty: 0,
        item_unit_price: 0,
        item_line_total: 0,
        order_total: order.total_amount != null ? Number(order.total_amount) : 0,
      });
    } else {
      // Export one line per order item
      const salespersonName = order.salesperson?.display_name || order.created_by_name_snapshot || 'Deleted User';
      for (const item of orderItems) {
        lines.push({
          order_ref: order.order_code || '',
          order_id: order.id,
          order_date: order.order_date || '',
          imported_timestamp: order.created_at || '',
          customer_name: order.customer_name || '',
          phone: order.phone || '',
          address: order.address || '',
          area: order.area || '',
          channel: order.channel || '',
          payment_method: order.payment_method || '',
          expected_pickup_date: order.expected_pickup_date || '',
          notes: order.notes || '',
          salesperson_name: salespersonName,
          runner_name: order.runner?.display_name || '',
          driver_name: order.driver?.display_name || '',
          status: order.status || '',
          runner_status: order.runner_status || '',
          reconciliation_status: order.reconciliation_status || '',
          failed_reason: order.failed_reason || '',
          failed_remark: order.failed_remark || '',
          next_delivery_date: order.next_delivery_date || '',
          delivered_timestamp: order.delivered_at || order.driver_delivered_at || '',
          sku_code: item.product?.sku_code || '',
          sku_name: item.product?.sku_name || item.sku_label || '',
          item_qty: item.qty != null ? Number(item.qty) : 0,
          item_unit_price: item.price != null ? Number(item.price) : 0,
          item_line_total: item.line_total != null ? Number(item.line_total) : 0,
          order_total: order.total_amount != null ? Number(order.total_amount) : 0,
        });
      }
    }
  }

  const columns = [
    { key: 'order_ref', header: 'order_ref' },
    { key: 'order_id', header: 'order_id' },
    { key: 'order_date', header: 'order_date' },
    { key: 'imported_timestamp', header: 'imported_timestamp' },
    { key: 'customer_name', header: 'customer_name' },
    { key: 'phone', header: 'phone', forceText: true },
    { key: 'address', header: 'address' },
    { key: 'area', header: 'area' },
    { key: 'channel', header: 'channel' },
    { key: 'payment_method', header: 'payment_method' },
    { key: 'expected_pickup_date', header: 'expected_pickup_date' },
    { key: 'notes', header: 'notes' },
    { key: 'salesperson_name', header: 'salesperson_name' },
    { key: 'runner_name', header: 'runner_name' },
    { key: 'driver_name', header: 'driver_name' },
    { key: 'status', header: 'status' },
    { key: 'runner_status', header: 'runner_status' },
    { key: 'reconciliation_status', header: 'reconciliation_status' },
    { key: 'failed_reason', header: 'failed_reason' },
    { key: 'failed_remark', header: 'failed_remark' },
    { key: 'next_delivery_date', header: 'next_delivery_date' },
    { key: 'delivered_timestamp', header: 'delivered_timestamp' },
    { key: 'sku_code', header: 'sku_code' },
    { key: 'sku_name', header: 'sku_name' },
    { key: 'item_qty', header: 'item_qty' },
    { key: 'item_unit_price', header: 'item_unit_price' },
    { key: 'item_line_total', header: 'item_line_total' },
    { key: 'order_total', header: 'order_total' },
  ];

  exportToCSV(lines as any, columns, filename);
}

// Export selected orders only (as order lines)
export function exportSelectedOrderLines(
  orders: any[],
  selectedIds: string[],
  filename: string
) {
  if (selectedIds.length === 0) {
    return false;
  }
  const selectedOrders = orders.filter(o => selectedIds.includes(o.id));
  exportOrderLines(selectedOrders, filename);
  return true;
}

// Runner simplified export - one row per item with minimal columns
export interface RunnerOrderLineExport {
  order_ref: string;
  customer_name: string;
  phone: string;
  address: string;
  area: string;
  payment_method: string;
  notes: string;
  salesperson_name: string;
  sku_code: string;
  sku_name: string;
  item_qty: number;
  item_unit_price: number;
  item_line_total: number;
  order_total: number;
}

export function exportRunnerOrderLines(
  orders: any[],
  filename: string
) {
  const lines: RunnerOrderLineExport[] = [];
  
  for (const order of orders) {
    const orderItems = order.order_items || [];
    
    if (orderItems.length === 0) {
      // Export order with empty item line
      lines.push({
        order_ref: order.order_code || '',
        customer_name: order.customer_name || '',
        phone: order.phone || '',
        address: order.address || '',
        area: order.area || '',
        payment_method: order.payment_method || '',
        notes: order.notes || '',
        salesperson_name: order.salesperson?.display_name || '',
        sku_code: 'UNKNOWN',
        sku_name: 'UNKNOWN',
        item_qty: 0,
        item_unit_price: 0,
        item_line_total: 0,
        order_total: order.total_amount != null ? Number(order.total_amount) : 0,
      });
    } else {
      // Export one line per order item
      for (const item of orderItems) {
        // Get SKU code - fallback to sku_label if product not linked
        const skuCode = item.product?.sku_code || item.sku_label || 'UNKNOWN';
        // Get SKU name - fallback to sku_label if product not linked
        const skuName = item.product?.sku_name || item.sku_label || 'UNKNOWN';

        lines.push({
          order_ref: order.order_code || '',
          customer_name: order.customer_name || '',
          phone: order.phone || '',
          address: order.address || '',
          area: order.area || '',
          payment_method: order.payment_method || '',
          notes: order.notes || '',
          salesperson_name: order.salesperson?.display_name || '',
          sku_code: skuCode,
          sku_name: skuName,
          item_qty: item.qty != null ? Number(item.qty) : 0,
          item_unit_price: item.price != null ? Number(item.price) : 0,
          item_line_total: item.line_total != null ? Number(item.line_total) : 0,
          order_total: order.total_amount != null ? Number(order.total_amount) : 0,
        });
      }
    }
  }

  const columns = [
    { key: 'order_ref', header: 'order_ref' },
    { key: 'customer_name', header: 'customer_name' },
    { key: 'phone', header: 'phone', forceText: true },
    { key: 'address', header: 'address' },
    { key: 'area', header: 'area' },
    { key: 'payment_method', header: 'payment_method' },
    { key: 'notes', header: 'notes' },
    { key: 'salesperson_name', header: 'salesperson_name' },
    { key: 'sku_code', header: 'sku_code' },
    { key: 'sku_name', header: 'sku_name' },
    { key: 'item_qty', header: 'item_qty' },
    { key: 'item_unit_price', header: 'item_unit_price' },
    { key: 'item_line_total', header: 'item_line_total' },
    { key: 'order_total', header: 'order_total' },
  ];

  exportToCSV(lines as any, columns, filename);
}

// Export selected orders for runners (simplified format)
export function exportSelectedRunnerOrderLines(
  orders: any[],
  selectedIds: string[],
  filename: string
) {
  if (selectedIds.length === 0) {
    return false;
  }
  const selectedOrders = orders.filter(o => selectedIds.includes(o.id));
  exportRunnerOrderLines(selectedOrders, filename);
  return true;
}

// Delivered orders export - one row per order with combined items
export interface DeliveredOrderExport {
  order_ref: string;
  customer_name: string;
  phone: string;
  address: string;
  area: string;
  salesperson_name: string;
  delivered_timestamp: string;
  items: string;
  total_qty: number;
  total_amount: number;
  payment_method: string;
  delivery_charges: number;
}

export function exportDeliveredOrderLines(
  orders: any[],
  deliveryChargesMap: Map<string, number>, // key: "runnerId:area" -> charge
  filename: string
) {
  const lines: DeliveredOrderExport[] = [];
  
  for (const order of orders) {
    const orderItems = order.order_items || [];
    const chargeKey = `${order.runner_id}:${order.area || ''}`;
    const deliveryCharge = deliveryChargesMap.get(chargeKey) || 0;
    
    // Combine all items into a single readable string and sum qty
    let itemsSummary = '';
    let totalQty = 0;
    
    if (orderItems.length > 0) {
      const itemParts: string[] = [];
      for (const item of orderItems) {
        const skuName = item.product?.sku_name || item.sku_label || 'Unknown';
        const qty = item.qty || 0;
        totalQty += qty;
        itemParts.push(`${skuName} x ${qty}`);
      }
      itemsSummary = itemParts.join('; ');
    }
    
    lines.push({
      order_ref: order.order_code || '',
      customer_name: order.customer_name || '',
      phone: order.phone || '',
      address: order.address || '',
      area: order.area || '',
      salesperson_name: order.salesperson?.display_name || order.created_by_name_snapshot || '',
      delivered_timestamp: order.delivered_at || order.driver_delivered_at || '',
      items: itemsSummary,
      total_qty: totalQty,
      total_amount: Number(order.total_amount) || 0,
      payment_method: order.payment_method || '',
      delivery_charges: deliveryCharge,
    });
  }

  const columns = [
    { key: 'order_ref', header: 'order_ref' },
    { key: 'customer_name', header: 'customer_name' },
    { key: 'phone', header: 'phone', forceText: true },
    { key: 'address', header: 'address' },
    { key: 'area', header: 'area' },
    { key: 'salesperson_name', header: 'salesperson_name' },
    { key: 'delivered_timestamp', header: 'delivered_timestamp' },
    { key: 'items', header: 'items' },
    { key: 'total_qty', header: 'qty' },
    { key: 'total_amount', header: 'total_amount' },
    { key: 'payment_method', header: 'payment_method' },
    { key: 'delivery_charges', header: 'delivery_charges' },
  ];

  exportToCSV(lines as any, columns, filename);
}
