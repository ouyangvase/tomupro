import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RunnerAssignmentScope } from '@/hooks/useAssignableRunners';

const assignmentGuardSql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260808170000_enforce_runner_assignment_bindings.sql'),
  'utf8',
);

describe('runner assignment scope contract', () => {
  it('models the three authorization scopes used by every runner selector', () => {
    const scopes: RunnerAssignmentScope[] = [
      { type: 'all' },
      { type: 'salesperson', salespersonId: 'salesperson-1' },
      { type: 'manager', managerId: 'manager-1' },
    ];

    expect(scopes).toHaveLength(3);
    expect(scopes.map((scope) => scope.type)).toEqual(['all', 'salesperson', 'manager']);
  });

  it('keeps the database guard aligned with the same binding rules', () => {
    expect(assignmentGuardSql).toContain('CREATE OR REPLACE FUNCTION public.enforce_runner_assignment_binding()');
    expect(assignmentGuardSql).toContain("b.active = true");
    expect(assignmentGuardSql).toContain('public.manager_runner_bindings');
    expect(assignmentGuardSql).toContain('OLD.salesperson_id IS NOT DISTINCT FROM NEW.salesperson_id');
    expect(assignmentGuardSql).toContain('Runner is not bound to this user');
  });
});
