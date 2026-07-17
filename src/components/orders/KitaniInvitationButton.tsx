import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CheckCircle2, Copy, ExternalLink, Link2, Loader2, MessageCircle, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useCreateKitaniInvitation, type KitaniOrderLink } from '@/hooks/useKitaniOrderLinks';
import type { Order } from '@/types/database';

interface KitaniInvitationButtonProps {
  order: Order;
  link?: KitaniOrderLink | null;
}

const statusLabels: Record<string, string> = {
  AWAITING_CUSTOMER_LOCATION: 'Awaiting Location',
  LOCATION_CONFIRMED: 'Location Confirmed',
  SUBMITTED_TO_TOMUPRO: 'Submitted',
  DELIVERED: 'Delivered',
  FAILED: 'Retry',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  REVOKED: 'Revoked',
};

function normalizeWhatsAppPhone(phone: string | null | undefined) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('673')) return digits;
  return `673${digits.replace(/^0+/, '')}`;
}

export function KitaniInvitationButton({ order, link }: KitaniInvitationButtonProps) {
  const { toast } = useToast();
  const createInvitation = useCreateKitaniInvitation();
  const [open, setOpen] = useState(false);
  const [localLink, setLocalLink] = useState<KitaniOrderLink | null>(null);

  const activeLink = localLink || link || null;
  const hasUsableLink = !!activeLink?.invitation_url && !!activeLink?.message;

  const label = useMemo(() => {
    if (!activeLink) return 'Create Link';
    return statusLabels[activeLink.status] || 'KITANI';
  }, [activeLink]);

  const badgeTone = activeLink?.status === 'LOCATION_CONFIRMED'
    ? 'bg-green-50 text-green-700 border-green-200'
    : activeLink?.status === 'FAILED'
      ? 'bg-red-50 text-red-700 border-red-200'
      : 'bg-amber-50 text-amber-700 border-amber-200';

  const handleOpen = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (hasUsableLink) {
      setOpen(true);
      return;
    }

    const created = await createInvitation.mutateAsync(order.id);
    setLocalLink(created);
    setOpen(true);
  };

  const copyText = async (text: string, title: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title });
  };

  const message = activeLink?.message || '';
  const invitationUrl = activeLink?.invitation_url || '';
  const whatsappPhone = normalizeWhatsAppPhone(order.phone);
  const whatsappUrl = whatsappPhone
    ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  return (
    <div className="flex justify-end" onClick={(event) => event.stopPropagation()}>
      <Button
        type="button"
        size="sm"
        variant={activeLink ? 'outline' : 'default'}
        className="h-8 rounded-full px-3 text-xs font-semibold"
        disabled={createInvitation.isPending}
        onClick={handleOpen}
      >
        {createInvitation.isPending ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : activeLink?.status === 'LOCATION_CONFIRMED' ? (
          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
        ) : activeLink ? (
          <Link2 className="mr-1.5 h-3.5 w-3.5" />
        ) : (
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
        )}
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl bg-background text-foreground">
          <DialogHeader>
            <DialogTitle>KITANI Delivery Link</DialogTitle>
            <DialogDescription>
              Send this message to the customer so they can verify their phone and confirm location.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline" className={badgeTone}>
                {activeLink ? statusLabels[activeLink.status] || activeLink.status : 'Ready'}
              </Badge>
              <span className="font-mono font-semibold">{order.order_code}</span>
              <span className="text-muted-foreground">{order.customer_name}</span>
              {activeLink?.expires_at && (
                <span className="text-muted-foreground">
                  Expires {format(new Date(activeLink.expires_at), 'MMM dd, HH:mm')}
                </span>
              )}
            </div>

            <Textarea
              readOnly
              value={message}
              className="min-h-[150px] bg-secondary/40 text-sm"
            />

            <div className="rounded-xl border bg-secondary/30 p-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Confirmation Link</p>
              <p className="break-all text-sm font-medium">{invitationUrl}</p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => copyText(invitationUrl, 'KITANI link copied')}
              disabled={!invitationUrl}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy Link
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => copyText(message, 'KITANI message copied')}
              disabled={!message}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy Message
            </Button>
            <Button
              type="button"
              onClick={() => window.open(whatsappUrl, '_blank', 'noopener,noreferrer')}
              disabled={!message}
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              WhatsApp
            </Button>
            {invitationUrl && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => window.open(invitationUrl, '_blank', 'noopener,noreferrer')}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
