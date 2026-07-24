import React, { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import DriverMapView from "@/components/maps/DriverMapView";
import { useAuth } from "@/contexts/AuthContext";
import { PageHero } from "@/components/dashboard/PageHero";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Power, ShieldCheck, WifiOff } from "lucide-react";
import capybaraDispatcher from "@/assets/capybara-dispatcher.png";

const DriverLocationsPage: React.FC = () => {
  const { user } = useAuth();
  const [isLiveMapActive, setIsLiveMapActive] = useState(false);

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHero
          icon={<MapPin className="h-6 w-6 text-primary" />}
          title="Driver Live Map"
          subtitle="Real-time driver locations and delivery tracking"
          image={capybaraDispatcher}
          imageAlt="Dispatcher Capybara"
        />

        {isLiveMapActive ? (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => setIsLiveMapActive(false)}
              >
                <WifiOff className="mr-2 h-4 w-4" />
                Close Live Map
              </Button>
            </div>
            <DriverMapView runnerId={user?.id} />
          </div>
        ) : (
          <Card className="border border-border/60 shadow-sm">
            <CardContent className="grid gap-5 p-5 md:grid-cols-[1fr_auto] md:items-center md:p-6">
              <div className="space-y-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                  <Power className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-foreground">Live Map is closed</h2>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    Driver locations and route markers will only load after you activate the map.
                    Use this when you need live tracking.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span>Location data stays paused while the map is closed.</span>
                </div>
              </div>
              <Button
                type="button"
                size="lg"
                className="h-12 rounded-xl px-6"
                onClick={() => setIsLiveMapActive(true)}
              >
                <MapPin className="mr-2 h-4 w-4" />
                Start Live Map
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default DriverLocationsPage;
