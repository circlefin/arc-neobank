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
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { readPortfolio } from "@/lib/app-kit/portfolio";
import { requirePasskeyUser } from "@/lib/auth";
import { formatPercent, formatTokenAmount, formatTotal } from "@/lib/format";
import { addAmounts, TOKEN_DECIMALS, TOKENS } from "@/lib/tokens";
import { Stat, Stats } from "../stats";
import { UnavailableNotice } from "../unavailable-notice";
import { WithdrawDialog } from "./withdraw-dialog";

export default async function CashAndSavingsPage() {
  const { account } = await requirePasskeyUser();
  const { treasury, positions, savings, unavailable, eurcUnconverted } = await readPortfolio(
    account.address,
  );
  const { eurcRate } = treasury;
  const hasCash = TOKENS.some((token) => treasury.cash[token] > BigInt(0));

  return (
    <div className="flex flex-col gap-4">
      <UnavailableNotice unavailable={unavailable} eurcUnconverted={eurcUnconverted} />
      <Card>
        <CardHeader>
          <CardTitle>Assets at a glance</CardTitle>
        </CardHeader>
        <CardContent>
          <Stats>
            <Stat
              label="Total value"
              value={formatTotal(addAmounts(treasury.spendable, savings.total), eurcRate)}
            />
            <Stat
              label="Total yield earned"
              value={formatTotal(savings.earned, eurcRate, TOKEN_DECIMALS)}
              valueClassName="text-base text-success"
            />
          </Stats>
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cash</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Stats>
              <Stat
                label="Total cash assets"
                value={formatTotal(treasury.cash, eurcRate)}
              />
              {TOKENS.map((token) => (
                <Stat
                  key={token}
                  label={token}
                  value={`${formatTokenAmount(treasury.cash[token])} ${token}`}
                />
              ))}
            </Stats>
            {!hasCash && (
              <Empty className="p-2">
                <EmptyDescription>No cash assets yet.</EmptyDescription>
              </Empty>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Savings</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Stats>
              <Stat label="Total savings" value={formatTotal(savings.total, eurcRate)} />
              <Stat
                label="Average yield p.a."
                value={
                  savings.averageApyBasisPoints === null
                    ? "Unavailable"
                    : formatPercent(savings.averageApyBasisPoints)
                }
                valueClassName="text-base text-success"
              />
              <Stat
                label="Annualized yield"
                value={formatTotal(savings.annualYield, eurcRate)}
                valueClassName="text-base text-success"
              />
            </Stats>
            {positions.length === 0 ? (
              <Empty className="p-2">
                <EmptyDescription>No savings positions yet.</EmptyDescription>
              </Empty>
            ) : (
              <ItemGroup className="gap-0">
                {positions.map((position) => {
                  const { vault, currentValue, principal, earned } = position;
                  return (
                    <Item key={vault.address} className="px-0">
                      <ItemContent>
                        <ItemTitle>{vault.name}</ItemTitle>
                        <ItemDescription>
                          {formatPercent(vault.apyBasisPoints)} APY ·{" "}
                          {principal === null
                            ? "Earnings still being worked out"
                            : `Deposited ${formatTokenAmount(principal)} · Earned ${formatTokenAmount(earned ?? BigInt(0))} ${vault.asset}`}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions className="flex-col items-end gap-1">
                        {formatTokenAmount(currentValue)} {vault.asset}
                        {/* Only the Owner can withdraw. An Operator may only send. */}
                        {account.role === "owner" && (
                          <WithdrawDialog position={position} />
                        )}
                      </ItemActions>
                    </Item>
                  );
                })}
              </ItemGroup>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
