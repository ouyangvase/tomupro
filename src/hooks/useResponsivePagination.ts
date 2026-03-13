import { useState, useEffect, useCallback, useMemo } from 'react';

interface UseResponsivePaginationOptions {
  totalItems: number;
  containerRef?: React.RefObject<HTMLElement>;
  headerHeight?: number; // Height of fixed header/filters
  footerHeight?: number; // Height of pagination controls
}

interface ResponsivePaginationResult {
  pageSize: number;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  totalPages: number;
  paginatedData: <T>(data: T[]) => T[];
  rowHeight: number;
}

export function useResponsivePagination({
  totalItems,
  headerHeight = 200,
  footerHeight = 60,
}: UseResponsivePaginationOptions): ResponsivePaginationResult {
  const [currentPage, setCurrentPage] = useState(1);
  const [dimensions, setDimensions] = useState({ width: 1920, height: 900 });

  // Calculate row height based on screen width
  const rowHeight = useMemo(() => {
    if (dimensions.width >= 1600) return 60; // Large screens
    if (dimensions.width < 1280) return 44; // Small desktops
    return 52; // Default
  }, [dimensions.width]);

  // Calculate page size based on available height
  const pageSize = useMemo(() => {
    const availableHeight = dimensions.height - headerHeight - footerHeight;
    const calculatedSize = Math.floor(availableHeight / rowHeight);
    // Clamp between 5 and 30
    return Math.max(5, Math.min(30, calculatedSize));
  }, [dimensions.height, headerHeight, footerHeight, rowHeight]);

  // Debounced resize handler
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setDimensions({
          width: window.innerWidth,
          height: window.innerHeight,
        });
      }, 150);
    };

    // Initial dimensions
    setDimensions({
      width: window.innerWidth,
      height: window.innerHeight,
    });

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  // Reset to page 1 when page size changes and current page would be out of bounds
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  const paginatedData = useCallback(
    <T,>(data: T[]): T[] => {
      const startIndex = (currentPage - 1) * pageSize;
      return data.slice(startIndex, startIndex + pageSize);
    },
    [currentPage, pageSize]
  );

  return {
    pageSize,
    currentPage,
    setCurrentPage,
    totalPages,
    paginatedData,
    rowHeight,
  };
}
