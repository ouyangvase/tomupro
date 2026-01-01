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

export function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header.toLowerCase().replace(/\s+/g, '_')] = values[index] || '';
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
    orders: 'customer_name,phone,address,area,channel,payment_method,expected_pickup_date,notes\n"John Doe","555-1234","123 Main St","Downtown","Website","COD","2024-01-15","Rush order"',
    order_lines: 'order_ref,order_date,customer_name,phone,address,area,channel,payment_method,expected_pickup_date,notes,sku_name_or_code,qty,price\n"ORD-001","2024-01-15","John Doe","555-1234","123 Main St","Downtown","Website","COD","2024-01-20","","Widget A",2,29.99\n"ORD-001","2024-01-15","John Doe","555-1234","123 Main St","Downtown","Website","COD","2024-01-20","","Widget B",1,49.99\n"ORD-002","2024-01-15","Jane Smith","555-5678","456 Oak Ave","Uptown","Social","TRANSFER","2024-01-21","Gift order","Premium Pack",1,99.99'
  };

  const blob = new Blob([templates[type]], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${type}_template.csv`;
  link.click();
}

// Export order lines (one row per order item)
export interface OrderLineExport {
  order_ref: string;
  order_date: string;
  customer_name: string;
  phone: string;
  address: string;
  area: string;
  channel: string;
  payment_method: string;
  expected_pickup_date: string;
  notes: string;
  sku_name_or_code: string;
  qty: number;
  price: number;
  line_total: number;
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
        order_ref: order.id,
        order_date: order.order_date || '',
        customer_name: order.customer_name || '',
        phone: order.phone || '',
        address: order.address || '',
        area: order.area || '',
        channel: order.channel || '',
        payment_method: order.payment_method || '',
        expected_pickup_date: order.expected_pickup_date || '',
        notes: order.notes || '',
        sku_name_or_code: '',
        qty: 0,
        price: 0,
        line_total: 0,
      });
    } else {
      // Export one line per order item
      for (const item of orderItems) {
        lines.push({
          order_ref: order.id,
          order_date: order.order_date || '',
          customer_name: order.customer_name || '',
          phone: order.phone || '',
          address: order.address || '',
          area: order.area || '',
          channel: order.channel || '',
          payment_method: order.payment_method || '',
          expected_pickup_date: order.expected_pickup_date || '',
          notes: order.notes || '',
          sku_name_or_code: item.product?.sku_code || item.product?.sku_name || item.sku_label || '',
          qty: item.qty || 0,
          price: Number(item.price) || 0,
          line_total: Number(item.line_total) || 0,
        });
      }
    }
  }

  const columns = [
    { key: 'order_ref', header: 'order_ref' },
    { key: 'order_date', header: 'order_date' },
    { key: 'customer_name', header: 'customer_name' },
    { key: 'phone', header: 'phone' },
    { key: 'address', header: 'address' },
    { key: 'area', header: 'area' },
    { key: 'channel', header: 'channel' },
    { key: 'payment_method', header: 'payment_method' },
    { key: 'expected_pickup_date', header: 'expected_pickup_date' },
    { key: 'notes', header: 'notes' },
    { key: 'sku_name_or_code', header: 'sku_name_or_code' },
    { key: 'qty', header: 'qty' },
    { key: 'price', header: 'price' },
    { key: 'line_total', header: 'line_total' },
  ];

  exportToCSV(lines as any, columns, filename);
}
