import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, MapPin, Navigation } from "lucide-react";
import { useDriverLatestLocations } from "@/hooks/useDriverLocations";
import { useMyDrivers } from "@/hooks/useDrivers";
import { useOrders } from "@/hooks/useOrders";
import { format } from "date-fns";

// Mapbox token from secrets
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN || "";

interface DriverMapViewProps {
  runnerId?: string;
}

const DriverMapView: React.FC<DriverMapViewProps> = ({ runnerId }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);

  const { data: drivers } = useMyDrivers();
  const driverIds = drivers?.map((d) => d.driver_id) || [];
  const { data: locations, refetch, isLoading } = useDriverLatestLocations(driverIds);
  
  const { data: orders } = useOrders({
    runnerStatus: "ASSIGNED",
  });

  // Get orders for selected driver
  const driverOrders = orders?.filter((o) => o.driver_id === selectedDriver) || [];

  useEffect(() => {
    if (!mapContainer.current || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      zoom: 10,
      center: [101.6869, 3.139], // Default to Kuala Lumpur
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    return () => {
      map.current?.remove();
    };
  }, []);

  // Update markers when locations change
  useEffect(() => {
    if (!map.current || !locations) return;

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    // Add driver markers
    locations.forEach((location) => {
      if (!location.latitude || !location.longitude) return;

      const el = document.createElement("div");
      el.className = "driver-marker";
      el.innerHTML = `
        <div class="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-primary-foreground shadow-lg border-2 border-background cursor-pointer">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v8M8 12h8"/>
          </svg>
        </div>
      `;

      el.addEventListener("click", () => {
        setSelectedDriver(location.driver_id);
      });

      const marker = new mapboxgl.Marker(el)
        .setLngLat([location.longitude, location.latitude])
        .setPopup(
          new mapboxgl.Popup({ offset: 25 }).setHTML(`
            <div class="p-2">
              <strong>${location.driver_name || "Driver"}</strong>
              <p class="text-sm text-muted-foreground">
                Updated: ${format(new Date(location.recorded_at), "HH:mm")}
              </p>
              ${location.speed ? `<p class="text-sm">Speed: ${Math.round(location.speed * 3.6)} km/h</p>` : ""}
            </div>
          `)
        )
        .addTo(map.current!);

      markersRef.current.push(marker);
    });

    // Fit bounds to show all markers
    if (locations.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      locations.forEach((loc) => {
        if (loc.latitude && loc.longitude) {
          bounds.extend([loc.longitude, loc.latitude]);
        }
      });
      map.current.fitBounds(bounds, { padding: 50, maxZoom: 14 });
    }
  }, [locations]);

  if (!MAPBOX_TOKEN) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <MapPin className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold mb-2">Map Not Available</h3>
          <p className="text-sm text-muted-foreground">
            Mapbox token not configured. Please add MAPBOX_PUBLIC_TOKEN to enable maps.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Navigation className="h-3 w-3" />
            {locations?.length || 0} drivers online
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <div ref={mapContainer} className="h-[500px] w-full" />
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Driver Locations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[200px] overflow-y-auto">
              {locations?.map((loc) => (
                <div
                  key={loc.id}
                  className={`p-2 rounded-lg cursor-pointer transition-colors ${
                    selectedDriver === loc.driver_id
                      ? "bg-primary/10 border border-primary"
                      : "bg-muted/50 hover:bg-muted"
                  }`}
                  onClick={() => {
                    setSelectedDriver(loc.driver_id);
                    if (map.current && loc.latitude && loc.longitude) {
                      map.current.flyTo({
                        center: [loc.longitude, loc.latitude],
                        zoom: 15,
                      });
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">
                      {loc.driver_name || "Unknown"}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {format(new Date(loc.recorded_at), "HH:mm")}
                    </Badge>
                  </div>
                  {loc.speed && (
                    <span className="text-xs text-muted-foreground">
                      {Math.round(loc.speed * 3.6)} km/h
                    </span>
                  )}
                </div>
              ))}
              {(!locations || locations.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No active drivers
                </p>
              )}
            </CardContent>
          </Card>

          {selectedDriver && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Assigned Orders</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[200px] overflow-y-auto">
                {driverOrders.map((order) => (
                  <div key={order.id} className="p-2 bg-muted/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">
                        {order.order_code}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {order.runner_status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {order.customer_name} - {order.area || "No area"}
                    </p>
                  </div>
                ))}
                {driverOrders.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No orders assigned
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default DriverMapView;
