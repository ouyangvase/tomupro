import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, Send, RefreshCw, CheckCircle, XCircle, Clock, SkipForward, Eye, EyeOff, Plug, Unplug, Layers } from 'lucide-react';
import { format } from 'date-fns';

interface IntegrationSetting {
  id: string;
  integration_name: string;
  webhook_url: string;
  webhook_enabled: boolean;
  shared_secret: string;
  updated_at: string;
}

interface WebhookLog {
  id: string;
  event_type: string;
  order_ref: string | null;
  sync_status: string;
  response_status: number | null;
  retry_count: number;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

interface SnipersDeliveryEvent {
  event_id: string;
  sales_entry_order_code: string;
  event_type: string;
  delivery_status: string;
  attempt_count: number;
  last_http_status: number | null;
  last_error: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

interface SnipersTestResult {
  connected?: boolean;
  endpoint?: string;
  http_status?: number;
  response_time_ms?: number;
  tested_at?: string;
  content_type?: string;
  safe_error?: string | null;
}

interface SnipersPushResult {
  attempted: number;
  acknowledged: number;
  unmatched: number;
  needsReview: number;
  failed: number;
  processed: number;
  pushedAt: string;
}

const statusConfig: Record<string, { icon: React.ReactNode; className: string }> = {
  sent: { icon: <CheckCircle className="h-3.5 w-3.5" />, className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  acknowledged: { icon: <CheckCircle className="h-3.5 w-3.5" />, className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  sending: { icon: <RefreshCw className="h-3.5 w-3.5 animate-spin" />, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  failed: { icon: <XCircle className="h-3.5 w-3.5" />, className: 'bg-destructive/10 text-destructive' },
  authentication_failed: { icon: <XCircle className="h-3.5 w-3.5" />, className: 'bg-destructive/10 text-destructive' },
  unmatched: { icon: <XCircle className="h-3.5 w-3.5" />, className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  needs_review: { icon: <Clock className="h-3.5 w-3.5" />, className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  pending: { icon: <Clock className="h-3.5 w-3.5" />, className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  skipped: { icon: <SkipForward className="h-3.5 w-3.5" />, className: 'bg-muted text-muted-foreground' },
};

export default function IntegrationSettings() {
  const [settings, setSettings] = useState<IntegrationSetting | null>(null);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [snipersLogs, setSnipersLogs] = useState<SnipersDeliveryEvent[]>([]);
  const [testingSnipers, setTestingSnipers] = useState(false);
  const [snipersTestResult, setSnipersTestResult] = useState<SnipersTestResult | null>(null);
  const [pushingSnipersPending, setPushingSnipersPending] = useState(false);
  const [snipersPushResult, setSnipersPushResult] = useState<SnipersPushResult | null>(null);

  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [sharedSecret, setSharedSecret] = useState('');

  // Smart Merge toggle state
  const [smartMergeEnabled, setSmartMergeEnabled] = useState(true);
  const [smartMergeSettingId, setSmartMergeSettingId] = useState<string | null>(null);
  const [savingSmartMerge, setSavingSmartMerge] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [settingsRes, logsRes, smartMergeRes, snipersLogsRes] = await Promise.all([
      supabase
        .from('integration_settings')
        .select('*')
        .eq('integration_name', 'pulseone')
        .single(),
      supabase
        .from('webhook_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('integration_settings')
        .select('id, webhook_enabled')
        .eq('integration_name', 'smart_merge')
        .maybeSingle(),
      (supabase as any)
        .from('snipers_delivery_events')
        .select('event_id, sales_entry_order_code, event_type, delivery_status, attempt_count, last_http_status, last_error, acknowledged_at, created_at')
        .order('created_at', { ascending: false })
        .limit(25),
    ]);

    if (settingsRes.data) {
      const s = settingsRes.data as unknown as IntegrationSetting;
      setSettings(s);
      setWebhookUrl(s.webhook_url || '');
      setWebhookEnabled(s.webhook_enabled);
      setSharedSecret(s.shared_secret || '');
    }
    setLogs((logsRes.data || []) as unknown as WebhookLog[]);
    setSnipersLogs((snipersLogsRes.data || []) as SnipersDeliveryEvent[]);
    if (smartMergeRes.data) {
      setSmartMergeSettingId(smartMergeRes.data.id);
      setSmartMergeEnabled(smartMergeRes.data.webhook_enabled ?? true);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase
      .from('integration_settings')
      .update({
        webhook_url: webhookUrl.trim(),
        webhook_enabled: webhookEnabled,
        shared_secret: sharedSecret,
        updated_at: new Date().toISOString(),
      })
      .eq('id', settings.id);

    if (error) {
      toast.error('Failed to save settings');
    } else {
      toast.success('Integration settings saved');
      fetchData();
    }
    setSaving(false);
  };

  const handleTestWebhook = async () => {
    if (!webhookUrl) {
      toast.error('Please enter a webhook URL first');
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-webhook-proxy', {
        body: {},
      });

      if (error) {
        toast.error(`Webhook test error: ${error.message}`);
      } else if (data?.success) {
        toast.success(`Webhook test passed! Status: ${data.status}`);
      } else {
        toast.error(`Webhook test failed: ${data?.status || 'unknown'} — ${(data?.response || data?.error || '').substring(0, 200)}`);
      }
    } catch (err) {
      toast.error(`Webhook test error: ${err instanceof Error ? err.message : String(err)}`);
    }
    setTesting(false);
  };

  const handleTestSnipers = async () => {
    setTestingSnipers(true);
    setSnipersTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('snipers-test-connection', {
        body: {},
      });

      const result = (data || {}) as SnipersTestResult;
      setSnipersTestResult(result);
      if (error) {
        toast.error(`SNIPERS test error: ${error.message}`);
      } else if (result.connected) {
        toast.success(`SNIPERS connected. HTTP ${result.http_status}`);
      } else {
        toast.error(`SNIPERS test failed: ${result.safe_error || 'No successful acknowledgement'}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSnipersTestResult({ connected: false, safe_error: message });
      toast.error(`SNIPERS test error: ${message}`);
    }
    setTestingSnipers(false);
  };

  const handlePushPendingSnipers = async () => {
    setPushingSnipersPending(true);
    setSnipersPushResult(null);

    try {
      const { data: pendingEvents, error: pendingError } = await (supabase as any)
        .from('snipers_delivery_events')
        .select('event_id, sales_entry_order_code')
        .eq('event_type', 'tomupro.order.delivered')
        .eq('delivery_status', 'pending')
        .order('created_at', { ascending: true })
        .limit(25);

      if (pendingError) {
        toast.error(`Could not load pending SNIPERS events: ${pendingError.message}`);
        return;
      }

      const eventIds = (pendingEvents || [])
        .map((event: { event_id?: string }) => event.event_id)
        .filter(Boolean);

      if (eventIds.length === 0) {
        toast.info('No pending SNIPERS events to push');
        fetchData();
        return;
      }

      const { data, error } = await supabase.functions.invoke('send-snipers-delivered', {
        body: {
          eventIds,
          limit: eventIds.length,
          concurrency: 2,
          interEventDelayMs: 500,
        },
      });

      if (error) {
        toast.error(`SNIPERS push failed: ${error.message}`);
        return;
      }

      const results = Array.isArray(data?.results) ? data.results : [];
      const acknowledged = results.filter((result: any) => result.status === 'acknowledged').length;
      const unmatched = results.filter((result: any) => result.status === 'unmatched').length;
      const needsReview = results.filter((result: any) => result.status === 'needs_review').length;
      const failed = results.filter((result: any) => ['failed', 'authentication_failed'].includes(result.status)).length;

      setSnipersPushResult({
        attempted: eventIds.length,
        acknowledged,
        unmatched,
        needsReview,
        failed,
        processed: Number(data?.processed || results.length || 0),
        pushedAt: new Date().toISOString(),
      });

      if (failed > 0) {
        toast.error(`SNIPERS pushed ${acknowledged} confirmed, ${failed} failed`);
      } else {
        toast.success(`SNIPERS pushed ${acknowledged} confirmed, ${unmatched} unmatched`);
      }

      fetchData();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`SNIPERS push error: ${message}`);
    } finally {
      setPushingSnipersPending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Settings Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            {webhookEnabled ? (
              <Plug className="h-5 w-5 text-green-500" />
            ) : (
              <Unplug className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <CardTitle className="text-lg">PulseOne Webhook Integration</CardTitle>
              <CardDescription>
                Send delivery events to PulseOne for profit tracking
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50">
            <div className="space-y-0.5">
              <Label className="font-medium text-foreground">Webhook Enabled</Label>
              <p className="text-xs text-muted-foreground">
                When enabled, delivery events will be sent to PulseOne automatically
              </p>
            </div>
            <Switch checked={webhookEnabled} onCheckedChange={setWebhookEnabled} />
          </div>

          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <Input
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://vegwxtqfrltghvtgocqd.supabase.co/functions/v1/webhook"
              type="url"
            />
          </div>

          <div className="space-y-2">
            <Label>Shared Secret (HMAC SHA-256)</Label>
            <div className="relative">
              <Input
                value={sharedSecret}
                onChange={(e) => setSharedSecret(e.target.value)}
                type={showSecret ? 'text' : 'password'}
                placeholder="Enter shared secret for signature validation"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                onClick={() => setShowSecret(!showSecret)}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Must match the secret configured on the PulseOne receiver
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Settings
            </Button>
            <Button variant="outline" onClick={handleTestWebhook} disabled={testing || !webhookUrl}>
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Test Webhook
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Plug className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg">SNIPERS Confirm Profit</CardTitle>
                <CardDescription>
                  Sends TOMUPRO delivered orders to SNIPERS Pulse One Confirm Profit.
                </CardDescription>
              </div>
            </div>
            <Button variant="outline" onClick={handleTestSnipers} disabled={testingSnipers}>
              {testingSnipers ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Test SNIPERS Connection
            </Button>
            <Button onClick={handlePushPendingSnipers} disabled={pushingSnipersPending || testingSnipers}>
              {pushingSnipersPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Push Pending to SNIPERS
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border/60 bg-secondary/20 p-3">
              <p className="text-xs uppercase text-muted-foreground">Target Workflow</p>
              <p className="mt-1 text-sm font-medium">Pulse One / Confirm Profit</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-secondary/20 p-3">
              <p className="text-xs uppercase text-muted-foreground">Matching Field</p>
              <p className="mt-1 text-sm font-medium">orders.order_code</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-secondary/20 p-3">
              <p className="text-xs uppercase text-muted-foreground">Delivery Source</p>
              <p className="mt-1 text-sm font-medium">orders.runner_status = DELIVERED</p>
            </div>
          </div>

          {snipersTestResult && (
            <div className={`rounded-lg border p-3 ${snipersTestResult.connected ? 'border-green-200 bg-green-50 text-green-800' : 'border-destructive/20 bg-destructive/5 text-destructive'}`}>
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {snipersTestResult.connected ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {snipersTestResult.connected ? 'Connected' : 'Failed'}
                {snipersTestResult.http_status ? <span>HTTP {snipersTestResult.http_status}</span> : null}
                {snipersTestResult.response_time_ms ? <span>{snipersTestResult.response_time_ms}ms</span> : null}
              </div>
              {snipersTestResult.endpoint && (
                <p className="mt-1 break-all text-xs opacity-80">{snipersTestResult.endpoint}</p>
              )}
              {snipersTestResult.safe_error && (
                <p className="mt-2 text-xs">{snipersTestResult.safe_error}</p>
              )}
              {snipersTestResult.tested_at && (
                <p className="mt-2 text-xs opacity-70">
                  Tested {format(new Date(snipersTestResult.tested_at), 'dd MMM yyyy HH:mm:ss')}
                </p>
              )}
            </div>
          )}

          {snipersPushResult && (
            <div className="rounded-lg border border-border/60 bg-secondary/20 p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline">{snipersPushResult.processed}/{snipersPushResult.attempted} processed</Badge>
                <Badge variant="outline" className="bg-green-50 text-green-700">
                  {snipersPushResult.acknowledged} confirmed
                </Badge>
                <Badge variant="outline" className="bg-orange-50 text-orange-700">
                  {snipersPushResult.unmatched} unmatched
                </Badge>
                <Badge variant="outline" className="bg-purple-50 text-purple-700">
                  {snipersPushResult.needsReview} review
                </Badge>
                <Badge variant="outline" className="bg-destructive/10 text-destructive">
                  {snipersPushResult.failed} failed
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Manual push sent the oldest pending SNIPERS delivered events. Run again if more pending rows remain.
                Last push {format(new Date(snipersPushResult.pushedAt), 'dd MMM yyyy HH:mm:ss')}.
              </p>
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Order Code</TableHead>
                  <TableHead className="text-xs">Event</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">HTTP</TableHead>
                  <TableHead className="text-xs">Attempts</TableHead>
                  <TableHead className="text-xs">Created</TableHead>
                  <TableHead className="text-xs">Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snipersLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                      No SNIPERS events yet. Delivered events will appear here after order delivery.
                    </TableCell>
                  </TableRow>
                ) : (
                  snipersLogs.map((log) => {
                    const sc = statusConfig[log.delivery_status] || statusConfig.pending;
                    return (
                      <TableRow key={log.event_id}>
                        <TableCell className="text-xs font-medium">{log.sales_entry_order_code}</TableCell>
                        <TableCell className="text-xs font-mono">{log.event_type}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] gap-1 ${sc.className}`}>
                            {sc.icon}
                            {log.delivery_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{log.last_http_status ?? '-'}</TableCell>
                        <TableCell className="text-xs">{log.attempt_count}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(log.created_at), 'dd MMM HH:mm')}
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate text-xs text-destructive">
                          {log.last_error || '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Webhook Logs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Webhook Logs</CardTitle>
              <CardDescription>Recent outbound webhook events</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              No webhook logs yet. Events will appear here after deliveries.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Event</TableHead>
                    <TableHead className="text-xs">Order Ref</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">HTTP</TableHead>
                    <TableHead className="text-xs">Retries</TableHead>
                    <TableHead className="text-xs">Time</TableHead>
                    <TableHead className="text-xs">Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const sc = statusConfig[log.sync_status] || statusConfig.pending;
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs font-mono">{log.event_type}</TableCell>
                        <TableCell className="text-xs font-medium">{log.order_ref || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] gap-1 ${sc.className}`}>
                            {sc.icon}
                            {log.sync_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{log.response_status ?? '-'}</TableCell>
                        <TableCell className="text-xs">{log.retry_count}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(log.created_at), 'dd MMM HH:mm')}
                        </TableCell>
                        <TableCell className="text-xs text-destructive max-w-[200px] truncate">
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
      {/* Smart Merge Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Layers className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Smart Delivery Merge</CardTitle>
              <CardDescription>
                Automatically group orders from the same customer for combined delivery
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50">
            <div className="space-y-0.5">
              <Label className="font-medium text-foreground">Enable Smart Merge</Label>
              <p className="text-xs text-muted-foreground">
                When enabled, runners can open Duplicate Orders from Runner Inbox to group orders by phone, address, and delivery date
              </p>
            </div>
            <Switch
              checked={smartMergeEnabled}
              onCheckedChange={async (checked) => {
                setSmartMergeEnabled(checked);
                setSavingSmartMerge(true);
                if (smartMergeSettingId) {
                  await supabase
                    .from('integration_settings')
                    .update({ webhook_enabled: checked, updated_at: new Date().toISOString() })
                    .eq('id', smartMergeSettingId);
                } else {
                  const { data } = await supabase
                    .from('integration_settings')
                    .insert({ integration_name: 'smart_merge', webhook_enabled: checked, webhook_url: '', shared_secret: '' })
                    .select('id')
                    .single();
                  if (data) setSmartMergeSettingId(data.id);
                }
                setSavingSmartMerge(false);
                toast.success(checked ? 'Smart Merge enabled' : 'Smart Merge disabled');
              }}
              disabled={savingSmartMerge}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
