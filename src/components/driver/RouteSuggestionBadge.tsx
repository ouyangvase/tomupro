import React from "react";
import { Badge } from "@/components/ui/badge";
import { Navigation } from "lucide-react";
import { formatDistance } from "@/lib/haversine";
import { cn } from "@/lib/utils";

interface RouteSuggestionBadgeProps {
  rank: number;
  distance?: number;
  showDistance?: boolean;
}

export const RouteSuggestionBadge: React.FC<RouteSuggestionBadgeProps> = ({
  rank,
  distance,
  showDistance = true,
}) => {
  if (rank <= 0) return null;

  const isTop = rank === 1;
  const isHighPriority = rank <= 3;

  return (
    <Badge
      variant={isTop ? "default" : isHighPriority ? "secondary" : "outline"}
      className={cn(
        "flex items-center gap-1 text-[10px] font-bold px-2 py-0 h-5 rounded-full",
        isTop && "shadow-sm"
      )}
    >
      <Navigation className="h-2.5 w-2.5" />
      <span>#{rank}</span>
      {showDistance && distance !== undefined && (
        <span className="opacity-70 font-normal">• {formatDistance(distance)}</span>
      )}
    </Badge>
  );
};

export default RouteSuggestionBadge;
