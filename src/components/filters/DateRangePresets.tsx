import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { CalendarDays, ChevronDown, X } from 'lucide-react';
import { 
  startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, 
  subMonths, startOfYear, format 
} from 'date-fns';
import { cn } from '@/lib/utils';
import { getKualaLumpurDateKey } from '@/lib/deliveredOrderReport';

function getKualaLumpurToday() {
  const dateKey = getKualaLumpurDateKey(new Date());
  return dateKey ? new Date(`${dateKey}T12:00:00`) : new Date();
}

export interface DateRange {
  from: Date | null;
  to: Date | null;
  label: string;
}

type PresetKey = 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'lifetime' | 'custom';

const presets: { key: PresetKey; label: string; getRange: () => { from: Date; to: Date } | null }[] = [
  { key: 'today', label: 'Today', getRange: () => { const today = getKualaLumpurToday(); return { from: startOfDay(today), to: endOfDay(today) }; } },
  { key: 'yesterday', label: 'Yesterday', getRange: () => { const yesterday = subDays(getKualaLumpurToday(), 1); return { from: startOfDay(yesterday), to: endOfDay(yesterday) }; } },
  { key: 'last7', label: 'Last 7 Days', getRange: () => { const today = getKualaLumpurToday(); return { from: startOfDay(subDays(today, 6)), to: endOfDay(today) }; } },
  { key: 'thisMonth', label: 'This Month', getRange: () => { const today = getKualaLumpurToday(); return { from: startOfMonth(today), to: endOfDay(today) }; } },
  { key: 'lastMonth', label: 'Last Month', getRange: () => { const lastMonth = subMonths(getKualaLumpurToday(), 1); return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) }; } },
  { key: 'thisYear', label: 'This Year', getRange: () => { const today = getKualaLumpurToday(); return { from: startOfYear(today), to: endOfDay(today) }; } },
  { key: 'lifetime', label: 'Lifetime', getRange: () => null },
];

interface DateRangePresetsProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

export function DateRangePresets({ value, onChange, className }: DateRangePresetsProps) {
  const isMobile = useIsMobile();
  const [activePreset, setActivePreset] = useState<PresetKey>('lifetime');
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [customStep, setCustomStep] = useState<'from' | 'to'>('from');
  const [customMonth, setCustomMonth] = useState(() => getKualaLumpurToday());

  const handlePresetClick = (preset: typeof presets[number]) => {
    setActivePreset(preset.key);
    const range = preset.getRange();
    if (range) {
      onChange({ from: range.from, to: range.to, label: preset.label });
    } else {
      onChange({ from: null, to: null, label: 'Lifetime' });
    }
  };

  const handleCustomApply = () => {
    if (customFrom && customTo && customTo >= customFrom) {
      setActivePreset('custom');
      onChange({
        from: startOfDay(customFrom),
        to: endOfDay(customTo),
        label: `${format(customFrom, 'MMM dd')} - ${format(customTo, 'MMM dd')}`,
      });
      setCustomOpen(false);
    }
  };

  const prepareCustomDraft = () => {
    const nextFrom = value.from || undefined;
    const nextTo = value.to || undefined;
    setCustomFrom(nextFrom);
    setCustomTo(nextTo);
    setCustomStep(nextFrom && !nextTo ? 'to' : 'from');
    setCustomMonth(nextFrom || nextTo || getKualaLumpurToday());
  };

  const handleCustomOpenChange = (open: boolean) => {
    if (open) prepareCustomDraft();
    setCustomOpen(open);
  };

  const handleCustomFromSelect = (date?: Date) => {
    if (!date) return;
    setCustomFrom(date);
    setCustomTo((current) => (current && current < date ? undefined : current));
    setCustomMonth(date);
    setCustomStep('to');
  };

  const handleCustomToSelect = (date?: Date) => {
    if (!date) return;
    setCustomTo(date);
  };

  const customRangeIsValid = Boolean(customFrom && customTo && customTo >= customFrom);
  const customTrigger = (
    <Button
      variant={activePreset === 'custom' ? 'default' : 'outline'}
      size="sm"
      className={cn(
        "h-8 text-xs rounded-full gap-1.5",
        activePreset === 'custom' && "shadow-md"
      )}
    >
      <CalendarDays className="h-3.5 w-3.5" />
      {activePreset === 'custom' ? value.label : 'Custom'}
      <ChevronDown className="h-3 w-3" />
    </Button>
  );

  const handleClear = () => {
    setActivePreset('lifetime');
    onChange({ from: null, to: null, label: 'Lifetime' });
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {/* Preset pills */}
      {presets.map((preset) => (
        <Button
          key={preset.key}
          variant={activePreset === preset.key ? 'default' : 'outline'}
          size="sm"
          onClick={() => handlePresetClick(preset)}
          className={cn(
            "h-8 text-xs rounded-full transition-all",
            activePreset === preset.key 
              ? "shadow-md" 
              : "hover:bg-secondary/80"
          )}
        >
          {preset.label}
        </Button>
      ))}

      {/* Custom date picker */}
      {isMobile ? (
        <Drawer open={customOpen} onOpenChange={handleCustomOpenChange} shouldScaleBackground={false}>
          <DrawerTrigger asChild>{customTrigger}</DrawerTrigger>
          <DrawerContent className="max-h-[calc(100dvh-0.5rem)] min-h-0 overflow-hidden rounded-t-3xl pb-0">
            <DrawerHeader className="px-4 pb-2 pt-2 text-left">
              <DrawerTitle>Custom Date Range</DrawerTitle>
              <DrawerDescription>Choose the From date, then the To date.</DrawerDescription>
            </DrawerHeader>
            <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-2 [-webkit-overflow-scrolling:touch]">
              <div className="grid grid-cols-2 gap-2 pb-3">
                <button
                  type="button"
                  onClick={() => setCustomStep('from')}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-left',
                    customStep === 'from' ? 'border-primary bg-primary/10' : 'border-border/60 bg-background',
                  )}
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">From</span>
                  <span className="mt-0.5 block text-sm font-semibold">{customFrom ? format(customFrom, 'd MMM yyyy') : 'Select date'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCustomStep('to')}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-left',
                    customStep === 'to' ? 'border-primary bg-primary/10' : 'border-border/60 bg-background',
                  )}
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">To</span>
                  <span className="mt-0.5 block text-sm font-semibold">{customTo ? format(customTo, 'd MMM yyyy') : 'Select date'}</span>
                </button>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/70 p-2">
                <div className="mb-1 flex items-center justify-between px-1 text-xs font-semibold text-muted-foreground">
                  <span>Selecting {customStep === 'from' ? 'From' : 'To'}</span>
                  {customStep === 'to' && !customFrom && <span className="text-amber-600">Choose From first</span>}
                </div>
                <Calendar
                  mode="single"
                  selected={customStep === 'from' ? customFrom : customTo}
                  onSelect={customStep === 'from' ? handleCustomFromSelect : handleCustomToSelect}
                  month={customMonth}
                  onMonthChange={setCustomMonth}
                  className="mx-auto p-0 pointer-events-auto"
                  disabled={(date) => date > new Date() || (customStep === 'to' && (!customFrom || date < customFrom))}
                />
              </div>
            </div>
            <DrawerFooter className="sticky bottom-0 z-10 mt-0 flex-row justify-end gap-2 border-t bg-background/95 px-4 pt-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur">
              <Button variant="outline" size="sm" onClick={() => setCustomOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCustomApply} disabled={!customRangeIsValid}>Apply</Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Popover open={customOpen} onOpenChange={handleCustomOpenChange}>
          <PopoverTrigger asChild>{customTrigger}</PopoverTrigger>
          <PopoverContent
            align="center"
            sideOffset={8}
            className="max-h-[calc(100dvh-6rem)] w-[calc(100vw-1rem)] max-w-[720px] overflow-y-auto overflow-x-hidden overscroll-contain p-3 sm:w-auto sm:p-4"
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">From</p>
                  <Calendar
                    mode="single"
                    selected={customFrom}
                    onSelect={setCustomFrom}
                    className="p-0 pointer-events-auto"
                    disabled={(date) => date > new Date()}
                  />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">To</p>
                  <Calendar
                    mode="single"
                    selected={customTo}
                    onSelect={setCustomTo}
                    className="p-0 pointer-events-auto"
                    disabled={(date) => date > new Date() || (customFrom ? date < customFrom : false)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setCustomOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={handleCustomApply} disabled={!customRangeIsValid}>Apply</Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Clear indicator */}
      {activePreset !== 'lifetime' && (
        <Button variant="ghost" size="sm" onClick={handleClear} className="h-8 w-8 p-0 rounded-full">
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

export function useDateRangeState() {
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null, label: 'Lifetime' });
  return { dateRange, setDateRange };
}
