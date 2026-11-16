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

import { Dollar, Euro } from "iconoir-react";
import type { Icon } from "@/lib/icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isToken, TOKENS, type Token } from "@/lib/tokens";

export const TOKEN_ICONS: Record<Token, Icon> = {
  USDC: Dollar,
  EURC: Euro,
};

type TokenSelectProps = {
  value: Token;
  onValueChange: (token: Token) => void;
  label: string;
};

export function TokenSelect({ value, onValueChange, label }: TokenSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (isToken(next)) onValueChange(next);
      }}
    >
      <SelectTrigger size="sm" aria-label={label}>
        <SelectValue>
          {(selected) => isToken(selected) && <TokenLabel token={selected} />}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false}>
        {TOKENS.map((token) => (
          <SelectItem key={token} value={token}>
            <TokenLabel token={token} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TokenLabel({ token }: { token: Token }) {
  const Icon = TOKEN_ICONS[token];
  return (
    <span className="flex items-center gap-1.5">
      <Icon className="size-4" />
      {token}
    </span>
  );
}
