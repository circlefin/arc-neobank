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

import { ArrowRight, Plus } from "iconoir-react";
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
import { InputGroupText } from "@/components/ui/input-group";
import {
  executeAddCollateral,
  quoteAddCollateral,
  toBorrowingPower,
  type ChangeQuote,
  type Loan,
} from "@/lib/app-kit/borrow";
import { failOperation, type OperationError } from "@/lib/app-kit/core";
import { formatTokenAmount, formatUsd, parseAmount } from "@/lib/format";
import { AmountField } from "../amount-field";
import { useBusinessWallet, useRefreshBalances } from "../business-wallet";
import { DetailRow, DetailsSection, FeeRow } from "../details-section";
import {
  ConfirmWithPasskeyButton,
  FailureStep,
  ProcessingStep,
  StepHeader,
  viewTransactionAction,
} from "../flow-steps";
import { HealthValue } from "../loan-health";
import { useIdempotencyKey } from "../use-idempotency-key";
import { useQuote } from "../use-quote";

type Step = "amount" | "review" | "processing" | "failed";

export function AddCollateralDialog({ loan }: { loan: Loan }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button type="button" variant="outline" size="lg" />}
      >
        <Plus data-icon="inline-start" />
        Add collateral
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <AddCollateralFlow loan={loan} onComplete={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

type AddCollateralFlowProps = { loan: Loan; onComplete: () => void };

function AddCollateralFlow({ loan, onComplete }: AddCollateralFlowProps) {
  const wallet = useBusinessWallet();
  const refreshBalances = useRefreshBalances();
  const idempotencyKey = useIdempotencyKey();
  const [step, setStep] = useState<Step>("amount");
  const [amount, setAmount] = useState("");
  const [failure, setFailure] = useState<OperationError | null>(null);

  const { collateral } = loan.market;
  const addAmount = parseAmount(amount, collateral.decimals);
  const isOverBalance = addAmount > collateral.walletBalance;
  const quoteState = useQuote(
    addAmount > BigInt(0) && !isOverBalance ? amount : null,
    () => quoteAddCollateral(loan, addAmount),
  );
  const quote = quoteState.status === "ready" ? quoteState.quote : null;
  const amountText = `${formatTokenAmount(addAmount, collateral.decimals)} ${collateral.symbol}`;

  async function confirm() {
    setStep("processing");
    try {
      const receipt = await wallet.runOnce(idempotencyKey.key, (keyed) =>
        executeAddCollateral(keyed, loan, addAmount),
      );
      toast.success("Collateral added", {
        description: `${amountText} now backs your loan.`,
        action: viewTransactionAction(receipt.explorerUrl),
      });
      refreshBalances(receipt);
      onComplete();
    } catch (caught) {
      setFailure(failOperation("add collateral", caught, "The collateral wasn't added."));
      setStep("failed");
    }
  }

  if (step === "review" && quote) {
    return (
      <>
        <StepHeader title="Review" onBack={() => setStep("amount")} />

        <dl className="flex flex-col gap-1">
          <DetailRow label="Adding">{amountText}</DetailRow>
          <DetailRow label="Health now">
            <HealthValue health={loan.health} />
          </DetailRow>
          <CollateralResult loan={loan} addAmount={addAmount} quote={quote} />
          <FeeRow fee={quote.fee} />
        </dl>

        <ConfirmWithPasskeyButton onClick={confirm} />
      </>
    );
  }

  if (step === "processing") {
    return (
      <ProcessingStep
        title="Adding collateral"
        description={`Depositing ${amountText} into your loan. Confirm with your passkey if asked.`}
      />
    );
  }

  if (step === "failed" && failure) {
    return (
      <FailureStep
        title="Collateral wasn't added"
        error={failure}
        onRetry={confirm}
        onBack={() => setStep("review")}
      />
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add collateral</DialogTitle>
        <DialogDescription>
          More {collateral.symbol} behind your loan makes it healthier and lets
          you borrow more.
        </DialogDescription>
      </DialogHeader>

      <AmountField
        label="Adding"
        token={collateral.symbol}
        decimals={collateral.decimals}
        balance={collateral.walletBalance}
        amount={amount}
        onAmountChange={setAmount}
        tokenAddon={<InputGroupText>{collateral.symbol}</InputGroupText>}
      />
      {isOverBalance && (
        <p role="alert" className="text-sm text-destructive">
          That&apos;s more than you have available.
        </p>
      )}
      {quoteState.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {quoteState.error.message}
        </p>
      )}

      {quote && (
        <DetailsSection title="Your loan after">
          <CollateralResult loan={loan} addAmount={addAmount} quote={quote} />
        </DetailsSection>
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

type CollateralResultProps = {
  loan: Loan;
  addAmount: bigint;
  quote: ChangeQuote;
};

function CollateralResult({ loan, addAmount, quote }: CollateralResultProps) {
  const { market } = loan;
  const collateralAfter = loan.collateral + addAmount;

  return (
    <>
      <DetailRow label="Collateral">
        {formatTokenAmount(collateralAfter, market.collateral.decimals)}{" "}
        {market.collateral.symbol}
      </DetailRow>
      <DetailRow label="Borrowing power">
        {formatUsd(toBorrowingPower(market, collateralAfter))}
      </DetailRow>
      <DetailRow label="Health after">
        <HealthValue health={quote.health} />
      </DetailRow>
    </>
  );
}
