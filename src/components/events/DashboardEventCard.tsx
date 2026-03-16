import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Megaphone, MapPin, Clock, CheckCircle, XCircle, HelpCircle } from 'lucide-react';
import { useMyEvents, useMyEventResponses, useRespondToEvent, useDismissEvent } from '@/hooks/useEvents';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

export function DashboardEventCards() {
  const { data: deliveries = [] } = useMyEvents();
  const { data: myResponses = [] } = useMyEventResponses();
  const respondToEvent = useRespondToEvent();
  const dismissEvent = useDismissEvent();
  const navigate = useNavigate();

  // Show only active, dashboard-visible events
  const dashboardEvents = deliveries.filter((d: any) => {
    const evt = d.events;
    const settings = evt?.event_settings?.[0];
    return evt?.status === 'published' && settings?.show_on_dashboard && d.current_status !== 'dismissed';
  }).slice(0, 3);

  const responseMap = new Map(myResponses.map((r: any) => [r.event_id, r.response]));

  if (dashboardEvents.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Events & Announcements</h3>
        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7" onClick={() => navigate('/events')}>
          View all →
        </Button>
      </div>
      {dashboardEvents.map((delivery: any) => {
        const evt = delivery.events;
        const settings = evt?.event_settings?.[0];
        const isEvent = evt?.type === 'event';
        const myResponse = responseMap.get(evt?.id);

        return (
          <Card key={delivery.id} className="overflow-hidden hover:shadow-md transition-all cursor-pointer" onClick={() => navigate('/events')}>
            <div className="flex">
              {evt.cover_image_url && (
                <div className="w-24 h-24 shrink-0 overflow-hidden">
                  <img src={evt.cover_image_url} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <CardContent className="p-3 flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  {isEvent ? <Calendar className="h-3.5 w-3.5 text-primary" /> : <Megaphone className="h-3.5 w-3.5 text-primary" />}
                  <h4 className="text-xs font-semibold truncate">{evt.title}</h4>
                </div>
                {evt.subtitle && <p className="text-[11px] text-muted-foreground truncate">{evt.subtitle}</p>}
                {settings?.event_start_at && (
                  <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {format(new Date(settings.event_start_at), 'MMM d, h:mm a')}
                  </p>
                )}
                {myResponse && (
                  <Badge className={cn(
                    "mt-1.5 rounded-full text-[10px]",
                    myResponse === 'join' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                    myResponse === 'not_join' ? 'bg-destructive/10 text-destructive' :
                    'bg-muted text-muted-foreground'
                  )}>
                    {myResponse === 'join' ? '✓ Joined' : myResponse === 'not_join' ? '✗ Declined' : '? Maybe'}
                  </Badge>
                )}
              </CardContent>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
