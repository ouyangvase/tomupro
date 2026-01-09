import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DollarSign, Settings, Users, Save, Plus, Trash2, Target, Percent, Hash, Layers } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUsers } from "@/hooks/useUsers";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  CommissionMode, 
  CommissionSettings as ICommissionSettings,
  CommissionTier,
  SalespersonTarget,
  TargetType,
  useUpsertCommissionSettings,
  useSetSalespersonTarget
} from "@/hooks/useCommission";
import { format } from "date-fns";

function useAllCommissionSettings() {
  return useQuery({
    queryKey: ['all-commission-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commission_settings')
        .select('*, commission_tiers(*), profiles!commission_settings_salesperson_id_fkey(display_name, email)')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as (ICommissionSettings & { 
        commission_tiers: CommissionTier[];
        profiles: { display_name: string; email: string } | null;
      })[];
    },
  });
}

function useAllSalespersonTargets(yearMonth: string) {
  return useQuery({
    queryKey: ['all-salesperson-targets', yearMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('salesperson_targets')
        .select('*, profiles!salesperson_targets_salesperson_id_fkey(display_name, email)')
        .eq('year_month', yearMonth)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as (SalespersonTarget & { 
        profiles: { display_name: string; email: string } | null;
      })[];
    },
  });
}

interface TierInput {
  min_orders: number;
  max_orders: number | null;
  tier_value: number;
}

export default function CommissionSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: users } = useUsers();
  const currentMonth = format(new Date(), 'yyyy-MM');
  
  const { data: allSettings, isLoading: settingsLoading } = useAllCommissionSettings();
  const { data: allTargets, isLoading: targetsLoading } = useAllSalespersonTargets(currentMonth);
  
  const upsertSettings = useUpsertCommissionSettings();
  const setTarget = useSetSalespersonTarget();
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [targetDialogOpen, setTargetDialogOpen] = useState(false);
  const [selectedSalesperson, setSelectedSalesperson] = useState<string>("");
  
  // Commission settings form state
  const [commissionMode, setCommissionMode] = useState<CommissionMode>("PERCENTAGE");
  const [baseValue, setBaseValue] = useState<number>(5);
  const [isTiered, setIsTiered] = useState(false);
  const [tiers, setTiers] = useState<TierInput[]>([
    { min_orders: 1, max_orders: 10, tier_value: 5 },
    { min_orders: 11, max_orders: 25, tier_value: 7 },
    { min_orders: 26, max_orders: null, tier_value: 10 },
  ]);
  
  // Target form state
  const [targetType, setTargetType] = useState<TargetType>("SALES_VALUE");
  const [targetValue, setTargetValue] = useState<number>(10000);
  
  const salespeople = users?.filter(u => u.role === 'salesperson' && u.is_active) || [];
  
  // Build settings map for quick lookup
  const settingsMap = new Map(
    allSettings?.map(s => [s.salesperson_id, s]) || []
  );
  
  // Build targets map for quick lookup
  const targetsMap = new Map(
    allTargets?.map(t => [t.salesperson_id, t]) || []
  );
  
  const handleOpenEditDialog = (spId: string) => {
    setSelectedSalesperson(spId);
    const existingSettings = settingsMap.get(spId);
    
    if (existingSettings) {
      setCommissionMode(existingSettings.commission_mode as CommissionMode);
      setBaseValue(existingSettings.base_value);
      setIsTiered(existingSettings.is_tiered);
      
      if (existingSettings.commission_tiers?.length > 0) {
        setTiers(existingSettings.commission_tiers.sort((a, b) => a.tier_order - b.tier_order).map(t => ({
          min_orders: t.min_orders,
          max_orders: t.max_orders,
          tier_value: t.tier_value,
        })));
      } else {
        setTiers([{ min_orders: 1, max_orders: 10, tier_value: 5 }]);
      }
    } else {
      // Reset to defaults
      setCommissionMode("PERCENTAGE");
      setBaseValue(5);
      setIsTiered(false);
      setTiers([{ min_orders: 1, max_orders: 10, tier_value: 5 }]);
    }
    
    setEditDialogOpen(true);
  };
  
  const handleOpenTargetDialog = (spId: string) => {
    setSelectedSalesperson(spId);
    const existingTarget = targetsMap.get(spId);
    
    if (existingTarget) {
      setTargetType(existingTarget.target_type as TargetType);
      setTargetValue(existingTarget.target_value);
    } else {
      setTargetType("SALES_VALUE");
      setTargetValue(10000);
    }
    
    setTargetDialogOpen(true);
  };
  
  const handleSaveSettings = async () => {
    if (!selectedSalesperson) return;
    
    try {
      await upsertSettings.mutateAsync({
        salespersonId: selectedSalesperson,
        commissionMode,
        baseValue,
        isTiered,
        tiers: isTiered ? tiers : undefined,
      });
      
      queryClient.invalidateQueries({ queryKey: ['all-commission-settings'] });
      setEditDialogOpen(false);
      toast({ title: "Commission settings saved successfully" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };
  
  const handleSaveTarget = async () => {
    if (!selectedSalesperson) return;
    
    try {
      await setTarget.mutateAsync({
        salespersonId: selectedSalesperson,
        yearMonth: currentMonth,
        targetType,
        targetValue,
      });
      
      queryClient.invalidateQueries({ queryKey: ['all-salesperson-targets'] });
      setTargetDialogOpen(false);
      toast({ title: "Monthly target saved successfully" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };
  
  const addTier = () => {
    const lastTier = tiers[tiers.length - 1];
    const newMin = lastTier?.max_orders ? lastTier.max_orders + 1 : 1;
    setTiers([...tiers, { min_orders: newMin, max_orders: null, tier_value: 10 }]);
  };
  
  const removeTier = (index: number) => {
    if (tiers.length <= 1) return;
    setTiers(tiers.filter((_, i) => i !== index));
  };
  
  const updateTier = (index: number, field: keyof TierInput, value: number | null) => {
    setTiers(tiers.map((tier, i) => 
      i === index ? { ...tier, [field]: value } : tier
    ));
  };
  
  const getDisplayName = (spId: string) => {
    const sp = salespeople.find(s => s.id === spId);
    return sp?.display_name || 'Unknown';
  };

  if (settingsLoading || targetsLoading) {
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
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            Commission System
          </h1>
          <p className="text-muted-foreground">
            Configure per-salesperson commission rates, tiers, and monthly targets
          </p>
        </div>

        {/* Info Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Commission Base
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                <code className="bg-muted px-1 rounded">Order Total - Discounts - Delivery Charges</code>
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Commission Trigger
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Only when <Badge variant="secondary">Admin Reconciliation = APPROVED</Badge>
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="h-4 w-4" />
                Snapshot Policy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Immutable snapshots locked to original salesperson
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Salespeople Commission Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Salesperson Commission Configuration
            </CardTitle>
            <CardDescription>
              Configure commission mode, rates, and monthly targets for each salesperson
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Salesperson</TableHead>
                  <TableHead>Commission Mode</TableHead>
                  <TableHead>Base Value</TableHead>
                  <TableHead>Tiered</TableHead>
                  <TableHead>Monthly Target ({format(new Date(), 'MMM yyyy')})</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salespeople.map(sp => {
                  const settings = settingsMap.get(sp.id);
                  const target = targetsMap.get(sp.id);
                  
                  return (
                    <TableRow key={sp.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{sp.display_name}</p>
                          <p className="text-xs text-muted-foreground">{sp.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {settings ? (
                          <Badge variant={settings.commission_mode === 'PERCENTAGE' ? 'default' : 'secondary'}>
                            {settings.commission_mode === 'PERCENTAGE' ? (
                              <><Percent className="h-3 w-3 mr-1" /> Percentage</>
                            ) : (
                              <><Hash className="h-3 w-3 mr-1" /> Per Order</>
                            )}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">Not configured</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {settings ? (
                          settings.commission_mode === 'PERCENTAGE' 
                            ? `${settings.base_value}%` 
                            : `BND ${settings.base_value.toFixed(2)}`
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {settings?.is_tiered ? (
                          <Badge variant="outline" className="bg-primary/10">
                            {settings.commission_tiers?.length || 0} Tiers
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">No</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {target ? (
                          <div>
                            <span className="font-medium">
                              {target.target_type === 'SALES_VALUE' 
                                ? `BND ${target.target_value.toLocaleString()}`
                                : `${target.target_value} orders`
                              }
                            </span>
                            <Badge variant="outline" className="ml-2 text-xs">
                              {target.target_type === 'SALES_VALUE' ? 'Sales' : 'Orders'}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Not set</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleOpenEditDialog(sp.id)}
                          >
                            <Settings className="h-4 w-4 mr-1" />
                            Commission
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleOpenTargetDialog(sp.id)}
                          >
                            <Target className="h-4 w-4 mr-1" />
                            Target
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                
                {salespeople.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No salespeople found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Edit Commission Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Commission Settings</DialogTitle>
              <DialogDescription>
                Configure commission for {getDisplayName(selectedSalesperson)}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Commission Mode</Label>
                <Select value={commissionMode} onValueChange={(v) => setCommissionMode(v as CommissionMode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENTAGE">
                      <div className="flex items-center gap-2">
                        <Percent className="h-4 w-4" />
                        <span>Percentage of Commission Base</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="PER_ORDER">
                      <div className="flex items-center gap-2">
                        <Hash className="h-4 w-4" />
                        <span>Fixed Amount Per Order</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Commission Base = Order Total - Discounts - Delivery Charges
                </p>
              </div>
              
              <div className="space-y-2">
                <Label>
                  {commissionMode === 'PERCENTAGE' ? 'Base Percentage (%)' : 'Fixed Amount (BND)'}
                </Label>
                <Input
                  type="number"
                  value={baseValue}
                  onChange={(e) => setBaseValue(parseFloat(e.target.value) || 0)}
                  min={0}
                  step={commissionMode === 'PERCENTAGE' ? 0.5 : 1}
                />
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable Tiered Commission</Label>
                  <p className="text-xs text-muted-foreground">Monthly reset, based on completed orders</p>
                </div>
                <Switch checked={isTiered} onCheckedChange={setIsTiered} />
              </div>
              
              {isTiered && (
                <div className="space-y-3">
                  <Label>Commission Tiers</Label>
                  {tiers.map((tier, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <Input
                        type="number"
                        value={tier.min_orders}
                        onChange={(e) => updateTier(index, 'min_orders', parseInt(e.target.value) || 0)}
                        className="w-20"
                        min={1}
                        placeholder="Min"
                      />
                      <span className="text-muted-foreground">to</span>
                      <Input
                        type="number"
                        value={tier.max_orders ?? ''}
                        onChange={(e) => updateTier(index, 'max_orders', e.target.value ? parseInt(e.target.value) : null)}
                        className="w-20"
                        placeholder="∞"
                      />
                      <span className="text-muted-foreground">orders →</span>
                      <Input
                        type="number"
                        value={tier.tier_value}
                        onChange={(e) => updateTier(index, 'tier_value', parseFloat(e.target.value) || 0)}
                        className="w-24"
                        step={0.5}
                      />
                      <span className="text-muted-foreground text-sm">
                        {commissionMode === 'PERCENTAGE' ? '%' : 'BND'}
                      </span>
                      {tiers.length > 1 && (
                        <Button variant="ghost" size="icon" onClick={() => removeTier(index)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addTier}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Tier
                  </Button>
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveSettings} disabled={upsertSettings.isPending}>
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Target Dialog */}
        <Dialog open={targetDialogOpen} onOpenChange={setTargetDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Monthly Target</DialogTitle>
              <DialogDescription>
                Set target for {getDisplayName(selectedSalesperson)} - {format(new Date(), 'MMMM yyyy')}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Target Type</Label>
                <Select value={targetType} onValueChange={(v) => setTargetType(v as TargetType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SALES_VALUE">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        <span>Sales Value (BND)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="ORDER_COUNT">
                      <div className="flex items-center gap-2">
                        <Hash className="h-4 w-4" />
                        <span>Order Count</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>
                  Target Value {targetType === 'SALES_VALUE' ? '(BND)' : '(Orders)'}
                </Label>
                <Input
                  type="number"
                  value={targetValue}
                  onChange={(e) => setTargetValue(parseFloat(e.target.value) || 0)}
                  min={0}
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setTargetDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveTarget} disabled={setTarget.isPending}>
                <Save className="h-4 w-4 mr-2" />
                Save Target
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
