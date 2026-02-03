# Cash Liability System: Driver-to-Runner Flow

## ✅ IMPLEMENTED

This system tracks cash collected by **drivers** that needs to be handed to their **runner**. This is a driver-runner internal settlement.

### Flow
1. Driver marks delivered → **MUST select: Cash or Transfer**
2. If **Cash**: Create cash liability with `driver_id` + `runner_id`
3. Runner sees outstanding cash **grouped by driver**
4. Runner confirms cash received **per driver**
5. No admin dashboard (internal driver-runner flow)

### Database Changes
- Added `driver_id` column to `cash_liabilities`
- Added `driver_payment_method` column to `orders`
- Updated RLS policies for driver insert, runner view/settle

### Files Changed
| File | Action |
|------|--------|
| `src/components/driver/DeliveryPaymentDialog.tsx` | Created - Payment method selection UI |
| `src/pages/driver/DriverInbox.tsx` | Modified - Uses new dialog |
| `src/hooks/useDrivers.ts` | Modified - Accepts payment method, creates liability |
| `src/hooks/useCashLiabilities.ts` | Modified - Group by driver, settle per driver |
| `src/pages/runner/RunnerCashSettlement.tsx` | Rewritten - Shows cash by driver |
| `src/components/layout/AppSidebar.tsx` | Modified - Removed admin cash liability item |
| `src/App.tsx` | Modified - Removed admin route |
| `src/pages/admin/CashLiabilityAdmin.tsx` | Deleted |
