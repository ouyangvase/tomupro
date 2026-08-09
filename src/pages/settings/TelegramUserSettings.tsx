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
  ExternalLink, Wifi, WifiOff, Clock, ArrowRight, Plus, Trash2, Star,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  useMyTelegramSettings, useUpsertMyTelegramSettings,
  useMyLatestTelegramLog, useMyTelegramDestinations,
  useVerifyTelegramDestination, useRemoveTelegramDestination,
  useSetPrimaryTelegramDestination, sendTelegramDestinationTest,
  sendAllTelegramDestinationsTest,
} from '@/hooks/useTelegram';
import { getTelegramErrorMessage } from '@/lib/telegramError';

const TELEGRAM_CHAT_ID_PATTERN = /^-?\d+$/;

export default function TelegramUserSettings() {
  const { user, profile } = useAuth();
  const userId = user?.id;
  const role = profile?.role;

  const { data: settings, isLoading } = useMyTelegramSettings(userId);
  const { data: destinations = [], isLoading: destinationsLoading } = useMyTelegramDestinations(userId);
  const { data: latestLog } = useMyLatestTelegramLog(userId);
  const upsertSettings = useUpsertMyTelegramSettings();
  const verifyDestination = useVerifyTelegramDestination();
  const removeDestination = useRemoveTelegramDestination();
  const setPrimaryDestination = useSetPrimaryTelegramDestination();

  const [newChatId, setNewChatId] = useState('');
  const [newLabel, setNewLabel] = useState('');
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
  const [testingDestinationId, setTestingDestinationId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [groupGuideOpen, setGroupGuideOpen] = useState(false);

  useEffect(() => {
    if (settings) {
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

    setSaving(true);
    try {
      await upsertSettings.mutateAsync({
        user_id: userId,
        chat_id: settings?.chat_id || null,
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
      toast.success('Settings saved successfully');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save settings');
    }
    setSaving(false);
  };

  const handleAddDestination = async () => {
    if (!userId || destinations.length >= 2) return;
    const normalizedChatId = newChatId.trim();
    if (!normalizedChatId) {
      toast.error('Enter a Telegram Chat ID');
      return;
    }
    if (!TELEGRAM_CHAT_ID_PATTERN.test(normalizedChatId)) {
      toast.error('Enter a valid personal or group Chat ID using numbers only');
      return;
    }

    setTestResult(null);
    try {
      await verifyDestination.mutateAsync({
        userId,
        chatId: normalizedChatId,
        label: newLabel.trim() || undefined,
      });
      setNewChatId('');
      setNewLabel('');
      setTestResult({ ok: true, message: 'Telegram verified and connected.' });
      toast.success('Telegram verified and connected');
    } catch (e: any) {
      const msg = await getTelegramErrorMessage(
        e,
        'Verification failed. Open @userinfobot, copy your Chat ID, and try again.',
      );
      setTestResult({ ok: false, message: msg });
      toast.error(msg);
    }
  };

  const handleTestDestination = async (destinationId: string) => {
    setTestingDestinationId(destinationId);
    setTestResult(null);
    try {
      await sendTelegramDestinationTest(destinationId);
      setTestResult({ ok: true, message: 'Message sent! Check your Telegram.' });
      toast.success('Test message sent! Check your Telegram.');
    } catch (e: any) {
      const msg = await getTelegramErrorMessage(e, 'Test failed. Check your Chat ID and try again.');
      setTestResult({ ok: false, message: msg });
      toast.error(msg);
    }
    setTestingDestinationId(null);
  };

  const handleTestAll = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await sendAllTelegramDestinationsTest();
      const successful = (response.results || []).filter((result: any) => result.success).length;
      const total = response.results?.length || 0;
      const allSucceeded = total > 0 && successful === total;
      setTestResult({ ok: allSucceeded, message: `${successful} of ${total} Telegram chats received the test.` });
      if (allSucceeded) toast.success(`Test delivered to ${successful} of ${total} chats`);
      else toast.error(`Test delivered to ${successful} of ${total} chats`);
    } catch (e: any) {
      const msg = await getTelegramErrorMessage(e, 'Telegram test failed');
      setTestResult({ ok: false, message: msg });
      toast.error(msg);
    }
    setTesting(false);
  };

  const handleRemoveDestination = async (destinationId: string) => {
    if (!userId) return;
    try {
      await removeDestination.mutateAsync({ userId, destinationId });
      toast.success('Telegram removed');
    } catch (e: any) {
      toast.error(e.message || 'Unable to remove Telegram');
    }
  };

  const handleSetPrimary = async (destinationId: string) => {
    if (!userId) return;
    try {
      await setPrimaryDestination.mutateAsync({ userId, destinationId });
      toast.success('Primary Telegram updated');
    } catch (e: any) {
      toast.error(e.message || 'Unable to update Primary Telegram');
    }
  };

  const isConnected = destinations.length > 0;

  if (isLoading || destinationsLoading) {
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
                  <p className="text-xs text-muted-foreground">{destinations.length}/2 Telegram chats</p>
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
            <div className="space-y-3">
              {destinations.map((destination) => (
                <div key={destination.id} className="rounded-xl border border-border/50 bg-secondary/15 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{destination.label}</p>
                        {destination.is_primary && (
                          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary text-[10px]">
                            Primary
                          </Badge>
                        )}
                        <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700 text-[10px] dark:border-green-800 dark:bg-green-950/30 dark:text-green-400">
                          Connected
                        </Badge>
                      </div>
                      <p className="break-all font-mono text-xs text-muted-foreground">Chat ID: {destination.chat_id}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive"
                      onClick={() => handleRemoveDestination(destination.id)}
                      disabled={removeDestination.isPending}
                      aria-label={`Remove ${destination.label}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => handleTestDestination(destination.id)}
                      disabled={testingDestinationId === destination.id}
                    >
                      {testingDestinationId === destination.id
                        ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        : <Send className="mr-1.5 h-3.5 w-3.5" />}
                      Test
                    </Button>
                    {!destination.is_primary && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => handleSetPrimary(destination.id)}
                        disabled={setPrimaryDestination.isPending}
                      >
                        <Star className="mr-1.5 h-3.5 w-3.5" />
                        Set Primary
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {destinations.length < 2 ? (
                <div className="space-y-3 rounded-xl border border-dashed border-primary/40 p-3">
                  <div>
                    <p className="text-sm font-semibold">How to get your Telegram Chat ID</p>
                    <ol className="mt-2 space-y-1.5 text-[11px] text-muted-foreground">
                      <li><span className="mr-1.5 font-semibold text-foreground">①</span>Open Telegram and search <span className="font-semibold text-foreground">@userinfobot</span>.</li>
                      <li><span className="mr-1.5 font-semibold text-foreground">②</span>Tap <span className="font-semibold text-foreground">Start</span> or send <span className="font-mono font-semibold text-foreground">/start</span>.</li>
                      <li><span className="mr-1.5 font-semibold text-foreground">③</span>Copy the Chat ID it shows you.</li>
                      <li><span className="mr-1.5 font-semibold text-foreground">④</span>Paste it below.</li>
                    </ol>
                    <a
                      href="https://t.me/userinfobot"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/30 px-2.5 text-[11px] font-medium text-primary hover:bg-primary/5"
                    >
                      Open @userinfobot <ExternalLink className="h-3 w-3" />
                    </a>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Then open <a href="https://t.me/ADDFD3BOT" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">@ADDFD3BOT</a> and tap Start so TomuPro can send messages.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-left text-[11px] font-medium text-primary hover:underline"
                    aria-expanded={groupGuideOpen}
                    onClick={() => setGroupGuideOpen(open => !open)}
                  >
                    Using a Telegram group instead?
                    <ArrowRight className={`h-3 w-3 transition-transform ${groupGuideOpen ? 'rotate-90' : ''}`} />
                  </button>
                  {groupGuideOpen && (
                    <div className="space-y-1.5 rounded-lg bg-secondary/30 px-2.5 py-2 text-[11px] text-muted-foreground">
                      <p>1. Add <span className="font-semibold text-foreground">@userinfobot</span> to the Telegram group.</p>
                      <p>2. Send <span className="font-mono font-semibold text-foreground">/start</span> in the group.</p>
                      <p>3. Copy the group Chat ID shown by the bot.</p>
                      <p>4. Paste it here.</p>
                      <p className="pt-1 font-medium text-foreground">Note: Group Chat IDs usually start with <span className="font-mono">-100</span>.</p>
                    </div>
                  )}
                  <Input
                    value={newLabel}
                    onChange={event => setNewLabel(event.target.value)}
                    placeholder="Name (optional)"
                    aria-label="Telegram name (optional)"
                    className="h-10 rounded-xl"
                    maxLength={40}
                  />
                  <div className="space-y-1.5">
                    <Label htmlFor="telegram-chat-id" className="text-xs font-medium">Chat ID</Label>
                    <Input
                      id="telegram-chat-id"
                      value={newChatId}
                      onChange={event => setNewChatId(event.target.value)}
                      placeholder="Paste your Chat ID here"
                      className="h-10 rounded-xl font-mono"
                      inputMode="numeric"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={handleAddDestination}
                    disabled={verifyDestination.isPending || !newChatId.trim()}
                    className="h-10 w-full rounded-xl"
                  >
                    {verifyDestination.isPending
                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      : <Plus className="mr-2 h-4 w-4" />}
                    Save & Test
                  </Button>
                </div>
              ) : (
                <p className="rounded-xl bg-secondary/30 px-3 py-2.5 text-center text-xs font-medium text-muted-foreground">
                  Maximum 2 Telegram chats connected
                </p>
              )}
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
            <div className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-secondary/20">
              <div className="space-y-0.5">
                <Label className="font-medium text-sm">Stock Balance Report</Label>
                <p className="text-[11px] text-muted-foreground">
                  Daily stock balance summary
                </p>
              </div>
              <Switch
                checked={receiveStock}
                onCheckedChange={v => setReceiveStock(v)}
              />
            </div>

            {/* Delivered Not Claimed */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-secondary/20">
              <div className="space-y-0.5">
                <Label className="font-medium text-sm">Delivery Report</Label>
                <p className="text-[11px] text-muted-foreground">
                  Daily unclaimed delivery amount summary
                </p>
              </div>
              <Switch
                checked={receiveDelivered}
                onCheckedChange={v => setReceiveDelivered(v)}
              />
            </div>

            {/* Failed Delivery Report */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-secondary/20">
              <div className="space-y-0.5">
                <Label className="font-medium text-sm">Failed Delivery Report</Label>
                <p className="text-[11px] text-muted-foreground">
                  Daily failed delivery summary report
                </p>
              </div>
              <Switch
                checked={receiveFailedDelivery}
                onCheckedChange={v => setReceiveFailedDelivery(v)}
              />
            </div>

            {/* Hide Zero Stock */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-secondary/20">
              <div className="space-y-0.5">
                <Label className="font-medium text-sm">Hide Zero-Stock SKUs</Label>
                <p className="text-[11px] text-muted-foreground">
                  Exclude SKUs with 0 balance from stock report
                </p>
              </div>
              <Switch
                checked={hideZeroStock}
                onCheckedChange={v => setHideZeroStock(v)}
              />
            </div>

          </div>
          <p className="px-5 pb-4 text-[11px] text-muted-foreground">
            Telegram reports are available to all users. Your report contains your own data and any shared scope configured for your account.
          </p>
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
          <Button variant="outline" onClick={handleTestAll} disabled={testing || destinations.length === 0} className="flex-1 h-11 rounded-xl">
            {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Test {destinations.length === 2 ? 'Both Chats' : 'Telegram'}
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
