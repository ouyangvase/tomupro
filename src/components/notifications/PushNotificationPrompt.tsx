import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { usePushNotifications } from '@/hooks/useNotificationSystem';

export function PushNotificationPrompt() {
  const { permission, isSupported, requestPermission, isEnabled } = usePushNotifications();
  const [dismissed, setDismissed] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Check if user has dismissed the prompt before
    const wasDismissed = localStorage.getItem('push-notification-prompt-dismissed');
    if (wasDismissed) {
      setDismissed(true);
    }

    // Only show if supported, not yet decided, and not dismissed
    if (isSupported && permission === 'default' && !wasDismissed) {
      // Delay showing the prompt
      const timer = setTimeout(() => setShow(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [isSupported, permission]);

  const handleDismiss = () => {
    setDismissed(true);
    setShow(false);
    localStorage.setItem('push-notification-prompt-dismissed', 'true');
  };

  const handleEnable = async () => {
    await requestPermission();
    setShow(false);
  };

  if (!show || dismissed || isEnabled || permission === 'denied') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-4">
      <Card className="w-80 shadow-lg border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Bell className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-medium text-sm">Enable Notifications</h4>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 shrink-0"
                  onClick={handleDismiss}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Get instant alerts for new pickups and deliveries, even when the app is in the background.
              </p>
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={handleEnable}>
                  Enable
                </Button>
                <Button size="sm" variant="ghost" onClick={handleDismiss}>
                  Not now
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
