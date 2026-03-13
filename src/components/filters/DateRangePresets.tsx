import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, ChevronDown, X } from 'lucide-react';
import { 
  startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, 
  subMonths, startOfYear, format 
} from 'date-fns';
import { cn } from '@/lib/utils';

export interface DateRange {
  from: Date | null;
  to: Date | null;
  label: string;
}

type PresetKey = 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'lifetime' | 'custom';

const presets: { key: PresetKey; label: string; getRange: () => { from: Date; to: Date } | null }[] = [
  { key: 'today', label: 'Today', getRange: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
  { key: 'yesterday', label: 'Yesterday', getRange: () => ({ from: startOfDay(subDays(new Date(), 1)), to: endOfDay(subDays(new Date(), 1)) }) },
  { key: 'last7', label: 'Last 7 Days', getRange: () => ({ from: startOfDay(subDays(new Date(), 6)), to: endOfDay(new Date()) }) },
  { key: 'thisMonth', label: 'This Month', getRange: () => ({ from: startOfMonth(new Date()), to: endOfDay(new Date()) }) },
  { key: 'lastMonth', label: 'Last Month', getRange: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
  { key: 'thisYear', label: 'This Year', getRange: () => ({ from: startOfYear(new Date()), to: endOfDay(new Date()) }) },
  { key: 'lifetime', label: 'Lifetime', getRange: () => null },
];

interface DateRangePresetsProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

export function DateRangePresets({ value, onChange, className }: DateRangePresetsProps) {
  const [activePreset, setActivePreset] = useState<PresetKey>('lifetime');
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

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
    if (customFrom && customTo) {
      setActivePreset('custom');
      onChange({
        from: startOfDay(customFrom),
        to: endOfDay(customTo),
        label: `${format(customFrom, 'MMM dd')} - ${format(customTo, 'MMM dd')}`,
      });
      setCustomOpen(false);
    }
  };

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
      <Popover open={customOpen} onOpenChange={setCustomOpen}>
        <PopoverTrigger asChild>
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
        </PopoverTrigger>
        <PopoverContent className="w-auto p-4" align="end">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
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
              <Button size="sm" onClick={handleCustomApply} disabled={!customFrom || !customTo}>Apply</Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

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
