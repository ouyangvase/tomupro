import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, RefreshCw } from 'lucide-react';

interface SyncNowButtonProps {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'icon';
  className?: string;
  showLabel?: boolean;
}

export function SyncNowButton({
  variant = 'outline',
  size = 'sm',
  className = '',
  showLabel = true,
}: SyncNowButtonProps) {
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-google-sheet', {
        body: { manual: true },
      });

      if (error) {
        toast.error(`Sync error: ${error.message}`);
      } else if (data?.success) {
        toast.success(
          `Google Sheet synced! Active: ${data.active}, Delivered: ${data.delivered}, Failed: ${data.failed}`
        );
      } else if (data?.skipped) {
        toast.info(`Sync skipped: ${data.reason}`);
      } else {
        toast.error(`Sync failed: ${data?.error || 'Unknown error'}`);
      }
    } catch (err) {
      toast.error(`Sync error: ${err instanceof Error ? err.message : String(err)}`);
    }
    setSyncing(false);
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleSync}
      disabled={syncing}
      className={`gap-2 ${className}`}
    >
      {syncing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4" />
      )}
      {showLabel && (syncing ? 'Syncing...' : 'Sync Sheet')}
    </Button>
  );
}
