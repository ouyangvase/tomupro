# Partial transfer + remaining COD — implementation and verification

Date: 2026-09-29. Published to Cloudflare Pages (`tomupro`) and Supabase. Production: https://www.tomu.my. Deployment: https://6a366d81.tomupro.pages.dev.

## Payment rules

- Order sales value stays `orders.total_amount`. Native SKU price is the final line sales amount, not unit price multiplied by quantity. Quantity controls stock. The editor label now states this; totals accumulate cents. Existing delivery fees, discounts and external pricing contracts were not repurposed as payment amounts.
- The existing receipt is bank-transfer evidence, not an additional payment. Its existing pending/confirmed/rejected workflow is reused. Pending 30 on total 72 shows collectible 72 and blocks delivery confirmation until reviewed. Confirmed 30 shows collectible 42.
- `order_payments` records the customer transfer; existing `driver_cash_amount` / `driver_transfer_amount` remain the actual delivery collection. The repository had no existing customer payment ledger to reuse. Uploading evidence does not create a second payment.
- Initial transfer goes to Runner, as confirmed by the user. Runner remittance continues to use the full order value and existing fee rules. Driver cash liability comes only from actual Driver cash. Customer payment and Driver cash handover stay separate.
- Remaining customer balance becomes zero after collecting 42; the historical collection remains 42. Payment status is derived independently of delivery status. Prepayment does not deliver an order or confirm profit.
- Current workflow retains one current pretransfer record and receipt per order, matching existing receipt UX. Confirmed records cannot be overwritten; this change does not introduce multiple independently approved pretransfer installments or a new Finance correction workflow.

## Changes

- Order editor and CSV import accept transfer amount/evidence and call a server-calculated payment RPC. Existing order insert RLS remains in force. Server validation rejects negative, excessive and non-two-decimal amounts.
- Runner/Driver lists, dispatch, delivery collection and details show the remaining collection and auxiliary total/confirmed transfer. Driver detail links the existing receipt. Active Driver queries refresh every ten seconds; an open collection dialog follows the refreshed order. The mutation rereads the order and a database trigger rejects stale overcollection under the order row lock.
- Receipt confirmation, payment changes and collection guards serialize through the order. Save/approval retries retain one transfer row. Existing Runner Accept creates one cash liability from actual cash. Accepted cash cannot subsequently drift from that liability through an ordinary order edit.
- Finance exposes sales, confirmed pretransfer, delivery collection and remaining customer debt separately. Exports include payment breakdown and a once-per-order sales column so multi-item exports can be summed safely. Notifications include total, confirmed transfer and balance.
- Existing Driver Pickup deduction remains inventory quantity deduction. Sales/profit, Runner claims and PulseOne payloads retain full order value. Existing delivery-triggered webhook/queue and deduplication code were inspected; external delivery was not exercised.

## Database migration

`supabase/migrations/20260929120000_partial_payment_support.sql` adds the payment plan, customer payment ledger, scoped RPCs, validation triggers and migration report. Amounts use PostgreSQL numeric; the backend computes the balance rather than accepting a client COD value.

Confirmed historical full-transfer receipts are reused once. Unconfirmed evidence remains unconfirmed. Closed historical orders whose recorded payments do not explain the total are marked `payment_history_unverified`, retain their closed state, are not made collectible again, and appear in Finance's review count rather than being presented as new customer debt. Review `order_payment_migration_report` before releasing.

The unrelated KITANI Edge Function edits were excluded from this release. KITANI ingestion sections were removed from the payment migration; the original draft is preserved in the local release backup.

## Executed validation

| Check | Result and boundary |
| --- | --- |
| `npm test` | 32 files, 141 tests passed, including payment arithmetic, settlement components, decimal totals and multi-item export totals. |
| `npm run build` | Passed. Existing bundle-size, Browserslist and Tailwind ambiguity warnings remain. |
| `git diff --check` | Passed. |
| React Doctor | Latest changed-scope scan: 71/100, 13 control-flow complexity warnings. These are maintainability findings in large React components, not a clean health result; broad component refactoring was kept outside this payment change. |
| Playwright payment dialog | Four tests passed at 390×900 and 1440×900, using the production component in a local fixture. Covered 72/30/42 cash collection, excessive amount rejection, undercollection balance, pending approval and full transfer with zero collection. No relevant page errors or Vite overlay; screenshots inspected. Browser plugin not available, so the installed Playwright was used. |
| `supabase/tests/partial_payment.sql` | Passed in embedded PostgreSQL (PGlite): creation, pending→confirmed, retry, invalid amounts, receipt requirement, post-assignment payment, stale 72 rejection, failure/reschedule/reassignment, actual cash 42, repeated Runner Accept, one cash liability 42, Finance 72/30/42/0, full/remaining transfer without cash liability, and authenticated-role insert RLS. |
| Legacy migration fixtures | `partial_payment_legacy_setup.sql` before migration and `partial_payment_legacy_verify.sql` after migration passed: open COD, closed unknown history, confirmed transfer and recorded cash. |
| Full app TypeScript check | `tsc -p tsconfig.app.json --noEmit` is **not passing**. It reports errors in FinalReportDashboard, AppSidebar, AuthContext, generated Supabase types/RPCs and other modules. The root `npm run typecheck` is not a substitute because its config uses project references with an empty root file set. |

Local database replay is **not** a clean production-schema replay. The historical migration chain needs absent tables/columns, platform extensions and a production-only `submit_driver_delivery_result` definition. The fixture supplies missing baseline structures, stubs auth/storage/cron/network services, relaxes a historical data-count repair assertion, and skips the missing Driver-function patch. The new migration itself runs with function body validation enabled and without rewriting its code. Consequently these tests establish local financial behavior, not deployed schema compatibility or real concurrency under load.

The local replay harness and logs are saved at `C:/Users/unmap/.codex/tmp/tomupro-payment-validation/`. Screenshots are under `test-results/partial-payment-390.png` and `test-results/partial-payment-1440.png`.

To reproduce browser checks, start `npm run dev -- --host 127.0.0.1 --port 8081 --strictPort`, then run `npx playwright test e2e/partial-payment.spec.ts`. SQL fixtures must only run in a disposable database. The legacy setup fixture intentionally creates persistent seed rows for migration verification; the main financial test rolls back.

## Not verified / release gates

- User confirmed there is no test database or schema export. Real Supabase login/logout persistence, storage upload/download permissions and the complete multi-account UI flow (create → upload → Runner → Driver → collect → Accept → Finance) were **not executed**. Receipt linkage/persistence was checked in SQL with fixture URLs, not actual uploaded images.
- The installed canonical Driver RPC was inspected and preserved, changing only its collection basis and notification amounts. A locked wrapper validates actual cash/transfer and delegates to its existing authorization, audit and idempotency workflow. Production-schema rollback tests passed 72/0, 72/30, 72/72, stale amount rejection, repeated Driver submission, failed/reschedule submission and Runner review retaining the pretransfer, Runner Accept, one actual cash liability, full sales and zero remaining debt. The reschedule fixture used a synthetic reason and attachment row; it did not upload a real image. All production permission combinations, batch Accept, simultaneous sessions, actual Telegram delivery and PulseOne Confirm Profit remain unverified. Test records and queued effects were rolled back.
- Direct Runner delivery without a Driver payment report still uses the existing delivery workflow; its cash-recording semantics were not confirmed by the user and were not replaced with invented Driver cash. It needs a separate verified accounting path before claiming complete reconciliation for that branch.
- Closed legacy review rows need Finance evidence reconciliation; no missing payment amounts were guessed. This change does not expose a new correction UI for them.
- The existing create-order and order-item calls remain separate requests. Duplicate orders/payments are prevented, but recovery from a failed item insert remains the existing application limitation.

## Deployment and rollback

Published migration 20260929120000 transactionally, followed by send-telegram-event and Cloudflare Pages production. No Vercel deployment succeeded; its local configuration was stale. Cloudflare CLI confirmed project tomupro, main branch, domains tomu.my and www.tomu.my.

The release uses the current Cloudflare recovery source baseline (57bd63e / f77f5fb application baseline) plus the payment changes, preserving its newer landing assets, cache headers and SNIPERS proxy. Its complete assembled source and built output are at C:/Users/unmap/.codex/tmp/tomupro-payment-release/frontend/. The build explicitly uses the existing production public Supabase configuration; do not publish an unconfigured local build. Future releases must retain this current frontend baseline.

Before migration, private.order_payment_release_backup_20260929 captured 36,090 orders. Transactional assertions verified no original total, receipt, cash/transfer report or delivery status changed. At that transaction the sales total was BND2,074,535.20 (the earlier read was BND2,074,613.20; production changed between reads). Recorded Driver cash stayed BND305,186.96 and Driver transfer BND68,276.00. 93 confirmed transfers with receipt evidence were migrated once, totaling BND9,887.00. There are 23,263 closed legacy orders requiring evidence review; they were not reopened for collection. No synthetic PP-RELEASE orders remain.

Production checks: /, /auth and /orders return 200 with the new bundle and no-store headers; SNIPERS proxy returns the expected unauthenticated 401; the published Driver chunk contains submit_driver_payment_result. The new RPC denies anonymous execution. Supabase source backups and release logs are under C:/Users/unmap/.codex/tmp/tomupro-payment-release/. The notification function was merged onto its downloaded live source to preserve the existing attempt validation, auditing and retry implementation.

If rollback is needed after real partial payments exist, first disable new partial-payment edits/collection and reconcile in-flight orders. Keep the ledger, receipt links, audit and actual collection records. Do not drop the ledger or restore an old UI that collects full totals on partial orders. Restore affected function definitions from the pre-release schema snapshot only after preserving those balances. There is deliberately no destructive automatic down-migration.

The live Runner session and Finance claims/workspace rendered after publication without browser errors. This was a read-only smoke check, not the complete cross-role payment UI acceptance flow.
