import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Calendar, Megaphone, MapPin, Clock, CheckCircle, XCircle, HelpCircle
} from 'lucide-react';
import { useMyPopupEvents, useRespondToEvent, useDismissEvent, type PopupEvent } from '@/hooks/useEvents';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export function EventPopupModal() {
  const { data: popupEvents = [] } = useMyPopupEvents();
  const respondToEvent = useRespondToEvent();
  const dismissEvent = useDismissEvent();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (popupEvents.length > 0) {
      setOpen(true);
      setCurrentIndex(0);
    }
  }, [popupEvents.length]);

  if (popupEvents.length === 0) return null;

  const current: PopupEvent | undefined = popupEvents[currentIndex];
  if (!current) return null;

  const isEvent = current.event_type === 'event';

  const goNext = () => {
    if (currentIndex < popupEvents.length - 1) {
      setCurrentIndex(i => i + 1);
    } else {
      setOpen(false);
    }
  };

  const handleDismiss = () => {
    if (current.dismissible) {
      dismissEvent.mutate({ eventId: current.event_id, action: 'dismissed' });
    } else {
      dismissEvent.mutate({ eventId: current.event_id, action: 'seen' });
    }
    goNext();
  };

  const handleRespond = (response: string) => {
    respondToEvent.mutate({ eventId: current.event_id, response });
    dismissEvent.mutate({ eventId: current.event_id, action: 'acknowledged' });
    goNext();
  };

  const handleAcknowledge = () => {
    dismissEvent.mutate({ eventId: current.event_id, action: 'acknowledged' });
    goNext();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v && current.dismissible) {
        handleDismiss();
      }
    }}>
      <DialogContent className="max-w-lg p-0 overflow-hidden rounded-2xl gap-0">
        {popupEvents.length > 1 && (
          <div className="absolute top-3 left-3 z-10">
            <Badge variant="secondary" className="rounded-full text-[10px]">
              {currentIndex + 1} / {popupEvents.length}
            </Badge>
          </div>
        )}

        {current.event_cover_image_url && (
          <div className="h-48 overflow-hidden">
            <img src={current.event_cover_image_url} alt={current.event_title} className="w-full h-full object-cover" />
          </div>
        )}

        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
              isEvent ? "bg-primary/10" : "bg-muted"
            )}>
              {isEvent ? <Calendar className="h-5 w-5 text-primary" /> : <Megaphone className="h-5 w-5 text-muted-foreground" />}
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">{current.event_title}</h2>
              {current.event_subtitle && <p className="text-sm text-muted-foreground">{current.event_subtitle}</p>}
            </div>
          </div>

          {isEvent && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              {current.event_start_at && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" /> {format(new Date(current.event_start_at), 'MMM d, h:mm a')}
                </span>
              )}
              {current.event_location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" /> {current.event_location}
                </span>
              )}
            </div>
          )}

          {current.event_description && (
            <p className="text-sm text-muted-foreground whitespace-pre-line line-clamp-6">
              {current.event_description}
            </p>
          )}

          <div className="flex items-center gap-2 pt-2 flex-wrap">
            {isEvent ? (
              <>
                <Button className="rounded-full gap-1.5 flex-1" onClick={() => handleRespond('join')}>
                  <CheckCircle className="h-4 w-4" /> Join Event
                </Button>
                <Button variant="outline" className="rounded-full gap-1.5 flex-1" onClick={() => handleRespond('not_join')}>
                  <XCircle className="h-4 w-4" /> Not Joining
                </Button>
                {current.allow_maybe && (
                  <Button variant="ghost" className="rounded-full gap-1.5" onClick={() => handleRespond('maybe')}>
                    <HelpCircle className="h-4 w-4" /> Maybe
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button className="rounded-full gap-1.5 flex-1" onClick={handleAcknowledge}>
                  <CheckCircle className="h-4 w-4" /> Mark as Read
                </Button>
                {current.dismissible && (
                  <Button variant="ghost" className="rounded-full gap-1.5" onClick={handleDismiss}>
                    Dismiss
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
