import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const reportSource = readFileSync(
  resolve(process.cwd(), 'supabase/functions/send-telegram-daily/index.ts'),
  'utf8',
);

describe('Telegram daily report authorization', () => {
  it('uses each user subscription without an admin activation gate', () => {
    expect(reportSource).toContain("from('telegram_notification_permissions')");
    expect(reportSource).not.toContain(".eq('admin_enabled', true)");
    expect(reportSource).toContain('for (const userSetting of (userSettings as any[]))');
    expect(reportSource).toContain('configuredPermission?.admin_enabled');
    expect(reportSource).toContain('const wantsStock = !!userSetting.receive_stock_balance');
    expect(reportSource).toContain('const wantsDelivered = !!userSetting.receive_delivered_not_claimed');
  });

  it('keeps shared runner, team, owner, and warehouse scope in the report', () => {
    expect(reportSource).toContain('allowed_stock_owner_ids');
    expect(reportSource).toContain('allowed_runner_ids');
    expect(reportSource).toContain('allowed_team_user_ids');
    expect(reportSource).toContain('allowed_warehouse_ids');
    expect(reportSource).toContain('bindings');
    expect(reportSource).toContain('if (!seeAll)');
  });

  it('uses the existing failed-delivery preference in the daily report', () => {
    expect(reportSource).toContain('receive_failed_delivery');
    expect(reportSource).toContain('driver_status.eq.DRIVER_FAILED');
    expect(reportSource).toContain('runner_status.eq.FAILED_DELIVERY');
  });
});
