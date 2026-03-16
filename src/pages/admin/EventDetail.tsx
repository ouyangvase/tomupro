import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft, Calendar, Megaphone, MapPin, Clock, Users,
  Send, CheckCircle, XCircle, HelpCircle, Eye, BarChart3, Trash2
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useParams, useNavigate } from 'react-router-dom';
import { useAdminEvent, usePublishEvent, useDeleteEvent, useEventDeliveryStats, useEventResponseStats, useEventResponses } from '@/hooks/useEvents';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function EventDetail() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { data: event, isLoading } = useAdminEvent(eventId);
  const { data: deliveryStats } = useEventDeliveryStats(eventId);
  const { data: responseStats } = useEventResponseStats(eventId);
  const { data: responses = [] } = useEventResponses(eventId);
  const publishEvent = usePublishEvent();
  const deleteEvent = useDeleteEvent();

  const handleDelete = () => {
    if (!eventId) return;
    deleteEvent.mutate(eventId, {
      onSuccess: () => navigate('/admin/events'),
    });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </AppLayout>
    );
  }

  if (!event) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto text-center py-16">
          <p className="text-muted-foreground">Event not found</p>
          <Button variant="outline" onClick={() => navigate('/admin/events')} className="mt-4">Back</Button>
        </div>
      </AppLayout>
    );
  }

  const settings = event.event_settings?.[0];
  const isEvent = event.type === 'event';

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6 pb-12">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/events')} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{event.title}</h1>
              <Badge variant="outline" className="capitalize rounded-full">{event.type}</Badge>
              <Badge className={cn(
                "rounded-full text-xs",
                event.status === 'published' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'
              )}>
                {event.status}
              </Badge>
            </div>
            {event.subtitle && <p className="text-sm text-muted-foreground mt-0.5">{event.subtitle}</p>}
          </div>
          {event.status === 'draft' && (
            <Button onClick={() => publishEvent.mutate(event.id)} disabled={publishEvent.isPending} className="rounded-full gap-2">
              <Send className="h-4 w-4" /> Publish
            </Button>
          )}
        </div>

        {/* Cover Image */}
        {event.cover_image_url && (
          <div className="rounded-xl overflow-hidden h-56">
            <img src={event.cover_image_url} alt={event.title} className="w-full h-full object-cover" />
          </div>
        )}

        {/* Analytics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <Users className="h-5 w-5 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold">{deliveryStats?.total ?? 0}</p>
              <p className="text-xs text-muted-foreground">Targeted</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Eye className="h-5 w-5 mx-auto text-blue-500 mb-1" />
              <p className="text-2xl font-bold">{deliveryStats?.seen ?? 0}</p>
              <p className="text-xs text-muted-foreground">Viewed</p>
            </CardContent>
          </Card>
          {isEvent && (
            <>
              <Card className="border-green-200 dark:border-green-900/30">
                <CardContent className="p-4 text-center">
                  <CheckCircle className="h-5 w-5 mx-auto text-green-500 mb-1" />
                  <p className="text-2xl font-bold">{responseStats?.join ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Joined</p>
                </CardContent>
              </Card>
              <Card className="border-destructive/20">
                <CardContent className="p-4 text-center">
                  <XCircle className="h-5 w-5 mx-auto text-destructive mb-1" />
                  <p className="text-2xl font-bold">{responseStats?.not_join ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Declined</p>
                </CardContent>
              </Card>
            </>
          )}
          {!isEvent && (
            <>
              <Card>
                <CardContent className="p-4 text-center">
                  <CheckCircle className="h-5 w-5 mx-auto text-green-500 mb-1" />
                  <p className="text-2xl font-bold">{deliveryStats?.acknowledged ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Acknowledged</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <XCircle className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-2xl font-bold">{deliveryStats?.dismissed ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Dismissed</p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Event Info */}
        {isEvent && settings && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Event Details</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {settings.event_start_at && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span>{format(new Date(settings.event_start_at), 'PPPp')}</span>
                  {settings.event_end_at && <span>→ {format(new Date(settings.event_end_at), 'p')}</span>}
                </div>
              )}
              {settings.event_location && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-primary" /> {settings.event_location}
                </div>
              )}
              {settings.rsvp_deadline && (
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" /> RSVP by {format(new Date(settings.rsvp_deadline), 'PPp')}
                </div>
              )}
              {settings.max_seats && (
                <div className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" /> {settings.max_seats} seats
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Description */}
        {event.description && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Description</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{event.description}</p>
            </CardContent>
          </Card>
        )}

        {/* Responses Table */}
        {isEvent && responses.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Responses ({responses.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {responses.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                    <div>
                      <p className="text-sm font-medium">{r.profiles?.display_name || r.profiles?.email || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">{r.profiles?.role}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.note && <span className="text-xs text-muted-foreground italic">"{r.note}"</span>}
                      <Badge className={cn(
                        "rounded-full text-xs",
                        r.response === 'join' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        r.response === 'not_join' ? 'bg-destructive/10 text-destructive' :
                        'bg-muted text-muted-foreground'
                      )}>
                        {r.response === 'join' ? '✓ Joining' : r.response === 'not_join' ? '✗ Declined' : '? Maybe'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Audience Rules */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Audience Rules</CardTitle></CardHeader>
          <CardContent>
            {event.event_audience_rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No audience rules defined</p>
            ) : (
              <div className="space-y-2">
                {event.event_audience_rules.map(rule => (
                  <div key={rule.id} className="flex items-center gap-2 text-sm">
                    <Badge variant={rule.rule_type === 'include' ? 'default' : 'destructive'} className="text-xs rounded-full">
                      {rule.rule_type}
                    </Badge>
                    <span className="capitalize">{rule.audience_type}</span>
                    {rule.audience_value && <span className="text-muted-foreground">= {rule.audience_value}</span>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
