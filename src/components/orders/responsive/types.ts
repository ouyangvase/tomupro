import { ReactNode } from 'react';

export interface ResponsiveColumn<T> {
  key: string;
  header: string;
  // Responsive width using CSS clamp: clamp(min, preferred, max)
  minWidth?: string;
  maxWidth?: string;
  preferredWidth?: string;
  // Fixed width (overrides responsive)
  width?: string;
  sortable?: boolean;
  filterable?: boolean;
  filterOptions?: { label: string; value: string }[];
  render?: (item: T) => ReactNode;
  // For mobile card: label for key-value display
  mobileLabel?: string;
  // Priority for mobile: higher priority shown first, lower can be collapsed
  mobilePriority?: 'primary' | 'secondary' | 'expanded';
}

export interface ResponsiveListProps<T extends object> {
  data: T[];
  columns: ResponsiveColumn<T>[];
  keyField: keyof T;
  // Selection
  selectable?: boolean;
  selectedRows?: string[];
  onSelectionChange?: (ids: string[]) => void;
  // Actions
  onRowClick?: (item: T) => void;
  rowActions?: (item: T) => ReactNode;
  bulkActions?: ReactNode;
  // Export
  enableExport?: boolean;
  onExport?: () => void;
  onExportSelected?: () => void;
  onImport?: () => void;
  // Loading/Empty states
  loading?: boolean;
  emptyMessage?: string;
  // Default sort
  defaultSort?: { field: string; direction: 'asc' | 'desc' };
}

export interface ExportDialogState {
  open: boolean;
  mode: 'selected' | 'all';
}
