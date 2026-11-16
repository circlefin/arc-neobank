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

import { ArrowRight, Cash } from "iconoir-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { failOperation, type OperationError } from "@/lib/app-kit/core";
import {
  moveToCash,
  quoteMaxMoveToCash,
  quoteMoveToCash,
  type MoveToCashQuote,
} from "@/lib/app-kit/unified-balance";
import { formatTokenAmount, parseAmount } from "@/lib/format";
import { AmountField } from "./amount-field";
import { useBusinessWallet, useRefreshBalances } from "./business-wallet";
import { DetailRow } from "./details-section";
import {
  ConfirmWithPasskeyButton,
  FailureStep,
  ProcessingStep,
  StepHeader,
  viewTransactionAction,
} from "./flow-steps";
import { TokenLabel } from "./token-select";
import { unlockUnifiedBalanceKey } from "./unified-balance-key";
import { useIdempotencyKey } from "./use-idempotency-key";
import { useQuote } from "./use-quote";

type Step = "details" | "review" | "processing" | "failed";

type MoveToCashDialogProps = { passkeyId: string; unifiedBalance: bigint };

// Spends Unified Balance on Arc by moving it into cash, where every payment can use it.
export function MoveToCashDialog({ passkeyId, unifiedBalance }: MoveToCashDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" className="w-full" />}>
        <Cash data-icon="inline-start" />
        Move to cash
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <MoveToCashFlow
          passkeyId={passkeyId}
          unifiedBalance={unifiedBalance}
          onComplete={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

type MoveToCashFlowProps = MoveToCashDialogProps & { onComplete: () => void };

function MoveToCashFlow({ passkeyId, unifiedBalance, onComplete }: MoveToCashFlowProps) {
  const wallet = useBusinessWallet();
  const refreshBalances = useRefreshBalances();
  const idempotencyKey = useIdempotencyKey();
  const [step, setStep] = useState<Step>("details");
  const [amount, setAmount] = useState("");
  const [failure, setFailure] = useState<OperationError | null>(null);

  const maxAmountState = useQuote(
    unifiedBalance > BigInt(0) ? String(unifiedBalance) : null,
    () => quoteMaxMoveToCash(wallet.address),
  );
  // Until the fees are known, the whole Unified Balance is the limit.
  const available = maxAmountState.status === "ready" ? maxAmountState.quote : unifiedBalance;
  const amountValue = parseAmount(amount);
  const isOverBalance = amountValue > available;
  const quoteState = useQuote(
    amountValue > BigInt(0) && !isOverBalance ? amount : null,
    () => quoteMoveToCash(wallet.address, amountValue),
  );
  const quote = quoteState.status === "ready" ? quoteState.quote : null;

  async function confirm(confirmed: MoveToCashQuote) {
    setStep("processing");
    try {
      const receipt = await moveToCash(
        { account: wallet.address, quote: confirmed, idempotencyKey: idempotencyKey.key },
        () => unlockUnifiedBalanceKey(passkeyId),
      );
      toast.success("Moved to cash", {
        description: `${formatTokenAmount(confirmed.amount)} USDC is now in your cash on Arc.`,
        action: viewTransactionAction(receipt.explorerUrl),
      });
      refreshBalances(receipt);
      onComplete();
    } catch (caught) {
      setFailure(failOperation("move to cash", caught, "The move didn't go through."));
      setStep("failed");
    }
  }

  if (step === "review" && quote) {
    return (
      <>
        <StepHeader title="Review" onBack={() => setStep("details")} />
        <dl className="flex flex-col gap-1">
          <DetailRow label="From">Unified Balance</DetailRow>
          <DetailRow label="To">Cash on Arc</DetailRow>
          <DetailRow label="You receive">
            {formatTokenAmount(quote.amount)} USDC
          </DetailRow>
          <DetailRow label="Fee">{formatTokenAmount(quote.fee)} USDC</DetailRow>
          <DetailRow label="Taken from Unified Balance">
            {formatTokenAmount(quote.totalDeducted)} USDC
          </DetailRow>
        </dl>
        <ConfirmWithPasskeyButton onClick={() => confirm(quote)} />
      </>
    );
  }

  if (step === "processing") {
    return (
      <ProcessingStep
        title="Moving to cash"
        description="Moving your Unified Balance into cash on Arc. Confirm with your passkey if asked. This takes under a minute."
      />
    );
  }

  if (step === "failed" && failure) {
    return (
      <FailureStep
        title="Money wasn't moved"
        error={failure}
        onRetry={quote ? () => confirm(quote) : undefined}
        onBack={() => setStep("review")}
      />
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Move to cash</DialogTitle>
        <DialogDescription>
          Bring USDC from your Unified Balance into cash on Arc.
        </DialogDescription>
      </DialogHeader>
      <AmountField
        label="Amount"
        token="USDC"
        balance={available}
        amount={amount}
        onAmountChange={setAmount}
        tokenAddon={<TokenLabel token="USDC" />}
      />
      {isOverBalance && (
        <p role="alert" className="text-sm text-destructive">
          That&apos;s more than you can move after fees.
        </p>
      )}
      {maxAmountState.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {maxAmountState.error.message}
        </p>
      )}
      {quoteState.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {quoteState.error.message}
        </p>
      )}
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={!quote || isOverBalance}
        onClick={() => {
          idempotencyKey.renew();
          setStep("review");
        }}
      >
        {quoteState.status === "loading" ? "Getting a quote…" : "Review"}
        <ArrowRight data-icon="inline-end" />
      </Button>
    </>
  );
}
