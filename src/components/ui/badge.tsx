import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive/15 text-destructive border-destructive/30",
        outline: "text-foreground border-border",
        // Status variants - semantic colors only
        success: "bg-[hsl(142,69%,58%,0.15)] text-[hsl(142,69%,58%)] border-[hsl(142,69%,58%,0.3)]",
        error: "bg-[hsl(0,91%,71%,0.15)] text-[hsl(0,91%,71%)] border-[hsl(0,91%,71%,0.3)]",
        pending: "bg-[hsl(45,93%,67%,0.15)] text-[hsl(45,93%,67%)] border-[hsl(45,93%,67%,0.3)]",
        neutral: "bg-[hsl(218,11%,65%,0.15)] text-[hsl(218,11%,65%)] border-[hsl(218,11%,65%,0.3)]",
        warning: "bg-[hsl(24,94%,64%,0.15)] text-[hsl(24,94%,64%)] border-[hsl(24,94%,64%,0.3)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
