
-- Events table
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'announcement' CHECK (type IN ('event', 'announcement')),
  title text NOT NULL,
  subtitle text,
  description text,
  cover_image_url text,
  thumbnail_image_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived', 'expired')),
  publish_at timestamptz,
  end_at timestamptz,
  expire_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Event settings table
CREATE TABLE public.event_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL UNIQUE,
  show_as_popup boolean NOT NULL DEFAULT true,
  show_on_dashboard boolean NOT NULL DEFAULT true,
  show_in_notification_center boolean NOT NULL DEFAULT true,
  show_on_mobile boolean NOT NULL DEFAULT true,
  require_response boolean NOT NULL DEFAULT false,
  response_type text DEFAULT 'rsvp',
  allow_maybe boolean NOT NULL DEFAULT true,
  dismissible boolean NOT NULL DEFAULT true,
  force_acknowledge boolean NOT NULL DEFAULT false,
  show_frequency text NOT NULL DEFAULT 'once' CHECK (show_frequency IN ('once', 'every_login', 'until_dismissed')),
  max_seats integer,
  rsvp_deadline timestamptz,
  event_location text,
  event_start_at timestamptz,
  event_end_at timestamptz
);

-- Event audience rules
CREATE TABLE public.event_audience_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  audience_type text NOT NULL CHECK (audience_type IN ('all', 'role', 'user', 'team', 'area', 'manager_group')),
  audience_value text,
  rule_type text NOT NULL DEFAULT 'include' CHECK (rule_type IN ('include', 'exclude')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Event user delivery tracking
CREATE TABLE public.event_user_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) NOT NULL,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz,
  dismissed_at timestamptz,
  popup_shown_count integer NOT NULL DEFAULT 0,
  last_popup_shown_at timestamptz,
  current_status text NOT NULL DEFAULT 'delivered' CHECK (current_status IN ('delivered', 'seen', 'dismissed', 'acknowledged')),
  UNIQUE(event_id, user_id)
);

-- Event responses (RSVP)
CREATE TABLE public.event_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) NOT NULL,
  response text NOT NULL CHECK (response IN ('join', 'not_join', 'maybe')),
  responded_at timestamptz NOT NULL DEFAULT now(),
  note text,
  UNIQUE(event_id, user_id)
);

-- Indexes
CREATE INDEX idx_events_status ON public.events(status);
CREATE INDEX idx_events_type ON public.events(type);
CREATE INDEX idx_events_publish_at ON public.events(publish_at);
CREATE INDEX idx_event_audience_rules_event_id ON public.event_audience_rules(event_id);
CREATE INDEX idx_event_user_delivery_user_id ON public.event_user_delivery(user_id);
CREATE INDEX idx_event_user_delivery_event_id ON public.event_user_delivery(event_id);
CREATE INDEX idx_event_responses_event_id ON public.event_responses(event_id);
CREATE INDEX idx_event_responses_user_id ON public.event_responses(user_id);

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_audience_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_user_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_responses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for events
CREATE POLICY "Admins can manage events" ON public.events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view published events delivered to them" ON public.events
  FOR SELECT TO authenticated
  USING (
    status = 'published' AND (
      publish_at IS NULL OR publish_at <= now()
    ) AND (
      expire_at IS NULL OR expire_at > now()
    ) AND EXISTS (
      SELECT 1 FROM public.event_user_delivery eud
      WHERE eud.event_id = events.id AND eud.user_id = auth.uid()
    )
  );

-- RLS for event_settings
CREATE POLICY "Admins can manage event_settings" ON public.event_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view settings for their events" ON public.event_settings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_user_delivery eud
      WHERE eud.event_id = event_settings.event_id AND eud.user_id = auth.uid()
    )
  );

-- RLS for event_audience_rules
CREATE POLICY "Admins can manage audience rules" ON public.event_audience_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS for event_user_delivery
CREATE POLICY "Admins can manage delivery" ON public.event_user_delivery
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own delivery" ON public.event_user_delivery
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own delivery" ON public.event_user_delivery
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RLS for event_responses
CREATE POLICY "Admins can view all responses" ON public.event_responses
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can manage own responses" ON public.event_responses
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Updated_at trigger for events
CREATE OR REPLACE FUNCTION public.update_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_events_updated_at();
