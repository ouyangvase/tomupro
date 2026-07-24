ALTER TABLE public.runner_assistants
  ADD COLUMN IF NOT EXISTS can_manage_driver_stock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_driver_inbox boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.runner_assistants.can_manage_driver_stock IS
  'Allows runner assistants to manage pickup, return, and allocated stock workflows for the assigned runner without cash settlement.';

COMMENT ON COLUMN public.runner_assistants.can_manage_driver_inbox IS
  'Allows runner assistants to access the assigned runner Driver Inbox bulk assignment workflow.';

NOTIFY pgrst, 'reload schema';
