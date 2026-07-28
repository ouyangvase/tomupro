import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import {
  Loader2, Send, Save, CheckCircle, XCircle, MessageSquare, Bell,
  ExternalLink, Wifi, WifiOff, Clock, ArrowRight,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  useMyTelegramSettings, useUpsertMyTelegramSettings,
  useMyLatestTelegramLog,
  sendTelegramTest,
} from '@/hooks/useTelegram';

const TELEGRAM_CHAT_ID_PATTERN = /^-?\d+$/;

export default function TelegramUserSettings() {
  const { user, profile } = useAuth();
  const userId = user?.id;
  const role = profile?.role;

  const { data: settings, isLoading } = useMyTelegramSettings(userId);
  const { data: latestLog } = useMyLatestTelegramLog(userId);
  const upsertSettings = useUpsertMyTelegramSettings();

  const [chatId, setChatId] = useState('');
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [receiveStock, setReceiveStock] = useState(true);
  const [receiveDelivered, setReceiveDelivered] = useState(true);
  const [receiveFailedDelivery, setReceiveFailedDelivery] = useState(true);
  const [hideZeroStock, setHideZeroStock] = useState(false);
  const [receiveReceiptEvents, setReceiveReceiptEvents] = useState(true);
  const [receiveDeliveryEvents, setReceiveDeliveryEvents] = useState(true);
  const [receiveTeamDeliveryEvents, setReceiveTeamDeliveryEvents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (settings) {
      setChatId(settings.chat_id || '');
      setTelegramEnabled(settings.telegram_enabled);
      setReceiveStock(settings.receive_stock_balance);
      setReceiveDelivered(settings.receive_delivered_not_claimed);
      setReceiveFailedDelivery((settings as any).receive_failed_delivery ?? true);
      setHideZeroStock(settings.hide_zero_stock_sku);
      setReceiveReceiptEvents((settings as any).receive_receipt_events ?? true);
      setReceiveDeliveryEvents((settings as any).receive_delivery_events ?? true);
      setReceiveTeamDeliveryEvents(
        (settings as any).receive_team_order_updates
        ?? (settings as any).receive_team_delivery_events
        ?? false
      );
    }
  }, [settings]);

  const handleSave = async () => {
    if (!userId) return;
    const normalizedChatId = chatId.trim();
    if (normalizedChatId && !TELEGRAM_CHAT_ID_PATTERN.test(normalizedChatId)) {
      toast.error('Enter a valid personal or group Chat ID using numbers only');
      return;
    }

    setSaving(true);
    try {
      await upsertSettings.mutateAsync({
        user_id: userId,
        chat_id: normalizedChatId || null,
        telegram_enabled: telegramEnabled,
        receive_stock_balance: receiveStock,
        receive_delivered_not_claimed: receiveDelivered,
        receive_failed_delivery: receiveFailedDelivery,
        receive_delivered_order: receiveDelivered,
        hide_zero_stock_sku: hideZeroStock,
        receive_receipt_events: receiveReceiptEvents,
        receive_delivery_events: receiveDeliveryEvents,
        receive_team_delivery_events: receiveTeamDeliveryEvents,
        receive_team_order_updates: receiveTeamDeliveryEvents,
      } as any);
      setChatId(normalizedChatId);
      toast.success('Settings saved successfully');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save settings');
    }
    setSaving(false);
  };

  const handleTest = async () => {
    const normalizedChatId = chatId.trim();
    if (!normalizedChatId) { toast.error('Enter your Chat ID first'); return; }
    if (!TELEGRAM_CHAT_ID_PATTERN.test(normalizedChatId)) {
      toast.error('Enter a valid personal or group Chat ID using numbers only');
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      await sendTelegramTest(normalizedChatId, 'TomuPro Telegram connection test successful!\n\nYou will receive daily notifications here.');
      setTestResult({ ok: true, message: 'Message sent! Check your Telegram.' });
      toast.success('Test message sent! Check your Telegram.');
    } catch (e: any) {
      const msg = e.message || 'Test failed. Make sure you have started @ADDFD3BOT on Telegram first.';
      setTestResult({ ok: false, message: msg });
      toast.error(msg);
    }
    setTesting(false);
  };

  const isConnected = !!chatId.trim();
  const canStock = true;
  const canDelivered = true;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-5 max-w-xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <MessageSquare className="h-4.5 w-4.5 text-primary" />
            </div>
            Telegram Notifications
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 ml-[46px]">
            Receive daily stock and delivery reports via Telegram.
          </p>
        </div>

        {/* Connection Status Card */}
        <Card className="rounded-2xl border-border/50 overflow-hidden">
          <div className={`px-5 py-4 border-b border-border/30 ${isConnected ? 'bg-green-50/50 dark:bg-green-950/20' : 'bg-secondary/20'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isConnected ? (
                  <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                    <Wifi className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                ) : (
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                    <WifiOff className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold">{isConnected ? 'Connected' : 'Not Connected'}</p>
                  {isConnected && <p className="text-xs text-muted-foreground font-mono">Chat ID: {chatId}</p>}
                </div>
              </div>
              <Badge
                variant="outline"
                className={`text-[10px] ${isConnected
                  ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
                  : 'text-muted-foreground'}`}
              >
                {isConnected ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Chat ID Input */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Chat ID</Label>
              <Input
                value={chatId}
                onChange={e => setChatId(e.target.value)}
                placeholder="Personal: 123456789 · Group: -1001234567890"
                className="font-mono h-10 rounded-xl"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <div className="space-y-1 text-[11px] text-muted-foreground">
                <p>
                  Personal: send <span className="font-mono font-semibold">/start</span> to <span className="font-semibold">@userinfobot</span>.
                </p>
                <p>
                  Group: add <span className="font-semibold">@ADDFD3BOT</span>, allow it to send messages, then enter the negative group ID (usually <span className="font-mono font-semibold">-100...</span>).
                </p>
              </div>
            </div>

            {/* Enable Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/40">
              <div className="space-y-0.5">
                <Label className="font-medium text-sm">Enable Notifications</Label>
                <p className="text-[11px] text-muted-foreground">Receive daily reports via Telegram</p>
              </div>
              <Switch checked={telegramEnabled} onCheckedChange={setTelegramEnabled} />
            </div>

            {/* Last Notification & Bot Setup */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {latestLog && (
                <div className="p-3 rounded-xl bg-secondary/20 border border-border/30 space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Last Notification</p>
                  <div className="flex items-center gap-1.5">
                    {latestLog.status === 'success' ? (
                      <CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-destructive" />
                    )}
                    <span className="text-xs font-medium">
                      {latestLog.status === 'success' ? 'Sent' : 'Failed'}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {format(new Date(latestLog.sent_at), 'dd MMM yyyy, HH:mm')}
                  </p>
                </div>
              )}

              <div className="p-3 rounded-xl bg-secondary/20 border border-border/30 space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Telegram Bot</p>
                <p className="text-xs font-semibold">@ADDFD3BOT</p>
                <a
                  href="https://t.me/ADDFD3BOT"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  Open in Telegram <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>
        </Card>

        {/* Notification Preferences */}
        <Card className="rounded-2xl border-border/50">
          <div className="px-5 py-3.5 border-b border-border/30">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Report Preferences</h2>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Choose which daily reports to receive</p>
          </div>

          <div className="p-5 space-y-3">
            {/* Stock Balance */}
            <div className={`flex items-center justify-between p-3 rounded-xl border border-border/40 transition-opacity ${!canStock ? 'opacity-50' : 'bg-secondary/20'}`}>
              <div className="space-y-0.5">
                <Label className="font-medium text-sm">Stock Balance Report</Label>
                <p className="text-[11px] text-muted-foreground">
                  Daily stock balance summary
                </p>
              </div>
              <Switch
                checked={receiveStock && canStock}
                onCheckedChange={v => setReceiveStock(v)}
                disabled={!canStock}
              />
            </div>

            {/* Delivered Not Claimed */}
            <div className={`flex items-center justify-between p-3 rounded-xl border border-border/40 transition-opacity ${!canDelivered ? 'opacity-50' : 'bg-secondary/20'}`}>
              <div className="space-y-0.5">
                <Label className="font-medium text-sm">Delivery Report</Label>
                <p className="text-[11px] text-muted-foreground">
                  Daily unclaimed delivery amount summary
                </p>
              </div>
              <Switch
                checked={receiveDelivered && canDelivered}
                onCheckedChange={v => setReceiveDelivered(v)}
                disabled={!canDelivered}
              />
            </div>

            {/* Failed Delivery Report */}
            <div className={`flex items-center justify-between p-3 rounded-xl border border-border/40 transition-opacity ${!canDelivered ? 'opacity-50' : 'bg-secondary/20'}`}>
              <div className="space-y-0.5">
                <Label className="font-medium text-sm">Failed Delivery Report</Label>
                <p className="text-[11px] text-muted-foreground">
                  Daily failed delivery summary report
                </p>
              </div>
              <Switch
                checked={receiveFailedDelivery && canDelivered}
                onCheckedChange={v => setReceiveFailedDelivery(v)}
                disabled={!canDelivered}
              />
            </div>

            {/* Hide Zero Stock */}
            <div className={`flex items-center justify-between p-3 rounded-xl border border-border/40 transition-opacity ${!canStock ? 'opacity-50' : 'bg-secondary/20'}`}>
              <div className="space-y-0.5">
                <Label className="font-medium text-sm">Hide Zero-Stock SKUs</Label>
                <p className="text-[11px] text-muted-foreground">
                  Exclude SKUs with 0 balance from stock report
                </p>
              </div>
              <Switch
                checked={hideZeroStock && canStock}
                onCheckedChange={v => setHideZeroStock(v)}
                disabled={!canStock}
              />
            </div>

          </div>
        </Card>

        {/* Event Notifications — for runner/runner_assistant roles */}
        {(role === 'runner' || role === 'runner_assistant') && (
          <Card className="rounded-2xl border-border/50">
            <div className="px-5 py-3.5 border-b border-border/30">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Event Notifications</h2>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Real-time alerts for receipt and delivery events</p>
            </div>

            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-secondary/20">
                <div className="space-y-0.5">
                  <Label className="font-medium text-sm">Receipt Events</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Notified when receipts are uploaded or need action
                  </p>
                </div>
                <Switch checked={receiveReceiptEvents} onCheckedChange={setReceiveReceiptEvents} />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-secondary/20">
                <div className="space-y-0.5">
                  <Label className="font-medium text-sm">Delivery Events</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Notified when orders are assigned or need delivery action
                  </p>
                </div>
                <Switch checked={receiveDeliveryEvents} onCheckedChange={setReceiveDeliveryEvents} />
              </div>
            </div>
          </Card>
        )}

        {role === 'manager' && (
          <Card className="rounded-2xl border-border/50">
            <div className="px-5 py-3.5 border-b border-border/30">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Team Driver Updates</h2>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Receive Driver delivered and failed delivery messages for orders owned by your team.
              </p>
            </div>

            <div className="p-5">
              <div className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-secondary/20">
                <div className="space-y-0.5">
                  <Label className="font-medium text-sm">Receive Team Order Updates</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Sends the Driver proof photos, status, time, amount and failed-delivery remark to your Telegram.
                  </p>
                </div>
                <Switch checked={receiveTeamDeliveryEvents} onCheckedChange={setReceiveTeamDeliveryEvents} />
              </div>
            </div>
          </Card>
        )}

        {/* Test Result */}
        {testResult && (
          <div className={`flex items-start gap-2.5 p-3.5 rounded-xl border ${testResult.ok
            ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/50'
            : 'bg-destructive/5 border-destructive/20'}`}
          >
            {testResult.ok ? (
              <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            )}
            <p className={`text-xs ${testResult.ok ? 'text-green-700 dark:text-green-300' : 'text-destructive'}`}>
              {testResult.message}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={handleSave} disabled={saving} className="flex-1 h-11 rounded-xl">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Settings
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={testing || !chatId.trim()} className="flex-1 h-11 rounded-xl">
            {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Send Test Message
          </Button>
        </div>

        {/* Logs Link */}
        <Link
          to="/settings/telegram-logs"
          className="flex items-center justify-between p-4 rounded-xl border border-border/40 bg-secondary/10 hover:bg-secondary/30 transition-colors group"
        >
          <div className="flex items-center gap-2.5">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Notification History</span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
    </AppLayout>
  );
}
