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

import type { Address } from "viem";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { readPortfolio } from "@/lib/app-kit/portfolio";
import { ARC } from "@/lib/chains";
import { listContacts } from "@/lib/contacts";
import { formatTokenAmount, formatUsd, formatUsdParts } from "@/lib/format";
import { totalInUsdc } from "@/lib/tokens";
import { AddMoneyDialog } from "./add-money-dialog";
import { BalanceBreakdownDialog } from "./balance-breakdown-dialog";
import { BorrowDialog } from "./borrow-dialog";
import { EarnDialog } from "./earn-dialog";
import { MoveDialog } from "./move-dialog";
import { SendDialog, type SendLimits } from "./send-dialog";
import { SwapDialog } from "./swap-dialog";

export const TOTAL_BALANCE_TITLE = "Your total spendable balance";

// Owners get every action. Operators may only send, and only while their access is active.
export type QuickActions = "all" | "send" | "none";

type TotalBalanceCardProps = {
  userId: string;
  passkeyId: string;
  accountAddress: Address;
  quickActions: QuickActions;
  sendLimits: SendLimits | null;
};

export async function TotalBalanceCard({
  userId,
  passkeyId,
  accountAddress,
  quickActions,
  sendLimits,
}: TotalBalanceCardProps) {
  const [{ treasury, vaults, credit }, contacts] = await Promise.all([
    readPortfolio(accountAddress),
    listContacts(accountAddress),
  ]);
  const spendable = totalInUsdc(treasury.spendable, treasury.eurcRate);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{TOTAL_BALANCE_TITLE}</CardTitle>
        <CardDescription>
          Your cash on Arc plus your Unified Balance.
        </CardDescription>
        <CardAction>
          <BalanceBreakdownDialog
            treasury={treasury}
            passkeyId={passkeyId}
            canMoveToCash={quickActions === "all"}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {spendable === null ? (
          // No rate to add EURC to USDC, so show each on its own rather than a total that leaves EURC out.
          <p className="headline text-3xl">
            {formatUsd(treasury.spendable.USDC)}
            <span className="text-xl">
              {" "}
              + {formatTokenAmount(treasury.spendable.EURC)} EURC
            </span>
          </p>
        ) : (
          <SpendableTotal amount={spendable} />
        )}
        {quickActions === "send" && (
          <div className="flex *:grow sm:*:grow-0">
            <SendDialog
              accountAddress={accountAddress}
              contacts={contacts}
              limits={sendLimits}
            />
          </div>
        )}
        {quickActions === "all" && (
          <div className="flex flex-wrap gap-2 *:grow *:nth-[-n+2]:basis-[calc(50%-0.25rem)] sm:*:grow-0 sm:*:nth-[-n+2]:basis-auto">
            <AddMoneyDialog
              userId={userId}
              passkeyId={passkeyId}
              accountAddress={accountAddress}
              usdcBalance={treasury.cash.USDC}
              sources={treasury.chains.filter(
                ({ chainId }) => chainId !== ARC.viem.id,
              )}
            />
            <SendDialog
              accountAddress={accountAddress}
              contacts={contacts}
              limits={sendLimits}
            />
            <SwapDialog balances={treasury.cash} />
            <MoveDialog cash={treasury.cash.USDC} chains={treasury.chains} />
            <EarnDialog vaults={vaults} balances={treasury.cash} />
            <BorrowDialog credit={credit} className="basis-full sm:basis-auto" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SpendableTotal({ amount }: { amount: bigint }) {
  const { whole, fraction } = formatUsdParts(amount);
  return (
    <p className="headline text-3xl">
      {whole}
      <span className="text-xl">{fraction}</span>
    </p>
  );
}
