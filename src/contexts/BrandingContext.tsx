import { createContext, useContext, useEffect, useMemo, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import capybaraHeroFallback from '@/assets/capybara-hero.png';

/* ─── Types ──────────────────────────────────────────────────────── */
export interface BrandingConfig {
  appName: string;
  appShortName: string;
  tagline: string;
  logoUrl: string;
  logoSmallUrl: string;
  faviconUrl: string;
  favicon32Url: string;
  favicon16Url: string;
  appleTouchIconUrl: string;
  pwaIcon192Url: string;
  pwaIcon512Url: string;
  themeColor: string;
}

interface BrandingContextValue {
  branding: BrandingConfig;
  loading: boolean;
  refetch: () => void;
}

const DEFAULTS: BrandingConfig = {
  appName: 'Tomu Pro',
  appShortName: 'Tomu Pro',
  tagline: 'AI Delivery Solution',
  logoUrl: capybaraHeroFallback,
  logoSmallUrl: capybaraHeroFallback,
  faviconUrl: '/favicon.ico',
  favicon32Url: '/favicon-32x32.png',
  favicon16Url: '/favicon-16x16.png',
  appleTouchIconUrl: '/apple-touch-icon.png',
  pwaIcon192Url: '/icon-192x192.png',
  pwaIcon512Url: '/icon-512x512.png',
  themeColor: '#1a2744',
};

const LS_KEY = 'app-branding';

function loadCached(): BrandingConfig {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULTS;
}

/* ─── Context ────────────────────────────────────────────────────── */
const BrandingContext = createContext<BrandingContextValue>({
  branding: DEFAULTS,
  loading: true,
  refetch: () => {},
});

export function useBranding() {
  return useContext(BrandingContext);
}

/* ─── Side Effects ───────────────────────────────────────────────── */
function applyBrandingSideEffects(b: BrandingConfig) {
  // Document title
  document.title = b.appName;

  // Favicons
  const setLink = (sel: string, url: string) => {
    const el = document.querySelector(sel) as HTMLLinkElement | null;
    if (el) el.href = url;
  };
  setLink('link[rel="icon"][sizes="32x32"]', b.favicon32Url);
  setLink('link[rel="icon"][sizes="16x16"]', b.favicon16Url);
  setLink('link[rel="apple-touch-icon"]', b.appleTouchIconUrl);

  // Theme color
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', b.themeColor);
  document.querySelector('meta[name="msapplication-TileColor"]')?.setAttribute('content', b.themeColor);

  // Dynamic PWA manifest
  const manifest = {
    name: b.appName,
    short_name: b.appShortName,
    description: `${b.appName} - ${b.tagline}`,
    start_url: '/',
    display: 'standalone',
    background_color: b.themeColor,
    theme_color: b.themeColor,
    orientation: 'portrait-primary',
    icons: [
      { src: b.pwaIcon192Url, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: b.pwaIcon512Url, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      { src: b.appleTouchIconUrl, sizes: '180x180', type: 'image/png' },
    ],
  };

  const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
  if (manifestLink) {
    const oldHref = manifestLink.getAttribute('href');
    if (oldHref?.startsWith('blob:')) URL.revokeObjectURL(oldHref);
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    manifestLink.href = URL.createObjectURL(blob);
  }
}

/* ─── Provider ───────────────────────────────────────────────────── */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data: dbRow, isLoading } = useQuery({
    queryKey: ['app-branding'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('app_branding' as any)
          .select('*')
          .limit(1)
          .single();
        if (error) {
          // Silently fall back — don't spam console in production
          if (import.meta.env.DEV) console.warn('[Branding] DB fetch skipped:', error.message);
          return null;
        }
        return data as Record<string, any>;
      } catch {
        // Network error / offline — silently use cached defaults
        return null;
      }
    },
    staleTime: 30 * 60 * 1000, // 30 minutes — prevents repeated fetches
    gcTime: 60 * 60 * 1000,    // 1 hour garbage collection
    retry: false,               // Never retry — use cached/defaults instead
    refetchOnWindowFocus: false, // Don't refetch on tab focus
    refetchOnReconnect: false,   // Don't refetch on network reconnect
  });

  const branding = useMemo<BrandingConfig>(() => {
    if (!dbRow) return loadCached();

    const ts = dbRow.updated_at ? `?v=${new Date(dbRow.updated_at).getTime()}` : '';
    const config: BrandingConfig = {
      appName: dbRow.app_name || DEFAULTS.appName,
      appShortName: dbRow.app_short_name || DEFAULTS.appShortName,
      tagline: dbRow.tagline || DEFAULTS.tagline,
      logoUrl: dbRow.logo_url ? `${dbRow.logo_url}${ts}` : DEFAULTS.logoUrl,
      logoSmallUrl: dbRow.logo_small_url ? `${dbRow.logo_small_url}${ts}` : DEFAULTS.logoSmallUrl,
      faviconUrl: dbRow.favicon_url ? `${dbRow.favicon_url}${ts}` : DEFAULTS.faviconUrl,
      favicon32Url: dbRow.favicon_32_url ? `${dbRow.favicon_32_url}${ts}` : DEFAULTS.favicon32Url,
      favicon16Url: dbRow.favicon_16_url ? `${dbRow.favicon_16_url}${ts}` : DEFAULTS.favicon16Url,
      appleTouchIconUrl: dbRow.apple_touch_icon_url ? `${dbRow.apple_touch_icon_url}${ts}` : DEFAULTS.appleTouchIconUrl,
      pwaIcon192Url: dbRow.pwa_icon_192_url ? `${dbRow.pwa_icon_192_url}${ts}` : DEFAULTS.pwaIcon192Url,
      pwaIcon512Url: dbRow.pwa_icon_512_url ? `${dbRow.pwa_icon_512_url}${ts}` : DEFAULTS.pwaIcon512Url,
      themeColor: dbRow.theme_color || DEFAULTS.themeColor,
    };

    // Persist to localStorage for next instant load
    try { localStorage.setItem(LS_KEY, JSON.stringify(config)); } catch { /* ignore */ }

    return config;
  }, [dbRow]);

  // Apply DOM side effects
  useEffect(() => {
    applyBrandingSideEffects(branding);
  }, [branding]);

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['app-branding'] });
  };

  const value = useMemo<BrandingContextValue>(
    () => ({ branding, loading: isLoading, refetch }),
    [branding, isLoading]
  );

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}
