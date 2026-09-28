import { QueryClient } from '@tanstack/react-query';

/** One QueryClient owns the application cache for the lifetime of the page. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
      refetchOnReconnect: false,
    },
  },
});
