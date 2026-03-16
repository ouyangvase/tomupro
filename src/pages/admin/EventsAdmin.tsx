import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Plus, Calendar, Megaphone, Eye, Users, BarChart3, 
  CheckCircle, Clock, Archive, MoreVertical, Send
} from 'lucide-react';
import { useAdminEvents, usePublishEvent, useDeleteEvent, type EventWithDetails } from '@/hooks/useEvents';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import capybaraAdmin from '@/assets/capybara-admin.png';

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  draft: { label: 'Draft', color: 'bg-muted text-muted-foreground', icon: Clock },
  published: { label: 'Published', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle },
  archived: { label: 'Archived', color: 'bg-muted text-muted-foreground', icon: Archive },
  expired: { label: 'Expired', color: 'bg-destructive/10 text-destructive', icon: Clock },
};

export default function EventsAdmin() {
  const { data: events = [], isLoading } = useAdminEvents();
  const publishEvent = usePublishEvent();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'event' | 'announcement'>('all');

  const filtered = events.filter(e => filter === 'all' || e.type === filter);
  const draftCount = events.filter(e => e.status === 'draft').length;
  const publishedCount = events.filter(e => e.status === 'published').length;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6 pb-12">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Events & Announcements</h1>
            <p className="text-muted-foreground mt-1">Create and manage events, announcements, and popups</p>
          </div>
          <Button onClick={() => navigate('/admin/events/create')} className="rounded-full gap-2">
            <Plus className="h-4 w-4" />
            Create New
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-border/60">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Megaphone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{events.length}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-primary/20 bg-primary/[0.03]">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{publishedCount}</p>
                <p className="text-xs text-muted-foreground">Published</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                <Clock className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{draftCount}</p>
                <p className="text-xs text-muted-foreground">Drafts</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2">
          {[
            { value: 'all' as const, label: 'All' },
            { value: 'event' as const, label: 'Events', icon: Calendar },
            { value: 'announcement' as const, label: 'Announcements', icon: Megaphone },
          ].map(tab => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={cn(
                "px-3.5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-1.5",
                filter === tab.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              )}
            >
              {tab.icon && <tab.icon className="h-3.5 w-3.5" />}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Events List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 flex flex-col items-center text-center">
              <img src={capybaraAdmin} alt="No events" className="h-28 w-28 mb-4 opacity-80" />
              <h3 className="text-lg font-semibold">No events yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Create your first event or announcement to get started.</p>
              <Button onClick={() => navigate('/admin/events/create')} className="mt-4 rounded-full gap-2">
                <Plus className="h-4 w-4" /> Create Event
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map(event => {
              const sc = statusConfig[event.status] || statusConfig.draft;
              const settings = event.event_settings?.[0];
              const rulesCount = event.event_audience_rules?.length || 0;

              return (
                <Card key={event.id} className="group hover:shadow-md transition-all cursor-pointer" onClick={() => navigate(`/admin/events/${event.id}`)}>
                  <CardContent className="p-0">
                    <div className="flex">
                      {/* Cover thumbnail */}
                      {event.cover_image_url ? (
                        <div className="w-32 h-28 shrink-0 overflow-hidden rounded-l-xl">
                          <img src={event.cover_image_url} alt="" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-32 h-28 shrink-0 rounded-l-xl bg-muted flex items-center justify-center">
                          {event.type === 'event' ? <Calendar className="h-8 w-8 text-muted-foreground/40" /> : <Megaphone className="h-8 w-8 text-muted-foreground/40" />}
                        </div>
                      )}
                      <div className="flex-1 p-4 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-sm truncate">{event.title}</h3>
                              <Badge variant="outline" className="text-[10px] rounded-full capitalize">
                                {event.type}
                              </Badge>
                              <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", sc.color)}>
                                {sc.label}
                              </span>
                            </div>
                            {event.subtitle && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">{event.subtitle}</p>
                            )}
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/admin/events/${event.id}`); }}>
                                <Eye className="h-4 w-4 mr-2" /> View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/admin/events/${event.id}/analytics`); }}>
                                <BarChart3 className="h-4 w-4 mr-2" /> Analytics
                              </DropdownMenuItem>
                              {event.status === 'draft' && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); publishEvent.mutate(event.id); }}>
                                  <Send className="h-4 w-4 mr-2" /> Publish Now
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(event.created_at), 'MMM d, yyyy')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {rulesCount} audience rule{rulesCount !== 1 ? 's' : ''}
                          </span>
                          {settings?.event_start_at && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(settings.event_start_at), 'MMM d, h:mm a')}
                            </span>
                          )}
                          {settings?.show_as_popup && <Badge variant="outline" className="text-[10px] rounded-full">Popup</Badge>}
                          {settings?.show_on_dashboard && <Badge variant="outline" className="text-[10px] rounded-full">Dashboard</Badge>}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
