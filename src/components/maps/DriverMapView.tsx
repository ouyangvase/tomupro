import React, { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RefreshCw, MapPin, Navigation, Package, Route } from "lucide-react";
import { useDriverLatestLocations } from "@/hooks/useDriverLocations";
import { useMyDrivers } from "@/hooks/useDrivers";
import { useOrders } from "@/hooks/useOrders";
import { useGeocoding } from "@/hooks/useGeocoding";
import { useRouteDrawing } from "@/hooks/useRouteDrawing";
import { format } from "date-fns";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN || "";
const ROUTE_SOURCE_ID = "driver-route";
const ROUTE_LAYER_ID = "driver-route-layer";

interface DriverMapViewProps {
  runnerId?: string;
}

const DriverMapView: React.FC<DriverMapViewProps> = ({ runnerId }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const driverMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const orderMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const [showOrders, setShowOrders] = useState(true);
  const [showRoute, setShowRoute] = useState(true);
  const [mapReady, setMapReady] = useState(false);

  const { data: drivers } = useMyDrivers();
  const driverIds = drivers?.map((d) => d.driver_id) || [];
  const { data: locations, refetch, isLoading } = useDriverLatestLocations(driverIds);
  
  const { data: orders } = useOrders({
    runnerStatus: "ASSIGNED",
  });

  const { geocodeOrders, geocodedOrders, isGeocoding } = useGeocoding();
  const { 
    calculateRoute, 
    clearRoute, 
    routes, 
    isCalculating,
    formatDistance,
    formatDuration 
  } = useRouteDrawing();

  const driverOrders = orders?.filter((o) => o.driver_id === selectedDriver) || [];
  const selectedRoute = selectedDriver ? routes.get(selectedDriver) : null;

  // Geocode orders when they change
  useEffect(() => {
    if (orders && orders.length > 0) {
      const ordersToGeocode = orders.map((o) => ({
        id: o.id,
        order_code: o.order_code,
        customer_name: o.customer_name,
        address: o.address,
        area: o.area,
        driver_id: o.driver_id,
      }));
      geocodeOrders(ordersToGeocode);
    }
  }, [orders, geocodeOrders]);

  // Calculate route when driver is selected
  const recalculateRoute = useCallback(async () => {
    if (!selectedDriver || !geocodedOrders || !locations) return;

    const driverLocation = locations.find((l) => l.driver_id === selectedDriver);
    if (!driverLocation?.latitude || !driverLocation?.longitude) return;

    const driverDestinations = geocodedOrders
      .filter((o) => o.driverId === selectedDriver)
      .map((o) => ({
        longitude: o.longitude,
        latitude: o.latitude,
        orderId: o.orderId,
        orderCode: o.orderCode,
      }));

    if (driverDestinations.length === 0) {
      clearRoute(selectedDriver);
      return;
    }

    await calculateRoute(
      selectedDriver,
      { longitude: driverLocation.longitude, latitude: driverLocation.latitude },
      driverDestinations
    );
  }, [selectedDriver, geocodedOrders, locations, calculateRoute, clearRoute]);

  useEffect(() => {
    if (showRoute && selectedDriver) {
      recalculateRoute();
    }
  }, [selectedDriver, showRoute, recalculateRoute]);

  useEffect(() => {
    if (!mapContainer.current || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      zoom: 10,
      center: [101.6869, 3.139],
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.current.on("load", () => {
      // Add route source and layer
      map.current!.addSource(ROUTE_SOURCE_ID, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [],
          },
        },
      });

      map.current!.addLayer({
        id: ROUTE_LAYER_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#3b82f6",
          "line-width": 4,
          "line-opacity": 0.8,
        },
      });

      setMapReady(true);
    });

    return () => {
      map.current?.remove();
    };
  }, []);

  // Update route on map
  useEffect(() => {
    if (!map.current || !mapReady) return;

    const source = map.current.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource;
    if (!source) return;

    if (showRoute && selectedRoute) {
      source.setData({
        type: "Feature",
        properties: {},
        geometry: selectedRoute.geometry,
      });
    } else {
      source.setData({
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [],
        },
      });
    }
  }, [selectedRoute, showRoute, mapReady]);

  // Update driver markers
  useEffect(() => {
    if (!map.current || !locations) return;

    driverMarkersRef.current.forEach((marker) => marker.remove());
    driverMarkersRef.current = [];

    locations.forEach((location) => {
      if (!location.latitude || !location.longitude) return;

      const isSelected = selectedDriver === location.driver_id;
      const el = document.createElement("div");
      el.className = "driver-marker";
      el.innerHTML = `
        <div style="width: ${isSelected ? 48 : 40}px; height: ${isSelected ? 48 : 40}px; background: ${isSelected ? '#22c55e' : 'hsl(var(--primary))'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 4px 12px rgba(0,0,0,0.3); border: 3px solid white; cursor: pointer; transition: all 0.2s;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="4"/>
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>
          </svg>
        </div>
      `;

      el.addEventListener("click", () => {
        setSelectedDriver(
          selectedDriver === location.driver_id ? null : location.driver_id
        );
      });

      const marker = new mapboxgl.Marker(el)
        .setLngLat([location.longitude, location.latitude])
        .setPopup(
          new mapboxgl.Popup({ offset: 25 }).setHTML(`
            <div style="padding: 8px;">
              <strong>${location.driver_name || "Driver"}</strong>
              <p style="font-size: 12px; color: #666; margin: 4px 0 0;">
                Updated: ${format(new Date(location.recorded_at), "HH:mm")}
              </p>
              ${location.speed ? `<p style="font-size: 12px;">Speed: ${Math.round(location.speed * 3.6)} km/h</p>` : ""}
            </div>
          `)
        )
        .addTo(map.current!);

      driverMarkersRef.current.push(marker);
    });

    fitMapToBounds();
  }, [locations, selectedDriver]);

  // Update order markers
  useEffect(() => {
    if (!map.current) return;

    orderMarkersRef.current.forEach((marker) => marker.remove());
    orderMarkersRef.current = [];

    if (!showOrders || !geocodedOrders) return;

    const filteredOrders = selectedDriver
      ? geocodedOrders.filter((o) => o.driverId === selectedDriver)
      : geocodedOrders;

    filteredOrders.forEach((order, index) => {
      const el = document.createElement("div");
      el.className = "order-marker";
      
      // Show sequence number if route is displayed
      const showSequence = showRoute && selectedDriver && selectedRoute;
      
      el.innerHTML = `
        <div style="position: relative; width: 32px; height: 32px;">
          <div style="width: 32px; height: 32px; background: hsl(var(--destructive)); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 2px 8px rgba(0,0,0,0.2); border: 2px solid white; cursor: pointer;">
            ${showSequence 
              ? `<span style="font-size: 12px; font-weight: bold;">${index + 1}</span>`
              : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>`
            }
          </div>
        </div>
      `;

      const marker = new mapboxgl.Marker(el)
        .setLngLat([order.longitude, order.latitude])
        .setPopup(
          new mapboxgl.Popup({ offset: 25 }).setHTML(`
            <div style="padding: 8px; min-width: 150px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                ${showSequence ? `<span style="background: #ef4444; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold;">Stop ${index + 1}</span>` : ''}
                <strong>${order.orderCode}</strong>
              </div>
              <p style="font-size: 12px; margin: 4px 0;">${order.customerName}</p>
              <p style="font-size: 11px; color: #666;">${order.area || "No area"}</p>
            </div>
          `)
        )
        .addTo(map.current!);

      orderMarkersRef.current.push(marker);
    });

    fitMapToBounds();
  }, [geocodedOrders, showOrders, selectedDriver, showRoute, selectedRoute]);

  const fitMapToBounds = () => {
    if (!map.current) return;

    const bounds = new mapboxgl.LngLatBounds();
    let hasPoints = false;

    locations?.forEach((loc) => {
      if (loc.latitude && loc.longitude) {
        bounds.extend([loc.longitude, loc.latitude]);
        hasPoints = true;
      }
    });

    if (showOrders) {
      geocodedOrders?.forEach((order) => {
        if (!selectedDriver || order.driverId === selectedDriver) {
          bounds.extend([order.longitude, order.latitude]);
          hasPoints = true;
        }
      });
    }

    if (hasPoints) {
      map.current.fitBounds(bounds, { padding: 50, maxZoom: 14 });
    }
  };

  if (!MAPBOX_TOKEN) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <MapPin className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold mb-2">Map Not Available</h3>
          <p className="text-sm text-muted-foreground">
            Mapbox token not configured.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="outline" className="gap-1">
            <Navigation className="h-3 w-3" />
            {locations?.length || 0} drivers
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <Package className="h-3 w-3" />
            {geocodedOrders?.length || 0} orders
            {isGeocoding && " (loading...)"}
          </Badge>
          {selectedRoute && (
            <Badge variant="default" className="gap-1">
              <Route className="h-3 w-3" />
              {formatDistance(selectedRoute.distance)} • {formatDuration(selectedRoute.duration)}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Switch
              id="show-orders"
              checked={showOrders}
              onCheckedChange={setShowOrders}
            />
            <Label htmlFor="show-orders" className="text-sm">Orders</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="show-route"
              checked={showRoute}
              onCheckedChange={setShowRoute}
              disabled={!selectedDriver}
            />
            <Label htmlFor="show-route" className="text-sm">Route</Label>
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <div ref={mapContainer} className="h-[500px] w-full" />
          </Card>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span>Driver</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span>Selected Driver</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-destructive" />
              <span>Delivery Stop</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-6 h-1 bg-blue-500 rounded" />
              <span>Route</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                Drivers
                {selectedDriver && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setSelectedDriver(null)}
                  >
                    Clear
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[180px] overflow-y-auto">
              {locations?.map((loc) => (
                <div
                  key={loc.id}
                  className={`p-2 rounded-lg cursor-pointer transition-colors ${
                    selectedDriver === loc.driver_id
                      ? "bg-primary/10 border border-primary"
                      : "bg-muted/50 hover:bg-muted"
                  }`}
                  onClick={() => {
                    setSelectedDriver(
                      selectedDriver === loc.driver_id ? null : loc.driver_id
                    );
                    if (map.current && loc.latitude && loc.longitude) {
                      map.current.flyTo({
                        center: [loc.longitude, loc.latitude],
                        zoom: 13,
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
                </div>
              ))}
              {(!locations || locations.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No active drivers
                </p>
              )}
            </CardContent>
          </Card>

          {selectedDriver && selectedRoute && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Route className="h-4 w-4" />
                  Route Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-muted/50 p-2 rounded">
                    <p className="text-muted-foreground text-xs">Distance</p>
                    <p className="font-semibold">{formatDistance(selectedRoute.distance)}</p>
                  </div>
                  <div className="bg-muted/50 p-2 rounded">
                    <p className="text-muted-foreground text-xs">Est. Time</p>
                    <p className="font-semibold">{formatDuration(selectedRoute.duration)}</p>
                  </div>
                  <div className="bg-muted/50 p-2 rounded col-span-2">
                    <p className="text-muted-foreground text-xs">Stops</p>
                    <p className="font-semibold">{driverOrders.length} deliveries</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-3"
                  onClick={recalculateRoute}
                  disabled={isCalculating}
                >
                  {isCalculating ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Route className="h-4 w-4 mr-2" />
                  )}
                  Recalculate Route
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {selectedDriver ? "Delivery Stops" : "All Orders"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[200px] overflow-y-auto">
              {(selectedDriver ? driverOrders : orders)?.map((order, index) => {
                const geocoded = geocodedOrders?.find(
                  (g) => g.orderId === order.id
                );
                return (
                  <div
                    key={order.id}
                    className="p-2 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors"
                    onClick={() => {
                      if (geocoded && map.current) {
                        map.current.flyTo({
                          center: [geocoded.longitude, geocoded.latitude],
                          zoom: 16,
                        });
                      }
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {selectedDriver && showRoute && (
                          <Badge variant="destructive" className="h-5 w-5 p-0 flex items-center justify-center text-xs">
                            {index + 1}
                          </Badge>
                        )}
                        <span className="font-medium text-sm">
                          {order.order_code}
                        </span>
                      </div>
                      {geocoded ? (
                        <MapPin className="h-3 w-3 text-green-500" />
                      ) : (
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {order.customer_name} - {order.area || "No area"}
                    </p>
                  </div>
                );
              })}
              {(!orders || orders.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No orders to display
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DriverMapView;
