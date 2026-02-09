import * as React from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export interface SearchableMultiSelectOption {
  label: string;
  value: string;
  searchLabel?: string;
}

interface SearchableMultiSelectProps {
  options: SearchableMultiSelectOption[];
  values: string[];
  onValuesChange: (values: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  allLabel?: string;
}

export function SearchableMultiSelect({
  options,
  values,
  onValuesChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results found.',
  className,
  allLabel = 'All',
}: SearchableMultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const isAllSelected = values.length === 0;

  const toggleOption = (optionValue: string) => {
    if (values.includes(optionValue)) {
      onValuesChange(values.filter((v) => v !== optionValue));
    } else {
      onValuesChange([...values, optionValue]);
    }
  };

  const selectAll = () => {
    onValuesChange([]);
  };

  const removeValue = (valueToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onValuesChange(values.filter((v) => v !== valueToRemove));
  };

  const selectedLabels = values
    .map((v) => options.find((o) => o.value === v)?.label)
    .filter(Boolean);

  const displayText = isAllSelected
    ? allLabel
    : selectedLabels.length <= 2
      ? selectedLabels.join(', ')
      : `${selectedLabels.length} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('justify-between font-normal h-10', className)}
        >
          <span className="truncate">{displayText}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0 z-50" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {/* All option */}
              <CommandItem
                value={allLabel}
                onSelect={selectAll}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    isAllSelected ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <span>{allLabel}</span>
              </CommandItem>
              {options.map((option) => {
                const isSelected = values.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={option.searchLabel || option.label}
                    onSelect={() => toggleOption(option.value)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        isSelected ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <span className="truncate">{option.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        {/* Selected badges */}
        {values.length > 0 && (
          <div className="border-t p-2 flex flex-wrap gap-1">
            {values.map((v) => {
              const opt = options.find((o) => o.value === v);
              return (
                <Badge
                  key={v}
                  variant="secondary"
                  className="text-xs gap-1 pr-1"
                >
                  {opt?.label || v}
                  <button
                    className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                    onClick={(e) => removeValue(v, e)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
