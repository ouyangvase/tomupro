import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Calendar, Megaphone, Upload, ArrowLeft, Plus, X, Users, Send, Save,
  MapPin, Clock, Image as ImageIcon
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCreateEvent, uploadEventImage } from '@/hooks/useEvents';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface AudienceRule {
  audience_type: string;
  audience_value: string;
  rule_type: 'include' | 'exclude';
}

export default function EventCreate() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const createEvent = useCreateEvent();

  // Event fields
  const [type, setType] = useState<'event' | 'announcement'>('announcement');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [description, setDescription] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  // Settings
  const [showAsPopup, setShowAsPopup] = useState(true);
  const [showOnDashboard, setShowOnDashboard] = useState(true);
  const [showInNotificationCenter, setShowInNotificationCenter] = useState(true);
  const [showOnMobile, setShowOnMobile] = useState(true);
  const [dismissible, setDismissible] = useState(true);
  const [forceAcknowledge, setForceAcknowledge] = useState(false);
  const [showFrequency, setShowFrequency] = useState('once');
  const [requireResponse, setRequireResponse] = useState(false);
  const [allowMaybe, setAllowMaybe] = useState(true);

  // Event-specific
  const [eventStartAt, setEventStartAt] = useState('');
  const [eventEndAt, setEventEndAt] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [rsvpDeadline, setRsvpDeadline] = useState('');
  const [maxSeats, setMaxSeats] = useState('');

  // Schedule
  const [publishNow, setPublishNow] = useState(true);
  const [publishAt, setPublishAt] = useState('');
  const [expireAt, setExpireAt] = useState('');

  // Audience
  const [audienceRules, setAudienceRules] = useState<AudienceRule[]>([
    { audience_type: 'all', audience_value: '', rule_type: 'include' }
  ]);

  const addAudienceRule = () => {
    setAudienceRules(prev => [...prev, { audience_type: 'role', audience_value: '', rule_type: 'include' }]);
  };

  const removeAudienceRule = (index: number) => {
    setAudienceRules(prev => prev.filter((_, i) => i !== index));
  };

  const updateAudienceRule = (index: number, field: keyof AudienceRule, value: string) => {
    setAudienceRules(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }
    try {
      setUploading(true);
      const url = await uploadEventImage(file);
      setCoverImageUrl(url);
      toast.success('Image uploaded');
    } catch (err: any) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (asDraft: boolean) => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!user) return;

    const eventPayload = {
      type,
      title: title.trim(),
      subtitle: subtitle.trim() || null,
      description: description.trim() || null,
      cover_image_url: coverImageUrl || null,
      status: asDraft ? 'draft' : 'published',
      publish_at: asDraft ? null : (publishNow ? new Date().toISOString() : publishAt || null),
      expire_at: expireAt || null,
      created_by: user.id,
    };

    const settingsPayload = {
      show_as_popup: showAsPopup,
      show_on_dashboard: showOnDashboard,
      show_in_notification_center: showInNotificationCenter,
      show_on_mobile: showOnMobile,
      require_response: type === 'event' ? requireResponse : false,
      response_type: type === 'event' ? 'rsvp' : null,
      allow_maybe: allowMaybe,
      dismissible,
      force_acknowledge: forceAcknowledge,
      show_frequency: showFrequency,
      max_seats: maxSeats ? parseInt(maxSeats) : null,
      rsvp_deadline: rsvpDeadline || null,
      event_location: eventLocation || null,
      event_start_at: eventStartAt || null,
      event_end_at: eventEndAt || null,
    };

    await createEvent.mutateAsync({
      event: eventPayload,
      settings: settingsPayload,
      audienceRules: audienceRules.filter(r => r.audience_type === 'all' || r.audience_value),
    });
    navigate('/admin/events');
  };

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6 pb-12">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/events')} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Create Event</h1>
            <p className="text-sm text-muted-foreground">Set up a new event or announcement</p>
          </div>
        </div>

        {/* Type Selector */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: 'event' as const, label: 'Event', desc: 'Users can RSVP', icon: Calendar },
            { value: 'announcement' as const, label: 'Announcement', desc: 'Read-only update', icon: Megaphone },
          ].map(t => (
            <button
              key={t.value}
              onClick={() => setType(t.value)}
              className={cn(
                "p-4 rounded-xl border-2 text-left transition-all",
                type === t.value
                  ? "border-primary bg-primary/5"
                  : "border-border/60 hover:border-border"
              )}
            >
              <t.icon className={cn("h-5 w-5 mb-2", type === t.value ? "text-primary" : "text-muted-foreground")} />
              <p className="font-medium text-sm">{t.label}</p>
              <p className="text-xs text-muted-foreground">{t.desc}</p>
            </button>
          ))}
        </div>

        {/* Basic Info */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Basic Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Enter title..." className="mt-1" maxLength={200} />
            </div>
            <div>
              <Label>Subtitle</Label>
              <Input value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="Optional subtitle..." className="mt-1" maxLength={300} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Write description..." className="mt-1 min-h-[120px]" maxLength={5000} />
            </div>
            <div>
              <Label>Cover Image</Label>
              <div className="mt-1">
                {coverImageUrl ? (
                  <div className="relative rounded-xl overflow-hidden h-48">
                    <img src={coverImageUrl} alt="Cover" className="w-full h-full object-cover" />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-7 w-7 rounded-full"
                      onClick={() => setCoverImageUrl('')}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-xl cursor-pointer hover:border-primary/40 transition-colors">
                    {uploading ? (
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    ) : (
                      <>
                        <ImageIcon className="h-8 w-8 text-muted-foreground/40 mb-2" />
                        <p className="text-xs text-muted-foreground">Click to upload (max 5MB)</p>
                      </>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
                  </label>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Event Details (only for events) */}
        {type === 'event' && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" /> Event Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Start Date & Time</Label>
                  <Input type="datetime-local" value={eventStartAt} onChange={e => setEventStartAt(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>End Date & Time</Label>
                  <Input type="datetime-local" value={eventEndAt} onChange={e => setEventEndAt(e.target.value)} className="mt-1" />
                </div>
              </div>
              <div>
                <Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Location</Label>
                <Input value={eventLocation} onChange={e => setEventLocation(e.target.value)} placeholder="e.g. Office HQ, Zoom link..." className="mt-1" maxLength={300} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>RSVP Deadline</Label>
                  <Input type="datetime-local" value={rsvpDeadline} onChange={e => setRsvpDeadline(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Max Seats (optional)</Label>
                  <Input type="number" value={maxSeats} onChange={e => setMaxSeats(e.target.value)} placeholder="Unlimited" className="mt-1" min={1} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Allow "Maybe" response</p>
                  <p className="text-xs text-muted-foreground">Users can choose Join, Not Join, or Maybe</p>
                </div>
                <Switch checked={allowMaybe} onCheckedChange={setAllowMaybe} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Display Settings */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Display Settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: 'Show as popup', desc: 'Display as modal overlay', checked: showAsPopup, onChange: setShowAsPopup },
              { label: 'Show on dashboard', desc: 'Display as dashboard card', checked: showOnDashboard, onChange: setShowOnDashboard },
              { label: 'Show in notification center', desc: 'Add to notification feed', checked: showInNotificationCenter, onChange: setShowInNotificationCenter },
              { label: 'Show on mobile', desc: 'Visible on mobile devices', checked: showOnMobile, onChange: setShowOnMobile },
              { label: 'Dismissible', desc: 'Users can dismiss the popup', checked: dismissible, onChange: setDismissible },
              { label: 'Force acknowledge', desc: 'Users must acknowledge before dismissing', checked: forceAcknowledge, onChange: setForceAcknowledge },
            ].map(setting => (
              <div key={setting.label} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{setting.label}</p>
                  <p className="text-xs text-muted-foreground">{setting.desc}</p>
                </div>
                <Switch checked={setting.checked} onCheckedChange={setting.onChange} />
              </div>
            ))}
            <div>
              <Label>Show frequency</Label>
              <Select value={showFrequency} onValueChange={setShowFrequency}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">Show once</SelectItem>
                  <SelectItem value="every_login">Every login</SelectItem>
                  <SelectItem value="until_dismissed">Until dismissed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Audience Targeting */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Audience Targeting</CardTitle>
              <Button variant="outline" size="sm" onClick={addAudienceRule} className="rounded-full gap-1 h-7 text-xs">
                <Plus className="h-3 w-3" /> Add Rule
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {audienceRules.map((rule, index) => (
              <div key={index} className="flex items-center gap-2 p-3 rounded-xl bg-muted/30 border border-border/40">
                <Select value={rule.rule_type} onValueChange={v => updateAudienceRule(index, 'rule_type', v)}>
                  <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="include">Include</SelectItem>
                    <SelectItem value="exclude">Exclude</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={rule.audience_type} onValueChange={v => updateAudienceRule(index, 'audience_type', v)}>
                  <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    <SelectItem value="role">By Role</SelectItem>
                    <SelectItem value="user">Specific User</SelectItem>
                    <SelectItem value="manager_group">Manager Group</SelectItem>
                    <SelectItem value="area">Area / District</SelectItem>
                  </SelectContent>
                </Select>
                {rule.audience_type !== 'all' && (
                  rule.audience_type === 'role' ? (
                    <Select value={rule.audience_value} onValueChange={v => updateAudienceRule(index, 'audience_value', v)}>
                      <SelectTrigger className="flex-1 h-8 text-xs"><SelectValue placeholder="Select role..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="salesperson">Salesperson</SelectItem>
                        <SelectItem value="runner">Runner</SelectItem>
                        <SelectItem value="driver">Driver</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={rule.audience_value}
                      onChange={e => updateAudienceRule(index, 'audience_value', e.target.value)}
                      placeholder={rule.audience_type === 'user' ? 'User ID...' : rule.audience_type === 'area' ? 'Area name...' : 'Group ID...'}
                      className="flex-1 h-8 text-xs"
                      maxLength={200}
                    />
                  )
                )}
                {audienceRules.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeAudienceRule(index)}>
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Schedule */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Schedule</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Publish immediately</p>
                <p className="text-xs text-muted-foreground">Or schedule for later</p>
              </div>
              <Switch checked={publishNow} onCheckedChange={setPublishNow} />
            </div>
            {!publishNow && (
              <div>
                <Label>Publish Date & Time</Label>
                <Input type="datetime-local" value={publishAt} onChange={e => setPublishAt(e.target.value)} className="mt-1" />
              </div>
            )}
            <div>
              <Label>Expire Date & Time (optional)</Label>
              <Input type="datetime-local" value={expireAt} onChange={e => setExpireAt(e.target.value)} className="mt-1" />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center gap-3 justify-end">
          <Button variant="outline" onClick={() => navigate('/admin/events')} className="rounded-full">
            Cancel
          </Button>
          <Button variant="outline" onClick={() => handleSubmit(true)} disabled={createEvent.isPending} className="rounded-full gap-2">
            <Save className="h-4 w-4" /> Save as Draft
          </Button>
          <Button onClick={() => handleSubmit(false)} disabled={createEvent.isPending} className="rounded-full gap-2">
            <Send className="h-4 w-4" /> Publish & Deliver
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
