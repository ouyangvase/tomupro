import { useBranding } from '@/contexts/BrandingContext';
import { cn } from '@/lib/utils';

interface AppLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  xs: 'h-7 w-7 object-contain',
  sm: 'h-9 w-28 object-cover',
  md: 'h-14 w-14 object-contain',
  lg: 'h-20 w-64 object-contain',
};

export function AppLogo({ size = 'sm', className }: AppLogoProps) {
  const { branding } = useBranding();
  const src = {
    xs: branding.logoSmallUrl,
    sm: branding.logoUrl,
    md: branding.logoStackedUrl,
    lg: branding.logoDisplayUrl,
  }[size];

  return (
    <img
      src={src}
      alt={branding.appName}
      className={cn(sizeMap[size], className)}
    />
  );
}
