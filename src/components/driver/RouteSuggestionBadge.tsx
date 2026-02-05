import React from "react";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";
import { formatDistance } from "@/lib/haversine";

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

  const getBadgeVariant = (rank: number) => {
    if (rank === 1) return "default"; // Primary color for #1
    if (rank <= 3) return "secondary";
    return "outline";
  };

  return (
    <Badge
      variant={getBadgeVariant(rank)}
      className="flex items-center gap-1 text-xs font-medium"
    >
      <MapPin className="h-3 w-3" />
      <span>#{rank}</span>
      {showDistance && distance !== undefined && (
        <span className="opacity-80">• {formatDistance(distance)}</span>
      )}
    </Badge>
  );
};

export default RouteSuggestionBadge;
