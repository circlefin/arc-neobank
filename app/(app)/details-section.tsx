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

import { NavArrowDown, NavArrowUp } from "iconoir-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatTokenAmount } from "@/lib/format";
import type { Token } from "@/lib/tokens";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type DetailsSectionProps = {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

export function DetailsSection({
  title,
  defaultOpen = true,
  children,
}: DetailsSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} render={<Card size="sm" />}>
      <CardHeader className="items-center">
        <CardTitle>{title}</CardTitle>
        <CardAction className="row-span-1 self-center">
          <CollapsibleTrigger
            render={<Button type="button" variant="outline" size="xs" />}
          >
            {open ? "Hide" : "Show"}
            {open ? (
              <NavArrowUp data-icon="inline-end" />
            ) : (
              <NavArrowDown data-icon="inline-end" />
            )}
          </CollapsibleTrigger>
        </CardAction>
      </CardHeader>
      <CollapsibleContent render={<CardContent />}>
        <dl className="flex flex-col gap-1">{children}</dl>
      </CollapsibleContent>
    </Collapsible>
  );
}

type DetailRowProps = {
  label: string;
  children: React.ReactNode;
  valueClassName?: string;
};

export function DetailRow({ label, children, valueClassName }: DetailRowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={valueClassName}>{children}</dd>
    </div>
  );
}

// What the provider charges, in USDC unless said otherwise. Network fees are covered.
export function FeeRow({ fee, token = "USDC" }: { fee: bigint; token?: Token }) {
  if (fee === BigInt(0)) {
    return (
      <DetailRow label="Fee" valueClassName="text-success">
        Free
      </DetailRow>
    );
  }
  return (
    <DetailRow label="Fee">
      {formatTokenAmount(fee)} {token}
    </DetailRow>
  );
}
