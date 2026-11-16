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

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import {
  summarizeCredit,
  toBorrowingPower,
  toCollateralValue,
  type Loan,
} from "@/lib/app-kit/borrow";
import { readPortfolio } from "@/lib/app-kit/portfolio";
import { requirePasskeyUser } from "@/lib/auth";
import {
  BASIS_POINTS_PER_WHOLE,
  formatPercent,
  formatTokenAmount,
  formatUsd,
  FULL_PERCENT,
} from "@/lib/format";
import { BorrowDialog } from "../borrow-dialog";
import { DetailRow } from "../details-section";
import { HealthBar, LiquidationPrice } from "../loan-health";
import { Stat, Stats } from "../stats";
import { UnavailableNotice } from "../unavailable-notice";
import { AddCollateralDialog } from "./add-collateral-dialog";
import { RepayDialog } from "./repay-dialog";

// Share of a whole, in basis points. Nothing borrowed or held reads as zero.
function toBasisPoints(part: bigint, whole: bigint) {
  return whole === BigInt(0)
    ? BigInt(0)
    : (part * BASIS_POINTS_PER_WHOLE) / whole;
}

export default async function CreditPage() {
  const { account } = await requirePasskeyUser();
  const { treasury, credit, unavailable } = await readPortfolio(account.address);
  const canManage = account.role === "owner";

  const { debt, collateralValue, borrowLimit, annualCost } =
    summarizeCredit(credit);
  const borrowLimitUsed = toBasisPoints(debt, borrowLimit);
  // Each loan's rate, weighted by what it owes.
  const averageBorrowRate = toBasisPoints(annualCost, debt);

  return (
    <div className="flex flex-col gap-4">
      <UnavailableNotice unavailable={unavailable} />
      <Card>
        <CardHeader>
          <CardTitle>Borrow overview</CardTitle>
          <CardDescription>
            Borrow USDC against the collateral you deposit.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Progress
            value={
              (Number(borrowLimitUsed) / Number(BASIS_POINTS_PER_WHOLE)) *
              FULL_PERCENT
            }
            aria-label="Borrow limit used"
          >
            <div className="flex w-full items-end justify-between gap-2">
              <p className="headline text-xl">
                {formatUsd(debt)} borrowed
              </p>
              <p className="text-muted-foreground">
                Up to {formatUsd(borrowLimit)}
              </p>
            </div>
          </Progress>
          <Stats>
            <Stat
              label="Borrow limit used"
              value={formatPercent(borrowLimitUsed)}
            />
            <Stat
              label="Borrow rate"
              value={formatPercent(averageBorrowRate)}
              valueClassName="text-base text-warning"
            />
            <Stat
              label="Annualized borrow cost"
              value={formatUsd(annualCost)}
              valueClassName="text-base text-warning"
            />
          </Stats>
          {canManage && (
            <div className="flex *:grow sm:*:grow-0">
              <BorrowDialog credit={credit} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Borrow management</CardTitle>
          <CardDescription>
            Manage your risk by adding collateral, or by repaying, to avoid
            losing collateral.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Stats>
            <Stat
              label="Total collateral value"
              value={formatUsd(collateralValue)}
            />
            <Stat
              label="Collateral ratio"
              value={formatPercent(toBasisPoints(collateralValue, debt))}
              info="Your collateral value divided by what you owe."
            />
          </Stats>
          {credit.loans.length === 0 ? (
            <Empty className="p-2">
              <EmptyDescription>No collateral yet.</EmptyDescription>
            </Empty>
          ) : (
            credit.loans.map((loan) => (
              <LoanCard
                key={loan.id}
                loan={loan}
                cash={treasury.cash.USDC}
                canManage={canManage}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type LoanCardProps = { loan: Loan; cash: bigint; canManage: boolean };

function LoanCard({ loan, cash, canManage }: LoanCardProps) {
  const { market, health } = loan;
  const collateralValue = toCollateralValue(market, loan.collateral);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{market.collateral.symbol} loan</CardTitle>
        <CardDescription>
          {market.protocol} · {formatPercent(market.borrowApyBasisPoints)} APY
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <HealthBar health={health} />
        <dl className="flex flex-col gap-1">
          <DetailRow label="You owe">
            {formatTokenAmount(loan.debt)} USDC
          </DetailRow>
          <DetailRow label="Collateral">
            {formatTokenAmount(loan.collateral, market.collateral.decimals)}{" "}
            {market.collateral.symbol} · {formatUsd(collateralValue)}
          </DetailRow>
          <DetailRow label="Collateral ratio">
            {formatPercent(toBasisPoints(collateralValue, loan.debt))}
          </DetailRow>
          <DetailRow label="Borrowing power">
            {formatUsd(toBorrowingPower(market, loan.collateral))}
          </DetailRow>
          <DetailRow label="Liquidation threshold">
            {formatPercent(market.liquidationThresholdBasisPoints)}
          </DetailRow>
          <DetailRow label="Liquidation price">
            <LiquidationPrice market={market} price={health.liquidationPrice} />
          </DetailRow>
        </dl>
        {canManage && (
          <div className="flex flex-wrap gap-2 *:grow sm:*:grow-0">
            <RepayDialog loan={loan} cash={cash} />
            <AddCollateralDialog loan={loan} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
