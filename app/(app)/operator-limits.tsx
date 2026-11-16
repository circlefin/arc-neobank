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

import { formatDateTime, formatTokenAmount } from "@/lib/format";
import type { Token } from "@/lib/tokens";
import { DetailRow } from "./details-section";

type OperatorLimitsProps = {
  paymentLimit: bigint;
  tokens: readonly Token[];
  expiresAt: string;
};

export function OperatorLimits({
  paymentLimit,
  tokens,
  expiresAt,
}: OperatorLimitsProps) {
  return (
    <dl className="flex flex-col gap-1">
      <DetailRow label="Limit per payment" valueClassName="text-right">
        {formatTokenAmount(paymentLimit)} {tokens.join(" or ")}
      </DetailRow>
      <DetailRow label="Access ends" valueClassName="text-right">
        {/* Formatted in the browser's time zone, which the server can't know. */}
        <time dateTime={expiresAt} suppressHydrationWarning>
          {formatDateTime(expiresAt)}
        </time>
      </DetailRow>
    </dl>
  );
}
