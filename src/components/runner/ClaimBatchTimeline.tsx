import { Check, Clock, Eye, CreditCard, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimelineStep {
  label: string;
  icon: React.ElementType;
  completed: boolean;
  active: boolean;
  date?: string;
}

interface ClaimBatchTimelineProps {
  status: 'ADMIN_ACK_PENDING' | 'CLAIMED';
  submittedAt: string;
  acknowledgedAt?: string | null;
  className?: string;
}

export function ClaimBatchTimeline({ 
  status, 
  submittedAt, 
  acknowledgedAt,
  className 
}: ClaimBatchTimelineProps) {
  const steps: TimelineStep[] = [
    {
      label: 'Submitted',
      icon: Check,
      completed: true,
      active: false,
      date: submittedAt,
    },
    {
      label: 'Reviewing',
      icon: Eye,
      completed: status === 'CLAIMED',
      active: status === 'ADMIN_ACK_PENDING',
    },
    {
      label: 'Approved',
      icon: Check,
      completed: status === 'CLAIMED',
      active: false,
      date: acknowledgedAt || undefined,
    },
    {
      label: 'Paid',
      icon: CreditCard,
      completed: false,
      active: false,
    },
  ];

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {steps.map((step, i) => {
        const Icon = step.icon;
        return (
          <div key={step.label} className="flex items-center gap-1">
            <div className="flex flex-col items-center gap-0.5">
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs transition-all",
                step.completed 
                  ? "bg-[hsl(var(--status-success))] text-white" 
                  : step.active 
                    ? "bg-[hsl(var(--status-warning)/0.2)] text-[hsl(var(--status-warning))] border-2 border-[hsl(var(--status-warning))] animate-pulse"
                    : "bg-muted text-muted-foreground"
              )}>
                {step.completed ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              </div>
              <span className={cn(
                "text-[10px] font-medium whitespace-nowrap",
                step.completed ? "text-[hsl(var(--status-success))]" : 
                step.active ? "text-[hsl(var(--status-warning))]" : "text-muted-foreground"
              )}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={cn(
                "w-6 h-0.5 mb-4",
                step.completed ? "bg-[hsl(var(--status-success))]" : "bg-border"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}
