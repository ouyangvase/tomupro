import { useEffect, useState } from 'react';
import { ExternalLink, FolderOpen, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAdminDocumentDrive } from '@/hooks/useAdminDocumentDrive';
import { validateDocumentDriveUrl } from '@/lib/adminDocumentDrive';

export function AdminDocumentDriveCard() {
  const { driveUrl, isLoading, isSaving, save } = useAdminDocumentDrive();
  const [isEditing, setIsEditing] = useState(false);
  const [draftUrl, setDraftUrl] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (isEditing) setDraftUrl(driveUrl || '');
  }, [driveUrl, isEditing]);

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const error = validateDocumentDriveUrl(draftUrl);
    setValidationError(error);
    if (error) return;

    try {
      await save(draftUrl);
      setIsEditing(false);
      toast.success('Document storage link updated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update the document link.');
    }
  };

  return (
    <>
      <Card className="border-primary/20 bg-primary/[0.02]" data-testid="admin-document-drive-card">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">TOMUPRO Documents</h2>
                <Badge variant="outline" className="text-[10px]">Admin only</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Company Drive</p>
              <p className="mt-1 text-xs text-muted-foreground">Internal files, SOPs and reference documents.</p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Button asChild size="sm" variant="outline" disabled={isLoading || !driveUrl}>
              <a
                href={driveUrl || undefined}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="admin-document-drive-open"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open Drive
              </a>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isLoading || isSaving}
              onClick={() => setIsEditing(true)}
              data-testid="admin-document-drive-edit"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit Link
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Document Storage Link</DialogTitle>
            <DialogDescription>Update the private TOMUPRO document folder URL.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Input
                value={draftUrl}
                onChange={(event) => {
                  setDraftUrl(event.target.value);
                  setValidationError(null);
                }}
                placeholder="https://..."
                type="url"
                autoFocus
                aria-label="Document storage URL"
                data-testid="admin-document-drive-input"
              />
              {validationError && <p className="text-xs text-destructive">{validationError}</p>}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
              <Button type="submit" disabled={isSaving}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
