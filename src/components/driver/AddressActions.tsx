import React from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Copy, MapPin, Navigation } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AddressActionsProps {
  address: string;
  area?: string | null;
}

export const AddressActions: React.FC<AddressActionsProps> = ({ address, area }) => {
  const fullAddress = area ? `${address}, ${area}` : address;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullAddress);
      toast.success("Address copied");
    } catch (error) {
      console.error("Failed to copy address:", error);
      toast.error("Failed to copy address");
    }
  };

  const detectMobileOS = (): "ios" | "android" | "other" => {
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) return "ios";
    if (/android/.test(ua)) return "android";
    return "other";
  };

  const handleOpenMaps = () => {
    const encodedAddress = encodeURIComponent(fullAddress);
    const os = detectMobileOS();

    let mapsUrl: string;

    if (os === "ios") {
      mapsUrl = `maps://maps.apple.com/?q=${encodedAddress}`;
    } else if (os === "android") {
      mapsUrl = `geo:0,0?q=${encodedAddress}`;
    } else {
      mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
    }

    window.open(mapsUrl, "_blank");
  };

  const handleOpenWaze = () => {
    const encodedAddress = encodeURIComponent(fullAddress);
    const wazeUrl = `https://waze.com/ul?q=${encodedAddress}&navigate=yes`;
    window.open(wazeUrl, "_blank");
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex gap-2 mt-2.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopy}
              className="h-8 w-8 rounded-full border-border/50"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Copy</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={handleOpenMaps}
              className="h-8 w-8 rounded-full border-border/50"
            >
              <MapPin className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Google Maps</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={handleOpenWaze}
              className="h-8 w-8 rounded-full border-border/50"
            >
              <Navigation className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Waze</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
};

export default AddressActions;
