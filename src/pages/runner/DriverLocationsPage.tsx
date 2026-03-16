import React from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import DriverMapView from "@/components/maps/DriverMapView";
import { useAuth } from "@/contexts/AuthContext";
import { PageHero } from "@/components/dashboard/PageHero";
import { MapPin } from "lucide-react";
import capybaraDispatcher from "@/assets/capybara-dispatcher.png";

const DriverLocationsPage: React.FC = () => {
  const { user } = useAuth();

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

        <DriverMapView runnerId={user?.id} />
      </div>
    </AppLayout>
  );
};

export default DriverLocationsPage;
