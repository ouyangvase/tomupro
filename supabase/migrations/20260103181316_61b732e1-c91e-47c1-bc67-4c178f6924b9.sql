-- Allow runners to view products that are referenced in their driver pickup items
CREATE POLICY "Runner can view products in their pickups"
ON public.products
FOR SELECT
USING (
  (get_user_role(auth.uid()) = 'runner'::app_role) 
  AND EXISTS (
    SELECT 1 
    FROM driver_pickups dp
    JOIN driver_pickup_items dpi ON dpi.pickup_id = dp.id
    WHERE dp.runner_id = auth.uid() 
    AND dpi.product_id = products.id
  )
);

-- Also allow runners to view products from orders assigned to them
CREATE POLICY "Runner can view products in their orders"
ON public.products
FOR SELECT
USING (
  (get_user_role(auth.uid()) = 'runner'::app_role) 
  AND EXISTS (
    SELECT 1 
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.runner_id = auth.uid() 
    AND oi.product_id = products.id
  )
);

-- Allow drivers to view products in their assigned orders
CREATE POLICY "Driver can view products in their orders"
ON public.products
FOR SELECT
USING (
  (get_user_role(auth.uid()) = 'driver'::app_role) 
  AND EXISTS (
    SELECT 1 
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.driver_id = auth.uid() 
    AND oi.product_id = products.id
  )
);

-- Allow drivers to view products in their pickups
CREATE POLICY "Driver can view products in their pickups"
ON public.products
FOR SELECT
USING (
  (get_user_role(auth.uid()) = 'driver'::app_role) 
  AND EXISTS (
    SELECT 1 
    FROM driver_pickups dp
    JOIN driver_pickup_items dpi ON dpi.pickup_id = dp.id
    WHERE dp.driver_id = auth.uid() 
    AND dpi.product_id = products.id
  )
);