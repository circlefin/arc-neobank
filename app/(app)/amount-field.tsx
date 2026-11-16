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

import { useId, useState } from "react";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Slider } from "@/components/ui/slider";
import {
  formatTokenAmount,
  FULL_PERCENT,
  parseAmount,
  toAmountPattern,
  toAmountText,
} from "@/lib/format";
import { TOKEN_DECIMALS } from "@/lib/tokens";

const WHOLE_PERCENT_PATTERN = /^\d{0,3}$/;

type AmountFieldProps = {
  label: string;
  // Symbol of the token or collateral being entered.
  token: string;
  decimals?: number;
  balance: bigint;
  amount: string;
  onAmountChange: (amount: string) => void;
  // The token picker, or a fixed token label.
  tokenAddon: React.ReactNode;
};

export function AmountField({
  label,
  token,
  decimals = TOKEN_DECIMALS,
  balance,
  amount,
  onAmountChange,
  tokenAddon,
}: AmountFieldProps) {
  const id = useId();
  const [percent, setPercent] = useState(0);
  const amountPattern = toAmountPattern(decimals);

  function selectPercent(next: number) {
    if (next > FULL_PERCENT) return;
    setPercent(next);
    onAmountChange(
      toAmountText((balance * BigInt(next)) / BigInt(FULL_PERCENT), decimals),
    );
  }

  // Moves the slider to match a typed amount, capped at the whole balance.
  function typeAmount(next: string) {
    onAmountChange(next);
    if (balance === BigInt(0)) {
      setPercent(0);
      return;
    }
    const share =
      (parseAmount(next, decimals) * BigInt(FULL_PERCENT)) / balance;
    setPercent(Math.min(Number(share), FULL_PERCENT));
  }

  return (
    <Field>
      <div className="flex items-center justify-between">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription className="text-xs">
          Available: {formatTokenAmount(balance, decimals)} {token}
        </FieldDescription>
      </div>
      <InputGroup className="h-12">
        <InputGroupInput
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={amount}
          onChange={(event) => {
            if (amountPattern.test(event.target.value)) {
              typeAmount(event.target.value);
            }
          }}
          className="text-xl"
        />
        {/* Same gap on the right as the input's text has on the left. */}
        <InputGroupAddon align="inline-end" className="pr-2.5 has-[>button]:mr-0">
          {tokenAddon}
        </InputGroupAddon>
      </InputGroup>
      <div className="flex items-center gap-4">
        <Slider
          aria-label={`Share of ${token} balance`}
          value={[percent]}
          onValueChange={(value) =>
            selectPercent(Array.isArray(value) ? value[0] : value)
          }
        />
        <InputGroup className="w-24 shrink-0">
          <InputGroupInput
            aria-label="Percent of balance"
            inputMode="numeric"
            value={percent === 0 ? "" : String(percent)}
            onChange={(event) => {
              if (WHOLE_PERCENT_PATTERN.test(event.target.value)) {
                selectPercent(Number(event.target.value));
              }
            }}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText>%</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </Field>
  );
}
