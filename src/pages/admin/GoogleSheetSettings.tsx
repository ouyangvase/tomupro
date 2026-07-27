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
import { Loader2, RefreshCw, CheckCircle, XCircle, Clock, SkipForward, FileSpreadsheet, ExternalLink, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

interface SyncLog {
  id: string;
  triggered_by: string;
  status: string;
  rows_synced: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

interface TabCount {
  db_count: number;
  sheet_count: number;
}

interface SheetSettings {
  id: string;
  webhook_enabled: boolean;
  webhook_url: string;
  metadata: {
    last_sync_at?: string | null;
    last_sync_status?: string | null;
    rows_synced?: number;
    service_account_email?: string;
    last_error?: string;
    tab_counts?: {
      active?: TabCount;
      delivered?: TabCount;
      failed?: TabCount;
    };
  } | null;
}

const logStatusConfig: Record<string, { icon: React.ReactNode; className: string }> = {
  success: { icon: <CheckCircle className="h-3.5 w-3.5" />, className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  mismatch: { icon: <AlertTriangle className="h-3.5 w-3.5" />, className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  failed: { icon: <XCircle className="h-3.5 w-3.5" />, className: 'bg-destructive/10 text-destructive' },
  pending: { icon: <Clock className="h-3.5 w-3.5" />, className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  skipped: { icon: <SkipForward className="h-3.5 w-3.5" />, className: 'bg-muted text-muted-foreground' },
};

function TabCountCard({ label, tabCount }: { label: string; tabCount?: TabCount }) {
  if (!tabCount) return null;
  const matched = tabCount.db_count === tabCount.sheet_count;
  return (
    <div className={`p-3 rounded-lg border ${matched ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' : 'bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-800'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Badge variant="outline" className={`text-[10px] gap-1 ${matched ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'}`}>
          {matched ? <CheckCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
          {matched ? 'Synced' : 'Mismatch'}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-[10px] text-muted-foreground">App Count</span>
          <p className="font-mono font-semibold">{tabCount.db_count.toLocaleString()}</p>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground">Sheet Count</span>
          <p className="font-mono font-semibold">{tabCount.sheet_count.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}

export default function GoogleSheetSettings() {
  const [settings, setSettings] = useState<SheetSettings | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingEnabled, setSavingEnabled] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [sheetId, setSheetId] = useState('');
  const [syncEnabled, setSyncEnabled] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [settingsRes, logsRes] = await Promise.all([
      supabase
        .from('integration_settings')
        .select('*')
        .eq('integration_name', 'google_sheet')
        .maybeSingle(),
      supabase
        .from('gsheet_sync_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    if (settingsRes.data) {
      const s = settingsRes.data as unknown as SheetSettings;
      setSettings(s);
      setSheetId(s.webhook_url || '');
      setSyncEnabled(s.webhook_enabled);
    }
    setLogs((logsRes.data || []) as unknown as SyncLog[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleEnabledChange = async (enabled: boolean) => {
    const previousValue = syncEnabled;
    setSyncEnabled(enabled);
    setSavingEnabled(true);

    const { error } = await supabase.rpc('set_google_sheet_sync_enabled', {
      p_enabled: enabled,
    });

    if (error) {
      setSyncEnabled(previousValue);
      toast.error('Failed to update Google Sheet sync');
    } else {
      toast.success(enabled ? 'Google Sheet sync enabled' : 'Google Sheet sync disabled');
      await fetchData();
    }

    setSavingEnabled(false);
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase
      .from('integration_settings')
      .update({
        webhook_url: sheetId.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', settings.id);

    if (error) {
      toast.error('Failed to save settings');
    } else {
      toast.success('Google Sheet settings saved');
      fetchData();
    }
    setSaving(false);
  };

  const handleSyncNow = async () => {
    if (!sheetId.trim()) {
      toast.error('Please enter a Google Sheet ID first');
      return;
    }
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-google-sheet', {
        body: { manual: true },
      });

      if (error) {
        toast.error(`Sync error: ${error.message}`);
      } else if (data?.success) {
        toast.success(`Sync complete! Active: ${data.active}, Delivered: ${data.delivered}, Failed: ${data.failed}`);
      } else if (data?.skipped) {
        toast.info(`Sync skipped: ${data.reason}`);
      } else {
        toast.error(`Sync failed: ${data?.error || 'Unknown error'}`);
      }
    } catch (err) {
      toast.error(`Sync error: ${err instanceof Error ? err.message : String(err)}`);
    }
    setSyncing(false);
    fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const meta = settings?.metadata;
  const lastSyncAt = meta?.last_sync_at;
  const lastSyncStatus = meta?.last_sync_status;
  const serviceEmail = meta?.service_account_email;
  const tabCounts = meta?.tab_counts;

  return (
    <div className="space-y-6">
      {/* Settings Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
            <div>
              <CardTitle className="text-lg">Google Sheet Sync</CardTitle>
              <CardDescription>
                Automatically sync dispatch data to a Google Sheet (read-only mirror)
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50">
            <div className="space-y-0.5">
              <Label className="font-medium text-foreground">Enable Google Sheet Sync</Label>
              <p className="text-xs text-muted-foreground">
                When enabled, dispatch data will be synced to the configured Google Sheet
              </p>
            </div>
            <Switch
              checked={syncEnabled}
              onCheckedChange={handleEnabledChange}
              disabled={savingEnabled}
            />
          </div>

          {/* Sheet ID */}
          <div className="space-y-2">
            <Label>Google Sheet ID</Label>
            <Input
              value={sheetId}
              onChange={(e) => setSheetId(e.target.value)}
              placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
            />
            <p className="text-xs text-muted-foreground">
              The Sheet ID from the Google Sheets URL: docs.google.com/spreadsheets/d/<strong>SHEET_ID</strong>/edit
            </p>
            {sheetId && (
              <a
                href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Open Sheet
              </a>
            )}
          </div>

          {/* Service Account Email (read-only) */}
          {serviceEmail && (
            <div className="space-y-2">
              <Label>Service Account Email</Label>
              <div className="p-2.5 rounded-md bg-muted/50 border border-border/50 text-sm font-mono text-muted-foreground break-all">
                {serviceEmail}
              </div>
              <p className="text-xs text-muted-foreground">
                Share the Google Sheet with this email (Editor access) for sync to work
              </p>
            </div>
          )}

          {/* Per-Tab Sync Status */}
          {tabCounts && (
            <div className="space-y-2">
              <Label>Sync Status by Tab</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <TabCountCard label="Active Dispatch" tabCount={tabCounts.active} />
                <TabCountCard label="Delivered" tabCount={tabCounts.delivered} />
                <TabCountCard label="Failed" tabCount={tabCounts.failed} />
              </div>
            </div>
          )}

          {/* Last Sync Status */}
          <div className="grid grid-cols-2 gap-4 p-3 rounded-lg bg-secondary/20 border border-border/30">
            <div>
              <p className="text-xs text-muted-foreground">Last Sync</p>
              <p className="text-sm font-medium">
                {lastSyncAt ? format(new Date(lastSyncAt), 'dd MMM yyyy HH:mm:ss') : 'Never'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              {lastSyncStatus ? (
                <Badge
                  variant="outline"
                  className={`text-[10px] gap-1 ${(logStatusConfig[lastSyncStatus] || logStatusConfig.pending).className}`}
                >
                  {(logStatusConfig[lastSyncStatus] || logStatusConfig.pending).icon}
                  {lastSyncStatus}
                </Badge>
              ) : (
                <span className="text-sm text-muted-foreground">-</span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Settings
            </Button>
            <Button
              variant="outline"
              onClick={handleSyncNow}
              disabled={syncing || !sheetId.trim() || !syncEnabled}
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync Now
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sync Logs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Sync Logs</CardTitle>
              <CardDescription>Recent Google Sheet sync events</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              No sync logs yet. Click "Sync Now" to perform the first sync.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Time</TableHead>
                    <TableHead className="text-xs">Trigger</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Rows</TableHead>
                    <TableHead className="text-xs">Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const sc = logStatusConfig[log.status] || logStatusConfig.pending;
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(log.created_at), 'dd MMM HH:mm:ss')}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{log.triggered_by}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] gap-1 ${sc.className}`}>
                            {sc.icon}
                            {log.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{log.rows_synced ? log.rows_synced.toLocaleString() : '-'}</TableCell>
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
