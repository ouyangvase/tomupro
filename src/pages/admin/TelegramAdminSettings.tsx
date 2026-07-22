import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Bell,
  Bot,
  CheckCircle,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  MessageSquare,
  Save,
  Send,
  Settings,
  Users,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  sendTelegramTest,
  triggerDailyReport,
  useAllUserTelegramSettings,
  useTelegramBotSettings,
  useTelegramLogs,
  useUpdateBotSettings,
} from '@/hooks/useTelegram';

interface ProfileRow {
  id: string;
  display_name: string;
  role: string;
  is_active: boolean;
}

const roleLabels: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  salesperson: 'Salesperson',
  runner: 'Runner',
  driver: 'Driver',
  runner_assistant: 'Runner assistant',
};

export default function TelegramAdminSettings() {
  const { user } = useAuth();

  const { data: botSettings, isLoading: loadingBot } = useTelegramBotSettings();
  const { data: allUserSettings } = useAllUserTelegramSettings();
  const { data: logs, refetch: refetchLogs } = useTelegramLogs(50);
  const updateBot = useUpdateBotSettings();

  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [botToken, setBotToken] = useState('');
  const [botEnabled, setBotEnabled] = useState(false);
  const [dailySendTime, setDailySendTime] = useState('09:00');
  const [showToken, setShowToken] = useState(false);
  const [savingBot, setSavingBot] = useState(false);
  const [testingBot, setTestingBot] = useState(false);
  const [sendingDaily, setSendingDaily] = useState(false);

  useEffect(() => {
    if (!botSettings) return;
    setBotToken(botSettings.bot_token || '');
    setBotEnabled(botSettings.bot_enabled);
    setDailySendTime(botSettings.daily_send_time?.slice(0, 5) || '09:00');
  }, [botSettings]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, role, is_active')
        .eq('is_active', true)
        .order('display_name');

      setProfiles((data || []) as ProfileRow[]);
    })();
  }, []);

  const userRows = useMemo(() => {
    return profiles.map((profile) => {
      const settings = allUserSettings?.find((item) => item.user_id === profile.id);
      return {
        ...profile,
        chatId: settings?.chat_id || null,
        telegramEnabled: settings?.telegram_enabled ?? false,
        receiveStock: settings?.receive_stock_balance ?? false,
        receiveDelivery: settings?.receive_delivered_not_claimed ?? false,
        receiveDriver: (settings as any)?.receive_delivery_events ?? false,
        receiveTeam: (settings as any)?.receive_team_order_updates ?? (settings as any)?.receive_team_delivery_events ?? false,
      };
    });
  }, [allUserSettings, profiles]);

  const stats = useMemo(() => {
    const connectedUsers = userRows.filter((row) => !!row.chatId).length;
    const activeUsers = userRows.filter((row) => !!row.chatId && row.telegramEnabled).length;
    const teamUpdateUsers = userRows.filter((row) => row.receiveTeam).length;
    const latestSuccess = logs?.find((log) => log.status === 'success') || null;

    return {
      totalUsers: userRows.length,
      connectedUsers,
      activeUsers,
      teamUpdateUsers,
      latestSuccess,
    };
  }, [logs, userRows]);

  const handleSaveBot = async () => {
    setSavingBot(true);
    try {
      await updateBot.mutateAsync({
        bot_token: botToken || null,
        bot_enabled: botEnabled,
        daily_send_time: `${dailySendTime}:00`,
        last_auto_send_date: null,
        updated_by: user?.id,
      } as any);
      toast.success('Telegram bot settings saved');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save bot settings');
    } finally {
      setSavingBot(false);
    }
  };

  const handleTestBot = async () => {
    if (!botToken) {
      toast.error('Enter a bot token first');
      return;
    }

    const mySettings = allUserSettings?.find((item) => item.user_id === user?.id);
    if (!mySettings?.chat_id) {
      toast.error('Open My Telegram Setup and save your Chat ID first');
      return;
    }

    setTestingBot(true);
    try {
      await sendTelegramTest(mySettings.chat_id, 'TomuPro Telegram bot test successful.\n\nYour account can receive Telegram notifications.');
      toast.success('Test message sent');
      refetchLogs();
    } catch (e: any) {
      toast.error(e.message || 'Test failed');
    } finally {
      setTestingBot(false);
    }
  };

  const handleSendDailyNow = async () => {
    setSendingDaily(true);
    try {
      const result = await triggerDailyReport();
      toast.success(`Daily report sent. ${result?.sent || 0} message(s) delivered.`);
      refetchLogs();
    } catch (e: any) {
      toast.error(e.message || 'Failed to send daily report');
    } finally {
      setSendingDaily(false);
    }
  };

  if (loadingBot) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="rounded-[1.25rem] border border-border/60 bg-background/95 p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <MessageSquare className="h-3.5 w-3.5" />
              Telegram self-service
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              Telegram notifications
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Each user connects their own Telegram account and chooses their reports at My Telegram Setup.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[520px]">
            <div className="rounded-2xl border border-border/60 bg-secondary/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bot</p>
              <p className="mt-1 text-lg font-bold">{botEnabled ? 'On' : 'Off'}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-secondary/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Connected</p>
              <p className="mt-1 text-lg font-bold">{stats.connectedUsers}/{stats.totalUsers}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-secondary/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Enabled</p>
              <p className="mt-1 text-lg font-bold">{stats.activeUsers}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-secondary/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Team updates</p>
              <p className="mt-1 text-lg font-bold">{stats.teamUpdateUsers}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="rounded-[1.25rem] border-border/60">
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Shared bot configuration</CardTitle>
                <CardDescription>
                  This is the only system-level control. User subscriptions are managed by each user.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-[1fr_180px]">
              <div className="space-y-2">
                <Label>Bot API token</Label>
                <div className="relative">
                  <Input
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    type={showToken ? 'text' : 'password'}
                    placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                    className="h-11 pr-11 font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2"
                    onClick={() => setShowToken((value) => !value)}
                    aria-label={showToken ? 'Hide bot token' : 'Show bot token'}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Use the existing TOMUPRO bot token from BotFather. Do not share this token with users.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Daily send time</Label>
                <Input
                  type="time"
                  value={dailySendTime}
                  onChange={(e) => setDailySendTime(e.target.value)}
                  className="h-11"
                />
                <p className="text-xs text-muted-foreground">Brunei time.</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
              <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-secondary/20 p-4">
                <div>
                  <Label className="text-sm font-semibold">Enable Telegram bot</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    When enabled, all users with a saved Chat ID and their own toggles can receive notifications.
                  </p>
                </div>
                <Switch checked={botEnabled} onCheckedChange={setBotEnabled} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSaveBot} disabled={savingBot}>
                  {savingBot ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save bot
                </Button>
                <Button variant="outline" onClick={handleTestBot} disabled={testingBot || !botToken}>
                  {testingBot ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Test bot
                </Button>
                <Button variant="outline" onClick={handleSendDailyNow} disabled={sendingDaily || !botEnabled}>
                  {sendingDaily ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock className="mr-2 h-4 w-4" />}
                  Send daily now
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[1.25rem] border-border/60">
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Settings className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">User setup</CardTitle>
                <CardDescription>Runner, salesperson and manager users set up Telegram themselves.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-secondary/20 p-4">
              <p className="text-sm font-semibold">How it works</p>
              <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>1. Open the TOMUPRO Telegram bot.</li>
                <li>2. Save Chat ID in My Telegram Setup.</li>
                <li>3. Choose report and driver-update toggles.</li>
              </ol>
            </div>

            <div className="grid gap-2">
              <Button asChild>
                <Link to="/settings/telegram">
                  <Bell className="mr-2 h-4 w-4" />
                  Open My Telegram Setup
                </Link>
              </Button>
              <Button asChild variant="outline">
                <a href="https://t.me/ADDFD3BOT" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open @ADDFD3BOT
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[1.25rem] border-border/60">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Connected users</CardTitle>
                <CardDescription>Read-only status. Users control their own Telegram account and notification toggles.</CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="w-fit">
              {stats.connectedUsers} connected
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {userRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No active users found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Connection</TableHead>
                    <TableHead>Chat ID</TableHead>
                    <TableHead>Reports</TableHead>
                    <TableHead>Team updates</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="min-w-[180px] font-medium">{row.display_name}</TableCell>
                      <TableCell>{roleLabels[row.role] || row.role}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={row.chatId && row.telegramEnabled
                            ? 'border-green-200 bg-green-50 text-green-700'
                            : row.chatId
                              ? 'border-amber-200 bg-amber-50 text-amber-700'
                              : 'text-muted-foreground'}
                        >
                          {row.chatId && row.telegramEnabled ? 'Enabled' : row.chatId ? 'Connected, off' : 'Not connected'}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-[140px] font-mono text-sm">
                        {row.chatId || <span className="font-sans text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {row.receiveStock && <Badge variant="secondary">Stock</Badge>}
                          {row.receiveDelivery && <Badge variant="secondary">Delivery</Badge>}
                          {row.receiveDriver && <Badge variant="secondary">Driver</Badge>}
                          {!row.receiveStock && !row.receiveDelivery && !row.receiveDriver && (
                            <span className="text-sm text-muted-foreground">No reports selected</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{row.receiveTeam ? 'On' : 'Off'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[1.25rem] border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">Notification history</CardTitle>
              <CardDescription>Recent Telegram delivery attempts from reports and driver updates.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {(!logs || logs.length === 0) ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No notification logs yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const profile = profiles.find((item) => item.id === log.user_id);
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="min-w-[160px] font-medium">
                          {profile?.display_name || log.user_id.slice(0, 8)}
                        </TableCell>
                        <TableCell className="capitalize">{log.notification_type.replace(/_/g, ' ')}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={log.status === 'success'
                              ? 'gap-1 border-green-200 bg-green-50 text-green-700'
                              : 'gap-1 border-destructive/20 bg-destructive/10 text-destructive'}
                          >
                            {log.status === 'success' ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            {log.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(log.sent_at), 'dd MMM yyyy, HH:mm')}
                        </TableCell>
                        <TableCell className="max-w-[280px] truncate text-destructive">
                          {log.error_message || '-'}
                        </TableCell>
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
