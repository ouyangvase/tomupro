-- First, deduplicate existing SKU codes by appending a suffix to duplicates
-- This uses a CTE with ROW_NUMBER to identify duplicates and update them

WITH duplicates AS (
  SELECT id, sku_code, owner_user_id,
    ROW_NUMBER() OVER (PARTITION BY owner_user_id, UPPER(TRIM(sku_code)) ORDER BY created_at) as rn
  FROM products
  WHERE sku_code IS NOT NULL AND TRIM(sku_code) <> ''
)
UPDATE products p
SET sku_code = p.sku_code || '-DUP' || d.rn
FROM duplicates d
WHERE p.id = d.id AND d.rn > 1;

-- Now create the unique partial index
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_owner_sku_unique 
ON public.products (owner_user_id, UPPER(TRIM(sku_code)))
WHERE sku_code IS NOT NULL AND TRIM(sku_code) <> '';