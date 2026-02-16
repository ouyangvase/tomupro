import { Construction, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

export function MaintenanceOverlay() {
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/auth';
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center">
      <div className="text-center space-y-4 p-8 max-w-md">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <Construction className="h-10 w-10 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">Maintenance in Progress</h1>
        <p className="text-muted-foreground">
          The system is currently undergoing maintenance. Please check back shortly.
        </p>
        <div className="flex items-center justify-center gap-2 pt-4">
          <div className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
          <div className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
          <div className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
        </div>
        <Button variant="outline" onClick={handleSignOut} className="mt-6 gap-2">
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
