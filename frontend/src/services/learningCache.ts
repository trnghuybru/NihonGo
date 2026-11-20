import { QueryClient } from '@tanstack/react-query';

// Opt-in lesson content only: never tokens, signed URLs or progress.
export const learningQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15 * 60 * 1000,
      gcTime: 60 * 60 * 1000,
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});
let account: string | null = null;
let generation = 0;
const listeners = new Set<() => void>();
export const learningCacheScope = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  snapshot: () => generation,
};
export function setLearningCacheAccount(next: string | null) {
  if (account === next) return;
  account = next;
  generation += 1;
  learningQueryClient.clear();
  listeners.forEach(listener => listener());
}
