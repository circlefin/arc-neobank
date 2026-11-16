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

import {
  ArrowDownLeft,
  ArrowSeparate,
  ArrowUpRight,
  Cash,
  CoinsSwap,
  HandCash,
  OpenNewWindow,
  PiggyBank,
} from "iconoir-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import {
  isIncoming,
  type Activity,
  type ActivityKind,
  type TokenAmount,
} from "@/lib/activity";
import { ARC, explorerTransactionUrl, requireChainById } from "@/lib/chains";
import {
  formatAddress,
  formatDateTime,
  formatShortDateTime,
  formatTokenAmount,
} from "@/lib/format";
import type { Icon } from "@/lib/icon";
import { cn } from "cn";
import { DetailRow } from "./details-section";

export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  "money-added": "Money added",
  "payment-sent": "Payment sent",
  swap: "Swapped",
  "savings-deposit": "Moved to savings",
  "savings-withdrawal": "Withdrawn from savings",
  borrow: "Money borrowed",
  "collateral-added": "Collateral added",
  "loan-repaid": "Repayment made",
  "loan-paid-off": "Loan paid off",
  // Bridged in by the business or by someone paying it: Arc doesn't show who sent it.
  "moved-into-arc": "Added from another chain",
  "moved-out-of-arc": "Moved out of Arc",
  "moved-to-cash": "Moved to cash",
  "moved-to-unified-balance": "Moved to Unified Balance",
};

const ACTIVITY_ICONS: Record<ActivityKind, Icon> = {
  "money-added": ArrowDownLeft,
  "payment-sent": ArrowUpRight,
  swap: CoinsSwap,
  "savings-deposit": PiggyBank,
  "savings-withdrawal": PiggyBank,
  borrow: HandCash,
  "collateral-added": HandCash,
  "loan-repaid": HandCash,
  "loan-paid-off": HandCash,
  "moved-into-arc": ArrowSeparate,
  "moved-out-of-arc": ArrowSeparate,
  "moved-to-cash": Cash,
  "moved-to-unified-balance": Cash,
};

// Payments and savings name who the money went to or came from.
const COUNTERPARTY_KINDS = [
  "money-added",
  "payment-sent",
  "savings-deposit",
  "savings-withdrawal",
] as const satisfies readonly ActivityKind[];

type CounterpartyKind = (typeof COUNTERPARTY_KINDS)[number];

// Other moves say what happened. A swap says what it got.
const KIND_DESCRIPTIONS: Record<
  Exclude<ActivityKind, CounterpartyKind | "swap">,
  string
> = {
  borrow: "Against your collateral",
  "collateral-added": "To your loan",
  "loan-repaid": "Toward your loan",
  "loan-paid-off": "Loan closed",
  "moved-into-arc": "Sender is on another chain",
  "moved-out-of-arc": "To another chain",
  "moved-to-cash": "From Unified Balance",
  "moved-to-unified-balance": "From cash",
};

const OTHER_AMOUNT_LABELS: Partial<Record<ActivityKind, string>> = {
  swap: "Received",
  borrow: "Collateral added",
  "loan-paid-off": "Collateral back",
};

export function ActivityList({ activities }: { activities: Activity[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Activity | null>(null);

  return (
    <>
      <ItemGroup className="gap-0">
        {activities.map((activity) => (
          <ActivityItem
            key={activity.id}
            activity={activity}
            onClick={() => {
              setSelected(activity);
              setOpen(true);
            }}
          />
        ))}
      </ItemGroup>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          {/* Kept after closing, so the details don't vanish mid-animation. */}
          {selected && <ActivityDetails activity={selected} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

type ActivityItemProps = { activity: Activity; onClick: () => void };

function ActivityItem({ activity, onClick }: ActivityItemProps) {
  const ActivityIcon = ACTIVITY_ICONS[activity.kind];
  const isAdded = isIncoming(activity.kind);

  return (
    <Item
      className="-mx-3 w-auto"
      render={<button type="button" onClick={onClick} />}
    >
      <ItemMedia variant="icon" className="size-8 rounded-lg bg-muted">
        <ActivityIcon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{ACTIVITY_LABELS[activity.kind]}</ItemTitle>
        <ItemDescription>{describeActivity(activity)}</ItemDescription>
      </ItemContent>
      <ItemActions className="flex-col items-end gap-1">
        <span className={cn(isAdded && "text-success")}>
          {formatSignedAmount(activity)}
        </span>
        <ActivityTime
          time={activity.time}
          format={formatShortDateTime}
          className="text-muted-foreground"
        />
      </ItemActions>
    </Item>
  );
}

function ActivityDetails({ activity }: { activity: Activity }) {
  const isAdded = isIncoming(activity.kind);
  const chain = requireChainById(activity.chainId);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{ACTIVITY_LABELS[activity.kind]}</DialogTitle>
        <DialogDescription>
          <ActivityTime time={activity.time} format={formatDateTime} />
        </DialogDescription>
      </DialogHeader>
      <p className={cn("headline text-3xl", isAdded && "text-success")}>
        {formatSignedAmount(activity)}
      </p>
      <dl className="flex flex-col gap-1">
        <DetailRow label="Status" valueClassName="text-success">
          Completed
        </DetailRow>
        {hasCounterparty(activity.kind) && (
          <DetailRow
            label={isAdded ? "From" : "To"}
            valueClassName="text-right break-all"
          >
            {activity.counterpartyName ?? formatAddress(activity.counterparty)}
          </DetailRow>
        )}
        {hasCounterparty(activity.kind) && activity.counterpartyName && (
          <DetailRow label="Address">
            {formatAddress(activity.counterparty)}
          </DetailRow>
        )}
        {activity.otherAmount && (
          <DetailRow label={OTHER_AMOUNT_LABELS[activity.kind] ?? "Also moved"}>
            {formatAmount(activity.otherAmount)}
          </DetailRow>
        )}
        {activity.memo && (
          <DetailRow label="Memo" valueClassName="text-right break-all">
            {activity.memo}
          </DetailRow>
        )}
      </dl>
      <Button
        variant="outline"
        size="lg"
        className="w-full"
        nativeButton={false}
        render={
          <a
            href={explorerTransactionUrl(chain, activity.transactionHash)}
            target="_blank"
            rel="noreferrer"
          />
        }
      >
        View on {chain.label} explorer
        <OpenNewWindow data-icon="inline-end" />
      </Button>
    </>
  );
}

type ActivityTimeProps = {
  time: string;
  format: (isoTime: string) => string;
  className?: string;
};

// The server formats in its own time zone and the browser in the user's, so the text may differ on hydration.
function ActivityTime({ time, format, className }: ActivityTimeProps) {
  return (
    <time dateTime={time} className={className} suppressHydrationWarning>
      {format(time)}
    </time>
  );
}

function hasCounterparty(kind: ActivityKind): kind is CounterpartyKind {
  return COUNTERPARTY_KINDS.some((candidate) => candidate === kind);
}

function describeActivity(activity: Activity) {
  const { kind, otherAmount, counterparty, counterpartyName, chainId } = activity;
  if (hasCounterparty(kind)) {
    const direction = isIncoming(kind) ? "From" : "To";
    return `${direction} ${counterpartyName ?? formatAddress(counterparty)}`;
  }
  if (kind === "swap") return otherAmount && `For ${formatAmount(otherAmount)}`;
  // Deposited from the account's wallet on another chain, not from cash.
  if (kind === "moved-to-unified-balance" && chainId !== ARC.viem.id) {
    return `From ${requireChainById(chainId).label}`;
  }
  return KIND_DESCRIPTIONS[kind];
}

function formatSignedAmount({ kind, amount }: Activity) {
  const sign = isIncoming(kind) ? "+" : "−";
  return `${sign}${formatAmount(amount)}`;
}

export function formatAmount({ value, decimals, symbol }: TokenAmount) {
  return `${formatTokenAmount(value, decimals)} ${symbol}`;
}
