import { useBranding } from '@/contexts/BrandingContext';
import { cn } from '@/lib/utils';

interface AppNameProps {
  highlight?: boolean;
  className?: string;
  /** Override the accent class for the highlighted portion */
  accentClass?: string;
}

/**
 * Renders the dynamic app name.
 * When `highlight` is true, splits the name into base + last word,
 * highlighting the last word with accent color (preserving the "TOMU**PRO**" pattern).
 */
export function AppName({ highlight = false, className, accentClass = 'text-primary' }: AppNameProps) {
  const { branding } = useBranding();
  const name = branding.appName;

  if (!highlight) {
    return <span className={className}>{name}</span>;
  }

  // Split at last uppercase transition or last space
  const parts = name.match(/^(.+?)([A-Z][a-z]*|[A-Z]+|\s\S+)$/);
  if (parts && parts.length >= 3) {
    const base = parts[1];
    const accent = parts[2].trim();
    return (
      <span className={className}>
        {base}<span className={accentClass}>{accent}</span>
      </span>
    );
  }

  // Fallback: no split possible, just render the name
  return <span className={className}>{name}</span>;
}
