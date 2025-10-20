"use client";

import { ReactNode, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// opcional: Devtools
// import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

export default function QueryProvider({ children }: { children: ReactNode }) {
  // cria o client uma única vez
  const [client] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={client}>
      {children}
      {/* <ReactQueryDevtools initialIsOpen={false} /> */}
    </QueryClientProvider>
  );
}
