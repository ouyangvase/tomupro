import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CalendarIcon, Clock, User } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { useSetAutoReschedule } from '@/hooks/useAutoReschedule';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { Badge } from '@/components/ui/badge';

interface Order {
  id: string;
  order_code: string;
  customer_name: string;
  runner_id: string | null;
  runner?: { display_name: string } | null;
  reschedule_cycle_no?: number;
  operational_status?: string;
}

interface RescheduleOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
}

export function RescheduleOrderDialog({
  open,
  onOpenChange,
  order,
}: RescheduleOrderDialogProps) {
  const [nextDate, setNextDate] = useState<Date | undefined>();
  const [runnerId, setRunnerId] = useState<string>('');
  const [comment, setComment] = useState('');

  const setAutoReschedule = useSetAutoReschedule();
  const { data: users = [] } = useUserDirectory();
  const runners = users.filter((u) => u.role === 'runner');

  // Initialize runner when order changes
  useEffect(() => {
    if (order?.runner_id) {
      setRunnerId(order.runner_id);
    } else {
      setRunnerId('');
    }
    setNextDate(undefined);
    setComment('');
  }, [order]);

  const handleClose = () => {
    setNextDate(undefined);
    setRunnerId('');
    setComment('');
    onOpenChange(false);
  };

  const handleConfirm = async () => {
    if (!order || !nextDate || !runnerId) return;

    await setAutoReschedule.mutateAsync({
      orderId: order.id,
      nextDate: format(nextDate, 'yyyy-MM-dd'),
      runnerId,
      comment: comment || 'Salesperson confirmed auto-reschedule',
      currentCycleNo: order.reschedule_cycle_no || 0,
      currentStatus: order.operational_status || 'NEW',
    });

    handleClose();
  };

  const isValid = nextDate && runnerId;

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Set Auto Reschedule
          </DialogTitle>
          <DialogDescription>
            Order <span className="font-mono font-medium">{order.order_code}</span> for{' '}
            <span className="font-medium">{order.customer_name}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Next Date */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <CalendarIcon className="h-3 w-3" />
              Next Delivery Date *
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !nextDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {nextDate ? format(nextDate, 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={nextDate}
                  onSelect={setNextDate}
                  disabled={(date) => date < new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            {/* Quick date buttons */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNextDate(addDays(new Date(), 1))}
              >
                Tomorrow
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNextDate(addDays(new Date(), 2))}
              >
                In 2 days
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNextDate(addDays(new Date(), 7))}
              >
                Next week
              </Button>
            </div>
          </div>

          {/* Runner Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <User className="h-3 w-3" />
              Assign to Runner *
            </Label>
            <Select value={runnerId} onValueChange={setRunnerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select runner..." />
              </SelectTrigger>
              <SelectContent>
                {runners.map((runner) => (
                  <SelectItem key={runner.id} value={runner.id}>
                    {runner.display_name}
                    {runner.id === order.runner_id && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        Current
                      </Badge>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {order.runner && (
              <p className="text-xs text-muted-foreground">
                Current runner: {order.runner.display_name}
              </p>
            )}
          </div>

          {/* Comment */}
          <div className="space-y-2">
            <Label>Comment (optional)</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add any notes about the reschedule..."
              rows={2}
            />
          </div>

          {/* Info box */}
          <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
            <p className="font-medium">What happens next:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
              <li>Order stays in Booking Sales until the scheduled date</li>
              <li>On {nextDate ? format(nextDate, 'MMM dd') : 'the scheduled date'}, it auto-moves to Ready</li>
              <li>Order will be auto-assigned to the selected runner</li>
              <li>Runner sees it in their inbox immediately</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!isValid || setAutoReschedule.isPending}
          >
            {setAutoReschedule.isPending ? 'Setting...' : 'Set Auto Reschedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
