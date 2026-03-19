import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { CheckCircle, Loader2 } from 'lucide-react';

interface RunnerDeliverConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onConfirm: () => void;
  isLoading: boolean;
}

export function RunnerDeliverConfirmDialog({
  open,
  onOpenChange,
  count,
  onConfirm,
  isLoading,
}: RunnerDeliverConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle className="h-6 w-6 text-primary" />
          </div>
          <AlertDialogTitle className="text-center">
            Mark {count} order{count !== 1 ? 's' : ''} as delivered?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            This will move the selected order{count !== 1 ? 's' : ''} into Delivered Orders and make{' '}
            {count !== 1 ? 'them' : 'it'} available for claim submission.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row gap-2 sm:justify-center">
          <AlertDialogCancel disabled={isLoading} className="flex-1 sm:flex-none">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isLoading} className="flex-1 sm:flex-none">
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4 mr-1" />
            )}
            Confirm Delivered
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
