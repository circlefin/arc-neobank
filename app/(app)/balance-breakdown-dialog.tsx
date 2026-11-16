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

import { InfoCircle } from "iconoir-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { Treasury } from "@/lib/app-kit/treasury";
import { formatTotal, formatUsd } from "@/lib/format";
import { MoveToCashDialog } from "./move-to-cash-dialog";
import { UnavailableNotice } from "./unavailable-notice";

const ROW_CLASS = "px-0 not-last:pt-0 last:pb-0";

type BalanceBreakdownDialogProps = {
  treasury: Treasury;
  passkeyId: string;
  // Only the Owner can move Unified Balance. An Operator may only send.
  canMoveToCash: boolean;
};

export function BalanceBreakdownDialog({
  treasury,
  passkeyId,
  canMoveToCash,
}: BalanceBreakdownDialogProps) {
  const fundedChains = treasury.chains.filter(
    ({ unified, unifiedPending }) => unified + unifiedPending > BigInt(0),
  );
  const walletChains = treasury.chains.filter(({ wallet }) => wallet > BigInt(0));

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Balance by chain"
          />
        }
      >
        <InfoCircle />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Balance by chain</DialogTitle>
          <DialogDescription>
            Cash sits in your account on Arc. Unified Balance is USDC you added
            from other chains. You can spend both on Arc. USDC still in your
            account on another chain, savings, and collateral aren&apos;t
            included until you move or withdraw them.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-72">
          <ItemGroup className="gap-0 pr-3">
            <Item className={ROW_CLASS}>
              <ItemContent>
                <ItemTitle>Arc</ItemTitle>
                <ItemDescription>Cash in your account</ItemDescription>
              </ItemContent>
              <ItemActions>{formatTotal(treasury.cash, treasury.eurcRate)}</ItemActions>
            </Item>
            {fundedChains.map(({ chainId, label, unified, unifiedPending }) => (
              <Item key={chainId} className={ROW_CLASS}>
                <ItemContent>
                  <ItemTitle>{label}</ItemTitle>
                  <ItemDescription>
                    Unified Balance
                    {unifiedPending > BigInt(0) &&
                      ` · ${formatUsd(unifiedPending)} arriving`}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>{formatUsd(unified)}</ItemActions>
              </Item>
            ))}
          </ItemGroup>
        </ScrollArea>
        <UnavailableNotice
          unavailable={treasury.unavailable}
          eurcUnconverted={treasury.eurcRate === null && treasury.cash.EURC > BigInt(0)}
        />
        <Separator />
        <div className="flex items-center justify-between pr-3 font-medium">
          <p>Total spendable</p>
          <p>{formatTotal(treasury.spendable, treasury.eurcRate)}</p>
        </div>
        {canMoveToCash && treasury.unifiedBalance > BigInt(0) && (
          <MoveToCashDialog
            passkeyId={passkeyId}
            unifiedBalance={treasury.unifiedBalance}
          />
        )}
        {walletChains.length > 0 && (
          <>
            <Separator />
            <ItemGroup className="gap-0 pr-3">
              {walletChains.map(({ chainId, label, wallet }) => (
                <Item key={chainId} className={ROW_CLASS}>
                  <ItemContent>
                    <ItemTitle>{label}</ItemTitle>
                    <ItemDescription>
                      In your account there. Move it into Arc to spend it.
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>{formatUsd(wallet)}</ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
