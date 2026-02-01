
Goal
- Make the Delivered Orders page show the same results for Admin vs Salesperson when filtering by SKU (e.g., TY01 shows 5 orders / delivered qty 6 for Admin too).
- Ensure search/filter always works on the real underlying delivered data that the Admin can see (no “false zero” caused by mismatched identifiers).

What’s happening (root cause)
- The Delivered Orders page currently treats “SKU filter” as a Product ID filter:
  - skuFilter stores product.id (UUID)
  - Filtering uses: order.order_items.some(item => item.product_id === skuFilter)
- Products are owned per user (owner_user_id). The same SKU code (e.g., TY01) can exist as different Product rows (different product.id) for different owners.
- When Admin selects “TY01” from the dropdown, they may be selecting a different product.id than the product_id stored on Xiaoli’s delivered order_items.
- Result: Admin sees 0 even though the delivered orders exist, because the filter is comparing the wrong key.

Solution approach
- Change the SKU filter to filter by SKU Code (e.g., “TY01”) instead of Product ID.
- Build SKU dropdown options as unique SKU codes (deduped), not per-product rows.
- When filtering delivered orders, match on:
  - item.product?.sku_code (preferred), otherwise
  - item.sku_label (fallback, and extract the code part if it contains “TY01/ROSE”)
- Add a safety “auto-reset” so if an old stored SKU filter value no longer exists (e.g., after we change the meaning from UUID to TY01), it automatically resets to “All SKUs” instead of showing 0.

Files to change
- src/pages/runner/RunnerDeliveredOrders.tsx (only)

Detailed implementation steps
1) Change SKU filter semantics (SKU code, not product id)
   - Keep state as string, but interpret it as:
     - 'all' OR a normalized SKU code like 'TY01'
   - Add small helpers inside the file:
     - normalizeSku(code: string) => code.trim().toUpperCase()
     - getItemSkuCode(item) => normalizeSku(item.product?.sku_code ?? extractFromSkuLabel(item.sku_label) ?? '')
     - extractFromSkuLabel(label) => take label before “/” (e.g., “TY01/ROSE” → “TY01”), else trim

2) Update SKU dropdown options to be unique by sku_code
   - Replace current skuOptions mapping (which uses products.map and value=p.id) with a deduped list by SKU code:
     - Build a Map<skuCode, skuName?> from products and/or delivered orders
     - Output options like:
       - value: 'TY01'
       - label: 'TY01 / ROSE' (if name known) else 'TY01'
       - searchLabel: 'TY01 ROSE'
   - Sort options by sku code so Admin doesn’t see repeated TY01 lines and selection is consistent.

3) Update Delivered Orders filtering logic (SKU)
   - Replace:
     - item.product_id === skuFilter
   - With:
     - getItemSkuCode(item) === normalizeSku(skuFilter)

4) Update SKU Summary card logic
   - Replace matching logic in skuSummary calculation from product_id-based to sku_code-based (same helper as above).
   - Selected SKU display name:
     - Use the sku code plus name (if available from the Map) so the card title becomes consistent across roles.

5) Add “invalid SKU filter auto-reset” effect
   - Because existing sessions might still have skuFilter set to an old UUID value (from the previous implementation), add an effect:
     - If skuFilter !== 'all' and skuFilter is not present in skuOptions values → setSkuFilter('all')
     - Also normalize any user-selected SKU to uppercase so comparisons are stable.

Manual acceptance tests (what we will verify after implementing)
1) Admin sees Xiaoli TY01 delivered
   - Login as Salesperson Xiaoli → Delivered Orders → select SKU = TY01 → confirm: Total Delivered Qty = 6, Total Orders = 5
   - Login as Admin → Delivered Orders → select SKU = TY01 → must show same totals + the 5 rows.
2) Idempotent filter behavior
   - Selecting TY01 should work regardless of which owner’s product row originally provided TY01.
3) “Stale filter” recovery
   - If Admin previously had a UUID-based SKU filter selected, the page should not show 0 permanently; it should auto-reset SKU filter to “All SKUs”.
4) Non-SKU filters still work
   - Search, area, driver, user filters still behave the same.

Notes / why this is the right fix
- SKU code is the business identifier users expect for filtering (“TY01”), while product_id is an internal per-owner identifier that can differ even for the same SKU code.
- This change makes Admin filtering consistent and prevents “false zero” results without changing backend logic or the overall UI.

Optional next improvement (not required for the TY01 bug, but aligns with “real data”)
- The Delivered Orders list uses useOrders() which has a hard cap (limit 2000). If you expect delivered orders to exceed 2000, we should migrate this page to the existing RPC-based delivered orders hooks (useDeliveredOrdersFast) with server-side paging so Admin truly sees all delivered orders and search/filter works across the full dataset.
