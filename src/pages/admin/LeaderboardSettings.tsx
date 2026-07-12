import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Settings, Users, Eye, Trophy, Save, Search, UserCheck, UserX, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { 
  useLeaderboardSettings, 
  useUpdateLeaderboardSettings, 
  useLeaderboardParticipants,
  useUpsertLeaderboardParticipant,
  PeriodMode,
  PrimaryMetric,
  VisibilityMode
} from "@/hooks/useLeaderboard";
import { useUsers } from "@/hooks/useUsers";

const METRIC_OPTIONS: { value: PrimaryMetric; label: string; description: string }[] = [
  { value: 'net_sales', label: 'Net Sales (BND)', description: 'Order Total - Discounts - Delivery Charges' },
  { value: 'completed_orders', label: 'Completed Orders', description: 'Admin Reconciliation Approved only' },
  { value: 'delivered_orders', label: 'Delivered Orders', description: 'All delivered regardless of reconciliation' },
  { value: 'conversion_score', label: 'Conversion Score', description: 'Delivered to Reconciled Approved rate' },
  { value: 'success_rate', label: 'Success Rate', description: 'Delivered success vs Failed rate' },
];

const PERIOD_OPTIONS: { value: PeriodMode; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
];

const VISIBILITY_OPTIONS: { value: VisibilityMode; label: string; description: string }[] = [
  { value: 'all', label: 'All Participants', description: 'Salespeople can see everyone' },
  { value: 'top_10_self', label: 'Top 10 + Self', description: 'Show Top 10 plus own rank' },
  { value: 'self_only', label: 'Self Only', description: 'Salespeople only see their own rank' },
];

export default function LeaderboardSettings() {
  const { toast } = useToast();
  const { data: settings, isLoading: settingsLoading } = useLeaderboardSettings();
  const { data: participants } = useLeaderboardParticipants();
  const { data: users } = useUsers();
  const updateSettings = useUpdateLeaderboardSettings();
  const upsertParticipant = useUpsertLeaderboardParticipant();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [localSettings, setLocalSettings] = useState({
    period_mode: 'month' as PeriodMode,
    primary_metric: 'net_sales' as PrimaryMetric,
    visibility_mode: 'all' as VisibilityMode,
    enabled_metrics: ['completed_orders', 'net_sales', 'delivered_orders'] as string[],
    hide_performance_ui: false,
  });
  
  useEffect(() => {
    if (settings) {
      setLocalSettings({
        period_mode: settings.period_mode,
        primary_metric: settings.primary_metric,
        visibility_mode: settings.visibility_mode,
        enabled_metrics: settings.enabled_metrics,
        hide_performance_ui: !!(settings.filters_default as any)?.hide_performance_ui,
      });
    }
  }, [settings]);
  
  const salespeople = users?.filter(u => u.role === 'salesperson' && u.is_active) || [];
  
  const filteredSalespeople = salespeople.filter(sp => 
    sp.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sp.email.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const participantMap = new Map(
    participants?.map(p => [p.salesperson_id, p.is_included]) || []
  );
  
  const getParticipantStatus = (spId: string) => {
    return participantMap.get(spId) ?? true; // Default to included
  };
  
  const handleToggleParticipant = async (spId: string, currentStatus: boolean) => {
    try {
      await upsertParticipant.mutateAsync({
        salesperson_id: spId,
        is_included: !currentStatus
      });
      toast({
        title: currentStatus ? "Excluded from leaderboard" : "Included in leaderboard",
        description: "Participant status updated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update participant status",
        variant: "destructive",
      });
    }
  };
  
  const handleSaveSettings = async () => {
    if (!settings?.id) return;
    
    try {
      await updateSettings.mutateAsync({
        id: settings.id,
        period_mode: localSettings.period_mode,
        primary_metric: localSettings.primary_metric,
        visibility_mode: localSettings.visibility_mode,
        enabled_metrics: localSettings.enabled_metrics,
        filters_default: { hide_performance_ui: localSettings.hide_performance_ui },
      });
      toast({
        title: "Settings saved",
        description: "Leaderboard settings have been updated",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    }
  };
  
  const toggleMetric = (metric: string) => {
    setLocalSettings(prev => ({
      ...prev,
      enabled_metrics: prev.enabled_metrics.includes(metric)
        ? prev.enabled_metrics.filter(m => m !== metric)
        : [...prev.enabled_metrics, metric]
    }));
  };
  
  const includedCount = salespeople.filter(sp => getParticipantStatus(sp.id)).length;
  const excludedCount = salespeople.length - includedCount;

  if (settingsLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Settings className="h-6 w-6" />
              Leaderboard Settings
            </h1>
            <p className="text-muted-foreground">
              Configure ranking metrics, visibility, and participants
            </p>
          </div>
          <Button onClick={handleSaveSettings} disabled={updateSettings.isPending}>
            <Save className="h-4 w-4 mr-2" />
            Save Settings
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Ranking Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5" />
                Ranking Configuration
              </CardTitle>
              <CardDescription>
                Choose how rankings are calculated
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Default Period</Label>
                <Select 
                  value={localSettings.period_mode}
                  onValueChange={(v) => setLocalSettings(prev => ({ ...prev, period_mode: v as PeriodMode }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIOD_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Primary Ranking Metric</Label>
                <Select 
                  value={localSettings.primary_metric}
                  onValueChange={(v) => setLocalSettings(prev => ({ ...prev, primary_metric: v as PrimaryMetric }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METRIC_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div>
                          <p>{opt.label}</p>
                          <p className="text-xs text-muted-foreground">{opt.description}</p>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <Label>Enabled Metrics (shown on leaderboard)</Label>
                <div className="space-y-2">
                  {METRIC_OPTIONS.map(metric => (
                    <div key={metric.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={metric.value}
                        checked={localSettings.enabled_metrics.includes(metric.value)}
                        onCheckedChange={() => toggleMetric(metric.value)}
                      />
                      <label htmlFor={metric.value} className="text-sm cursor-pointer">
                        {metric.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Visibility Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Visibility Settings
              </CardTitle>
              <CardDescription>
                Control who can see what on the leaderboard
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Salesperson Visibility</Label>
                <div className="space-y-2">
                  {VISIBILITY_OPTIONS.map(opt => (
                    <div 
                      key={opt.value}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        localSettings.visibility_mode === opt.value 
                          ? 'border-primary bg-primary/5' 
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => setLocalSettings(prev => ({ ...prev, visibility_mode: opt.value }))}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{opt.label}</p>
                          <p className="text-sm text-muted-foreground">{opt.description}</p>
                        </div>
                        {localSettings.visibility_mode === opt.value && (
                          <Badge variant="default">Selected</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <Separator />

              <div className="space-y-2 text-sm text-muted-foreground">
                <p><strong>Manager:</strong> Sees bound salespeople only</p>
                <p><strong>Admin:</strong> Sees all + filter options</p>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-2">
                    <EyeOff className="h-4 w-4" />
                    Hide Performance UI
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    When enabled, the leaderboard page is hidden from all non-admin users
                  </p>
                </div>
                <Switch
                  checked={localSettings.hide_performance_ui}
                  onCheckedChange={(checked) => setLocalSettings(prev => ({ ...prev, hide_performance_ui: checked }))}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Participants Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Participants
            </CardTitle>
            <CardDescription>
              Toggle which salespeople appear on the leaderboard
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search salespeople..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-4 text-sm">
                <span className="flex items-center gap-1">
                  <UserCheck className="h-4 w-4 text-green-600" />
                  {includedCount} included
                </span>
                <span className="flex items-center gap-1">
                  <UserX className="h-4 w-4 text-red-600" />
                  {excludedCount} excluded
                </span>
              </div>
            </div>
            
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {filteredSalespeople.map(sp => {
                const isIncluded = getParticipantStatus(sp.id);
                return (
                  <div 
                    key={sp.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      isIncluded ? 'border-green-200 bg-green-50/50 dark:bg-green-950/20' : 'border-red-200 bg-red-50/50 dark:bg-red-950/20'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{sp.display_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{sp.email}</p>
                    </div>
                    <Switch
                      checked={isIncluded}
                      onCheckedChange={() => handleToggleParticipant(sp.id, isIncluded)}
                    />
                  </div>
                );
              })}
            </div>
            
            {filteredSalespeople.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                No salespeople found
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
