

# Plan: Fix CSV Parser to Handle Multi-Line Quoted Fields

## Problem Identified

Your CSV file contains **addresses with newline characters inside quoted fields** - this is valid CSV format according to RFC 4180. However, the current CSV parser in `src/lib/csv.ts` incorrectly splits on ALL newlines, breaking rows that have multi-line quoted values.

**Examples from your file:**
```csv
KD8,21/12/2025,Nursheena,7126940,"Jln Laila Wijaya. 
kg Perpindahan Mata2,Gadong B, BSB, Brunei",BM,Whatsapp,COD,2/2/2026,,K4,2,39
```

The parser sees this as 2 separate rows:
- Row 1: `KD8,21/12/2025,Nursheena,7126940,"Jln Laila Wijaya.` (incomplete - no SKU)
- Row 2: `kg Perpindahan Mata2,Gadong B...` (garbage row)

This causes the "SKU code is required" error for Row 5, 6, 8, 9, etc.

## Solution

Rewrite the CSV parsing functions to properly handle quoted fields that span multiple lines.

### Files to Modify

| File | Change |
|------|--------|
| `src/lib/csv.ts` | Replace `parseCSV` and `parseCSVRaw` with RFC-4180 compliant parser |

## Technical Implementation

### Updated CSV Parser Logic

```typescript
/**
 * RFC-4180 compliant CSV parser that handles:
 * - Quoted fields with embedded newlines
 * - Escaped quotes (doubled quotes)
 * - Mixed quoted/unquoted fields
 */
function parseCSVContent(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];
    
    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote
          currentField += '"';
          i++;
        } else {
          // End of quoted field
          inQuotes = false;
        }
      } else {
        // Any character inside quotes (including newlines)
        currentField += char;
      }
    } else {
      if (char === '"') {
        // Start of quoted field
        inQuotes = true;
      } else if (char === ',') {
        // Field separator
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        // Row separator (handle \r\n)
        if (char === '\r') i++; // Skip \n
        currentRow.push(currentField.trim());
        if (currentRow.length > 0 && currentRow.some(f => f)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else if (char !== '\r') {
        currentField += char;
      }
    }
  }
  
  // Handle last field/row
  currentRow.push(currentField.trim());
  if (currentRow.length > 0 && currentRow.some(f => f)) {
    rows.push(currentRow);
  }
  
  return rows;
}
```

### Key Improvements

1. **Character-by-character parsing** - Instead of splitting on newlines first, we scan each character
2. **Quote state tracking** - Track when we're inside a quoted field and treat embedded newlines as part of the value
3. **Proper quote escaping** - Handle `""` as an escaped quote character
4. **Preserve all data** - Multi-line addresses stay intact as single field values

## Expected Results After Fix

| Before | After |
|--------|-------|
| 60 validation errors | 0 errors |
| 144 "valid" rows parsed | 203 valid rows parsed |
| KD8 address broken | KD8 address intact: "Jln Laila Wijaya.\nkg Perpindahan Mata2,Gadong B, BSB, Brunei" |
| "SKU code is required" false errors | All SKU codes detected correctly |

## Validation

After implementing:
1. Upload the same CSV file
2. All 203 orders should parse correctly
3. Column mapping should show all data properly aligned
4. Import should succeed with all orders created

