import React from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const REMARK_COLOR_MAP: Record<string, { bg: string; label: string }> = {
  texted_customer: { bg: "bg-blue-500", label: "Texted Customer" },
  called_customer: { bg: "bg-purple-500", label: "Called Customer" },
  waiting_reply: { bg: "bg-gray-400", label: "Waiting Reply" },
  customer_replied: { bg: "bg-green-500", label: "Customer Replied" },
  arranging_delivery: { bg: "bg-orange-500", label: "Arranging Delivery" },
  custom: { bg: "bg-yellow-500", label: "Custom Note" },
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
          <span
            className={cn(
              "inline-block h-2.5 w-2.5 rounded-full flex-shrink-0 ring-2 ring-background",
              colorInfo.bg,
              className
            )}
            aria-label={colorInfo.label}
          />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {colorInfo.label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default RemarkStatusDot;
