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

import { Progress } from "@/components/ui/progress";
import type {
  BorrowMarket,
  HealthBand,
  Loan,
  LoanHealth,
} from "@/lib/app-kit/borrow";
import {
  BASIS_POINTS_PER_WHOLE,
  formatHealthFactor,
  formatUsd,
  FULL_PERCENT,
} from "@/lib/format";

type BandStyle = { label: string; text: string; indicator: string };

const BAND_STYLES: Record<HealthBand, BandStyle> = {
  SAFE: {
    label: "Healthy",
    text: "text-success",
    indicator: "**:data-[slot=progress-indicator]:bg-success",
  },
  WARN: {
    label: "Watch",
    text: "text-warning",
    indicator: "**:data-[slot=progress-indicator]:bg-warning",
  },
  URGENT: {
    label: "At risk",
    text: "text-destructive",
    indicator: "**:data-[slot=progress-indicator]:bg-destructive",
  },
  IMMINENT: {
    label: "Close to liquidation",
    text: "text-destructive",
    indicator: "**:data-[slot=progress-indicator]:bg-destructive",
  },
  LIQUIDATABLE: {
    label: "Can be liquidated",
    text: "text-destructive",
    indicator: "**:data-[slot=progress-indicator]:bg-destructive",
  },
};

// The account is only as safe as this loan. A loan with nothing owed can't be liquidated.
export function findRiskiestLoan(loans: Loan[]) {
  return loans.reduce<Loan | undefined>((riskiest, loan) => {
    if (loan.health.healthFactor === null) return riskiest ?? loan;
    if (!riskiest || riskiest.health.healthFactor === null) return loan;
    return loan.health.healthFactor < riskiest.health.healthFactor
      ? loan
      : riskiest;
  }, undefined);
}

// How much of the borrowing limit is used. Full means the loan can be liquidated.
function toLimitUsedPercent(healthFactor: bigint | null) {
  if (healthFactor === null) return 0;
  const percent =
    (BASIS_POINTS_PER_WHOLE * BigInt(FULL_PERCENT)) / healthFactor;
  return Math.min(Number(percent), FULL_PERCENT);
}

export function HealthBar({ health }: { health: LoanHealth }) {
  const style = BAND_STYLES[health.band];

  return (
    <Progress
      value={toLimitUsedPercent(health.healthFactor)}
      aria-label="Borrowing limit used"
      className={style.indicator}
    >
      <div className="flex w-full items-end justify-between gap-2">
        <p>
          Health: <span className={style.text}>{style.label}</span>
        </p>
        <p className="text-muted-foreground">
          {health.healthFactor === null
            ? "Nothing owed"
            : `Health factor ${formatHealthFactor(health.healthFactor)}`}
        </p>
      </div>
    </Progress>
  );
}

export function HealthValue({ health }: { health: LoanHealth }) {
  const style = BAND_STYLES[health.band];

  return (
    <span className={style.text}>
      {health.healthFactor === null
        ? style.label
        : `${formatHealthFactor(health.healthFactor)} · ${style.label}`}
    </span>
  );
}

type LiquidationPriceProps = {
  market: BorrowMarket;
  price: bigint | null;
};

export function LiquidationPrice({ market, price }: LiquidationPriceProps) {
  if (price === null) return "None";
  return `${formatUsd(price)} per ${market.collateral.symbol}`;
}
