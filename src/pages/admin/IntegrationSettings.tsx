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
import { Loader2, Send, RefreshCw, CheckCircle, XCircle, Clock, SkipForward, Eye, EyeOff, Plug, Unplug } from 'lucide-react';
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

const statusConfig: Record<string, { icon: React.ReactNode; className: string }> = {
  sent: { icon: <CheckCircle className="h-3.5 w-3.5" />, className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  failed: { icon: <XCircle className="h-3.5 w-3.5" />, className: 'bg-destructive/10 text-destructive' },
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

  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [sharedSecret, setSharedSecret] = useState('');

  const fetchData = async () => {
    setLoading(true);
    const [settingsRes, logsRes] = await Promise.all([
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
    ]);

    if (settingsRes.data) {
      const s = settingsRes.data as unknown as IntegrationSetting;
      setSettings(s);
      setWebhookUrl(s.webhook_url || '');
      setWebhookEnabled(s.webhook_enabled);
      setSharedSecret(s.shared_secret || '');
    }
    setLogs((logsRes.data || []) as unknown as WebhookLog[]);
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
      const testPayload = {
        event_type: 'test.ping',
        occurred_at: new Date().toISOString(),
        order_ref: 'TEST-PING',
        order_id: '00000000-0000-0000-0000-000000000000',
        customer_name: 'Test Customer',
        customer_phone: '+60000000000',
        full_address: 'Test Address',
        area: 'Test Area',
        payment_type: 'COD',
        order_total: 0,
        items: [],
      };

      const payloadStr = JSON.stringify(testPayload);

      // Sign with shared secret
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw', enc.encode(sharedSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false, ['sign']
      );
      const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payloadStr));
      const signature = Array.from(new Uint8Array(sig))
        .map(b => b.toString(16).padStart(2, '0')).join('');

      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': 'test.ping',
          'X-Webhook-Signature': signature,
          'Idempotency-Key': `test-ping-${Date.now()}`,
          'X-Source-System': 'TOMUPRO',
        },
        body: payloadStr,
      });

      const text = await resp.text();
      if (resp.ok) {
        toast.success(`Webhook test passed! Status: ${resp.status}`);
      } else {
        toast.error(`Webhook test failed: ${resp.status} — ${text.substring(0, 200)}`);
      }
    } catch (err) {
      toast.error(`Webhook test error: ${err instanceof Error ? err.message : String(err)}`);
    }
    setTesting(false);
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

      {/* Webhook Logs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Webhook Logs</CardTitle>
              <CardDescription>Recent outbound webhook events</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={fetchData}>
              <RefreshCw className="h-4 w-4" />
            </Button>
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
    </div>
  );
}
