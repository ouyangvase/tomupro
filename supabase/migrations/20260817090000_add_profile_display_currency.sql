-- Store the currency code shown to each user. This is presentation-only;
-- stored order and financial amounts remain unchanged.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_currency TEXT NOT NULL DEFAULT 'BND';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_display_currency_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_currency_check
  CHECK (display_currency IN ('BND', 'MYR'));

COMMENT ON COLUMN public.profiles.display_currency IS
  'Per-user display currency code. UI-only label; no amount conversion is performed.';
