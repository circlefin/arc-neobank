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

import { useEffect, useState } from "react";
import { failOperation, type OperationError } from "@/lib/app-kit/core";

const QUOTE_DELAY_MILLISECONDS = 400;

type QuoteState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; quote: T }
  | { status: "error"; error: OperationError };

type Settled<T> =
  | { key: string; status: "ready"; quote: T }
  | { key: string; status: "error"; error: OperationError };

// Fetches a quote once typing pauses. `key` changes whenever the request does; null means don't quote.
export function useQuote<T>(
  key: string | null,
  fetchQuote: () => Promise<T>,
): QuoteState<T> {
  // A settled quote remembers which request it answers, so a stale one never shows.
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  useEffect(() => {
    if (key === null) return;
    let current = true;
    const timer = setTimeout(() => {
      fetchQuote().then(
        (quote) => current && setSettled({ key, status: "ready", quote }),
        (caught: unknown) =>
          current &&
          setSettled({
            key,
            status: "error",
            error: failOperation("quote", caught, "We couldn't get a quote. Try again."),
          }),
      );
    }, QUOTE_DELAY_MILLISECONDS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
    // The key stands for everything fetchQuote reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (key === null) return { status: "idle" };
  if (settled?.key !== key) return { status: "loading" };
  return settled;
}
