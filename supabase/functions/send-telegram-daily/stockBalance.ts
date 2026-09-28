export async function fetchAllStockBalances(supabase: any) {
  const rows: any[] = [];
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('stock_balance_view')
      .select('warehouse_id, owner_user_id, owner_name, sku_code, balance_qty')
      .order('warehouse_id', { ascending: true })
      .order('product_id', { ascending: true })
      .range(rows.length, rows.length + pageSize - 1);

    if (error) throw new Error(`Failed to fetch stock balances: ${error.message}`);
    if (!data?.length) return rows;
    rows.push(...data);
  }
}
