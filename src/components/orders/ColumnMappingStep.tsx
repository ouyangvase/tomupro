import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle } from 'lucide-react';

// Required fields for order import
const REQUIRED_FIELDS = ['order_ref', 'customer_name', 'phone', 'address'];

// All available target fields with labels
const TARGET_FIELDS: { key: string; label: string; required: boolean }[] = [
  { key: 'order_ref', label: 'Order Reference', required: true },
  { key: 'order_date', label: 'Order Date', required: false },
  { key: 'customer_name', label: 'Customer Name', required: true },
  { key: 'phone', label: 'Phone', required: true },
  { key: 'address', label: 'Address', required: true },
  { key: 'area', label: 'Area', required: false },
  { key: 'channel', label: 'Channel', required: false },
  { key: 'payment_method', label: 'Payment Method', required: false },
  { key: 'expected_pickup_date', label: 'Pickup Date', required: false },
  { key: 'notes', label: 'Order Notes', required: false },
  { key: 'sku_name_or_code', label: 'SKU', required: false },
  { key: 'qty', label: 'Quantity', required: false },
  { key: 'price', label: 'Price', required: false },
];

interface ColumnMappingStepProps {
  csvHeaders: string[];
  columnMapping: Record<string, string>;
  onMappingChange: (mapping: Record<string, string>) => void;
  sampleData?: Record<string, string>[];
}

export function ColumnMappingStep({
  csvHeaders,
  columnMapping,
  onMappingChange,
  sampleData = [],
}: ColumnMappingStepProps) {
  const handleMappingChange = (csvColumn: string, targetField: string) => {
    const newMapping = { ...columnMapping };
    
    // Remove old mapping if this target was already assigned
    if (targetField !== '_skip') {
      for (const key of Object.keys(newMapping)) {
        if (newMapping[key] === targetField) {
          delete newMapping[key];
        }
      }
    }
    
    if (targetField === '_skip') {
      delete newMapping[csvColumn];
    } else {
      newMapping[csvColumn] = targetField;
    }
    
    onMappingChange(newMapping);
  };

  // Check which required fields are mapped
  const mappedTargets = new Set(Object.values(columnMapping));
  const missingRequired = REQUIRED_FIELDS.filter(f => !mappedTargets.has(f));
  const allRequiredMapped = missingRequired.length === 0;

  // Get sample value for a CSV column
  const getSampleValue = (csvColumn: string): string => {
    if (sampleData.length === 0) return '';
    const val = sampleData[0][csvColumn];
    if (!val) return '';
    return val.length > 25 ? val.substring(0, 25) + '...' : val;
  };

  return (
    <div className="space-y-3">
      {/* Status indicator */}
      <div className={`flex items-center gap-2 p-2 rounded-lg text-xs ${allRequiredMapped ? 'bg-primary/10 text-primary' : 'bg-amber-500/10 text-amber-600'}`}>
        {allRequiredMapped ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
            <span>All required fields mapped</span>
          </>
        ) : (
          <>
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Missing: {missingRequired.join(', ')}</span>
          </>
        )}
      </div>

      {/* Mapping table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="max-h-[280px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium w-[35%]">CSV Column</th>
                <th className="px-2 py-1.5 text-left font-medium w-[25%]">Sample</th>
                <th className="px-2 py-1.5 text-left font-medium w-[40%]">Map To</th>
              </tr>
            </thead>
            <tbody>
              {csvHeaders.map((header, idx) => (
                <tr key={header} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                  <td className="px-2 py-1.5">
                    <span className="font-mono text-xs truncate block max-w-[120px]" title={header}>
                      {header}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="text-muted-foreground truncate block max-w-[80px]" title={getSampleValue(header)}>
                      {getSampleValue(header) || <em className="text-muted-foreground/50">empty</em>}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <Select
                      value={columnMapping[header] || '_skip'}
                      onValueChange={(val) => handleMappingChange(header, val)}
                    >
                      <SelectTrigger className="h-7 text-xs w-full">
                        <SelectValue placeholder="Skip" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_skip" className="text-xs">
                          <span className="text-muted-foreground">— Skip column —</span>
                        </SelectItem>
                        {TARGET_FIELDS.map((field) => {
                          const isAlreadyMapped = mappedTargets.has(field.key) && columnMapping[header] !== field.key;
                          return (
                            <SelectItem
                              key={field.key}
                              value={field.key}
                              className="text-xs"
                              disabled={isAlreadyMapped}
                            >
                              <span className="flex items-center gap-1.5">
                                {field.label}
                                {field.required && (
                                  <Badge variant="outline" className="h-4 text-[10px] px-1">
                                    req
                                  </Badge>
                                )}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Badge variant="outline" className="h-4 text-[10px] px-1">req</Badge>
          = Required field
        </span>
      </div>
    </div>
  );
}

// Export required fields check helper
export function areRequiredFieldsMapped(mapping: Record<string, string>): boolean {
  const mappedTargets = new Set(Object.values(mapping));
  return REQUIRED_FIELDS.every(f => mappedTargets.has(f));
}

// Export function to apply mapping to parsed data
export function applyColumnMapping(
  rows: Record<string, string>[],
  mapping: Record<string, string>
): Record<string, string>[] {
  return rows.map(row => {
    const mappedRow: Record<string, string> = {};
    
    for (const [csvColumn, targetField] of Object.entries(mapping)) {
      if (targetField && targetField !== '_skip') {
        mappedRow[targetField] = row[csvColumn] || '';
      }
    }
    
    return mappedRow;
  });
}
