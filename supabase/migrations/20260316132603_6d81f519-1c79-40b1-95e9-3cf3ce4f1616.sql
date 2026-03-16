
-- User guide progress tracking
CREATE TABLE public.user_guide_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  guide_id TEXT NOT NULL,
  current_step INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  last_viewed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, guide_id)
);

-- Onboarding sessions
CREATE TABLE public.onboarding_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  skipped_at TIMESTAMPTZ,
  status TEXT DEFAULT 'in_progress',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_guide_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only access their own progress
CREATE POLICY "Users can view own guide progress"
  ON public.user_guide_progress FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own guide progress"
  ON public.user_guide_progress FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own guide progress"
  ON public.user_guide_progress FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can only access their own onboarding
CREATE POLICY "Users can view own onboarding"
  ON public.onboarding_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own onboarding"
  ON public.onboarding_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own onboarding"
  ON public.onboarding_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);
