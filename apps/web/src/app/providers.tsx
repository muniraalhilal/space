'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/primitives';
import { ApiError } from '@/lib/api';

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: false,
            retry: (n, e) => !(e instanceof ApiError && [401, 403, 404].includes(e.status)) && n < 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        {children}
        <Toaster position="bottom-right" toastOptions={{ style: { borderRadius: 14, border: '1px solid var(--line)', fontFamily: 'var(--font-sans)', fontSize: 13 } }} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
