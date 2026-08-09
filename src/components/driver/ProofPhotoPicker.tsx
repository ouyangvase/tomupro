import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Camera, Image as ImageIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProofPhotoPickerProps {
  label: string;
  preview?: string | null;
  previews?: string[];
  onFileChange?: (file: File | null) => void;
  onFilesChange?: (files: File[]) => void;
  onRemoveFile?: (index: number) => void;
  multiple?: boolean;
  disabled?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  helperText?: string;
  className?: string;
}

export function ProofPhotoPicker({
  label,
  preview,
  previews,
  onFileChange,
  onFilesChange,
  onRemoveFile,
  multiple = false,
  disabled = false,
  emptyTitle = 'Take photo or choose from album',
  emptyDescription = 'Camera or photo library. Full-size photos are compressed before upload.',
  helperText,
  className,
}: ProofPhotoPickerProps) {
  const inputId = useId();
  const previewList = previews ?? (preview ? [preview] : []);

  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </Label>

      {previewList.length > 0 ? (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            {previewList.map((previewUrl, index) => (
              <div key={`${previewUrl}-${index}`} className="relative overflow-hidden rounded-xl border bg-secondary/30">
                <img
                  src={previewUrl}
                  alt={`${label} preview ${index + 1}`}
                  className="h-44 w-full object-contain"
                  decoding="async"
                  loading="lazy"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute right-2 top-2 h-8 w-8 rounded-full"
                  onClick={() => {
                    if (multiple) onRemoveFile?.(index);
                    else onFileChange?.(null);
                  }}
                  disabled={disabled}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          {multiple && (
            <Label
              htmlFor={inputId}
              className={cn(
                'flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 p-3 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary/5',
                disabled && 'pointer-events-none opacity-60',
              )}
            >
              <Camera className="h-4 w-4" />
              Add more photos
            </Label>
          )}
        </div>
      ) : (
        <Label
          htmlFor={inputId}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border/60 p-5 text-center transition-colors hover:border-primary/40 hover:bg-primary/5',
            disabled && 'pointer-events-none opacity-60',
          )}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Camera className="h-5 w-5" />
          </span>
          <span className="text-sm font-medium">{emptyTitle}</span>
          <span className="text-xs text-muted-foreground">{emptyDescription}</span>
        </Label>
      )}

      <input
        id={inputId}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="sr-only"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (multiple) {
            onFilesChange?.(files);
          } else {
            onFileChange?.(files[0] ?? null);
          }
          event.currentTarget.value = '';
        }}
        disabled={disabled}
      />

      {helperText && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ImageIcon className="h-3.5 w-3.5" />
          {helperText}
        </div>
      )}
    </div>
  );
}
