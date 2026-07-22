/// <reference types="@types/google.maps" />
import React, { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MapPin, Navigation, Package, Loader2, AlertTriangle, Route, Wifi, WifiOff } from "lucide-react";
import { useDriverLatestLocations, getDriverStatus } from "@/hooks/useDriverLocations";
import { useMyDrivers } from "@/hooks/useDrivers";
import { useOrders } from "@/hooks/useOrders";
import { useGeocoding } from "@/hooks/useGeocoding";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

declare global {
  interface Window {
    initGoogleMaps?: () => void;
    google?: typeof google;
  }
}

interface DriverMapViewProps {
  runnerId?: string;
}

const getMarkerColor = (recordedAt: string): string => {
  const now = new Date();
  const recorded = new Date(recordedAt);
  const diffMinutes = (now.getTime() - recorded.getTime()) / (1000 * 60);
  if (diffMinutes < 2) return '#22c55e';
  if (diffMinutes < 10) return '#eab308';
  return '#6b7280';
};

const DriverMapView: React.FC<DriverMapViewProps> = ({ runnerId }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const driverMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const orderMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null);
  
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const [showOrders, setShowOrders] = useState(true);
  const [showRoute, setShowRoute] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingKey, setIsLoadingKey] = useState(true);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);

  const { data: drivers } = useMyDrivers();
  const driverIds = drivers?.map((d) => d.driver_id) || [];
  const { data: locations, isLoading } = useDriverLatestLocations(driverIds);
  const { data: orders } = useOrders({ runnerStatus: "ASSIGNED" });
  const { geocodeOrders, geocodedOrders, isGeocoding } = useGeocoding();

  const driverOrders = orders?.filter((o) => o.driver_id === selectedDriver) || [];
  const displayedOrders = selectedDriver 
    ? orders?.filter((o) => o.driver_id === selectedDriver) 
    : orders?.filter((o) => o.driver_id);

  // Stats
  const activeDrivers = locations?.filter(l => getMarkerColor(l.recorded_at) === '#22c55e').length || 0;
  const totalDrivers = locations?.length || 0;
  const totalOrdersOnMap = geocodedOrders.length;

  useEffect(() => {
    const fetchApiKey = async () => {
      try {
        setIsLoadingKey(true);
        const { data, error } = await supabase.functions.invoke('get-google-maps-key');
        if (error) { setLoadError('Failed to load Google Maps configuration'); return; }
        if (data?.apiKey) setApiKey(data.apiKey);
        else if (data?.error) setLoadError(data.error);
      } catch { setLoadError('Failed to initialize map'); } finally { setIsLoadingKey(false); }
    };
    fetchApiKey();
  }, []);

  useEffect(() => {
    if (!apiKey || !mapContainer.current || mapRef.current) return;
    const initMap = () => {
      if (!mapContainer.current) return;
      mapRef.current = new google.maps.Map(mapContainer.current, {
        center: { lat: 4.5353, lng: 114.7277 }, zoom: 10,
        mapTypeControl: false, streetViewControl: false, fullscreenControl: true, zoomControl: true,
        styles: [
          { featureType: "poi", stylers: [{ visibility: "off" }] },
          { featureType: "transit", stylers: [{ visibility: "off" }] },
        ],
      });
      infoWindowRef.current = new google.maps.InfoWindow();
      directionsServiceRef.current = new google.maps.DirectionsService();
      directionsRendererRef.current = new google.maps.DirectionsRenderer({
        suppressMarkers: true,
        polylineOptions: { strokeColor: '#C79A5A', strokeWeight: 4, strokeOpacity: 0.8 },
      });
      directionsRendererRef.current.setMap(mapRef.current);
      setMapReady(true);
    };
    if (window.google?.maps) { initMap(); return; }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker,places`;
    script.async = true; script.defer = true;
    script.onload = initMap;
    script.onerror = () => setLoadError('Failed to load Google Maps');
    document.head.appendChild(script);
    return () => {
      driverMarkersRef.current.forEach(marker => marker.setMap(null));
      driverMarkersRef.current.clear();
      orderMarkersRef.current.forEach(marker => marker.setMap(null));
      orderMarkersRef.current.clear();
      if (directionsRendererRef.current) directionsRendererRef.current.setMap(null);
    };
  }, [apiKey]);

  useEffect(() => {
    if (!mapReady || !displayedOrders || displayedOrders.length === 0) return;
    const ordersToGeocode = displayedOrders.map(o => ({
      id: o.id, order_code: o.order_code, customer_name: o.customer_name,
      address: o.address, area: o.area, driver_id: o.driver_id,
    }));
    geocodeOrders(ordersToGeocode);
  }, [mapReady, displayedOrders, geocodeOrders]);

  useEffect(() => {
    if (!mapRef.current || !mapReady || !locations) return;
    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;
    locations.forEach((location) => {
      if (!location.latitude || !location.longitude) return;
      const position = { lat: location.latitude, lng: location.longitude };
      bounds.extend(position); hasPoints = true;
      const isSelected = selectedDriver === location.driver_id;
      const markerColor = getMarkerColor(location.recorded_at);
      let marker = driverMarkersRef.current.get(location.driver_id);
      if (marker) {
        marker.setPosition(position);
        marker.setIcon({ path: google.maps.SymbolPath.CIRCLE, scale: isSelected ? 14 : 12,
          fillColor: isSelected ? '#22c55e' : markerColor, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3 });
      } else {
        marker = new google.maps.Marker({
          position, map: mapRef.current!, title: location.driver_name || 'Driver',
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: isSelected ? 14 : 12,
            fillColor: isSelected ? '#22c55e' : markerColor, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3 },
          zIndex: 1000,
        });
        marker.addListener('click', () => {
          setSelectedDriver(selectedDriver === location.driver_id ? null : location.driver_id);
          const content = `<div style="padding:12px;min-width:180px;font-family:system-ui;">
            <strong style="font-size:14px;">${location.driver_name || "Driver"}</strong>
            <p style="font-size:12px;color:#666;margin:6px 0 0;">Updated: ${formatDistanceToNow(new Date(location.recorded_at), { addSuffix: true })}</p>
            ${location.speed ? `<p style="font-size:12px;margin:4px 0 0;">Speed: ${Math.round(location.speed * 3.6)} km/h</p>` : ""}
          </div>`;
          infoWindowRef.current?.setContent(content);
          infoWindowRef.current?.open(mapRef.current!, marker);
        });
        driverMarkersRef.current.set(location.driver_id, marker);
      }
    });
    const currentDriverIds = new Set(locations.map(l => l.driver_id));
    driverMarkersRef.current.forEach((marker, driverId) => {
      if (!currentDriverIds.has(driverId)) { marker.setMap(null); driverMarkersRef.current.delete(driverId); }
    });
    if (showOrders && geocodedOrders.length > 0) {
      geocodedOrders.forEach(order => { bounds.extend({ lat: order.latitude, lng: order.longitude }); hasPoints = true; });
    }
    if (hasPoints) {
      mapRef.current.fitBounds(bounds);
      const listener = google.maps.event.addListener(mapRef.current, 'idle', () => {
        const zoom = mapRef.current?.getZoom();
        if (zoom && zoom > 15) mapRef.current?.setZoom(15);
        google.maps.event.removeListener(listener);
      });
    }
  }, [locations, selectedDriver, mapReady, showOrders, geocodedOrders]);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    orderMarkersRef.current.forEach(marker => marker.setMap(null));
    orderMarkersRef.current.clear();
    if (!showOrders || geocodedOrders.length === 0) return;
    geocodedOrders.forEach((order, index) => {
      const position = { lat: order.latitude, lng: order.longitude };
      const marker = new google.maps.Marker({
        position, map: mapRef.current!, title: order.orderCode,
        label: { text: String(index + 1), color: '#ffffff', fontSize: '11px', fontWeight: 'bold' },
        icon: { path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW, scale: 6,
          fillColor: '#ef4444', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 },
        zIndex: 500,
      });
      marker.addListener('click', () => {
        const content = `<div style="padding:12px;min-width:180px;font-family:system-ui;">
          <strong style="color:#ef4444;font-size:13px;">#${index + 1} - ${order.orderCode}</strong>
          <p style="font-size:13px;margin:6px 0 2px;">${order.customerName}</p>
          <p style="font-size:12px;color:#666;">${order.address}</p>
          ${order.area ? `<p style="font-size:11px;color:#999;">${order.area}</p>` : ''}
        </div>`;
        infoWindowRef.current?.setContent(content);
        infoWindowRef.current?.open(mapRef.current!, marker);
      });
      orderMarkersRef.current.set(order.orderId, marker);
    });
  }, [geocodedOrders, showOrders, mapReady]);

  const calculateRoute = useCallback(async () => {
    if (!directionsServiceRef.current || !directionsRendererRef.current || !mapRef.current) return;
    if (!selectedDriver || geocodedOrders.length === 0) return;
    const driverLocation = locations?.find(l => l.driver_id === selectedDriver);
    if (!driverLocation?.latitude || !driverLocation?.longitude) return;
    setIsCalculatingRoute(true);
    try {
      const origin = { lat: driverLocation.latitude, lng: driverLocation.longitude };
      const driverOrderLocations = geocodedOrders.filter(o => o.driverId === selectedDriver);
      if (driverOrderLocations.length === 0) { setIsCalculatingRoute(false); return; }
      const destination = { lat: driverOrderLocations[driverOrderLocations.length - 1].latitude, lng: driverOrderLocations[driverOrderLocations.length - 1].longitude };
      const waypoints = driverOrderLocations.slice(0, -1).map(order => ({ location: { lat: order.latitude, lng: order.longitude }, stopover: true }));
      directionsServiceRef.current.route({
        origin, destination, waypoints: waypoints.slice(0, 23), optimizeWaypoints: true,
        travelMode: google.maps.TravelMode.DRIVING,
      }, (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          directionsRendererRef.current?.setDirections(result);
          setShowRoute(true);
        }
        setIsCalculatingRoute(false);
      });
    } catch { setIsCalculatingRoute(false); }
  }, [selectedDriver, geocodedOrders, locations]);

  const clearRoute = useCallback(() => {
    if (directionsRendererRef.current) directionsRendererRef.current.setDirections({ routes: [] } as google.maps.DirectionsResult);
    setShowRoute(false);
  }, []);

  useEffect(() => { clearRoute(); }, [selectedDriver, clearRoute]);

  if (isLoadingKey) {
    return (
      <Card className="border shadow-sm">
        <CardContent className="p-12 text-center">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Loader2 className="h-7 w-7 text-primary animate-spin" />
          </div>
          <h3 className="font-semibold mb-1">Loading Map</h3>
          <p className="text-sm text-muted-foreground">Initializing Google Maps...</p>
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card className="border shadow-sm">
        <CardContent className="p-12 text-center">
          <div className="h-14 w-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <h3 className="font-semibold mb-1">Map Not Available</h3>
          <p className="text-sm text-muted-foreground">{loadError}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary + Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="gap-1.5 py-1.5 px-3 rounded-full">
            <Navigation className="h-3.5 w-3.5" />
            {totalDrivers} driver{totalDrivers !== 1 ? 's' : ''}
          </Badge>
          <Badge variant="outline" className="gap-1.5 py-1.5 px-3 rounded-full">
            <MapPin className="h-3.5 w-3.5" />
            {totalOrdersOnMap} order{totalOrdersOnMap !== 1 ? 's' : ''}
          </Badge>
          {isGeocoding && (
            <Badge variant="secondary" className="gap-1.5 py-1.5 px-3 rounded-full">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Geocoding...
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Switch id="show-orders" checked={showOrders} onCheckedChange={setShowOrders} />
            <Label htmlFor="show-orders" className="text-sm">Show Orders</Label>
          </div>
          {selectedDriver && geocodedOrders.filter(o => o.driverId === selectedDriver).length > 0 && (
            <Button
              variant={showRoute ? "default" : "outline"}
              size="sm"
              className="rounded-xl gap-1.5"
              onClick={showRoute ? clearRoute : calculateRoute}
              disabled={isCalculatingRoute}
            >
              {isCalculatingRoute ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}
              {showRoute ? 'Hide Route' : 'Show Route'}
            </Button>
          )}
        </div>
      </div>

      {/* Map + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Map */}
        <div className="lg:col-span-3">
          <Card className="overflow-hidden border shadow-sm">
            <div ref={mapContainer} className="h-[550px] w-full" />
          </Card>
          {/* Legend */}
          <div className="flex items-center gap-5 mt-3 text-xs text-muted-foreground flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span>Active (&lt;2 min)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <span>Recent (2-10 min)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-gray-500" />
              <span>Stale (&gt;10 min)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-red-500" style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }} />
              <span>Order</span>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Driver List */}
          <Card className="border shadow-sm">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Navigation className="h-4 w-4 text-primary" />
                </div>
                <p className="font-semibold text-sm">Drivers</p>
              </div>
              {selectedDriver && (
                <Button variant="ghost" size="sm" className="h-7 text-xs rounded-lg" onClick={() => setSelectedDriver(null)}>
                  Clear
                </Button>
              )}
            </div>
            <CardContent className="p-2 max-h-[400px] overflow-y-auto">
              {locations?.map((loc) => {
                const markerColor = getMarkerColor(loc.recorded_at);
                const isActive = markerColor === '#22c55e';
                const isRecent = markerColor === '#eab308';
                const driverOrderCount = geocodedOrders.filter(o => o.driverId === loc.driver_id).length;
                
                return (
                  <div
                    key={loc.id}
                    className={`p-3 rounded-xl cursor-pointer transition-all mb-1 ${
                      selectedDriver === loc.driver_id
                        ? "bg-primary/10 border border-primary shadow-sm"
                        : "hover:bg-muted/80"
                    }`}
                    onClick={() => {
                      setSelectedDriver(selectedDriver === loc.driver_id ? null : loc.driver_id);
                      if (mapRef.current && loc.latitude && loc.longitude) {
                        mapRef.current.panTo({ lat: loc.latitude, lng: loc.longitude });
                        mapRef.current.setZoom(14);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="relative">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                            {(loc.driver_name || '?')[0]?.toUpperCase()}
                          </div>
                          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card" style={{ backgroundColor: markerColor }} />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-sm">{loc.driver_name || "Unknown"}</span>
                            {driverOrderCount > 0 && (
                              <Badge variant="outline" className="text-xs h-5 rounded-full px-1.5">{driverOrderCount}</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(loc.recorded_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </div>
                    {loc.speed && loc.speed > 0 && (
                      <p className="text-xs text-muted-foreground mt-1 ml-10">
                        {Math.round(loc.speed * 3.6)} km/h
                      </p>
                    )}
                  </div>
                );
              })}
              {(!locations || locations.length === 0) && (
                <div className="text-center py-10">
                  <div className="h-10 w-10 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                    <MapPin className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">No active drivers</p>
                  <p className="text-xs text-muted-foreground mt-1">Drivers need to enable location sharing</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Selected Driver Orders */}
          {selectedDriver && (
            <Card className="border shadow-sm">
              <div className="flex items-center gap-2 p-4 border-b">
                <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Package className="h-4 w-4 text-primary" />
                </div>
                <p className="font-semibold text-sm">Assigned Orders</p>
              </div>
              <CardContent className="p-2">
                {driverOrders.length > 0 ? (
                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {driverOrders.map((order, index) => {
                      const isGeocoded = geocodedOrders.some(g => g.orderId === order.id);
                      return (
                        <div key={order.id} className="p-2.5 rounded-xl hover:bg-muted/50 transition-colors flex items-start gap-2.5">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{order.order_code}</p>
                            <p className="text-xs text-muted-foreground truncate">{order.customer_name}</p>
                            <p className="text-xs text-muted-foreground truncate">{order.area || 'No area'}</p>
                            {!isGeocoded && (
                              <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                                <AlertTriangle className="h-3 w-3" />
                                Location not found
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">No orders assigned</p>
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
