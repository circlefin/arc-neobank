/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { ARC } from "@/lib/chains";
import { clearDiagnostics } from "@/lib/diagnostics";

// Reads only. The business account signs through ZeroDev, so no wallet connects here.
const wagmiConfig = createConfig({
  chains: [ARC.viem],
  transports: { [ARC.viem.id]: http() },
  multiInjectedProviderDiscovery: false,
  ssr: true,
});

export function WagmiReadProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  // The trail belongs to the signed-in session, so leaving these pages ends it.
  useEffect(() => clearDiagnostics, []);
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
