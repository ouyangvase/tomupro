# Templates and Cancelled Sales release — 29 September 2026

Published to existing Cloudflare Pages project `tomupro`: https://d388d97b.tomupro.pages.dev and https://www.tomu.my. Both serve `/assets/index-DmH8h8kQ.js` (HTTP 200 verified). Source continues from the corrected release baseline, including the Admin dashboard update.

## Order entry

Only the Multi-SKU CSV download remains. Rows with the same order reference form one order; customer, payment, dates and notes must agree across its rows. `line_total` includes all units in that row: quantity 2, line total 42 means BND42 for both units, not BND84. Repeat the order-level transfer amount on each row; it is counted once per order. Each transfer order requires its own receipt during review.

Paste example (use actual available SKU codes):

```text
Customer Name: SAMPLE CUSTOMER
Phone: +6738888888
Address: NO 1, SIMPANG 1, JALAN EXAMPLE
Payment: TRANSFER + COD
Transfer Amount: 30.00

Items:
2 X SKU-A $42.00
1 X SKU-B $30.00

Order Notes:
Call before delivery.
Use the side entrance / blue gate.
```

Total BND72, submitted transfer BND30, expected balance BND42. While transfer is pending, Driver collection remains BND72; confirmation reduces it to BND42. Upload the receipt in the payment section after parsing. `Payment: COD` with transfer 0 and `Payment: TRANSFER` with transfer 72 are also supported. Legacy unlabeled paste format remains supported.

Migration `20260929160000_atomic_order_template_import.sql` adds an order request fingerprint and the authenticated `import_order_with_payment` RPC. It computes totals from validated items and creates order, items and existing payment ledger records in one transaction. Same UUID and payload return the existing order; changed payload with an already-used UUID is rejected. No second payment ledger was introduced. Receipt object upload precedes the database transaction; uploaded URLs are reused on in-dialog retries. A cancelled/failed import may leave an unused storage object, but cannot create a partial order/payment transaction.

The migration was applied transactionally and recorded as applied. Bulk migration replay was not used: the existing remote migration history includes an older version absent from this checkout. Existing remote history was preserved.

## Cancelled Sales

Opening the tab requests one page of 50 rows with only display fields. Additional pages, matching IDs and full export data load on their respective actions. Search debounce is 350 ms. Filter/sort logic runs on the server, including cancellation-date fallback for older rows. Queries carry abort signals. Pages stay fresh for five minutes. Cancelled queries have separate cache keys and do not refresh on focus, reconnect or other order realtime invalidations; manual Refresh and successful restore refresh the visible page.

For the same 50 production rows, serialized selected JSON decreased from 264,953 to 47,715 bytes (about 82%). This measures data shape, not billed egress or CPU. With the 1,324-order browser fixture, opening requests one page and zero ID batches; Select All explicitly requests two ID batches. Previously those two ID batches were eager. Cached revisit and focus/reconnect produced zero additional list requests.

## Verification

- `npx vitest run`: 64 files, 310 tests passed. Covers payment examples, invalid values, line totals, grouping conflicts, multiline notes, legacy parsing, CSV round-trip, and export filters/order/empty role scope.
- Production-configured Vite build passed, retaining Cloudflare worker/routes/headers.
- `supabase/tests/atomic_order_template_import.sql` passed against the deployed RPC under an authenticated fixture role, within a rolled-back transaction. Covers 0/30/72 transfer, backend total calculation, pending/confirmed COD, receipt requirement, unchanged retry, changed-payload rejection, invalid amounts and forced item failure with no partial order/payment. All fixtures rolled back.
- Real components in a local browser harness with mocked APIs: downloaded CSV → map → receipt-required review → upload preview → one atomic RPC; no separate item writes. Cancelled tab demand loading, pagination, cache revisit, background events, Select All, debounced search, reason-filtered sorted export, Refresh and restore-success refresh passed. Export file order was inspected.
- React Doctor changed scan: no errors; four complexity warnings. Same four existing large components scanned before/after retained score 49, with issue count 60 → 58. No broad component refactor was made.
- Repository-wide TypeScript checking remains blocked by existing generated-schema/type errors in unrelated modules. Changed-file diagnostics were checked separately; build and runtime checks above passed.

Not executed: a real customer order through the live authenticated UI, a production storage upload, every role's browser workflow, full five-minute wall-clock cache expiry, every network-failure timing, or an end-to-end Driver → Runner Accept → Finance/PulseOne cycle in this release. Browser API mocks and rollback SQL tests are distinct from those live workflows.
