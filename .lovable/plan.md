
# Cash Liability & Settlement System

## Overview

This system tracks runner-held cash as a financial liability, not just a payment method. When a driver marks a CASH order as delivered, a liability record is created that the runner must eventually settle by returning the cash to the company.

## System Architecture

### Current State Analysis

| Component | Current Behavior |
|-----------|-----------------|
| Driver marks delivered | `useDriverMarkDelivered` updates `driver_status` to `DRIVER_DELIVERED` |
| Payment method | Stored on order as `payment_method` (COD or TRANSFER) |
| Cash tracking | Not tracked as liability - only used for display |
| Runner settlement | No cash settlement flow exists |

### New Data Model

#### Table: `cash_liabilities`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| runner_id | uuid | References profiles.id |
| order_id | uuid | References orders.id (unique) |
| order_code | text | Denormalized for display |
| cash_amount | numeric | Amount collected in cash |
| delivered_at | timestamptz | When delivery was confirmed |
| status | text | 'OPEN' or 'SETTLED' |
| settlement_batch_id | uuid | References settlement batch (nullable) |
| created_at | timestamptz | Record creation time |
| settled_at | timestamptz | When settled (nullable) |

#### Table: `cash_settlement_batches`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| runner_id | uuid | References profiles.id |
| total_amount | numeric | Sum of all liabilities in batch |
| order_count | integer | Number of orders settled |
| status | text | 'SETTLED' (immutable after creation) |
| settled_at | timestamptz | Settlement timestamp |
| settled_by | uuid | Who confirmed settlement |
| note | text | Optional settlement note |
| created_at | timestamptz | Record creation time |

## Implementation Details

### 1. Database Schema Migration

```sql
-- Cash liabilities table
CREATE TABLE public.cash_liabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id uuid NOT NULL REFERENCES profiles(id),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
  order_code text NOT NULL,
  cash_amount numeric NOT NULL CHECK (cash_amount > 0),
  delivered_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'SETTLED')),
  settlement_batch_id uuid REFERENCES cash_settlement_batches(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  
  CONSTRAINT settled_requires_batch CHECK (
    (status = 'SETTLED' AND settlement_batch_id IS NOT NULL AND settled_at IS NOT NULL)
    OR (status = 'OPEN' AND settlement_batch_id IS NULL AND settled_at IS NULL)
  )
);

-- Settlement batches table
CREATE TABLE public.cash_settlement_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id uuid NOT NULL REFERENCES profiles(id),
  total_amount numeric NOT NULL,
  order_count integer NOT NULL,
  status text NOT NULL DEFAULT 'SETTLED',
  settled_at timestamptz NOT NULL DEFAULT now(),
  settled_by uuid NOT NULL REFERENCES profiles(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_cash_liabilities_runner_status ON cash_liabilities(runner_id, status);
CREATE INDEX idx_cash_liabilities_delivered_at ON cash_liabilities(delivered_at);
CREATE INDEX idx_cash_settlement_batches_runner ON cash_settlement_batches(runner_id);
```

### 2. RLS Policies

```sql
-- Runners can view their own liabilities
CREATE POLICY "Runners view own liabilities"
ON cash_liabilities FOR SELECT
USING (runner_id = auth.uid() OR get_user_role(auth.uid()) IN ('admin', 'manager'));

-- Only system (via edge function) creates liabilities
CREATE POLICY "System creates liabilities"
ON cash_liabilities FOR INSERT
WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'runner'));

-- Runners can settle their own liabilities (via batch)
CREATE POLICY "Runners settle own liabilities"
ON cash_liabilities FOR UPDATE
USING (runner_id = auth.uid() AND status = 'OPEN');

-- No deletions allowed
-- (No DELETE policy = blocked)

-- Settlement batches - similar pattern
CREATE POLICY "View own settlement batches"
ON cash_settlement_batches FOR SELECT
USING (runner_id = auth.uid() OR get_user_role(auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "Runners create settlement batches"
ON cash_settlement_batches FOR INSERT
WITH CHECK (runner_id = auth.uid() AND settled_by = auth.uid());
```

### 3. Delivery Flow Enhancement

**File: `src/pages/driver/DriverInbox.tsx`**

Modify the delivery confirmation dialog to show payment method clearly:

- For TRANSFER: Auto-confirm, no cash liability created
- For CASH (COD): Show prominent "CASH COLLECTED" indicator

**File: `src/hooks/useDrivers.ts`**

Update `useDriverMarkDelivered` to trigger liability creation:

```typescript
// After marking as DRIVER_DELIVERED, the runner acceptance flow
// will create the cash liability via the runner accept endpoint
```

**File: `src/hooks/useCashLiabilities.ts`** (New)

```typescript
// Hook to manage cash liabilities
export function useCashLiabilities(runnerId?: string) {
  // Fetch open liabilities
  // Group by date (today, previous days)
  // Calculate totals
}

export function useSettleCash() {
  // Create settlement batch
  // Update all selected liabilities to SETTLED
  // Audit log the transaction
}

export function useAdminCashLiabilities(filters) {
  // Admin view with runner filter, date range, status
}
```

### 4. Integration Point: Runner Accepts Delivery

When runner accepts a driver's delivery (`useRunnerAcceptDelivery`), if order.payment_method = 'COD':

1. Create cash_liability record
2. runner_id = order.runner_id
3. cash_amount = order.total_amount
4. delivered_at = now()
5. status = 'OPEN'

**Updated hook logic:**

```typescript
// In useRunnerAcceptDelivery mutation
const orderPaymentMethod = order.payment_method;
if (orderPaymentMethod === 'COD') {
  await supabase.from('cash_liabilities').insert({
    runner_id: order.runner_id,
    order_id: order.id,
    order_code: order.order_code,
    cash_amount: order.total_amount,
    delivered_at: new Date().toISOString(),
    status: 'OPEN'
  });
}
```

### 5. Runner Cash Settlement View

**File: `src/pages/runner/RunnerCashSettlement.tsx`** (New)

UI Components:
- **Summary Card**: Total Outstanding Cash (large, prominent)
- **Grouped Liability List**:
  - Today's Cash: Expandable list with order details
  - Previous Days: Grouped by date, showing aging
- **Each Liability Row**:
  - Order Code | Customer | Delivered Time | Cash Amount
- **Settlement Action**:
  - "Confirm Cash Received" button
  - Confirmation modal with total amount
  - Optional note field
  - Settlement creates batch and marks all as SETTLED

### 6. Admin Cash Liability Dashboard

**File: `src/pages/admin/CashLiabilityAdmin.tsx`** (New)

Features:
- Filter by Runner (dropdown)
- Filter by Status (OPEN / SETTLED / All)
- Date range filter
- Table showing all liabilities with:
  - Runner Name | Order Code | Amount | Delivered At | Status | Settled At
- Click to drill down into specific liability
- Export functionality
- Summary cards:
  - Total Outstanding (OPEN)
  - Total Settled Today
  - Runners with Open Liabilities

### 7. Sidebar Navigation Updates

**File: `src/components/layout/AppSidebar.tsx`**

Add to runner section:
```typescript
{
  title: "Cash Settlement",
  url: "/runner/cash-settlement",
  icon: DollarSign,
  roles: ['runner']
}
```

Add to admin reconciliation section:
```typescript
{
  title: "Cash Liabilities",
  url: "/admin/cash-liabilities",
  icon: Banknote,
  roles: ['admin']
}
```

### 8. Risk Control (Optional Feature Flag)

Add to `feature_settings`:
- Key: `restrict_cash_orders_with_open_liability`
- Scope: RUNNER
- Default: false

When enabled, runners with OPEN liabilities cannot have new CASH orders assigned.

### 9. Audit Trail

All settlement actions logged to `audit_logs`:
```typescript
{
  entity_type: 'cash_settlement_batch',
  entity_id: batchId,
  action: 'CASH_SETTLED',
  before_json: { open_liabilities: count },
  after_json: { settled_amount: total, order_count: count }
}
```

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/xxx_cash_liabilities.sql` | Create | DB schema + RLS |
| `src/hooks/useCashLiabilities.ts` | Create | Data hooks |
| `src/pages/runner/RunnerCashSettlement.tsx` | Create | Runner settlement page |
| `src/pages/admin/CashLiabilityAdmin.tsx` | Create | Admin dashboard |
| `src/hooks/useDrivers.ts` | Modify | Add liability creation on accept |
| `src/components/layout/AppSidebar.tsx` | Modify | Add nav items |
| `src/App.tsx` | Modify | Add routes |
| `src/types/database.ts` | Modify | Add new types |

## Acceptance Criteria

1. Driver delivers CASH order -> Runner accepts -> Cash liability created
2. Driver delivers TRANSFER order -> No liability created
3. Runner sees outstanding cash grouped by date
4. Runner can settle cash and all liabilities marked as SETTLED
5. Admin can view all cash liabilities across all runners
6. No deletion of liability records possible
7. Settlement is permanent and audited
8. Each order can only have one liability record (unique constraint)

## Security Considerations

- Runners can only view/settle their own liabilities
- Admin/Manager can view all liabilities (read-only for non-admin)
- Settlement creates immutable audit trail
- No DELETE operations allowed on either table
- Settled records cannot be modified (constraint enforced)
