import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Calendar, Megaphone, MapPin, Clock, CheckCircle, XCircle, HelpCircle, X
} from 'lucide-react';
import { useMyPopupEvents, useRespondToEvent, useDismissEvent, type PopupEvent } from '@/hooks/useEvents';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogBody,
  ResponsiveDialogFooter,
} from '@/components/ui/responsive-dialog';
import { useIsMobile } from '@/hooks/use-mobile';

export function EventPopupModal() {
  const { data: popupEvents = [] } = useMyPopupEvents();
  const respondToEvent = useRespondToEvent();
  const dismissEvent = useDismissEvent();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

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
    <ResponsiveDialog open={open} onOpenChange={(v) => {
      if (!v && current.dismissible) {
        handleDismiss();
      }
    }}>
      <ResponsiveDialogContent className={cn(
        "p-0 gap-0 overflow-hidden",
        !isMobile && "max-w-lg rounded-2xl"
      )}>
        {/* Hidden accessible header */}
        <ResponsiveDialogHeader className="sr-only">
          <ResponsiveDialogTitle>{current.event_title}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>Event details</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <ResponsiveDialogBody className="p-0 overflow-y-auto">
          {/* Image section */}
          {current.event_cover_image_url && (
            <div className="relative w-full bg-muted/30 flex items-center justify-center">
              {/* Counter badge */}
              {popupEvents.length > 1 && (
                <div className="absolute top-3 left-3 z-10">
                  <Badge variant="secondary" className="rounded-full text-[10px] bg-background/80 backdrop-blur-sm">
                    {currentIndex + 1} / {popupEvents.length}
                  </Badge>
                </div>
              )}
              {/* Close button */}
              {current.dismissible && (
                <button
                  onClick={handleDismiss}
                  className="absolute top-3 right-3 z-10 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center hover:bg-background transition-colors"
                >
                  <X className="h-4 w-4 text-foreground" />
                </button>
              )}
              <img
                src={current.event_cover_image_url}
                alt={current.event_title}
                className={cn(
                  "w-full h-auto object-contain",
                  isMobile ? "max-h-[40vh]" : "max-h-[50vh]"
                )}
              />
            </div>
          )}

          {/* Content */}
          <div className="p-5 space-y-3">
            {/* Counter if no image */}
            {!current.event_cover_image_url && popupEvents.length > 1 && (
              <Badge variant="secondary" className="rounded-full text-[10px] mb-1">
                {currentIndex + 1} / {popupEvents.length}
              </Badge>
            )}

            {/* Type badge */}
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="rounded-full text-[10px] gap-1">
                {isEvent ? <Calendar className="h-3 w-3" /> : <Megaphone className="h-3 w-3" />}
                {isEvent ? 'Event' : 'Announcement'}
              </Badge>
            </div>

            {/* Title */}
            <h2 className="text-lg font-bold tracking-tight text-foreground">{current.event_title}</h2>
            {current.event_subtitle && (
              <p className="text-sm text-muted-foreground">{current.event_subtitle}</p>
            )}

            {/* Metadata chips */}
            {isEvent && (current.event_start_at || current.event_location) && (
              <div className="flex items-center gap-2 flex-wrap">
                {current.event_start_at && (
                  <Badge variant="secondary" className="rounded-full gap-1 text-xs font-normal">
                    <Clock className="h-3 w-3" />
                    {format(new Date(current.event_start_at), 'MMM d, h:mm a')}
                  </Badge>
                )}
                {current.event_location && (
                  <Badge variant="secondary" className="rounded-full gap-1 text-xs font-normal">
                    <MapPin className="h-3 w-3" />
                    {current.event_location}
                  </Badge>
                )}
              </div>
            )}

            {/* Description - full, no clamp */}
            {current.event_description && (
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {current.event_description}
              </p>
            )}
          </div>
        </ResponsiveDialogBody>

        {/* Action buttons */}
        <ResponsiveDialogFooter className="px-5 py-4 border-t bg-background">
          <div className="flex items-center gap-2 w-full flex-wrap">
            {isEvent ? (
              <>
                <Button className="rounded-full gap-1.5 flex-1" onClick={() => handleRespond('join')}>
                  <CheckCircle className="h-4 w-4" /> Join
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
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
