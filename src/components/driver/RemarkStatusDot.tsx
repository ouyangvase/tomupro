import React from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const REMARK_COLOR_MAP: Record<string, { bg: string; ring: string; label: string; pulse?: boolean }> = {
  texted_customer: { bg: "bg-[hsl(217,91%,60%)]", ring: "ring-[hsl(217,91%,60%/0.3)]", label: "Texted Customer" },
  called_customer: { bg: "bg-[hsl(271,91%,65%)]", ring: "ring-[hsl(271,91%,65%/0.3)]", label: "Called Customer" },
  waiting_reply: { bg: "bg-[hsl(var(--status-neutral))]", ring: "ring-[hsl(var(--status-neutral)/0.3)]", label: "Waiting Reply", pulse: true },
  customer_replied: { bg: "bg-[hsl(var(--status-success))]", ring: "ring-[hsl(var(--status-success)/0.3)]", label: "Customer Replied" },
  arranging_delivery: { bg: "bg-[hsl(var(--status-warning))]", ring: "ring-[hsl(var(--status-warning)/0.3)]", label: "Arranging Delivery" },
  custom: { bg: "bg-[hsl(45,93%,47%)]", ring: "ring-[hsl(45,93%,47%/0.3)]", label: "Custom Note" },
};

interface RemarkStatusDotProps {
  remarkType?: string;
  className?: string;
}

export const RemarkStatusDot: React.FC<RemarkStatusDotProps> = ({
  remarkType,
  className,
}) => {
  if (!remarkType) return null;

  const colorInfo = REMARK_COLOR_MAP[remarkType];
  if (!colorInfo) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="relative inline-flex flex-shrink-0">
            <span
              className={cn(
                "inline-block h-3 w-3 rounded-full ring-[3px]",
                colorInfo.bg,
                colorInfo.ring,
                className
              )}
              aria-label={colorInfo.label}
            />
            {colorInfo.pulse && (
              <span
                className={cn(
                  "absolute inset-0 rounded-full animate-ping",
                  colorInfo.bg,
                  "opacity-40"
                )}
                style={{ animationDuration: '2s' }}
              />
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs font-medium">
          {colorInfo.label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default RemarkStatusDot;
