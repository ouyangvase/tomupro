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
import { CalendarIcon, Clock, User, ChevronDown } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { useSetAutoReschedule } from '@/hooks/useAutoReschedule';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';

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
  const [infoExpanded, setInfoExpanded] = useState(false);

  const isMobile = useIsMobile();
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
    setInfoExpanded(false);
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

  // Quick date options
  const quickDates = [
    { label: 'Tomorrow', date: addDays(new Date(), 1) },
    { label: 'In 2 days', date: addDays(new Date(), 2) },
    { label: 'Next week', date: addDays(new Date(), 7) },
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={cn(
          'sm:max-w-md',
          isMobile && 'max-h-[90vh] flex flex-col p-0 gap-0'
        )}
      >
        {/* Header */}
        <DialogHeader className={cn(isMobile && 'px-4 pt-4 pb-2')}>
          <DialogTitle className={cn('flex items-center gap-2', isMobile && 'text-base')}>
            <Clock className={cn(isMobile ? 'h-4 w-4' : 'h-5 w-5')} />
            Set Auto Reschedule
          </DialogTitle>
          <DialogDescription className={cn(isMobile && 'text-xs')}>
            Order <span className="font-mono font-medium">{order.order_code}</span> for{' '}
            <span className="font-medium">{order.customer_name}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable content */}
        <div
          className={cn(
            'space-y-4 py-4',
            isMobile && 'flex-1 overflow-y-auto px-4 py-3 space-y-3'
          )}
        >
          {/* Next Date */}
          <div className={cn(isMobile ? 'space-y-1.5' : 'space-y-2')}>
            <Label className="flex items-center gap-1 text-xs">
              <CalendarIcon className="h-3 w-3" />
              Next Delivery Date *
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    isMobile && 'h-9 text-sm',
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
            {/* Quick date buttons — 3 column equal width */}
            <div className="grid grid-cols-3 gap-1.5">
              {quickDates.map((qd) => (
                <Button
                  key={qd.label}
                  type="button"
                  variant={nextDate?.toDateString() === qd.date.toDateString() ? 'default' : 'outline'}
                  size="sm"
                  className={cn('w-full', isMobile && 'h-8 text-xs px-1')}
                  onClick={() => setNextDate(qd.date)}
                >
                  {qd.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Runner Selection */}
          <div className={cn(isMobile ? 'space-y-1.5' : 'space-y-2')}>
            <Label className="flex items-center gap-1 text-xs">
              <User className="h-3 w-3" />
              Assign to Runner *
            </Label>
            <Select value={runnerId} onValueChange={setRunnerId}>
              <SelectTrigger className={cn(isMobile && 'h-9 text-sm')}>
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
              <p className="text-[11px] text-muted-foreground">
                Current runner: {order.runner.display_name}
              </p>
            )}
          </div>

          {/* Comment */}
          <div className={cn(isMobile ? 'space-y-1' : 'space-y-2')}>
            <Label className="text-xs">Comment (optional)</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add notes..."
              rows={isMobile ? 2 : 2}
              className={cn(isMobile && 'text-sm min-h-[56px] resize-none')}
            />
          </div>

          {/* Collapsible info box */}
          <div className="rounded-lg border bg-muted/30 overflow-hidden">
            <button
              type="button"
              onClick={() => setInfoExpanded(!infoExpanded)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>What happens next</span>
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 transition-transform duration-200',
                  infoExpanded && 'rotate-180'
                )}
              />
            </button>
            {infoExpanded && (
              <ul className="px-3 pb-2.5 text-[11px] text-muted-foreground space-y-0.5 list-disc list-inside">
                <li>Order stays in Booking Sales until the scheduled date</li>
                <li>On {nextDate ? format(nextDate, 'MMM dd') : 'the scheduled date'}, it auto-moves to Ready</li>
                <li>Auto-assigned to the selected runner</li>
                <li>Runner sees it in their inbox immediately</li>
              </ul>
            )}
          </div>
        </div>

        {/* Sticky footer */}
        <DialogFooter
          className={cn(
            isMobile && 'px-4 py-3 border-t bg-background safe-area-pb flex-row gap-2'
          )}
        >
          <Button
            variant="outline"
            onClick={handleClose}
            className={cn(isMobile && 'flex-1 h-10')}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!isValid || setAutoReschedule.isPending}
            className={cn(isMobile && 'flex-1 h-10')}
          >
            {setAutoReschedule.isPending ? 'Setting...' : 'Set Auto Reschedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
