// CSV Import/Export utilities

export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  columns: { key: string; header: string }[],
  filename: string
) {
  if (data.length === 0) return;

  const headers = columns.map(c => c.header);
  const rows = data.map(item =>
    columns.map(col => {
      const value = item[col.key];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value).replace(/"/g, '""');
    })
  );

  const csvContent = [
    headers.map(h => `"${h}"`).join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
}

// Header normalization map - accepts various formats for each field
const HEADER_ALIASES: Record<string, string[]> = {
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

export function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  const rawHeaders = parseCSVLine(lines[0]);
  const headers = rawHeaders.map(normalizeHeader);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    rows.push(row);
  }

  return rows;
}

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

export function downloadTemplate(type: 'orders' | 'order_lines') {
  const templates = {
    orders: 'order_ref,customer_name,phone,address,area,channel,payment_method,expected_pickup_date,notes\n"ORD-001","John Doe","555-1234","123 Main St","Downtown","Website","COD","2024-01-15","Rush order"',
    order_lines: 'order_ref,order_date,customer_name,phone,address,area,channel,payment_method,expected_pickup_date,notes,sku_name_or_code,qty,price\n"ORD-001","2024-01-15","John Doe","555-1234","123 Main St","Downtown","Website","COD","2024-01-20","","Widget A",2,29.99\n"ORD-001","2024-01-15","John Doe","555-1234","123 Main St","Downtown","Website","COD","2024-01-20","","Widget B",1,49.99\n"ORD-002","2024-01-15","Jane Smith","555-5678","456 Oak Ave","Uptown","Social","TRANSFER","2024-01-21","Gift order","Premium Pack",1,99.99'
  };

  const blob = new Blob([templates[type]], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${type}_template.csv`;
  link.click();
}

// Export order lines (one row per order item) - with extended fields for salesperson/runner
export interface OrderLineExport {
  order_id: string;
  created_at: string;
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
  sku_code: string;
  sku_name: string;
  qty: number;
  amount: number;
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
      lines.push({
        order_id: order.id,
        created_at: order.created_at || '',
        customer_name: order.customer_name || '',
        phone: order.phone || '',
        address: order.address || '',
        area: order.area || '',
        channel: order.channel || '',
        payment_method: order.payment_method || '',
        expected_pickup_date: order.expected_pickup_date || '',
        notes: order.notes || '',
        salesperson_name: order.salesperson?.display_name || '',
        runner_name: order.runner?.display_name || '',
        status: order.status || '',
        runner_status: order.runner_status || '',
        reconciliation_status: order.reconciliation_status || '',
        sku_code: '',
        sku_name: '',
        qty: 0,
        amount: 0,
      });
    } else {
      // Export one line per order item
      for (const item of orderItems) {
        lines.push({
          order_id: order.id,
          created_at: order.created_at || '',
          customer_name: order.customer_name || '',
          phone: order.phone || '',
          address: order.address || '',
          area: order.area || '',
          channel: order.channel || '',
          payment_method: order.payment_method || '',
          expected_pickup_date: order.expected_pickup_date || '',
          notes: order.notes || '',
          salesperson_name: order.salesperson?.display_name || '',
          runner_name: order.runner?.display_name || '',
          status: order.status || '',
          runner_status: order.runner_status || '',
          reconciliation_status: order.reconciliation_status || '',
          sku_code: item.product?.sku_code || '',
          sku_name: item.product?.sku_name || item.sku_label || '',
          qty: item.qty || 0,
          amount: Number(item.line_total) || 0,
        });
      }
    }
  }

  const columns = [
    { key: 'order_id', header: 'order_id' },
    { key: 'created_at', header: 'created_at' },
    { key: 'customer_name', header: 'customer_name' },
    { key: 'phone', header: 'phone' },
    { key: 'address', header: 'address' },
    { key: 'area', header: 'area' },
    { key: 'channel', header: 'channel' },
    { key: 'payment_method', header: 'payment_method' },
    { key: 'expected_pickup_date', header: 'expected_pickup_date' },
    { key: 'notes', header: 'notes' },
    { key: 'salesperson_name', header: 'salesperson_name' },
    { key: 'runner_name', header: 'runner_name' },
    { key: 'status', header: 'status' },
    { key: 'runner_status', header: 'runner_status' },
    { key: 'reconciliation_status', header: 'reconciliation_status' },
    { key: 'sku_code', header: 'sku_code' },
    { key: 'sku_name', header: 'sku_name' },
    { key: 'qty', header: 'qty' },
    { key: 'amount', header: 'amount' },
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
