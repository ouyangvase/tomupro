import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Calendar, Megaphone, MapPin, Clock, CheckCircle, XCircle, HelpCircle
} from 'lucide-react';
import { useMyEvents, useMyEventResponses, useRespondToEvent, useDismissEvent } from '@/hooks/useEvents';
import { format, isPast, isFuture } from 'date-fns';
import { cn } from '@/lib/utils';
import capybaraEmpty from '@/assets/capybara-empty.png';

type Tab = 'upcoming' | 'responses' | 'announcements' | 'past';

export default function UserEventsPage() {
  const { data: deliveries = [], isLoading } = useMyEvents();
  const { data: myResponses = [] } = useMyEventResponses();
  const respondToEvent = useRespondToEvent();
  const dismissEvent = useDismissEvent();
  const [tab, setTab] = useState<Tab>('upcoming');

  // Categorize
  const events = deliveries.filter((d: any) => d.events?.type === 'event' && d.events?.status === 'published');
  const announcements = deliveries.filter((d: any) => d.events?.type === 'announcement' && d.events?.status === 'published');
  
  const upcomingEvents = events.filter((d: any) => {
    const startAt = d.events?.event_settings?.[0]?.event_start_at;
    return !startAt || isFuture(new Date(startAt));
  });
  const pastEvents = events.filter((d: any) => {
    const startAt = d.events?.event_settings?.[0]?.event_start_at;
    return startAt && isPast(new Date(startAt));
  });

  const responseMap = new Map(myResponses.map((r: any) => [r.event_id, r.response]));

  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: 'upcoming', label: 'Upcoming', count: upcomingEvents.length },
    { value: 'responses', label: 'My Responses', count: myResponses.length },
    { value: 'announcements', label: 'Announcements', count: announcements.length },
    { value: 'past', label: 'Past', count: pastEvents.length },
  ];

  const getDisplayList = () => {
    switch (tab) {
      case 'upcoming': return upcomingEvents;
      case 'announcements': return announcements;
      case 'past': return pastEvents;
      default: return [];
    }
  };

  const displayList = getDisplayList();

  const renderEventCard = (delivery: any) => {
    const evt = delivery.events;
    if (!evt) return null;
    const settings = evt.event_settings?.[0];
    const isEvent = evt.type === 'event';
    const myResponse = responseMap.get(evt.id);

    return (
      <Card key={delivery.id} className="group hover:shadow-md transition-all overflow-hidden">
        {/* Cover */}
        {evt.cover_image_url && (
          <div className="h-40 overflow-hidden">
            <img src={evt.cover_image_url} alt={evt.title} className="w-full h-full object-cover" />
          </div>
        )}
        <CardContent className={cn("p-4", !evt.cover_image_url && "pt-5")}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                {isEvent ? <Calendar className="h-4 w-4 text-primary shrink-0" /> : <Megaphone className="h-4 w-4 text-primary shrink-0" />}
                <h3 className="font-semibold text-sm">{evt.title}</h3>
                <Badge variant="outline" className="text-[10px] rounded-full capitalize">{evt.type}</Badge>
              </div>
              {evt.subtitle && <p className="text-xs text-muted-foreground mt-1">{evt.subtitle}</p>}
            </div>
            {myResponse && (
              <Badge className={cn(
                "rounded-full text-xs shrink-0",
                myResponse === 'join' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                myResponse === 'not_join' ? 'bg-destructive/10 text-destructive' :
                'bg-muted text-muted-foreground'
              )}>
                {myResponse === 'join' ? '✓ Joining' : myResponse === 'not_join' ? '✗ Not Joining' : '? Maybe'}
              </Badge>
            )}
          </div>

          {evt.description && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-3 whitespace-pre-line">{evt.description}</p>
          )}

          {/* Event metadata */}
          {isEvent && settings && (
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
              {settings.event_start_at && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {format(new Date(settings.event_start_at), 'MMM d, h:mm a')}
                </span>
              )}
              {settings.event_location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {settings.event_location}
                </span>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            {isEvent && !myResponse && (
              <>
                <Button
                  size="sm"
                  className="rounded-full gap-1 h-8 text-xs"
                  onClick={() => respondToEvent.mutate({ eventId: evt.id, response: 'join' })}
                  disabled={respondToEvent.isPending}
                >
                  <CheckCircle className="h-3 w-3" /> Join
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full gap-1 h-8 text-xs"
                  onClick={() => respondToEvent.mutate({ eventId: evt.id, response: 'not_join' })}
                  disabled={respondToEvent.isPending}
                >
                  <XCircle className="h-3 w-3" /> Not Joining
                </Button>
                {settings?.allow_maybe && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-full gap-1 h-8 text-xs"
                    onClick={() => respondToEvent.mutate({ eventId: evt.id, response: 'maybe' })}
                    disabled={respondToEvent.isPending}
                  >
                    <HelpCircle className="h-3 w-3" /> Maybe
                  </Button>
                )}
              </>
            )}
            {!isEvent && delivery.current_status !== 'acknowledged' && delivery.current_status !== 'dismissed' && (
              <>
                <Button
                  size="sm"
                  className="rounded-full gap-1 h-8 text-xs"
                  onClick={() => dismissEvent.mutate({ eventId: evt.id, action: 'acknowledged' })}
                >
                  <CheckCircle className="h-3 w-3" /> Mark as Read
                </Button>
                {settings?.dismissible && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-full gap-1 h-8 text-xs"
                    onClick={() => dismissEvent.mutate({ eventId: evt.id, action: 'dismissed' })}
                  >
                    Dismiss
                  </Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6 pb-12">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Events & Announcements</h1>
          <p className="text-muted-foreground mt-1">Stay up to date with team events</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map(t => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5",
                tab === t.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              )}
            >
              {t.label}
              <span className={cn("text-xs", tab === t.value ? "text-primary-foreground/80" : "text-muted-foreground")}>{t.count}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Card key={i}><CardContent className="p-4"><Skeleton className="h-32 w-full" /></CardContent></Card>)}
          </div>
        ) : tab === 'responses' ? (
          myResponses.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-3">
              {myResponses.map((r: any) => (
                <Card key={r.id} className="hover:shadow-md transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold">{r.events?.title}</h3>
                      </div>
                      <Badge className={cn(
                        "rounded-full text-xs",
                        r.response === 'join' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        r.response === 'not_join' ? 'bg-destructive/10 text-destructive' :
                        'bg-muted text-muted-foreground'
                      )}>
                        {r.response === 'join' ? '✓ Joining' : r.response === 'not_join' ? '✗ Declined' : '? Maybe'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Responded {format(new Date(r.responded_at), 'MMM d, h:mm a')}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        ) : displayList.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            {displayList.map(renderEventCard)}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="py-16 flex flex-col items-center text-center">
        <img src={capybaraEmpty} alt="No events" className="h-28 w-28 mb-4 opacity-80" />
        <h3 className="text-lg font-semibold">Nothing here yet</h3>
        <p className="text-sm text-muted-foreground mt-1">Check back soon for new events and updates.</p>
      </CardContent>
    </Card>
  );
}
