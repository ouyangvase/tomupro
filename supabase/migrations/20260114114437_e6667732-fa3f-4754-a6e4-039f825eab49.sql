-- Create manager_runner_bindings table
CREATE TABLE public.manager_runner_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  runner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id),
  UNIQUE(manager_id, runner_id)
);

-- Enable RLS
ALTER TABLE public.manager_runner_bindings ENABLE ROW LEVEL SECURITY;

-- SELECT: admin or own bindings
CREATE POLICY "manager_runner_bindings_select"
ON public.manager_runner_bindings
FOR SELECT
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  OR manager_id = auth.uid()
);

-- INSERT: admin or manager creating their own binding
CREATE POLICY "manager_runner_bindings_insert"
ON public.manager_runner_bindings
FOR INSERT
WITH CHECK (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  OR (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'manager'
    AND manager_id = auth.uid()
  )
);

-- UPDATE: admin or manager updating their own binding
CREATE POLICY "manager_runner_bindings_update"
ON public.manager_runner_bindings
FOR UPDATE
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  OR (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'manager'
    AND manager_id = auth.uid()
  )
);

-- DELETE: admin or manager deleting their own binding
CREATE POLICY "manager_runner_bindings_delete"
ON public.manager_runner_bindings
FOR DELETE
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  OR (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'manager'
    AND manager_id = auth.uid()
  )
);

-- Add index for performance
CREATE INDEX idx_manager_runner_bindings_manager ON public.manager_runner_bindings(manager_id);
CREATE INDEX idx_manager_runner_bindings_runner ON public.manager_runner_bindings(runner_id);