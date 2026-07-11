import { useState, useRef, useCallback } from 'react';
import { useBranding } from '@/contexts/BrandingContext';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Palette, Upload, Save, RotateCcw, Loader2, Image, Type, Globe } from 'lucide-react';
import { AppLogo } from '@/components/brand/AppLogo';
import { AppName } from '@/components/brand/AppName';

/* ─── Canvas resize helper ───────────────────────────────────────── */
function resizeImage(file: File, maxSize: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = maxSize;
      canvas.height = maxSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas not supported'));
      ctx.drawImage(img, 0, 0, maxSize, maxSize);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create blob'));
      }, 'image/png');
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

async function uploadBrandingFile(file: File | Blob, path: string): Promise<string | null> {
  const { error } = await supabase.storage
    .from('branding')
    .upload(path, file, { upsert: true, contentType: 'image/png' });
  if (error) {
    console.error('[Branding] Upload error:', error.message);
    return null;
  }
  const { data } = supabase.storage.from('branding').getPublicUrl(path);
  return data.publicUrl;
}

/* ─── Component ──────────────────────────────────────────────────── */
export default function BrandingSettings() {
  const { branding, refetch } = useBranding();
  const { user } = useAuth();
  const { toast } = useToast();

  const [appName, setAppName] = useState(branding.appName);
  const [shortName, setShortName] = useState(branding.appShortName);
  const [tagline, setTagline] = useState(branding.tagline);
  const [themeColor, setThemeColor] = useState(branding.themeColor);
  const [saving, setSaving] = useState(false);

  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  const handleLogoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Invalid file', description: 'Please upload an image file (PNG, JPG, SVG)' });
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }, [toast]);

  const handleFaviconChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Invalid file', description: 'Please upload an image file' });
      return;
    }
    setFaviconFile(file);
    setFaviconPreview(URL.createObjectURL(file));
  }, [toast]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    try {
      const updates: Record<string, any> = {
        app_name: appName.trim() || 'Tomu Pro',
        app_short_name: shortName.trim() || appName.trim() || 'Tomu Pro',
        tagline: tagline.trim() || 'AI Delivery Solution',
        theme_color: themeColor || '#1a2744',
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      };

      // Upload logo if changed
      if (logoFile) {
        const ts = Date.now();
        const logoUrl = await uploadBrandingFile(logoFile, `logo-${ts}.png`);
        if (logoUrl) {
          updates.logo_url = logoUrl;
          updates.logo_small_url = logoUrl;
        }

        // Generate small variant (40px) for sidebar collapsed
        try {
          const smallBlob = await resizeImage(logoFile, 40);
          const smallUrl = await uploadBrandingFile(smallBlob, `logo-small-${ts}.png`);
          if (smallUrl) updates.logo_small_url = smallUrl;
        } catch { /* use full size as fallback */ }
      }

      // Upload favicon if changed
      if (faviconFile) {
        const ts = Date.now();

        // Generate all favicon sizes
        const sizes = [
          { size: 32, field: 'favicon_32_url', path: `favicon-32-${ts}.png` },
          { size: 16, field: 'favicon_16_url', path: `favicon-16-${ts}.png` },
          { size: 180, field: 'apple_touch_icon_url', path: `apple-touch-${ts}.png` },
          { size: 192, field: 'pwa_icon_192_url', path: `pwa-192-${ts}.png` },
          { size: 512, field: 'pwa_icon_512_url', path: `pwa-512-${ts}.png` },
        ];

        // Upload original as main favicon
        const mainUrl = await uploadBrandingFile(faviconFile, `favicon-${ts}.png`);
        if (mainUrl) updates.favicon_url = mainUrl;

        // Generate and upload each size variant
        for (const { size, field, path } of sizes) {
          try {
            const blob = await resizeImage(faviconFile, size);
            const url = await uploadBrandingFile(blob, path);
            if (url) updates[field] = url;
          } catch (err) {
            console.warn(`[Branding] Failed to generate ${size}px icon:`, err);
          }
        }
      }

      // Update the single row in app_branding
      const { error } = await supabase
        .from('app_branding' as any)
        .update(updates)
        .not('id', 'is', null); // Updates the single row

      if (error) throw error;

      toast({ title: 'Branding updated', description: 'Changes will appear across the app immediately.' });
      refetch();

      // Clear file state
      setLogoFile(null);
      setFaviconFile(null);
      setLogoPreview(null);
      setFaviconPreview(null);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to save', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('app_branding' as any)
        .update({
          app_name: 'Tomu Pro',
          app_short_name: 'Tomu Pro',
          tagline: 'AI Delivery Solution',
          logo_url: null,
          logo_small_url: null,
          favicon_url: null,
          favicon_32_url: null,
          favicon_16_url: null,
          apple_touch_icon_url: null,
          pwa_icon_192_url: null,
          pwa_icon_512_url: null,
          theme_color: '#1a2744',
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        })
        .not('id', 'is', null);

      if (error) throw error;

      setAppName('Tomu Pro');
      setShortName('Tomu Pro');
      setTagline('AI Delivery Solution');
      setThemeColor('#1a2744');
      setLogoFile(null);
      setFaviconFile(null);
      setLogoPreview(null);
      setFaviconPreview(null);

      toast({ title: 'Branding reset', description: 'Reverted to default branding.' });
      refetch();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Reset failed', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Live Preview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="h-4 w-4" /> App Branding
          </CardTitle>
          <CardDescription>Customize your app name, logo, and favicon. Changes apply instantly to all users.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-xl border">
            {logoPreview ? (
              <img src={logoPreview} alt="Preview" className="h-10 w-10 object-contain rounded-lg" />
            ) : (
              <AppLogo size="sm" className="rounded-lg" />
            )}
            <div>
              <p className="font-bold text-sm">{appName || 'Tomu Pro'}</p>
              <p className="text-xs text-muted-foreground">{tagline || 'AI Delivery Solution'}</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="h-6 w-6 rounded-full border-2 border-border" style={{ backgroundColor: themeColor }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Text Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Type className="h-4 w-4" /> Name & Text
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="appName" className="text-xs font-medium">App Name</Label>
              <Input id="appName" value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="Tomu Pro" className="h-10" />
              <p className="text-[10px] text-muted-foreground">Displayed in sidebar, browser tab, and PWA</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shortName" className="text-xs font-medium">Short Name</Label>
              <Input id="shortName" value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="Tomu Pro" className="h-10" />
              <p className="text-[10px] text-muted-foreground">Used in PWA home screen icon label</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tagline" className="text-xs font-medium">Tagline</Label>
            <Input id="tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="AI Delivery Solution" className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="themeColor" className="text-xs font-medium">Theme Color</Label>
            <div className="flex items-center gap-3">
              <input type="color" id="themeColor" value={themeColor} onChange={(e) => setThemeColor(e.target.value)} className="h-10 w-12 rounded-lg border border-border cursor-pointer" />
              <Input value={themeColor} onChange={(e) => setThemeColor(e.target.value)} placeholder="#1a2744" className="h-10 font-mono uppercase w-32" />
              <p className="text-[10px] text-muted-foreground">Browser theme & PWA splash</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logo Upload */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Image className="h-4 w-4" /> Logo
          </CardTitle>
          <CardDescription>Upload a square image (PNG or SVG recommended). Used in sidebar, landing page, and login.</CardDescription>
        </CardHeader>
        <CardContent>
          <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-xl bg-muted/50 border-2 border-dashed border-border flex items-center justify-center overflow-hidden">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo preview" className="h-full w-full object-contain" />
              ) : (
                <AppLogo size="md" />
              )}
            </div>
            <div className="space-y-2">
              <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload Logo
              </Button>
              {logoFile && <p className="text-xs text-muted-foreground">{logoFile.name}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Favicon Upload */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4" /> Favicon & PWA Icons
          </CardTitle>
          <CardDescription>Upload a square image (at least 512x512). Auto-generates all required sizes for browser tab, PWA, and Apple devices.</CardDescription>
        </CardHeader>
        <CardContent>
          <input ref={faviconInputRef} type="file" accept="image/*" onChange={handleFaviconChange} className="hidden" />
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-muted/50 border-2 border-dashed border-border flex items-center justify-center overflow-hidden">
              {faviconPreview ? (
                <img src={faviconPreview} alt="Favicon preview" className="h-full w-full object-contain" />
              ) : (
                <img src={branding.faviconUrl} alt="Current favicon" className="h-8 w-8 object-contain" />
              )}
            </div>
            <div className="space-y-2">
              <Button variant="outline" size="sm" onClick={() => faviconInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload Favicon
              </Button>
              {faviconFile && <p className="text-xs text-muted-foreground">{faviconFile.name}</p>}
              <p className="text-[10px] text-muted-foreground">Generates: 16px, 32px, 180px (Apple), 192px, 512px (PWA)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </Button>
        <Button variant="outline" onClick={handleReset} disabled={saving} className="gap-2">
          <RotateCcw className="h-4 w-4" /> Reset to Defaults
        </Button>
      </div>
    </div>
  );
}
