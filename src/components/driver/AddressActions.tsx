import React from "react";
import { Button } from "@/components/ui/button";
import { Copy, MapPin, Navigation } from "lucide-react";
import { toast } from "sonner";

interface AddressActionsProps {
  address: string;
  area?: string | null;
}

export const AddressActions: React.FC<AddressActionsProps> = ({ address, area }) => {
  const fullAddress = area ? `${address}, ${area}` : address;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullAddress);
      toast.success("Address copied to clipboard");
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
      // iOS: Open in Apple Maps with option for Google Maps
      mapsUrl = `maps://maps.apple.com/?q=${encodedAddress}`;
    } else if (os === "android") {
      // Android: Open in Google Maps
      mapsUrl = `geo:0,0?q=${encodedAddress}`;
    } else {
      // Fallback: Open Google Maps in browser
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
    <div className="flex flex-wrap gap-2 mt-3">
      <Button
        variant="outline"
        size="sm"
        onClick={handleCopy}
        className="flex items-center gap-1.5 text-xs"
      >
        <Copy className="h-3.5 w-3.5" />
        Copy Address
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleOpenMaps}
        className="flex items-center gap-1.5 text-xs"
      >
        <MapPin className="h-3.5 w-3.5" />
        Google Maps
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleOpenWaze}
        className="flex items-center gap-1.5 text-xs"
      >
        <Navigation className="h-3.5 w-3.5" />
        Waze
      </Button>
    </div>
  );
};

export default AddressActions;
