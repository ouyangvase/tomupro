-- Drop existing RLS policies on profiles
DROP POLICY IF EXISTS "Profiles viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Profiles viewable by all authenticated" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Admin and Manager can read all profiles
CREATE POLICY "Admin and Manager can read all profiles"
ON public.profiles
FOR SELECT
USING (
  get_user_role(auth.uid()) IN ('admin'::app_role, 'manager'::app_role)
);

-- Other users can only read their own profile
CREATE POLICY "Users can read own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() = id);

-- Admin can update any profile
CREATE POLICY "Admin can update all profiles"
ON public.profiles
FOR UPDATE
USING (get_user_role(auth.uid()) = 'admin'::app_role);

-- Users can update their own profile (excluding role)
-- Note: Role changes are only allowed via Admin, enforced in application logic
CREATE POLICY "Users can update own profile fields"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id);