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

import { Cash, HandCash, PiggyBank } from "iconoir-react";
import Link from "next/link";
import { Fragment } from "react";
import type { Address } from "viem";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { summarizeCredit } from "@/lib/app-kit/borrow";
import { readPortfolio } from "@/lib/app-kit/portfolio";
import { formatPercent, formatTokenAmount, formatTotal, formatUsd } from "@/lib/format";
import { addAmounts, TOKEN_DECIMALS, TOKENS } from "@/lib/tokens";
import { findRiskiestLoan, HealthValue } from "./loan-health";
import { CASH_AND_SAVINGS_PATH, CREDIT_PATH } from "./nav-items";
import { Stat, Stats } from "./stats";

export const ASSETS_TITLE = "Assets";

export async function AssetsCard({
  accountAddress,
}: {
  accountAddress: Address;
}) {
  const { treasury, savings, positions, vaults, credit } =
    await readPortfolio(accountAddress);
  const featuredVault = vaults.at(0);
  const { loans } = credit;
  const riskiestLoan = findRiskiestLoan(loans);
  const { debt, collateralValue } = summarizeCredit(credit);
  const { eurcRate } = treasury;
  const netValue = addAmounts(treasury.spendable, savings.total, {
    USDC: collateralValue - debt,
    EURC: BigInt(0),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ASSETS_TITLE}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Stats>
          <Stat
            label="Total yield earned"
            value={formatTotal(savings.earned, eurcRate, TOKEN_DECIMALS)}
            valueClassName="text-base text-success"
          />
          <Stat
            label="Your net value"
            value={formatTotal(netValue, eurcRate)}
            info="What you own minus what you owe."
          />
          <Stat
            label="Outstanding debt"
            value={formatUsd(debt)}
          />
        </Stats>

        <ItemGroup className="gap-0">
          <Item
            className="-mx-3 w-auto"
            render={<Link href={CASH_AND_SAVINGS_PATH} />}
          >
            <ItemMedia variant="icon" className="size-8 rounded-lg bg-muted">
              <Cash />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Cash</ItemTitle>
              <ItemDescription>On Arc</ItemDescription>
            </ItemContent>
            <ItemActions className="flex-col items-end gap-1">
              {formatTotal(treasury.cash, eurcRate)}
              <div className="flex items-center gap-2 text-muted-foreground">
                {TOKENS.map((token, index) => (
                  <Fragment key={token}>
                    {index > 0 && <Separator orientation="vertical" />}
                    <span>
                      {formatTokenAmount(treasury.cash[token])} {token}
                    </span>
                  </Fragment>
                ))}
              </div>
            </ItemActions>
          </Item>
          <Item
            className="-mx-3 w-auto"
            render={<Link href={CASH_AND_SAVINGS_PATH} />}
          >
            <ItemMedia variant="icon" className="size-8 rounded-lg bg-muted">
              <PiggyBank />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>
                Savings
                {featuredVault && (
                  <Badge variant="success">
                    ~{formatPercent(featuredVault.apyBasisPoints)} APY
                  </Badge>
                )}
              </ItemTitle>
              <ItemDescription>
                {positions.length === 0
                  ? "No assets"
                  : `${positions.length} ${positions.length === 1 ? "vault" : "vaults"}`}
              </ItemDescription>
            </ItemContent>
            <ItemActions>{formatTotal(savings.total, eurcRate)}</ItemActions>
          </Item>
          <Item
            className="-mx-3 w-auto"
            render={<Link href={CREDIT_PATH} />}
          >
            <ItemMedia variant="icon" className="size-8 rounded-lg bg-muted">
              <HandCash />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Credit</ItemTitle>
              <ItemDescription>
                {loans.length === 0
                  ? "No collateral"
                  : loans.map(
                      ({ market, collateral }) =>
                        `${formatTokenAmount(collateral, market.collateral.decimals)} ${market.collateral.symbol}`,
                    ).join(", ")}
              </ItemDescription>
            </ItemContent>
            <ItemActions className="flex-col items-end gap-1">
              {formatUsd(collateralValue)}
              {riskiestLoan && (
                <span>
                  <span className="text-muted-foreground">Health</span>{" "}
                  <HealthValue health={riskiestLoan.health} />
                </span>
              )}
            </ItemActions>
          </Item>
        </ItemGroup>
      </CardContent>
    </Card>
  );
}
