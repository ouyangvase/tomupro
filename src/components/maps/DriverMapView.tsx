import React, { useEffect, useRef, useState, useCallback } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RefreshCw, MapPin, Navigation, Package, Loader2, AlertTriangle } from "lucide-react";
import { useDriverLatestLocations } from "@/hooks/useDriverLocations";
import { useMyDrivers } from "@/hooks/useDrivers";
import { useOrders } from "@/hooks/useOrders";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

interface DriverMapViewProps {
  runnerId?: string;
}

const getMarkerColor = (recordedAt: string): string => {
  const now = new Date();
  const recorded = new Date(recordedAt);
  const diffMinutes = (now.getTime() - recorded.getTime()) / (1000 * 60);
  
  if (diffMinutes < 2) return '#22c55e'; // green - active
  if (diffMinutes < 10) return '#eab308'; // yellow - recent
  return '#6b7280'; // gray - stale
};

const DriverMapView: React.FC<DriverMapViewProps> = ({ runnerId }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const driverMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const orderMarkersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const [showOrders, setShowOrders] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingKey, setIsLoadingKey] = useState(true);

  const { data: drivers } = useMyDrivers();
  const driverIds = drivers?.map((d) => d.driver_id) || [];
  const { data: locations, refetch, isLoading } = useDriverLatestLocations(driverIds);
  
  const { data: orders } = useOrders({
    runnerStatus: "ASSIGNED",
  });

  const driverOrders = orders?.filter((o) => o.driver_id === selectedDriver) || [];

  // Fetch API key from edge function
  useEffect(() => {
    const fetchApiKey = async () => {
      try {
        setIsLoadingKey(true);
        const { data, error } = await supabase.functions.invoke('get-google-maps-key');
        
        if (error) {
          console.error('Error fetching API key:', error);
          setLoadError('Failed to load Google Maps configuration');
          return;
        }
        
        if (data?.apiKey) {
          setApiKey(data.apiKey);
        } else if (data?.error) {
          setLoadError(data.error);
        }
      } catch (err) {
        console.error('Error:', err);
        setLoadError('Failed to initialize map');
      } finally {
        setIsLoadingKey(false);
      }
    };

    fetchApiKey();
  }, []);

  // Initialize Google Maps
  useEffect(() => {
    if (!apiKey || !mapContainer.current || mapRef.current) return;

    // Set API options
    setOptions({
      key: apiKey,
      v: "weekly",
    });

    // Import the maps library
    importLibrary('maps').then(({ Map }) => {
      if (!mapContainer.current) return;
      
      mapRef.current = new Map(mapContainer.current, {
        center: { lat: 4.5353, lng: 114.7277 }, // Brunei center
        zoom: 10,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        zoomControl: true,
      });

      infoWindowRef.current = new google.maps.InfoWindow();
      setMapReady(true);
    }).catch((err) => {
      console.error('Error loading Google Maps:', err);
      setLoadError('Failed to load Google Maps');
    });

    return () => {
      // Cleanup markers
      driverMarkersRef.current.forEach(marker => marker.setMap(null));
      driverMarkersRef.current.clear();
      orderMarkersRef.current.forEach(marker => marker.setMap(null));
      orderMarkersRef.current = [];
    };
  }, [apiKey]);

  // Update driver markers
  useEffect(() => {
    if (!mapRef.current || !mapReady || !locations) return;

    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;

    // Update existing markers or create new ones
    locations.forEach((location) => {
      if (!location.latitude || !location.longitude) return;

      const position = { lat: location.latitude, lng: location.longitude };
      bounds.extend(position);
      hasPoints = true;

      const isSelected = selectedDriver === location.driver_id;
      const markerColor = getMarkerColor(location.recorded_at);
      
      let marker = driverMarkersRef.current.get(location.driver_id);
      
      if (marker) {
        // Update existing marker position smoothly
        marker.setPosition(position);
        marker.setIcon({
          path: google.maps.SymbolPath.CIRCLE,
          scale: isSelected ? 14 : 12,
          fillColor: isSelected ? '#22c55e' : markerColor,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        });
      } else {
        // Create new marker
        marker = new google.maps.Marker({
          position,
          map: mapRef.current!,
          title: location.driver_name || 'Driver',
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: isSelected ? 14 : 12,
            fillColor: isSelected ? '#22c55e' : markerColor,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3,
          },
        });

        marker.addListener('click', () => {
          setSelectedDriver(
            selectedDriver === location.driver_id ? null : location.driver_id
          );
          
          const content = `
            <div style="padding: 8px; min-width: 150px;">
              <strong>${location.driver_name || "Driver"}</strong>
              <p style="font-size: 12px; color: #666; margin: 4px 0 0;">
                Updated: ${formatDistanceToNow(new Date(location.recorded_at), { addSuffix: true })}
              </p>
              ${location.speed ? `<p style="font-size: 12px;">Speed: ${Math.round(location.speed * 3.6)} km/h</p>` : ""}
            </div>
          `;
          
          infoWindowRef.current?.setContent(content);
          infoWindowRef.current?.open(mapRef.current!, marker);
        });

        driverMarkersRef.current.set(location.driver_id, marker);
      }
    });

    // Remove markers for drivers no longer in the list
    const currentDriverIds = new Set(locations.map(l => l.driver_id));
    driverMarkersRef.current.forEach((marker, driverId) => {
      if (!currentDriverIds.has(driverId)) {
        marker.setMap(null);
        driverMarkersRef.current.delete(driverId);
      }
    });

    // Fit bounds if we have points
    if (hasPoints && locations.length > 0) {
      mapRef.current.fitBounds(bounds);
      
      // Don't zoom in too much for single points
      const listener = google.maps.event.addListener(mapRef.current, 'idle', () => {
        const zoom = mapRef.current?.getZoom();
        if (zoom && zoom > 15) {
          mapRef.current?.setZoom(15);
        }
        google.maps.event.removeListener(listener);
      });
    }
  }, [locations, selectedDriver, mapReady]);

  // Update order markers
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;

    // Clear existing order markers
    orderMarkersRef.current.forEach(marker => marker.setMap(null));
    orderMarkersRef.current = [];

    if (!showOrders || !orders) return;

    const filteredOrders = selectedDriver
      ? orders.filter((o) => o.driver_id === selectedDriver)
      : orders.filter((o) => o.driver_id);

    // Note: Orders don't have lat/lng by default, this would need geocoding
    // For now, we'll skip order markers since geocoding requires additional setup
  }, [orders, showOrders, selectedDriver, mapReady]);

  // Loading state
  if (isLoadingKey) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
          <h3 className="font-semibold mb-2">Loading Map</h3>
          <p className="text-sm text-muted-foreground">
            Initializing Google Maps...
          </p>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (loadError) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive" />
          <h3 className="font-semibold mb-2">Map Not Available</h3>
          <p className="text-sm text-muted-foreground">
            {loadError}
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
          {selectedDriver && (
            <Badge variant="secondary" className="gap-1">
              <Package className="h-3 w-3" />
              {driverOrders.length} orders
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Switch
              id="show-orders"
              checked={showOrders}
              onCheckedChange={setShowOrders}
              disabled
            />
            <Label htmlFor="show-orders" className="text-sm text-muted-foreground">Orders (requires geocoding)</Label>
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
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span>Active (&lt;2 min)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <span>Recent (2-10 min)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-gray-500" />
              <span>Stale (&gt;10 min)</span>
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
            <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
              {locations?.map((loc) => {
                const markerColor = getMarkerColor(loc.recorded_at);
                const isActive = markerColor === '#22c55e';
                const isRecent = markerColor === '#eab308';
                
                return (
                  <div
                    key={loc.id}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedDriver === loc.driver_id
                        ? "bg-primary/10 border border-primary"
                        : "bg-muted/50 hover:bg-muted"
                    }`}
                    onClick={() => {
                      setSelectedDriver(
                        selectedDriver === loc.driver_id ? null : loc.driver_id
                      );
                      if (mapRef.current && loc.latitude && loc.longitude) {
                        mapRef.current.panTo({ lat: loc.latitude, lng: loc.longitude });
                        mapRef.current.setZoom(14);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: markerColor }}
                        />
                        <span className="font-medium text-sm">
                          {loc.driver_name || "Unknown"}
                        </span>
                      </div>
                      <Badge 
                        variant={isActive ? "default" : isRecent ? "secondary" : "outline"}
                        className="text-xs"
                      >
                        {formatDistanceToNow(new Date(loc.recorded_at), { addSuffix: true })}
                      </Badge>
                    </div>
                    {loc.speed && loc.speed > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Speed: {Math.round(loc.speed * 3.6)} km/h
                      </p>
                    )}
                  </div>
                );
              })}
              {(!locations || locations.length === 0) && (
                <div className="text-center py-8">
                  <MapPin className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No active drivers
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Drivers need to enable location sharing
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {selectedDriver && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Assigned Orders</CardTitle>
              </CardHeader>
              <CardContent>
                {driverOrders.length > 0 ? (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {driverOrders.map((order) => (
                      <div key={order.id} className="p-2 bg-muted/50 rounded text-sm">
                        <p className="font-medium">{order.order_code}</p>
                        <p className="text-xs text-muted-foreground">{order.customer_name}</p>
                        <p className="text-xs text-muted-foreground">{order.area || 'No area'}</p>
                      </div>
                    ))}
                  </div>
                ) : (
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
