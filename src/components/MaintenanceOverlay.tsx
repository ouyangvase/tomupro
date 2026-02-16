import { Construction } from 'lucide-react';

export function MaintenanceOverlay() {
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
      </div>
    </div>
  );
}
