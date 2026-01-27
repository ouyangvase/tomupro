-- Performance indexes to speed up RLS policy execution
CREATE INDEX IF NOT EXISTS idx_profiles_id_role ON profiles(id) INCLUDE (role);
CREATE INDEX IF NOT EXISTS idx_manager_salesperson_bindings_active ON manager_salesperson_bindings(manager_id, salesperson_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_user_data_shares_viewer_active ON user_data_shares(viewer_user_id, subject_user_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_orders_salesperson_runner ON orders(salesperson_id, runner_id);
CREATE INDEX IF NOT EXISTS idx_group_members_lookup ON group_members(group_id, member_user_id);