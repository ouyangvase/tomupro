import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CheckCircle2, Copy, ExternalLink, Link2, Loader2, MessageCircle, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useCreateKitaniInvitation, type KitaniOrderLink } from '@/hooks/useKitaniOrderLinks';
import type { Order } from '@/types/database';

interface KitaniInvitationButtonProps {
  order: Order;
  link?: KitaniOrderLink | null;
  mode?: 'table' | 'mobile';
  className?: string;
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

export function KitaniInvitationButton({ order, link, mode = 'table', className }: KitaniInvitationButtonProps) {
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

  const rawMessage = activeLink?.message || '';
  const invitationUrl = activeLink?.invitation_url || '';
  const message = invitationUrl && rawMessage && !rawMessage.includes(invitationUrl)
    ? `${rawMessage.trim()}\n\nConfirm your location: ${invitationUrl}`
    : rawMessage;
  const whatsappPhone = normalizeWhatsAppPhone(order.phone);
  const whatsappUrl = whatsappPhone
    ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  return (
    <div className={cn('flex w-full justify-end', className)} onClick={(event) => event.stopPropagation()}>
      <Button
        type="button"
        size="sm"
        variant={activeLink ? 'outline' : 'default'}
        className={cn(
          'min-w-0 justify-center whitespace-nowrap font-semibold',
          mode === 'mobile'
            ? 'h-9 w-full rounded-xl px-3 text-xs'
            : 'h-8 w-full max-w-[156px] rounded-full px-3 text-xs'
        )}
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
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-2xl max-h-[92dvh] overflow-y-auto rounded-3xl border border-border/70 bg-background p-0 text-foreground shadow-2xl">
          <DialogHeader className="border-b border-border/60 px-5 pb-4 pt-5 text-left sm:px-6 sm:pt-6">
            <DialogTitle className="text-xl">KITANI Delivery Link</DialogTitle>
            <DialogDescription className="max-w-xl text-sm leading-relaxed">
              Send this message to the customer so they can verify their phone and confirm location.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-5 py-5 sm:px-6">
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

            <div className="rounded-2xl border border-primary/30 bg-secondary/30 p-4 text-sm leading-relaxed text-foreground shadow-inner">
              <p className="whitespace-pre-wrap break-words">{message || 'Create a KITANI link to generate the customer message.'}</p>
            </div>

            <div className="rounded-xl border bg-secondary/30 p-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Confirmation Link</p>
              <p className="break-all text-sm font-medium">{invitationUrl}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-border/60 px-5 pb-5 pt-4 sm:grid-cols-4 sm:px-6">
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              onClick={() => copyText(invitationUrl, 'KITANI link copied')}
              disabled={!invitationUrl}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy Link
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              onClick={() => copyText(message, 'KITANI message copied')}
              disabled={!message}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy Message
            </Button>
            <Button
              type="button"
              className="h-11 w-full"
              onClick={() => window.open(whatsappUrl, '_blank', 'noopener,noreferrer')}
              disabled={!message}
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              WhatsApp
            </Button>
            {invitationUrl && (
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full"
                onClick={() => window.open(invitationUrl, '_blank', 'noopener,noreferrer')}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
