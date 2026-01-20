-- Fix the remaining duplicate active warehouses manually

-- 1. For HC (manager): keep the warehouse with more stock, deactivate others
-- First check which has more stock
WITH hc_warehouses AS (
  SELECT 
    w.id,
    COALESCE(SUM(sm.qty_change), 0) as balance
  FROM warehouses w
  LEFT JOIN stock_movements sm ON sm.warehouse_id = w.id
  WHERE w.owner_user_id = '84973d2b-d29b-41c2-a4a3-f628d9434853'
    AND w.is_active = true
  GROUP BY w.id
  ORDER BY balance DESC
)
UPDATE warehouses
SET is_active = false
WHERE id IN (SELECT id FROM hc_warehouses OFFSET 1);

-- 2. For KAIWEI (manager): keep the warehouse with more stock, deactivate others
WITH kw_warehouses AS (
  SELECT 
    w.id,
    COALESCE(SUM(sm.qty_change), 0) as balance
  FROM warehouses w
  LEFT JOIN stock_movements sm ON sm.warehouse_id = w.id
  WHERE w.owner_user_id = 'b97d569a-a950-444d-a820-114d2e8cbc2e'
    AND w.is_active = true
  GROUP BY w.id
  ORDER BY balance DESC
)
UPDATE warehouses
SET is_active = false
WHERE id IN (SELECT id FROM kw_warehouses OFFSET 1);

-- 3. For SP (salesperson): deactivate MANAGER warehouse, keep SALESPERSON
UPDATE warehouses
SET is_active = false
WHERE owner_user_id = '4bf9d756-3c4e-4672-bce4-06709c6cea8d'
  AND warehouse_type = 'MANAGER';

-- 4. Now create the unique index
DROP INDEX IF EXISTS idx_unique_active_warehouse_per_user;

CREATE UNIQUE INDEX idx_unique_active_warehouse_per_user 
ON warehouses (owner_user_id) 
WHERE is_active = true;