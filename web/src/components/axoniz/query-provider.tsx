"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            retry: 1,
            // Fail visibly and fast: when the AXONIZ engine is down, pages must
            // render their honest offline/empty states instead of skeleton limbo.
            retryDelay: 500,
            refetchIntervalInBackground: false,
            networkMode: "online",
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
