import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Loader2, Send, RefreshCw, CheckCircle, XCircle, Eye, EyeOff,
  Bot, Clock, Users, Shield, ChevronDown, ChevronUp, Save,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  useTelegramBotSettings, useUpdateBotSettings,
  useAllUserTelegramSettings, useAllTelegramPermissions,
  useUpsertTelegramPermission, useTelegramLogs,
  sendTelegramTest, triggerDailyReport,
  type TelegramPermission,
} from '@/hooks/useTelegram';

/* ── Types ── */
interface ProfileRow { id: string; display_name: string; role: string; is_active: boolean }
interface WarehouseRow { id: string; name: string; owner_user_id: string }

/* ── Component ── */
export default function TelegramAdminSettings() {
  const { user } = useAuth();

  // Queries
  const { data: botSettings, isLoading: loadingBot } = useTelegramBotSettings();
  const updateBot = useUpdateBotSettings();
  const { data: allUserSettings } = useAllUserTelegramSettings();
  const { data: allPermissions, refetch: refetchPerms } = useAllTelegramPermissions();
  const upsertPerm = useUpsertTelegramPermission();
  const { data: logs, refetch: refetchLogs } = useTelegramLogs(50);

  // Bot form state
  const [botToken, setBotToken] = useState('');
  const [botEnabled, setBotEnabled] = useState(false);
  const [dailySendTime, setDailySendTime] = useState('09:00');
  const [showToken, setShowToken] = useState(false);
  const [savingBot, setSavingBot] = useState(false);
  const [testingBot, setTestingBot] = useState(false);
  const [sendingDaily, setSendingDaily] = useState(false);

  // Profiles & warehouses for permission config
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  // Local edits for permissions (keyed by user_id)
  const [permEdits, setPermEdits] = useState<Record<string, Partial<TelegramPermission>>>({});

  useEffect(() => {
    if (botSettings) {
      setBotToken(botSettings.bot_token || '');
      setBotEnabled(botSettings.bot_enabled);
      setDailySendTime(botSettings.daily_send_time?.slice(0, 5) || '09:00');
    }
  }, [botSettings]);

  useEffect(() => {
    (async () => {
      const [pRes, wRes] = await Promise.all([
        supabase.from('profiles').select('id, display_name, role, is_active').eq('is_active', true).order('display_name'),
        supabase.from('warehouses').select('id, name, owner_user_id').eq('is_active', true).order('name'),
      ]);
      setProfiles((pRes.data || []) as ProfileRow[]);
      setWarehouses((wRes.data || []) as WarehouseRow[]);
    })();
  }, []);

  /* ── Bot actions ── */
  const handleSaveBot = async () => {
    setSavingBot(true);
    try {
      await updateBot.mutateAsync({
        bot_token: botToken || null,
        bot_enabled: botEnabled,
        daily_send_time: dailySendTime + ':00',
        // Reset last_auto_send_date so the cron re-evaluates with the new time today
        last_auto_send_date: null,
        updated_by: user?.id,
      } as any);
      toast.success('Telegram bot settings saved (auto-send scheduled)');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save bot settings');
    }
    setSavingBot(false);
  };

  const handleTestBot = async () => {
    if (!botToken) { toast.error('Enter a bot token first'); return; }
    // Find admin's own chat ID
    const adminSettings = allUserSettings?.find(s => s.user_id === user?.id);
    if (!adminSettings?.chat_id) { toast.error('Set your own Chat ID in user Telegram settings first'); return; }
    setTestingBot(true);
    try {
      await sendTelegramTest(adminSettings.chat_id, '✅ TomuPro Telegram bot connected successfully!');
      toast.success('Test message sent!');
    } catch (e: any) {
      toast.error(e.message || 'Test failed');
    }
    setTestingBot(false);
  };

  const handleSendDailyNow = async () => {
    setSendingDaily(true);
    try {
      const result = await triggerDailyReport();
      toast.success(`Daily report sent! ${result?.sent || 0} messages delivered.`);
      refetchLogs();
    } catch (e: any) {
      toast.error(e.message || 'Failed to send daily report');
    }
    setSendingDaily(false);
  };

  /* ── Permission helpers ── */
  const getPermForUser = useCallback((uid: string): Partial<TelegramPermission> => {
    if (permEdits[uid]) return permEdits[uid];
    const existing = allPermissions?.find(p => p.user_id === uid);
    return existing || { admin_enabled: false, can_receive_stock_balance: false, can_receive_delivered_not_claimed: false, see_all_stock: false, can_view_all_data: false, allowed_stock_owner_ids: [], allowed_warehouse_ids: [], allowed_runner_ids: [], allowed_team_user_ids: [] };
  }, [permEdits, allPermissions]);

  const updatePermEdit = (uid: string, field: string, value: any) => {
    setPermEdits(prev => {
      const existing = allPermissions?.find(p => p.user_id === uid);
      const base = existing || { admin_enabled: false, can_receive_stock_balance: false, can_receive_delivered_not_claimed: false, see_all_stock: false, allowed_stock_owner_ids: [], allowed_warehouse_ids: [] };
      const merged = { ...base, ...prev[uid], user_id: uid, [field]: value };
      return { ...prev, [uid]: merged };
    });
  };

  const handleSavePerm = async (uid: string) => {
    const perm = getPermForUser(uid);
    try {
      await upsertPerm.mutateAsync({
        user_id: uid,
        admin_enabled: perm.admin_enabled ?? false,
        can_receive_stock_balance: perm.can_receive_stock_balance ?? false,
        can_receive_delivered_not_claimed: perm.can_receive_delivered_not_claimed ?? false,
        see_all_stock: perm.see_all_stock ?? false,
        can_view_all_data: perm.can_view_all_data ?? false,
        allowed_stock_owner_ids: perm.allowed_stock_owner_ids || [],
        allowed_warehouse_ids: perm.allowed_warehouse_ids || [],
        allowed_runner_ids: perm.allowed_runner_ids || [],
        allowed_team_user_ids: perm.allowed_team_user_ids || [],
        updated_by: user?.id,
      } as any);
      toast.success('Permission saved');
      setPermEdits(prev => { const next = { ...prev }; delete next[uid]; return next; });
      refetchPerms();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save permission');
    }
  };

  const getUserChatStatus = (uid: string) => {
    const s = allUserSettings?.find(u => u.user_id === uid);
    return s?.chat_id ? 'connected' : 'not_connected';
  };

  if (loadingBot) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* ── Card 1: Bot Configuration ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Bot className={`h-5 w-5 ${botEnabled ? 'text-green-500' : 'text-muted-foreground'}`} />
            <div>
              <CardTitle className="text-lg">Telegram Bot Configuration</CardTitle>
              <CardDescription>Shared bot for all user notifications</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50">
            <div className="space-y-0.5">
              <Label className="font-medium text-foreground">Bot Enabled</Label>
              <p className="text-xs text-muted-foreground">Enable Telegram notifications for all permitted users</p>
            </div>
            <Switch checked={botEnabled} onCheckedChange={setBotEnabled} />
          </div>

          <div className="space-y-2">
            <Label>Bot API Token</Label>
            <div className="relative">
              <Input value={botToken} onChange={e => setBotToken(e.target.value)} type={showToken ? 'text' : 'password'} placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" className="pr-10 font-mono text-sm" />
              <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => setShowToken(!showToken)}>
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Get this from @BotFather on Telegram</p>
          </div>

          <div className="space-y-2">
            <Label>Daily Send Time</Label>
            <Input type="time" value={dailySendTime} onChange={e => setDailySendTime(e.target.value)} className="w-40" />
            <p className="text-xs text-muted-foreground">Time to send daily notifications (Brunei time BN +8). Report is sent automatically every day at this time — no need to keep the app open.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button onClick={handleSaveBot} disabled={savingBot}>
              {savingBot ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save Settings
            </Button>
            <Button variant="outline" onClick={handleTestBot} disabled={testingBot || !botToken}>
              {testingBot ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Test Bot
            </Button>
            <Button variant="outline" onClick={handleSendDailyNow} disabled={sendingDaily || !botEnabled}>
              {sendingDaily ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Clock className="h-4 w-4 mr-2" />}
              Send Daily Report Now
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Card 2: User Permissions ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">User Permissions</CardTitle>
              <CardDescription>Control which users receive Telegram notifications and what data they can see</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {profiles.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">No active users found.</p>
          ) : (
            <div className="space-y-3">
              {profiles.map(p => {
                const perm = getPermForUser(p.id);
                const chatStatus = getUserChatStatus(p.id);
                const isExpanded = expandedUser === p.id;
                const hasEdits = !!permEdits[p.id];
                return (
                  <div key={p.id} className="border border-border/50 rounded-lg overflow-hidden">
                    {/* Summary row */}
                    <div
                      className="flex items-center gap-3 p-3 cursor-pointer hover:bg-secondary/20 transition-colors"
                      onClick={() => setExpandedUser(isExpanded ? null : p.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{p.display_name}</span>
                          <Badge variant="outline" className="text-[10px] capitalize">{p.role}</Badge>
                          {chatStatus === 'connected' ? (
                            <Badge variant="outline" className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 gap-1"><CheckCircle className="h-3 w-3" />Connected</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground gap-1">Not Connected</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {perm.admin_enabled ? (
                          <Badge variant="outline" className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Enabled</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">Disabled</Badge>
                        )}
                        {hasEdits && <Badge className="text-[10px] bg-yellow-500">Unsaved</Badge>}
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>

                    {/* Expanded config */}
                    {isExpanded && (
                      <div className="border-t border-border/50 p-4 bg-secondary/10 space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="flex items-center justify-between p-2 rounded bg-background border border-border/30">
                            <Label className="text-xs">Admin Enabled</Label>
                            <Switch checked={perm.admin_enabled ?? false} onCheckedChange={v => updatePermEdit(p.id, 'admin_enabled', v)} />
                          </div>
                          <div className="flex items-center justify-between p-2 rounded bg-background border border-border/30">
                            <Label className="text-xs">Stock Balance</Label>
                            <Switch checked={perm.can_receive_stock_balance ?? false} onCheckedChange={v => updatePermEdit(p.id, 'can_receive_stock_balance', v)} />
                          </div>
                          <div className="flex items-center justify-between p-2 rounded bg-background border border-border/30">
                            <Label className="text-xs">Delivered Not Claimed</Label>
                            <Switch checked={perm.can_receive_delivered_not_claimed ?? false} onCheckedChange={v => updatePermEdit(p.id, 'can_receive_delivered_not_claimed', v)} />
                          </div>
                          <div className="flex items-center justify-between p-2 rounded bg-background border border-border/30">
                            <Label className="text-xs">See All Data (Master)</Label>
                            <Switch checked={perm.can_view_all_data ?? false} onCheckedChange={v => updatePermEdit(p.id, 'can_view_all_data', v)} />
                          </div>
                        </div>

                        {/* Granular selectors — only shown when can_view_all_data is off */}
                        {!perm.can_view_all_data && (
                          <>
                            {/* Stock Owner multi-select */}
                            <div className="space-y-2">
                              <Label className="text-xs font-medium">Allowed Stock Owners</Label>
                              <div className="flex flex-wrap gap-2">
                                {profiles.filter(pr => pr.role === 'salesperson' || pr.role === 'runner' || pr.role === 'manager').map(owner => {
                                  const selected = (perm.allowed_stock_owner_ids || []).includes(owner.id);
                                  return (
                                    <Badge
                                      key={owner.id}
                                      variant={selected ? 'default' : 'outline'}
                                      className={`cursor-pointer text-[11px] ${selected ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}
                                      onClick={() => {
                                        const ids = perm.allowed_stock_owner_ids || [];
                                        const next = selected ? ids.filter(i => i !== owner.id) : [...ids, owner.id];
                                        updatePermEdit(p.id, 'allowed_stock_owner_ids', next);
                                      }}
                                    >
                                      {owner.display_name}
                                    </Badge>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Allowed Runners multi-select */}
                            <div className="space-y-2">
                              <Label className="text-xs font-medium">Allowed Runners</Label>
                              <div className="flex flex-wrap gap-2">
                                {profiles.filter(pr => pr.role === 'runner').map(runner => {
                                  const selected = (perm.allowed_runner_ids || []).includes(runner.id);
                                  return (
                                    <Badge
                                      key={runner.id}
                                      variant={selected ? 'default' : 'outline'}
                                      className={`cursor-pointer text-[11px] ${selected ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}
                                      onClick={() => {
                                        const ids = perm.allowed_runner_ids || [];
                                        const next = selected ? ids.filter(i => i !== runner.id) : [...ids, runner.id];
                                        updatePermEdit(p.id, 'allowed_runner_ids', next);
                                      }}
                                    >
                                      {runner.display_name}
                                    </Badge>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Allowed Team Users multi-select */}
                            <div className="space-y-2">
                              <Label className="text-xs font-medium">Allowed Team Users</Label>
                              <div className="flex flex-wrap gap-2">
                                {profiles.filter(pr => pr.id !== p.id).map(teamUser => {
                                  const selected = (perm.allowed_team_user_ids || []).includes(teamUser.id);
                                  return (
                                    <Badge
                                      key={teamUser.id}
                                      variant={selected ? 'default' : 'outline'}
                                      className={`cursor-pointer text-[11px] ${selected ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}
                                      onClick={() => {
                                        const ids = perm.allowed_team_user_ids || [];
                                        const next = selected ? ids.filter(i => i !== teamUser.id) : [...ids, teamUser.id];
                                        updatePermEdit(p.id, 'allowed_team_user_ids', next);
                                      }}
                                    >
                                      {teamUser.display_name} <span className="opacity-60 ml-1">{teamUser.role}</span>
                                    </Badge>
                                  );
                                })}
                              </div>
                            </div>
                          </>
                        )}

                        <div className="flex justify-end">
                          <Button size="sm" onClick={() => handleSavePerm(p.id)} disabled={upsertPerm.isPending}>
                            {upsertPerm.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                            Save Permissions
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Card 3: Notification Logs ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg">Notification Logs</CardTitle>
                <CardDescription>Recent Telegram notification history</CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => refetchLogs()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {(!logs || logs.length === 0) ? (
            <p className="text-center text-muted-foreground py-8 text-sm">No notification logs yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">User</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Time</TableHead>
                    <TableHead className="text-xs">Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map(log => {
                    const profile = profiles.find(p => p.id === log.user_id);
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs font-medium">{profile?.display_name || log.user_id.slice(0, 8)}</TableCell>
                        <TableCell className="text-xs capitalize">{log.notification_type.replace('_', ' ')}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] gap-1 ${log.status === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
                            {log.status === 'success' ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            {log.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{format(new Date(log.sent_at), 'dd MMM HH:mm')}</TableCell>
                        <TableCell className="text-xs text-destructive max-w-[200px] truncate">{log.error_message || '-'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
