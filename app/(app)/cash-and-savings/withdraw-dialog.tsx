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

import { ArrowRight } from "iconoir-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { failOperation, type OperationError } from "@/lib/app-kit/core";
import {
  quoteWithdrawalFee,
  withdrawAllFromVault,
  withdrawFromVault,
  type Position,
} from "@/lib/app-kit/earn";
import { formatTokenAmount, parseAmount } from "@/lib/format";
import { AmountField } from "../amount-field";
import { useBusinessWallet, useRefreshBalances } from "../business-wallet";
import { DetailRow, FeeRow } from "../details-section";
import {
  ConfirmWithPasskeyButton,
  FailureStep,
  ProcessingStep,
  StepHeader,
  viewTransactionAction,
} from "../flow-steps";
import { TokenLabel } from "../token-select";
import { useIdempotencyKey } from "../use-idempotency-key";
import { useQuote } from "../use-quote";

type Step = "details" | "review" | "processing" | "failed";

// Takes part or all of a savings position back into cash.
export function WithdrawDialog({ position }: { position: Position }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        Withdraw
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <WithdrawFlow position={position} onComplete={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

type WithdrawFlowProps = { position: Position; onComplete: () => void };

function WithdrawFlow({ position, onComplete }: WithdrawFlowProps) {
  const wallet = useBusinessWallet();
  const refreshBalances = useRefreshBalances();
  const idempotencyKey = useIdempotencyKey();
  const { vault, currentValue } = position;
  const [step, setStep] = useState<Step>("details");
  const [amount, setAmount] = useState("");
  const [failure, setFailure] = useState<OperationError | null>(null);

  const amountValue = parseAmount(amount);
  const isOverBalance = amountValue > currentValue;
  const isFull = amountValue === currentValue;
  const amountText = `${formatTokenAmount(amountValue)} ${vault.asset}`;
  const quoteState = useQuote(
    amountValue > BigInt(0) && !isOverBalance ? amount : null,
    () => quoteWithdrawalFee(wallet, vault, amountValue),
  );
  const fee = quoteState.status === "ready" ? quoteState.quote : null;

  async function confirm() {
    setStep("processing");
    try {
      const receipt = await wallet.runOnce(idempotencyKey.key, (keyed) =>
        isFull
          ? withdrawAllFromVault(keyed, position)
          : withdrawFromVault(keyed, vault, amountValue),
      );
      toast.success("Withdrawal complete", {
        description: isFull
          ? `Everything in ${vault.name} is back in your cash.`
          : `${amountText} is back in your cash.`,
        action: viewTransactionAction(receipt.explorerUrl),
      });
      refreshBalances(receipt);
      onComplete();
    } catch (caught) {
      setFailure(failOperation("earn withdrawal", caught, "The withdrawal didn't go through."));
      setStep("failed");
    }
  }

  if (step === "review" && fee !== null) {
    return (
      <>
        <StepHeader title="Review" onBack={() => setStep("details")} />
        <dl className="flex flex-col gap-1">
          <DetailRow label="From">{vault.name}</DetailRow>
          <DetailRow label="To">Cash on Arc</DetailRow>
          <DetailRow label="Amount">
            {isFull ? `All of it, about ${amountText}` : amountText}
          </DetailRow>
          <DetailRow label="Left in savings">
            {formatTokenAmount(currentValue - amountValue)} {vault.asset}
          </DetailRow>
          <FeeRow fee={fee} token={vault.asset} />
        </dl>
        <ConfirmWithPasskeyButton onClick={confirm} />
      </>
    );
  }

  if (step === "processing") {
    return (
      <ProcessingStep
        title="Withdrawing"
        description={`Moving ${amountText} from ${vault.name} to your cash. Confirm with your passkey if asked.`}
      />
    );
  }

  if (step === "failed" && failure) {
    return (
      <FailureStep
        title="Withdrawal didn't go through"
        error={failure}
        onRetry={confirm}
        onBack={() => setStep("review")}
      />
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Withdraw from {vault.name}</DialogTitle>
      </DialogHeader>
      <AmountField
        label="Withdrawing"
        token={vault.asset}
        balance={currentValue}
        amount={amount}
        onAmountChange={setAmount}
        tokenAddon={<TokenLabel token={vault.asset} />}
      />
      {isOverBalance && (
        <p role="alert" className="text-sm text-destructive">
          That&apos;s more than this position holds.
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
        disabled={fee === null || isOverBalance}
        onClick={() => {
          idempotencyKey.renew();
          setStep("review");
        }}
      >
        {quoteState.status === "loading"
          ? "Getting a quote…"
          : isFull
            ? "Review full withdrawal"
            : "Review"}
        <ArrowRight data-icon="inline-end" />
      </Button>
    </>
  );
}
