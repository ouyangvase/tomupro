import { useSearchParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Search, ArrowLeft } from 'lucide-react';

export default function OrderNotFound() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const refId = searchParams.get('ref') || 'Unknown';

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto mt-12">
        <Card>
          <CardContent className="py-12 flex flex-col items-center text-center space-y-4">
            <div className="h-14 w-14 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <AlertTriangle className="h-7 w-7 text-amber-600" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-semibold">Order Record Not Found</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                This notification exists but the order record could not be found. It may have been deleted, or you may not have access to the order owner.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-muted/60 border border-border/40 text-xs font-mono text-muted-foreground w-full text-left">
              <div><span className="text-foreground/60">Reference ID:</span> {refId}</div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/orders')}
                className="gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Go to Orders
              </Button>
              <Button
                size="sm"
                onClick={() => navigate('/notifications')}
                className="gap-1.5"
              >
                <Search className="h-3.5 w-3.5" />
                Back to Notifications
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
