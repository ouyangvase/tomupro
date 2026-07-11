import { useBranding } from '@/contexts/BrandingContext';
import { cn } from '@/lib/utils';

interface AppLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  xs: 'h-7 w-7',
  sm: 'h-9 w-9',
  md: 'h-14 w-14',
  lg: 'h-20 w-20',
};

export function AppLogo({ size = 'sm', className }: AppLogoProps) {
  const { branding } = useBranding();
  const src = size === 'xs' ? branding.logoSmallUrl : branding.logoUrl;

  return (
    <img
      src={src}
      alt={branding.appName}
      className={cn(sizeMap[size], 'object-contain', className)}
    />
  );
}
