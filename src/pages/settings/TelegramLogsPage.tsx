import { AppLayout } from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { useTelegramLogs } from '@/hooks/useTelegram';

export default function TelegramLogsPage() {
  const { data: logs = [], isLoading } = useTelegramLogs(100);

  return (
    <AppLayout>
      <div className="space-y-5 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" asChild>
            <Link to="/settings/telegram"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Notification History
            </h1>
            <p className="text-sm text-muted-foreground">
              Log of all Telegram notifications sent to your account
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : logs.length === 0 ? (
          <Card className="rounded-2xl p-8 text-center">
            <Clock className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No notifications sent yet</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {logs.map(log => (
              <Card key={log.id} className="rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {log.status === 'success' ? (
                      <div className="h-7 w-7 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center shrink-0 mt-0.5">
                        <CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                      </div>
                    ) : (
                      <div className="h-7 w-7 rounded-full bg-destructive/10 flex items-center justify-center shrink-0 mt-0.5">
                        <XCircle className="h-3.5 w-3.5 text-destructive" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${log.status === 'success'
                            ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
                            : 'bg-destructive/10 text-destructive border-destructive/20'}`}
                        >
                          {log.status === 'success' ? 'Sent' : 'Failed'}
                        </Badge>
                        <span className="text-xs text-muted-foreground capitalize">
                          {(log.notification_type || 'unknown').replace(/_/g, ' ')}
                        </span>
                      </div>
                      {log.chat_id && (
                        <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                          Chat ID: {log.chat_id}
                        </p>
                      )}
                      {log.error_message && (
                        <p className="text-xs text-destructive mt-1.5 break-words">
                          {log.error_message}
                        </p>
                      )}
                      {log.message_preview && (
                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 break-words">
                          {log.message_preview}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                    {format(new Date(log.sent_at), 'dd MMM HH:mm')}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
