import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import type { Order } from '@/types/database';
import { CheckCircle, XCircle, Loader2, ZoomIn, ZoomOut, ImageIcon } from 'lucide-react';

interface ReceiptConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
  /** Called after runner confirms — parent should open deliver dialog */
  onConfirmed?: () => void;
  /** When true, hides confirm/reject buttons — view-only mode */
  readOnly?: boolean;
}

export function ReceiptConfirmDialog({
  open,
  onOpenChange,
  order,
  onConfirmed,
  readOnly = false,
}: ReceiptConfirmDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [zoomed, setZoomed] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [loading, setLoading] = useState(false);

  const resetState = () => {
    setZoomed(false);
    setRejecting(false);
    setRejectReason('');
    setLoading(false);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) resetState();
    onOpenChange(v);
  };

  const handleConfirm = async () => {
    if (!order || !user) return;
    setLoading(true);
    try {
      const { data: result, error } = await (supabase as any).rpc('confirm_order_receipt', {
        p_order_id: order.id,
        p_actor_id: user.id,
      });

      if (error) throw error;
      if (result && !result.success) throw new Error(result.error || 'Failed to confirm receipt');

      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders-paginated'] });

      toast({ title: 'Receipt confirmed', description: 'You can now mark this order as delivered.' });
      handleOpenChange(false);
      onConfirmed?.();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message || 'Failed to confirm receipt' });
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!order || !user) return;
    if (!rejectReason.trim()) {
      toast({ variant: 'destructive', title: 'Reason required', description: 'Please enter a reason for rejecting the receipt.' });
      return;
    }
    setLoading(true);
    try {
      const { data: result, error } = await (supabase as any).rpc('reject_order_receipt', {
        p_order_id: order.id,
        p_actor_id: user.id,
        p_reason: rejectReason.trim(),
      });

      if (error) throw error;
      if (result && !result.success) throw new Error(result.error || 'Failed to reject receipt');

      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders-paginated'] });

      toast({ title: 'Receipt rejected', description: 'The salesperson will be notified to re-upload.' });
      handleOpenChange(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message || 'Failed to reject receipt' });
    } finally {
      setLoading(false);
    }
  };

  if (!order) return null;

  const statusBadge = () => {
    const s = order.receipt_status;
    if (s === 'pending') return <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Pending Review</Badge>;
    if (s === 'confirmed') return <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/20">Confirmed</Badge>;
    if (s === 'rejected') return <Badge variant="outline" className="text-xs bg-red-500/10 text-red-600 border-red-500/20">Rejected</Badge>;
    return <Badge variant="outline" className="text-xs">No Receipt</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center">Verify Payment Receipt</DialogTitle>
          <DialogDescription className="text-center">
            Order <span className="font-mono font-semibold">{order.order_code}</span> — Bank Transfer
          </DialogDescription>
        </DialogHeader>

        {/* Receipt status */}
        <div className="flex items-center justify-center gap-2">
          {statusBadge()}
        </div>

        {/* Receipt image */}
        {order.receipt_url ? (
          <div className="relative group">
            <img
              src={order.receipt_url}
              alt="Payment receipt"
              className={`w-full rounded-lg border transition-all cursor-pointer ${
                zoomed ? 'max-h-none' : 'max-h-[350px] object-contain'
              }`}
              onClick={() => setZoomed(!zoomed)}
            />
            <button
              onClick={() => setZoomed(!zoomed)}
              className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {zoomed ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border rounded-lg border-dashed">
            <ImageIcon className="h-10 w-10 mb-2 opacity-40" />
            <p className="text-sm">No receipt uploaded</p>
          </div>
        )}

        {/* Reject reason input */}
        {!readOnly && rejecting && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Rejection Reason</label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why the receipt is being rejected..."
              rows={3}
            />
          </div>
        )}

        {/* Actions */}
        {!readOnly && (
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {!rejecting ? (
            <>
              <Button
                onClick={handleConfirm}
                disabled={loading || !order.receipt_url}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                Confirm Payment Received
              </Button>
              <Button
                variant="outline"
                onClick={() => setRejecting(true)}
                disabled={loading || !order.receipt_url}
                className="w-full border-destructive/40 text-destructive hover:bg-destructive/10"
              >
                <XCircle className="h-4 w-4 mr-1" /> Reject Receipt
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={handleReject}
                disabled={loading || !rejectReason.trim()}
                variant="destructive"
                className="w-full"
              >
                {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <XCircle className="h-4 w-4 mr-1" />}
                Confirm Rejection
              </Button>
              <Button
                variant="outline"
                onClick={() => { setRejecting(false); setRejectReason(''); }}
                disabled={loading}
                className="w-full"
              >
                Back
              </Button>
            </>
          )}
        </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
