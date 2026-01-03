import React from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import DriverMapView from "@/components/maps/DriverMapView";
import { useAuth } from "@/contexts/AuthContext";

const DriverLocationsPage: React.FC = () => {
  const { user } = useAuth();

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Driver Locations</h1>
          <p className="text-muted-foreground">
            Live view of your drivers' positions and assigned orders
          </p>
        </div>

        <DriverMapView runnerId={user?.id} />
      </div>
    </AppLayout>
  );
};

export default DriverLocationsPage;
