import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ArrowUpRight, CheckCircle2, Copy, ExternalLink, Link2, Loader2, MessageCircle, ShieldCheck, Sparkles } from 'lucide-react';
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
    ? 'bg-[#e9f5ee] text-[#21613d] ring-[#b9ddc7]'
    : activeLink?.status === 'FAILED'
      ? 'bg-[#fbeceb] text-[#9a332d] ring-[#efc2bd]'
      : 'bg-[#f5ead3] text-[#795116] ring-[#dfc795]';

  const buttonTone = activeLink?.status === 'LOCATION_CONFIRMED'
    ? 'from-[#9ecfb1] via-[#4f936b] to-[#246044]'
    : activeLink?.status === 'FAILED'
      ? 'from-[#e3a39b] via-[#b65047] to-[#74302b]'
      : 'from-[#f4dfad] via-[#c8953f] to-[#8a5b18]';

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
    <div
      className={cn('flex w-full justify-end font-["Plus_Jakarta_Sans"]', className)}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className={cn(
          'group/kitani w-full rounded-full bg-gradient-to-br p-[1px] shadow-[0_12px_28px_-18px_rgba(82,52,12,0.85),0_1px_0_rgba(255,255,255,0.8)]',
          buttonTone,
          mode === 'mobile'
            ? 'max-w-none'
            : 'max-w-[180px]'
        )}
      >
        <button
          type="button"
          className={cn(
            'flex w-full items-center rounded-full bg-[#191813] text-left text-[#fffaf0] shadow-[inset_0_1px_0_rgba(255,255,255,0.13)]',
            'transition-[transform,background-color,box-shadow] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]',
            'hover:-translate-y-px hover:bg-[#222018] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_9px_20px_-14px_rgba(0,0,0,0.8)]',
            'active:translate-y-0 active:scale-[0.98] disabled:cursor-wait disabled:opacity-65',
            mode === 'mobile' ? 'h-11 px-2' : 'h-10 px-2'
          )}
          disabled={createInvitation.isPending}
          onClick={handleOpen}
          aria-label={`${label} for order ${order.order_code}`}
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#d8ab5d]/14 text-[#edc77f] ring-1 ring-inset ring-[#edc77f]/28">
            {createInvitation.isPending ? (
              <Loader2
                className="h-3.5 w-3.5 animate-[spin_1.2s_cubic-bezier(0.32,0.72,0,1)_infinite]"
                strokeWidth={1.7}
              />
            ) : activeLink?.status === 'LOCATION_CONFIRMED' ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-[#9ed3b2]" strokeWidth={1.7} />
            ) : activeLink ? (
              <Link2 className="h-3.5 w-3.5" strokeWidth={1.7} />
            ) : (
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.7} />
            )}
          </span>

          <span className="min-w-0 flex-1 px-2">
            <span className="block text-[8px] font-semibold uppercase leading-none tracking-[0.2em] text-[#d8ab5d]">
              KITANI
            </span>
            <span className="mt-1 block truncate text-[11px] font-semibold leading-none tracking-normal text-[#fffaf0]">
              {createInvitation.isPending ? 'Creating Link' : label}
            </span>
          </span>

          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#fffaf0] text-[#191813] shadow-[0_3px_10px_-5px_rgba(0,0,0,0.7)] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover/kitani:translate-x-0.5 group-hover/kitani:-translate-y-0.5 group-hover/kitani:scale-105">
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.7} />
          </span>
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] w-[calc(100vw-1.25rem)] max-w-2xl gap-0 overflow-hidden rounded-[28px] border-0 bg-[#d8c7a8] p-1.5 font-['Plus_Jakarta_Sans'] text-[#1b1a16] shadow-[0_40px_100px_-38px_rgba(36,28,14,0.55)] [&>button]:right-5 [&>button]:top-5 [&>button]:rounded-full [&>button]:bg-white/10 [&>button]:p-2 [&>button]:text-white [&>button]:opacity-80 [&>button]:transition-opacity [&>button]:hover:opacity-100">
          <div className="max-h-[calc(92dvh-0.75rem)] overflow-y-auto rounded-[22px] bg-[#fbfaf6]">
            <DialogHeader className="relative overflow-hidden bg-[#191813] px-5 pb-6 pt-6 text-left text-[#fffaf0] sm:px-7 sm:pb-7 sm:pt-7">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#edc77f]/80 to-transparent" />
              <div className="mb-5 flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[#d8ab5d]/15 text-[#edc77f] ring-1 ring-inset ring-[#edc77f]/25">
                  <Sparkles className="h-4 w-4" strokeWidth={1.6} />
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#d8ab5d]">
                  KITANI Concierge
                </span>
              </div>
              <DialogTitle className="text-2xl font-semibold tracking-normal text-[#fffaf0] sm:text-[28px]">
                Delivery invitation
              </DialogTitle>
              <DialogDescription className="mt-2 max-w-lg text-sm leading-6 text-[#c8c3b7]">
                Share one secure link for customer verification and precise delivery location.
              </DialogDescription>
            </DialogHeader>

            <div className="border-b border-[#dfdacd] bg-[#f4f0e7] px-5 py-4 sm:px-7">
              <div className="flex flex-wrap items-center gap-2.5 text-sm">
                <Badge className={cn('border-0 px-2.5 py-1 text-[10px] font-semibold ring-1 ring-inset', badgeTone)}>
                  {activeLink ? statusLabels[activeLink.status] || activeLink.status : 'Ready'}
                </Badge>
                <span className="font-mono text-xs font-semibold text-[#1b1a16]">{order.order_code}</span>
                <span className="h-1 w-1 rounded-full bg-[#b6ad9e]" />
                <span className="font-medium text-[#514d44]">{order.customer_name}</span>
                {activeLink?.expires_at && (
                  <span className="ml-auto text-xs text-[#777064]">
                    Expires {format(new Date(activeLink.expires_at), 'MMM dd, HH:mm')}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-5 px-5 py-6 sm:px-7 sm:py-7">
              <section>
                <div className="mb-2.5 flex items-center gap-2 text-[#6b6255]">
                  <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.6} />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em]">Customer message</p>
                </div>
                <div className="rounded-[20px] bg-[#e9e2d5] p-1 ring-1 ring-[#d8cfbf]/70">
                  <div className="rounded-[16px] bg-white px-4 py-4 text-sm leading-6 text-[#34312b] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] sm:px-5 sm:py-5">
                    <p className="whitespace-pre-wrap break-words">
                      {message || 'Create a KITANI link to generate the customer message.'}
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <div className="mb-2.5 flex items-center gap-2 text-[#6b6255]">
                  <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.6} />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em]">Secure confirmation link</p>
                </div>
                <div className="flex min-h-12 items-center rounded-[16px] bg-[#f0ece4] px-4 py-3 ring-1 ring-inset ring-[#d8d1c5]">
                  <p className="min-w-0 break-all font-mono text-xs font-medium leading-5 text-[#514d44]">
                    {invitationUrl || 'Link will appear here after creation.'}
                  </p>
                </div>
              </section>
            </div>

            <div className="grid grid-cols-2 gap-2.5 border-t border-[#dfdacd] bg-[#f4f0e7] px-5 py-5 sm:grid-cols-4 sm:px-7">
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-full border-0 bg-white text-xs font-semibold text-[#34312b] ring-1 ring-inset ring-[#d8d1c5] transition-[transform,background-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-px hover:bg-[#fffdf8]"
                onClick={() => copyText(invitationUrl, 'KITANI link copied')}
                disabled={!invitationUrl}
              >
                <Copy className="mr-2 h-3.5 w-3.5" strokeWidth={1.7} />
                Copy Link
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-full border-0 bg-white text-xs font-semibold text-[#34312b] ring-1 ring-inset ring-[#d8d1c5] transition-[transform,background-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-px hover:bg-[#fffdf8]"
                onClick={() => copyText(message, 'KITANI message copied')}
                disabled={!message}
              >
                <Copy className="mr-2 h-3.5 w-3.5" strokeWidth={1.7} />
                Message
              </Button>
              <Button
                type="button"
                className="h-11 w-full rounded-full bg-[#246044] text-xs font-semibold text-white shadow-[0_8px_18px_-12px_rgba(36,96,68,0.8)] transition-[transform,background-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-px hover:bg-[#2b6e4f]"
                onClick={() => window.open(whatsappUrl, '_blank', 'noopener,noreferrer')}
                disabled={!message}
              >
                <MessageCircle className="mr-2 h-3.5 w-3.5" strokeWidth={1.7} />
                WhatsApp
              </Button>
              <Button
                type="button"
                className="h-11 w-full rounded-full bg-[#191813] text-xs font-semibold text-[#fffaf0] shadow-[0_8px_18px_-12px_rgba(0,0,0,0.8)] transition-[transform,background-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-px hover:bg-[#28251d]"
                onClick={() => window.open(invitationUrl, '_blank', 'noopener,noreferrer')}
                disabled={!invitationUrl}
              >
                <ExternalLink className="mr-2 h-3.5 w-3.5" strokeWidth={1.7} />
                Open Link
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
