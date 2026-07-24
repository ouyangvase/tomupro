import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { BookOpenCheck, Edit3, MapPinned, Plus, RefreshCcw, Save, Search, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

type RuleStatusFilter = 'active' | 'inactive' | 'all';

interface DeliveryArea {
  code: string;
  name: string;
  district: string | null;
  is_special: boolean;
  active: boolean;
  display_order: number;
}

interface DeliveryAreaRule {
  id: string;
  delivery_area_code: string;
  rule_type: string;
  normalized_value: string;
  confidence: number;
  priority: number;
  source: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface RuleFormState {
  delivery_area_code: string;
  rule_type: string;
  normalized_value: string;
  confidence: string;
  priority: string;
  active: boolean;
}

const EMPTY_FORM: RuleFormState = {
  delivery_area_code: '',
  rule_type: 'exact_address',
  normalized_value: '',
  confidence: '0.990',
  priority: '100',
  active: true,
};

const RULE_TYPES = [
  { value: 'exact_address', label: 'Exact normalized address' },
  { value: 'locality', label: 'Locality / kampong' },
  { value: 'mukim', label: 'Mukim' },
  { value: 'postal_prefix', label: 'Postal prefix' },
  { value: 'postal_code', label: 'Postal code' },
  { value: 'landmark', label: 'Landmark' },
];

function normalizeRuleValue(value: string) {
  return value
    .toUpperCase()
    .replace(/[,.;:/\\-]+/g, ' ')
    .replace(/\b(KPG|KG)\b/g, 'KAMPONG')
    .replace(/\bJLN\b/g, 'JALAN')
    .replace(/\bSPG\b/g, 'SIMPANG')
    .replace(/\s+/g, ' ')
    .replace(/KAMPONG KAMPONG/g, 'KAMPONG')
    .trim();
}

function formatPercent(value: number) {
  return `${Math.round(Number(value || 0) * 1000) / 10}%`;
}

function sourceLabel(source: string) {
  if (source === 'runner_manual_correction') return 'Learned from Resolve Area';
  if (source === 'admin_manual_rule') return 'Admin rule';
  if (source === 'seed') return 'Seed rule';
  return source.replace(/_/g, ' ');
}

export default function AreaLearningSettings() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const [areas, setAreas] = useState<DeliveryArea[]>([]);
  const [rules, setRules] = useState<DeliveryAreaRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('exact_address');
  const [statusFilter, setStatusFilter] = useState<RuleStatusFilter>('active');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<DeliveryAreaRule | null>(null);
  const [form, setForm] = useState<RuleFormState>(EMPTY_FORM);

  const areaNameByCode = useMemo(() => {
    return areas.reduce<Record<string, string>>((acc, area) => {
      acc[area.code] = area.name;
      return acc;
    }, {});
  }, [areas]);

  const stats = useMemo(() => {
    const exactRules = rules.filter((rule) => rule.rule_type === 'exact_address');
    return {
      activeExact: exactRules.filter((rule) => rule.active).length,
      inactiveExact: exactRules.filter((rule) => !rule.active).length,
      adminRules: rules.filter((rule) => rule.source === 'admin_manual_rule').length,
      seedRules: rules.filter((rule) => rule.source === 'seed').length,
    };
  }, [rules]);

  const filteredRules = useMemo(() => {
    const query = search.trim().toUpperCase();

    return rules.filter((rule) => {
      if (areaFilter !== 'all' && rule.delivery_area_code !== areaFilter) return false;
      if (typeFilter !== 'all' && rule.rule_type !== typeFilter) return false;
      if (statusFilter === 'active' && !rule.active) return false;
      if (statusFilter === 'inactive' && rule.active) return false;
      if (!query) return true;

      return (
        rule.normalized_value.includes(query)
        || rule.delivery_area_code.includes(query)
        || (areaNameByCode[rule.delivery_area_code] || '').toUpperCase().includes(query)
        || sourceLabel(rule.source).toUpperCase().includes(query)
      );
    });
  }, [areaFilter, areaNameByCode, rules, search, statusFilter, typeFilter]);

  const fetchData = async () => {
    setLoading(true);

    const [areasRes, rulesRes] = await Promise.all([
      (supabase as any)
        .from('delivery_areas')
        .select('code,name,district,is_special,active,display_order')
        .eq('active', true)
        .order('display_order', { ascending: true }),
      (supabase as any)
        .from('delivery_area_rules')
        .select('id,delivery_area_code,rule_type,normalized_value,confidence,priority,source,active,created_at,updated_at')
        .order('updated_at', { ascending: false })
        .limit(500),
    ]);

    if (areasRes.error) {
      toast.error(`Unable to load delivery areas: ${areasRes.error.message}`);
    } else {
      setAreas((areasRes.data || []) as DeliveryArea[]);
    }

    if (rulesRes.error) {
      toast.error(`Unable to load learning rules: ${rulesRes.error.message}`);
    } else {
      setRules((rulesRes.data || []).map((rule: DeliveryAreaRule) => ({
        ...rule,
        confidence: Number(rule.confidence || 0),
        priority: Number(rule.priority || 0),
      })));
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openAddDialog = () => {
    setEditingRule(null);
    setForm({
      ...EMPTY_FORM,
      delivery_area_code: areas.find((area) => !area.is_special)?.code || '',
    });
    setDialogOpen(true);
  };

  const openEditDialog = (rule: DeliveryAreaRule) => {
    setEditingRule(rule);
    setForm({
      delivery_area_code: rule.delivery_area_code,
      rule_type: rule.rule_type,
      normalized_value: rule.normalized_value,
      confidence: String(rule.confidence),
      priority: String(rule.priority),
      active: rule.active,
    });
    setDialogOpen(true);
  };

  const saveRule = async () => {
    if (!isAdmin) return;

    const normalizedValue = normalizeRuleValue(form.normalized_value);
    const confidence = Number(form.confidence);
    const priority = Number(form.priority);

    if (!form.delivery_area_code || !normalizedValue) {
      toast.error('Area and normalized value are required');
      return;
    }

    if (!Number.isFinite(confidence) || confidence <= 0 || confidence > 1) {
      toast.error('Confidence must be between 0.001 and 1.000');
      return;
    }

    if (!Number.isFinite(priority)) {
      toast.error('Priority must be a number');
      return;
    }

    setSaving(true);

    const payload = {
      delivery_area_code: form.delivery_area_code,
      rule_type: form.rule_type,
      normalized_value: normalizedValue,
      confidence,
      priority,
      source: editingRule?.source === 'runner_manual_correction'
        ? 'runner_manual_correction'
        : 'admin_manual_rule',
      active: form.active,
      updated_at: new Date().toISOString(),
    };

    const result = editingRule
      ? await (supabase as any)
        .from('delivery_area_rules')
        .update(payload)
        .eq('id', editingRule.id)
      : await (supabase as any)
        .from('delivery_area_rules')
        .upsert(payload, {
          onConflict: 'rule_type,normalized_value,delivery_area_code',
        });

    if (result.error) {
      toast.error(`Unable to save rule: ${result.error.message}`);
    } else {
      toast.success(editingRule ? 'Learning rule updated' : 'Learning rule saved');
      setDialogOpen(false);
      await fetchData();
    }

    setSaving(false);
  };

  const toggleRule = async (rule: DeliveryAreaRule) => {
    if (!isAdmin) return;

    const { error } = await (supabase as any)
      .from('delivery_area_rules')
      .update({
        active: !rule.active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rule.id);

    if (error) {
      toast.error(`Unable to update rule: ${error.message}`);
    } else {
      toast.success(rule.active ? 'Learning rule paused' : 'Learning rule activated');
      await fetchData();
    }
  };

  const normalAreas = areas.filter((area) => !area.is_special);

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary">
            <BookOpenCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">Area Learning</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground sm:text-base">
              Review and maintain the backend rules used when Resolve Area learns customer addresses.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={fetchData} disabled={loading}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Reload
          </Button>
          <Button onClick={openAddDialog} disabled={!isAdmin}>
            <Plus className="mr-2 h-4 w-4" />
            Add Rule
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active Learned</p>
            <p className="mt-2 text-3xl font-bold">{stats.activeExact}</p>
            <p className="text-sm text-muted-foreground">exact-address rules</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Paused Conflicts</p>
            <p className="mt-2 text-3xl font-bold">{stats.inactiveExact}</p>
            <p className="text-sm text-muted-foreground">inactive exact rules</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Admin Rules</p>
            <p className="mt-2 text-3xl font-bold">{stats.adminRules}</p>
            <p className="text-sm text-muted-foreground">manually maintained</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Seed Rules</p>
            <p className="mt-2 text-3xl font-bold">{stats.seedRules}</p>
            <p className="text-sm text-muted-foreground">default localities</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Learning Rule Manager
          </CardTitle>
          <CardDescription>
            Active exact-address rules are used before locality rules. A later correction can pause conflicting exact-address rules.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_180px_160px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search address, area, or source..."
              />
            </div>
            <Select value={areaFilter} onValueChange={setAreaFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Area" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All areas</SelectItem>
                {normalAreas.map((area) => (
                  <SelectItem key={area.code} value={area.code}>{area.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Rule type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All rule types</SelectItem>
                {RULE_TYPES.map((ruleType) => (
                  <SelectItem key={ruleType.value} value={ruleType.value}>{ruleType.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as RuleStatusFilter)}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="all">All status</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-2xl border bg-background/60">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <p className="font-semibold">{filteredRules.length} rule(s)</p>
                <p className="text-sm text-muted-foreground">Showing backend rules currently matching your filters.</p>
              </div>
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[320px]">Normalized value</TableHead>
                    <TableHead>Area</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                        Loading learning rules...
                      </TableCell>
                    </TableRow>
                  ) : filteredRules.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                        No learning rules found for this filter.
                      </TableCell>
                    </TableRow>
                  ) : filteredRules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell>
                        <p className="max-w-xl break-words font-medium">{rule.normalized_value}</p>
                      </TableCell>
                      <TableCell>{areaNameByCode[rule.delivery_area_code] || rule.delivery_area_code}</TableCell>
                      <TableCell>{rule.rule_type.replace(/_/g, ' ')}</TableCell>
                      <TableCell>{formatPercent(rule.confidence)}</TableCell>
                      <TableCell>{rule.priority}</TableCell>
                      <TableCell>
                        <Badge variant={rule.source === 'seed' ? 'secondary' : 'default'}>
                          {sourceLabel(rule.source)}
                        </Badge>
                      </TableCell>
                      <TableCell>{format(new Date(rule.updated_at || rule.created_at), 'dd MMM, HH:mm')}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Switch
                            checked={rule.active}
                            disabled={!isAdmin}
                            onCheckedChange={() => toggleRule(rule)}
                          />
                          <Button size="sm" variant="outline" onClick={() => openEditDialog(rule)} disabled={!isAdmin}>
                            <Edit3 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-3 p-3 lg:hidden">
              {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading learning rules...</div>
              ) : filteredRules.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No learning rules found for this filter.</div>
              ) : filteredRules.map((rule) => (
                <div key={rule.id} className="rounded-2xl border bg-card/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{areaNameByCode[rule.delivery_area_code] || rule.delivery_area_code}</p>
                      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{rule.rule_type.replace(/_/g, ' ')}</p>
                    </div>
                    <Badge variant={rule.active ? 'default' : 'secondary'}>
                      {rule.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <p className="mt-3 break-words text-sm">{rule.normalized_value}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Confidence</p>
                      <p className="font-semibold">{formatPercent(rule.confidence)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Priority</p>
                      <p className="font-semibold">{rule.priority}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button className="flex-1" variant="outline" onClick={() => openEditDialog(rule)} disabled={!isAdmin}>
                      Edit
                    </Button>
                    <Button className="flex-1" variant="secondary" onClick={() => toggleRule(rule)} disabled={!isAdmin}>
                      {rule.active ? 'Pause' : 'Activate'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <MapPinned className="h-5 w-5 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            Runner Resolve Area still uses the backend RPC <span className="font-mono text-foreground">correct_order_delivery_area</span>.
            When saved, exact normalized addresses are stored here as <span className="font-mono text-foreground">exact_address</span> rules.
          </p>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Edit Learning Rule' : 'Add Learning Rule'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Delivery Area</Label>
                <Select
                  value={form.delivery_area_code}
                  onValueChange={(value) => setForm((current) => ({ ...current, delivery_area_code: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select area" />
                  </SelectTrigger>
                  <SelectContent>
                    {normalAreas.map((area) => (
                      <SelectItem key={area.code} value={area.code}>{area.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Rule Type</Label>
                <Select
                  value={form.rule_type}
                  onValueChange={(value) => setForm((current) => ({ ...current, rule_type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {RULE_TYPES.map((ruleType) => (
                      <SelectItem key={ruleType.value} value={ruleType.value}>{ruleType.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Address / Matching Value</Label>
              <Textarea
                value={form.normalized_value}
                onChange={(event) => setForm((current) => ({ ...current, normalized_value: event.target.value }))}
                placeholder="Paste address, locality, postal code, or landmark..."
                className="min-h-24"
              />
              <p className="text-xs text-muted-foreground">
                Saved as: <span className="font-mono">{normalizeRuleValue(form.normalized_value) || '-'}</span>
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="space-y-2">
                <Label>Confidence</Label>
                <Input
                  value={form.confidence}
                  onChange={(event) => setForm((current) => ({ ...current, confidence: event.target.value }))}
                  inputMode="decimal"
                  placeholder="0.990"
                />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Input
                  value={form.priority}
                  onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
                  inputMode="numeric"
                  placeholder="100"
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
                <Label>Active</Label>
                <Switch
                  checked={form.active}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, active: checked }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveRule} disabled={!isAdmin || saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving...' : 'Save Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
