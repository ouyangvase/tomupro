import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import {
  useReasons,
  useCreateReason,
  useUpdateReason,
  useDeleteReason,
  type ReasonType,
  type Reason,
} from '@/hooks/useReasons';
import { useMessageTemplate, useSaveMessageTemplate } from '@/hooks/useMessageTemplates';
import {
  DEFAULT_WHATSAPP_ORDER_TEMPLATE,
  generateWhatsAppMessage,
  WHATSAPP_ORDER_TEMPLATE_KEY,
  WHATSAPP_TEMPLATE_TAGS,
} from '@/lib/whatsapp';
import { Plus, Settings, Trash2, Pencil, MessageSquare, Save, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import type { Order } from '@/types/database';

type SettingsTab = ReasonType | 'WHATSAPP';

export default function ReasonsSettings() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const [activeTab, setActiveTab] = useState<SettingsTab>('CANCEL');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingReason, setEditingReason] = useState<Reason | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newSortOrder, setNewSortOrder] = useState(0);
  const activeReasonType: ReasonType = activeTab === 'WHATSAPP' ? 'CANCEL' : activeTab;

  // Fetch all reasons (including inactive for admin view)
  const { data: reasons, isLoading } = useReasons(activeReasonType, false);

  const createReason = useCreateReason();
  const updateReason = useUpdateReason();
  const deleteReason = useDeleteReason();

  const handleAddReason = async () => {
    if (activeTab === 'WHATSAPP' || !newLabel.trim()) return;

    await createReason.mutateAsync({
      reason_type: activeTab,
      label: newLabel.trim(),
      sort_order: newSortOrder,
    });

    setNewLabel('');
    setNewSortOrder(0);
    setAddDialogOpen(false);
  };

  const handleEditReason = async () => {
    if (!editingReason || !newLabel.trim()) return;

    await updateReason.mutateAsync({
      id: editingReason.id,
      label: newLabel.trim(),
      sort_order: newSortOrder,
    });

    setEditingReason(null);
    setNewLabel('');
    setNewSortOrder(0);
    setEditDialogOpen(false);
  };

  const handleToggleActive = async (reason: Reason) => {
    await updateReason.mutateAsync({
      id: reason.id,
      is_active: !reason.is_active,
    });
  };

  const handleOpenEdit = (reason: Reason) => {
    setEditingReason(reason);
    setNewLabel(reason.label);
    setNewSortOrder(reason.sort_order);
    setEditDialogOpen(true);
  };

  const handleDelete = async (reason: Reason) => {
    await deleteReason.mutateAsync(reason.id);
  };

  const columns: Column<Reason>[] = [
    {
      key: 'label',
      header: 'Label',
      sortable: true,
    },
    {
      key: 'sort_order',
      header: 'Sort Order',
      sortable: true,
    },
    {
      key: 'is_active',
      header: 'Active',
      render: (reason) => (
        <Switch
          checked={reason.is_active}
          onCheckedChange={() => isAdmin && handleToggleActive(reason)}
          disabled={!isAdmin || updateReason.isPending}
        />
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      sortable: true,
      render: (reason) => format(new Date(reason.created_at), 'MMM d, yyyy'),
    },
  ];

  // Add actions column only for admin
  if (isAdmin) {
    columns.push({
      key: 'actions',
      header: 'Actions',
      render: (reason) => (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenEdit(reason);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(reason);
            }}
            disabled={deleteReason.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    });
  }

  const tabLabels: Record<ReasonType, string> = {
    CANCEL: 'Cancel Reasons',
    FAILED_DELIVERY: 'Failed Delivery Reasons',
    DISPUTE: 'Dispute Reasons',
  };

  return (
    <AppLayout>
      <div className="space-y-5 p-4 sm:space-y-6 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Settings className="h-7 w-7 shrink-0 text-primary sm:h-8 sm:w-8" />
            <div>
              <h1 className="text-2xl font-bold leading-tight">Reason Settings</h1>
              <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
                Manage reasons for cancellations, failed deliveries, and disputes
              </p>
            </div>
          </div>

          {isAdmin && activeTab !== 'WHATSAPP' && (
            <Button className="w-full sm:w-auto" onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Reason
            </Button>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SettingsTab)}>
          <TabsList className="grid h-auto w-full grid-cols-1 gap-2 rounded-2xl p-1.5 sm:grid-cols-3">
            <TabsTrigger className="w-full whitespace-normal px-3 py-2.5 text-center leading-tight" value="CANCEL">
              Cancel Reasons
            </TabsTrigger>
            <TabsTrigger className="w-full whitespace-normal px-3 py-2.5 text-center leading-tight" value="FAILED_DELIVERY">
              Failed Delivery
            </TabsTrigger>
            <TabsTrigger className="w-full whitespace-normal px-3 py-2.5 text-center leading-tight" value="WHATSAPP">
              WhatsApp Message
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            {activeTab === 'WHATSAPP' ? (
              <WhatsAppMessageTemplatePanel isAdmin={isAdmin} />
            ) : (
              <DataGrid
                data={reasons || []}
                columns={columns}
                loading={isLoading}
                keyField="id"
              />
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Reason Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {tabLabels[activeReasonType].replace('s', '')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Enter reason label..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sortOrder">Sort Order</Label>
              <Input
                id="sortOrder"
                type="number"
                value={newSortOrder}
                onChange={(e) => setNewSortOrder(Number(e.target.value))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddReason}
              disabled={activeTab === 'WHATSAPP' || !newLabel.trim() || createReason.isPending}
            >
              {createReason.isPending ? 'Adding...' : 'Add Reason'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Reason Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Reason</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editLabel">Label</Label>
              <Input
                id="editLabel"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Enter reason label..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editSortOrder">Sort Order</Label>
              <Input
                id="editSortOrder"
                type="number"
                value={newSortOrder}
                onChange={(e) => setNewSortOrder(Number(e.target.value))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEditReason}
              disabled={!newLabel.trim() || updateReason.isPending}
            >
              {updateReason.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function WhatsAppMessageTemplatePanel({ isAdmin }: { isAdmin: boolean }) {
  const { data: template, isLoading } = useMessageTemplate(WHATSAPP_ORDER_TEMPLATE_KEY);
  const saveTemplate = useSaveMessageTemplate();
  const [body, setBody] = useState(DEFAULT_WHATSAPP_ORDER_TEMPLATE);

  useEffect(() => {
    setBody(template?.body || DEFAULT_WHATSAPP_ORDER_TEMPLATE);
  }, [template?.body]);

  const previewOrder = {
    order_code: 'AP876',
    customer_name: 'A',
    phone: '8112386',
    address: 'MULAUT HUA HO',
    area: 'BM',
    total_amount: 49,
    order_items: [
      {
        id: 'preview-item',
        order_id: 'preview-order',
        product_id: null,
        sku_label: 'TY13',
        qty: 1,
        price: 49,
        line_total: 49,
        notes: null,
        created_at: new Date().toISOString(),
        product: {
          id: 'preview-product',
          sku_code: 'TY13',
          sku_name: 'DILDO COVER (NATURAL)',
          owner_user_id: '',
          created_by: '',
          created_at: new Date().toISOString(),
          updated_at: null,
          is_active: true,
        },
      },
    ],
  } as Partial<Order> as Order;

  const previewMessage = generateWhatsAppMessage(previewOrder, body);

  const insertTag = (tag: string) => {
    setBody(current => `${current}${current.endsWith(' ') || current.endsWith('\n') ? '' : ' '}${tag}`);
  };

  const handleSave = async () => {
    await saveTemplate.mutateAsync({
      template_key: WHATSAPP_ORDER_TEMPLATE_KEY,
      name: 'Customer WhatsApp Message',
      description: 'Message used when runner or driver users open WhatsApp from an order phone number.',
      body,
      variables: WHATSAPP_TEMPLATE_TAGS.map(item => item.tag),
      is_active: true,
    });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">WhatsApp Customer Message</h2>
              <p className="text-sm text-muted-foreground">
                This template is used by runner and driver WhatsApp links. Tags are replaced per order.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setBody(DEFAULT_WHATSAPP_ORDER_TEMPLATE)}
              disabled={!isAdmin || saveTemplate.isPending}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!isAdmin || saveTemplate.isPending || !body.trim()}
            >
              <Save className="mr-2 h-4 w-4" />
              {saveTemplate.isPending ? 'Saving...' : 'Save Template'}
            </Button>
          </div>
        </div>

        {!isAdmin && (
          <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
            Only admin users can edit this message template.
          </div>
        )}

        <div className="mt-5 space-y-3">
          <Label htmlFor="whatsapp-message-template">Message Template</Label>
          <Textarea
            id="whatsapp-message-template"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={!isAdmin || isLoading}
            className="min-h-[360px] font-mono text-sm leading-6"
          />
        </div>

        <div className="mt-5">
          <Label>Available Tags</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {WHATSAPP_TEMPLATE_TAGS.map(item => (
              <button
                key={item.tag}
                type="button"
                onClick={() => insertTag(item.tag)}
                disabled={!isAdmin}
                className="rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                title={item.description}
              >
                {item.tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Preview</h3>
          <p className="mt-1 text-sm text-muted-foreground">Example order AP876</p>
        </div>
        <pre className="mt-4 max-h-[560px] overflow-auto whitespace-pre-wrap rounded-xl bg-secondary/50 p-4 text-sm leading-6 text-foreground">
          {previewMessage}
        </pre>
      </div>
    </div>
  );
}
