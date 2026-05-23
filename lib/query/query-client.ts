import { QueryClient } from '@tanstack/react-query';

const REACT_QUERY_STALE_TIME_MS = 30_000;
const REACT_QUERY_GC_TIME_MS = 5 * 60_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: REACT_QUERY_STALE_TIME_MS,
      gcTime: REACT_QUERY_GC_TIME_MS,
      retry: 1,
      refetchOnReconnect: true,
      refetchOnMount: false,
    },
    mutations: {
      retry: 1,
    },
  },
});
