# Partial payment implementation audit

Status: tested database foundation drafts; application integration and production release are incomplete.
Date: 2026-09-29.

## Source and scope

Inspected `tomupro-src` at `ae128df` and prepared branch `codex/partial-payment`
in the existing `tomupro-stock-report-fix` checkout. The branch preserves the
KITANI/driver fixes and the deployed Telegram stock pagination fix. No AGENTS.md
file was found by a hidden-file search in either checkout; the user-supplied
AGENTS.md instructions apply. Authenticated Chrome access was restored and live
columns, functions, policies and 48 order triggers were inspected read-only.
Production is newer than the original Git baseline. The user explicitly confirmed
`tomupro-mulerun-deploy` as the correct source. Its source, public assets, functions
and migrations were recovered in commit `6202be1` and pushed to
`origin/codex/partial-payment`, preserving the deployed Telegram stock pagination
fix. This source backup is not a partial-payment production deployment.

## Confirmed business decisions

- Sales value stays in `orders.total_amount`; BND72 remains BND72 revenue.
- Advance bank transfers go to the runner's bank account.
- Dispatch is blocked until the advance transfer receipt is confirmed.
- Existing receipt storage, compression, review permissions and audit conventions
  must be reused.
- Partial collection must remain outstanding; no implied transfer may cover it.
- Confirmed: after driver assignment require explicit unassignment with an audit
  reason before COD-changing edits, followed by explicit reassignment.
- Each assignment keeps an immutable sales/confirmed-paid/COD/driver/actor/time snapshot.
- Receipt-only metadata changes remain permitted before pickup when COD is unchanged.
- A permanent pickup/delivery marker prevents reschedule/reset paths unlocking payments.
- After pickup, separate approved finance adjustments preserve original payments
  and operational collection instructions. No driver acknowledgement workflow.

## Verification and release gate (2026-09-29)

- `node node_modules/vite/bin/vite.js build`: PASS, 3,864 modules, 29.02 seconds.
  Existing bundle-size/Browserslist warnings remain.
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json`: FAIL on the
  recovered baseline, including stale generated RPC/types, sidebar typings and
  missing `Order.current_operational_state`. No feature integration was present
  when this baseline check ran; do not report a clean full typecheck.
- `node node_modules/vitest/vitest.mjs run src/lib/orderPayments.test.ts`: 29 tests pass.
- `node tests/payment-foundation.mjs`: 25 isolated PostgreSQL tests pass with
  `@electric-sql/pglite@0.5.8`. Set `PAYMENT_TEST_PGLITE` to that package's
  `dist/index.js` path. Installed outside the repo in Windows TEMP for testing.
- Tests exercise actual triggers, transaction rollback, snapshot immutability,
  confirmation locks, receipt-only edits, reason audit, replay/stale-save rejection,
  nullable ownership denial, pickup locks, two-person finance reversal approval,
  preservation of original history, and denial of direct authenticated writes.
- These tests use a minimal schema fixture. They do not prove integration with
  the 48 existing production triggers, all role policies, or multi-connection races.
- Docker Desktop engine is unavailable; Windows denied starting its service.
  User was asked to start Docker Desktop for full local Supabase integration tests.
- Draft SQL is deliberately in `docs/drafts`, outside the deployable migration
  directory, to prevent an accidental incomplete schema release.

## Live historical audit (read-only; not migration results)

| Declared method | Receipt state | Orders | Separate receipt amount recorded |
|---|---|---:|---:|
| COD | none | 35,675 | 0 |
| TRANSFER | confirmed | 94 | 0 |
| TRANSFER | none | 252 | 0 |
| TRANSFER | pending | 67 | 0 |
| TRANSFER | pending_confirmation | 1 | 0 |

There are 2,160 assigned COD orders without a delivery timestamp and one assigned
TRANSFER order without a receipt status. These are not automatically classified as
active operational assignments by this count. The 414 declared transfer orders
need explicit migration handling; a confirmed status alone supplies no separately
recorded amount. Driver cash/transfer evidence must also be audited before historical
COD rows are classified. Migrated orders: **0**. Production schema/data changes: **0**.

## Remaining implementation (release is not ready)

1. Integrate transfer confirmation/rejection, receipt-only replacement and required
   unassignment reason into existing authorized RPCs and UI.
2. Persist order/items/payment edits atomically, and verify against live-equivalent
   lifecycle and inventory triggers. Current draft transfer RPC alone does not make
   the existing multi-request order editor atomic.
3. Connect actual delivery cash/transfer collection and runner acceptance to the
   ledger. Remove both client and SQL inferred-transfer remainder behavior.
4. Expose finance correction request/review UI with real company permission tests.
5. Update every operational screen/export/notification to use the assignment COD;
   connect finance balances/settlements without changing sales revenue.
6. Historical review/backfill, full role/concurrency tests, desktop/mobile checks,
   then promote tested drafts into migrations and publish together.

Rollback so far: no production rollback is needed because nothing was deployed.
Before release, prepare a transaction-tested migration rollback that retains payment
and assignment audit records; reverting frontend code must not erase that history.

## Architecture findings

1. `src/types/database.ts` models one order-level `payment_method`, one receipt,
   and driver cash/transfer totals. There is no customer payment ledger identified
   in the inspected application/schema. `cod_amount` exists for KITANI ingestion,
   but is not a general authoritative COD balance.
2. `OrderEditor.tsx` validates only COD/TRANSFER. It saves the order, uploads the
   receipt, updates receipt fields, then saves order items using separate calls.
   Repeated/concurrent saves are not an atomic payment transaction.
3. `useOrderItems.ts` calculates order value from line totals; prices are already
   final SKU line amounts. Do not multiply them by quantity again.
4. Receipts use the existing `receipts` bucket, image preparation and
   `orders.receipt_url/status/confirmed_by/confirmed_at` fields. Upload sets the
   receipt to pending. Admin has a direct confirmation path in the editor.
5. `confirm_order_receipt` checks the authenticated actor, assigned runner or
   assistant `confirm_receipt` permission, and currently accepts only TRANSFER
   orders. Its audit only describes receipt status, not a payment amount.
6. `finance_transactions` is a company income/expense/transfer journal, with
   generic source references. `finance_claims` describes expense claims. Neither
   is an existing customer-payment ledger with order-specific proof/confirmation
   semantics. Preserve both rather than overloading expense entries as deposits.
7. `cash_liabilities` is uniquely keyed by order and represents driver cash owed
   to the runner. The latest inspected `review_driver_delivery` writes actual
   `driver_cash_amount` on acceptance. Preserve this boundary: runner-held bank
   transfers are not driver cash liabilities.
8. Runner claims and customer outstanding are different balances. With BND30
   transferred to the runner plus BND42 cash collected, customer outstanding is
   zero, driver cash liability is BND42, and gross collected for seller settlement
   is BND72 before applicable delivery fees. If cash is BND40, customer outstanding
   is BND2 and collected is BND70; do not silently claim BND72 as collected.

## Change map

References are relative to this checkout. Entries distinguish operational COD
from legitimate sales-value uses; a global replacement of total_amount is unsafe.

| Area | Evidence / entry points | Required behavior |
|---|---|---|
| Create/edit | `components/orders/OrderEditor.tsx:90,646,835,901,918,1368`; `hooks/useOrders.ts` | Payment selector and safe decimal validation; atomic amount/proof save; preserve confirmed history |
| Booking | `pages/sales/BookingSales.tsx:451,461,468` | Keep sales amount; add transfer/COD breakdown and partial-receipt state |
| Ready | `pages/sales/ReadySales.tsx:346,535,550`; `hooks/useReadyOrderStats.ts:80` | Partial orders count as COD only if remaining COD is positive; block driver dispatch until confirmed |
| Action Required | `pages/sales/SalespersonActionInbox.tsx`; shared editor | Rejected transfer review must use the payment amount, not sales total |
| Dispatch | `components/orders/DispatchBoardRow.tsx:64,132`; `pages/runner/RunnerDriverInbox.tsx:172` | Replace full-total collection assumption; enforce dispatch gate on server too |
| Runner inbox/detail | `pages/runner/RunnerInbox.tsx:763,823,928,989`; `components/runner/ReceiptConfirmDialog.tsx` | COD42 prominently; total72/confirmed transfer30/receipt in details |
| Driver inbox/export | `pages/driver/DriverInbox.tsx:368,689,1169` | Current export explicitly uses total for COD; replace with confirmed-payment-derived due |
| Assignment RPC | `hooks/useDriverAssignments.ts`; migration `20260808210000_canonical_driver_lifecycle_reconciliation.sql:151` | Return true collection amount; retain revenue in order_data.total_amount |
| Delivery dialog | `components/driver/DeliveryPaymentDialog.tsx:61` | Collect remaining COD; enter actual cash and transfer separately, without inventing a balancing transfer |
| Driver delivered write | `hooks/useDrivers.ts:447,464,475` | Current code sets transfer = orderAmount - collectedCash; must accept validated actual amounts atomically and retain shortfall |
| Driver pickup | `hooks/useDriverPickups.ts`; `pages/driver/DriverPickupsPage.tsx` | Product pickup/stock quantities remain unchanged; any collection summaries must use COD |
| Runner pickup order | `hooks/usePickupOrders.ts`; `components/runner/CreatePickupOrderDialog.tsx` | Separate order source and pickup fee from customer payment; maintain current creation permissions |
| Failed/rescheduled | `pages/runner/RunnerFailedOrders.tsx`; `review_driver_delivery` | Retain advance payment through failure/reschedule; do not manufacture collection or clear payment history |
| Accept/batch accept | `hooks/useRunnerReview.ts`; `pages/runner/DriverManagement.tsx`; `components/runner/RunnerReviewModal.tsx` | Preserve acceptance workflow, retain customer shortfall, create liability from actual cash only |
| Review aggregates | `lib/driverReviewDateGroups.ts:42`; `pages/runner/DriverManagement.tsx:221,250,281` | Remove legacy full-total fallback for new ledger-backed orders; keep sales and collection measures distinct |
| Finance overview | `hooks/useFinanceOverview.ts`; migration `20260809120000_finance_overview_canonical_reporting.sql:388,451,585` | Existing sums divide whole sales amounts by method; replace with separate payment aggregates |
| Driver cash | `pages/runner/RunnerCashDriver.tsx:23,48,166`; `components/runner/CashSettlementWorkspace.tsx` | Former uses order totals; latter consumes actual liabilities and must keep that meaning |
| Claims | `components/runner/CreateClaimDialog.tsx:50`; `AutoClaimSuggestion.tsx:32`; `UserGroupedBulkClaimDialog.tsx:128` | Separate sale, collected, fees and customer outstanding; do not double-add deposit |
| Bulk claim backend | `supabase/functions/submit-bulk-claim/index.ts:81,206,212,245` | Currently net claim = sales total - fee, irrespective of actual collection; update source calculations |
| Reconciliation | `pages/reconciliation/ReconciliationAdmin.tsx:125,140`; `hooks/useDeliveredOrders.ts` | Show sales/transfer/COD due/actual cash/outstanding; preserve already-settled historical records |
| Exports | Driver XLSX, runner workload XLSX, delivered/reconciliation exports, `components/finance/FinalReportDashboard.tsx`, `pages/admin/ClaimBatchesHistory.tsx` | Explicit breakdown columns; revenue column remains total72 |
| Telegram receipts | `supabase/functions/send-telegram-event/index.ts:259` | Receipt notification currently displays metadata.total_amount; must display payment amount30 |
| Telegram operations | same file `:282,308`; notification metadata SQL producers | COD means remaining collection; finance messages use full breakdown |
| Telegram daily | `supabase/functions/send-telegram-daily/index.ts` | Gross sales remains sales; unclaimed collected amounts/shortfalls separated; preserve pagination fix |
| Analytics | `private.driver_analytics_payment_components`; `get_driver_analytics`; `get_runner_performance*`; driver analytics pages | Collection fallback currently uses sales amount; preserve revenue and count actual method components |
| PulseOne | `supabase/functions/send-webhook/index.ts:149`; queue webhook producer migrations | order_total remains72; add agreed payment breakdown without changing existing revenue semantics or duplicate events |
| KITANI | `supabase/functions/create-kitani-invitation/index.ts:114`; migration `20260901093000_kitani_order_financial_contract.sql` | Existing constraint forces COD=total; resolve explicitly without corrupting external financial contracts |

## Proposed implementation boundaries

- Add an order customer-payment ledger only after live schema confirms none
  already exists. Reuse the existing receipt URL/storage object, not a second
  bucket or uploader. Distinguish bank receipts from driver cash collection.
- Amounts stored as exact NUMERIC(12,2); input parsed to integer cents for client
  arithmetic, rejecting nonfinite/exponential/overprecision/negative input.
- Ledger write API locks the order, checks ownership/role and expected revision,
  and uses a unique request identity. One transaction records payment and audit.
  An update targets the existing payment, never blindly inserts another deposit.
- Confirmed payment corrections require recorded reversal/replacement with reason;
  do not overwrite the evidence or copy the same receipt object as a new payment.
- Receipt confirmation must atomically confirm the amount it reviewed. Stale
  review/save requests must fail rather than confirm a changed amount.
- Enforce dispatch and assigned-edit rules in SQL, including direct order updates,
  batch assignment, external ingestion and admin paths, not only button disabling.
- Compute confirmed non-COD paid, COD due, actual COD collected, total collected,
  outstanding and paid state centrally. Never infer receipt-backed payment from a
  missing cash balance. Do not use COD due as revenue.
- Pre-dispatch full transfer with an unconfirmed receipt is pending, not paid.
  Once confirmed, COD=0 and payment status is paid even before delivery.
- Settlements continue to use existing finance/cash ledgers. Runner bank receipts
  and driver cash are different custody categories, not additional sales.

## Historical migration plan (not executed)

First inspect live columns, policies, function definitions, constraints and counts.
Record per-order source evidence and classification in a migration report.

1. COD with no transfer evidence: keep sale and original collection amount;
   transfer paid=0. Do not treat the KITANI column's default zero as proof of no COD.
2. Confirmed full-transfer receipt with coherent amount: link the existing receipt
   once; retain reviewer and timestamp. Never upload another copy.
3. Driver cash/transfer splits: use explicit amounts and acceptance evidence;
   distinguish customer payment from driver handover.
4. Pending/rejected receipts, mixed records without amounts, conflicting driver
   splits, settled claims with inconsistent totals, KITANI discrepancies: report
   for manual review rather than assuming zero transfer or full payment.
5. Idempotent backfill keyed to source evidence; no notification replay, inventory
   mutation, automatic re-claiming, or alteration of closed finance snapshots.

Migration results: not available; no migration has been applied.

## Verification plan

The requested 17 cases remain acceptance criteria, not claimed passing tests.
Unit tests cover exact cents and the 72/0, 72/30, 72/72, 72/80 cases. Database
integration tests cover roles, receipt ownership, concurrent save, cross-order
isolation, confirmation races, dispatch gate, edit restrictions, idempotent
backfill and audit. Integration tests cover actual 42 vs40 collection, runner
accept/batch accept, liability/settlement, exports, Telegram and PulseOne.
Mobile and desktop checks must use a test database with explicit 72/30 examples.
No test may send real customer Telegram messages or mutate production orders.

## Current changes, validation and rollback

- Added this audit only for partial payment; runtime behavior unchanged.
- Existing stock-report commits retained as branch ancestry, not new payment work.
- Repository searches and targeted reads completed; no payment tests run yet.
- Production migrations, payment UI checks and migration counts: not run.
- No production rollback is needed for this audit. For implementation, plan an
  additive schema and a feature gate; retain ledger/audit records during rollback.
  Once partial orders exist, reverting to a client that collects total_amount is
  unsafe. Disable new partial entry and preserve correct collection reads while
  rolling back write behavior.
