-- Fix: Allow deleting user_data_shares by setting audit log references to NULL
-- Drop the existing foreign key constraint
ALTER TABLE public.access_audit_log
DROP CONSTRAINT IF EXISTS access_audit_log_share_id_fkey;

-- Re-add the foreign key with ON DELETE SET NULL
ALTER TABLE public.access_audit_log
ADD CONSTRAINT access_audit_log_share_id_fkey
FOREIGN KEY (share_id) REFERENCES public.user_data_shares(id)
ON DELETE SET NULL;