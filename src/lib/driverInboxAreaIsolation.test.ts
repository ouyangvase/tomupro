import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();
const driverInboxSource = readFileSync(
  resolve(projectRoot, 'src/pages/runner/RunnerDriverInbox.tsx'),
  'utf8',
);
const isolationMigration = readFileSync(
  resolve(
    projectRoot,
    'supabase/migrations/20260731100000_isolate_driver_inbox_delivery_area.sql',
  ),
  'utf8',
);
const manualAssignmentMigration = readFileSync(
  resolve(
    projectRoot,
    'supabase/migrations/20260731211500_allow_manual_driver_assignment_before_zone_review.sql',
  ),
  'utf8',
);
const sharedRunnerCorrectionMigration = readFileSync(
  resolve(
    projectRoot,
    'supabase/migrations/20260802123437_allow_bound_runners_to_correct_delivery_zones.sql',
  ),
  'utf8',
);

describe('Driver Inbox business-area isolation', () => {
  it('does not use the canonical business area as a Driver Inbox zone fallback', () => {
    expect(driverInboxSource).not.toContain('normalizeText(order.area)');
    expect(driverInboxSource).not.toContain('delivery_area_name || order.area');
  });

  it('keeps automatic and manual delivery-zone writes away from orders.area', () => {
    const classifyFunction = isolationMigration.split(
      'CREATE OR REPLACE FUNCTION public.correct_order_delivery_area',
    )[0];
    const correctionFunction = isolationMigration
      .split('CREATE OR REPLACE FUNCTION public.correct_order_delivery_area')[1]
      .split('CREATE OR REPLACE FUNCTION public.canonicalize_order_delivery_area')[0];

    expect(classifyFunction).not.toMatch(/\n\s*area\s*=/);
    expect(correctionFunction).not.toMatch(/\n\s*area\s*=/);
  });

  it('does not let dispatch grouping fall back to the canonical business area', () => {
    expect(isolationMigration).not.toContain('legacy_order_area_code(o.area)');
    expect(isolationMigration).not.toContain('UPDATE OF address, area, status');
  });

  it('requires a snapshot and evidence before production repair', () => {
    expect(isolationMigration).toContain(
      'private.driver_inbox_area_isolation_repair_20260731',
    );
    expect(isolationMigration).toContain(
      'v_total <> 44 OR v_safe <> 41 OR v_manual <> 3',
    );
    expect(isolationMigration).toContain(
      'o.area = snapshot.area_before',
    );
  });

  it('allows manual assignment before zone review without weakening dated zone assignment', () => {
    expect(manualAssignmentMigration).toContain(
      "IN ('SELF_PICKUP', 'CANCELLED')",
    );
    expect(manualAssignmentMigration).toContain(
      "p_operational_date IS NOT NULL",
    );
    expect(manualAssignmentMigration).toContain(
      ") = 'NEEDS_REVIEW'",
    );
    expect(manualAssignmentMigration).not.toContain(
      "IN ('SELF_PICKUP', 'CANCELLED', 'NEEDS_REVIEW')",
    );
  });

  it('lets a runner correct zones for actively bound drivers without opening unrelated orders', () => {
    expect(sharedRunnerCorrectionMigration).toContain(
      'runner_can_manage_delivery_area_order',
    );
    expect(sharedRunnerCorrectionMigration).toContain(
      'rd.runner_id = p_runner_id',
    );
    expect(sharedRunnerCorrectionMigration).toContain(
      'rd.driver_id = p_driver_id',
    );
    expect(sharedRunnerCorrectionMigration).toContain('rd.is_active = true');
    expect(sharedRunnerCorrectionMigration).toContain(
      'p_order_runner_id = p_runner_id',
    );
    expect(sharedRunnerCorrectionMigration).toContain(
      'REVOKE ALL ON FUNCTION public.runner_can_manage_delivery_area_order',
    );
  });

  it('keeps a delivery-zone correction action visible for already-classified orders', () => {
    expect(driverInboxSource).toContain("'Change Delivery Zone'");
    expect(driverInboxSource).toContain("'Resolve Delivery Zone'");
    expect(driverInboxSource).toContain('handleOpenAreaCorrection([order.id])');
    expect(driverInboxSource).not.toContain('!isNormalArea(areaCode) ? (');
  });
});
