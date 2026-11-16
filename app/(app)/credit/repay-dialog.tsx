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

import { ArrowRight, Refresh } from "iconoir-react";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  executePayOff,
  executeRepay,
  quotePayOff,
  quoteRepay,
  type Loan,
  type LoanHealth,
} from "@/lib/app-kit/borrow";
import { failOperation, type OperationError } from "@/lib/app-kit/core";
import { formatTokenAmount, parseAmount } from "@/lib/format";
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
import { TokenLabel } from "../token-select";
import { useIdempotencyKey } from "../use-idempotency-key";
import { useQuote } from "../use-quote";

type Step = "amount" | "review" | "processing" | "failed";

const REPAY_MODES = ["part", "full"] as const;

type RepayMode = (typeof REPAY_MODES)[number];

function isRepayMode(value: unknown): value is RepayMode {
  return REPAY_MODES.some((mode) => mode === value);
}

// A full repayment closes the loan and returns all the collateral.
type Repayment =
  | { mode: "part"; amount: bigint; fee: bigint; health: LoanHealth }
  // Interest accrues until it lands, so it takes up to `amount`. The rest comes back.
  | { mode: "full"; amount: bigint; fee: bigint; collateralBack: bigint };

async function quoteRepayment(
  loan: Loan,
  mode: RepayMode,
  amount: bigint,
): Promise<Repayment> {
  if (mode === "part") return { mode, amount, ...(await quoteRepay(loan, amount)) };
  const { maxRepayment, fee, collateralBack } = await quotePayOff(loan);
  return { mode, amount: maxRepayment, fee, collateralBack };
}

type RepayDialogProps = { loan: Loan; cash: bigint };

export function RepayDialog({ loan, cash }: RepayDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="lg" />}>
        <Refresh data-icon="inline-start" />
        Repay
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <RepayFlow loan={loan} cash={cash} onComplete={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

type RepayFlowProps = RepayDialogProps & { onComplete: () => void };

function RepayFlow({ loan, cash, onComplete }: RepayFlowProps) {
  const wallet = useBusinessWallet();
  const refreshBalances = useRefreshBalances();
  const idempotencyKey = useIdempotencyKey();
  const [step, setStep] = useState<Step>("amount");
  const [mode, setMode] = useState<RepayMode>("part");
  const [amount, setAmount] = useState("");
  const [failure, setFailure] = useState<OperationError | null>(null);

  const partAmount = parseAmount(amount);
  const isOverDebt = mode === "part" && partAmount > loan.debt;
  const isPartOverBalance = mode === "part" && partAmount > cash;
  const canQuotePart = partAmount > BigInt(0) && !isOverDebt && !isPartOverBalance;
  // Paying off needs no amount. Paying part needs one that fits.
  const quoteKey = mode === "full" ? mode : canQuotePart ? `${mode}:${partAmount}` : null;
  const quoteState = useQuote(quoteKey, () => quoteRepayment(loan, mode, partAmount));
  const repayment = quoteState.status === "ready" ? quoteState.quote : null;
  const isOverBalance = isPartOverBalance || (repayment !== null && repayment.amount > cash);

  async function confirm(confirmed: Repayment) {
    setStep("processing");
    try {
      const receipt = await wallet.runOnce(idempotencyKey.key, (keyed) =>
        confirmed.mode === "full"
          ? executePayOff(keyed, loan)
          : executeRepay(keyed, loan, confirmed.amount),
      );
      const action = viewTransactionAction(receipt.explorerUrl);
      if (confirmed.mode === "full") {
        toast.success("Loan paid off", {
          description: `Your ${loan.market.collateral.symbol} is back in your account.`,
          action,
        });
      } else {
        toast.success("Repayment made", {
          description: `${formatTokenAmount(confirmed.amount)} USDC paid toward your loan.`,
          action,
        });
      }
      refreshBalances(receipt);
      onComplete();
    } catch (caught) {
      setFailure(failOperation("repay", caught, "The repayment didn't go through."));
      setStep("failed");
    }
  }

  if (step === "review" && repayment) {
    return (
      <RepayReview
        loan={loan}
        repayment={repayment}
        onBack={() => setStep("amount")}
        onConfirm={() => confirm(repayment)}
      />
    );
  }

  if (step === "processing" && repayment) {
    return (
      <ProcessingStep
        title="Repaying"
        description={
          repayment.mode === "full"
            ? "Paying off your loan and returning your collateral. Confirm with your passkey if asked."
            : `Paying ${formatTokenAmount(repayment.amount)} USDC toward your loan. Confirm with your passkey if asked.`
        }
      />
    );
  }

  if (step === "failed" && failure) {
    return (
      <FailureStep
        title="Repayment didn't go through"
        error={failure}
        onRetry={repayment ? () => confirm(repayment) : undefined}
        onBack={() => setStep("review")}
      />
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Repay your loan</DialogTitle>
        <DialogDescription>
          You owe {formatTokenAmount(loan.debt)} USDC against your{" "}
          {loan.market.collateral.symbol}.
        </DialogDescription>
      </DialogHeader>

      <ToggleGroup
        variant="outline"
        className="w-full"
        value={[mode]}
        onValueChange={(values) => {
          if (!isRepayMode(values[0])) return;
          setMode(values[0]);
          setAmount("");
        }}
      >
        <ToggleGroupItem value="part" className="flex-1">
          Repay part
        </ToggleGroupItem>
        <ToggleGroupItem value="full" className="flex-1">
          Repay in full
        </ToggleGroupItem>
      </ToggleGroup>

      {mode === "part" ? (
        <AmountField
          label="Repaying"
          token="USDC"
          // The slider runs up to what you owe, or what you have if that's less.
          balance={cash < loan.debt ? cash : loan.debt}
          amount={amount}
          onAmountChange={setAmount}
          tokenAddon={<TokenLabel token="USDC" />}
        />
      ) : (
        <dl className="flex flex-col gap-1">
          <DetailRow label="You owe">
            {formatTokenAmount(loan.debt)} USDC
          </DetailRow>
          {repayment && (
            <DetailRow label="Takes at most">
              {formatTokenAmount(repayment.amount)} USDC
            </DetailRow>
          )}
          <DetailRow label="Available">
            {formatTokenAmount(cash)} USDC
          </DetailRow>
        </dl>
      )}
      {isOverDebt && (
        <p role="alert" className="text-sm text-destructive">
          That&apos;s more than you owe.
        </p>
      )}
      {!isOverDebt && isOverBalance && (
        <p role="alert" className="text-sm text-destructive">
          That&apos;s more than you have available.
        </p>
      )}
      {quoteState.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {quoteState.error.message}
        </p>
      )}

      {repayment && (
        <DetailsSection title="Your loan after">
          <RepaymentResult loan={loan} repayment={repayment} />
        </DetailsSection>
      )}

      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={!repayment || isOverDebt || isOverBalance}
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

type RepayReviewProps = {
  loan: Loan;
  repayment: Repayment;
  onBack: () => void;
  onConfirm: () => void;
};

function RepayReview({ loan, repayment, onBack, onConfirm }: RepayReviewProps) {
  const amountText = `${formatTokenAmount(repayment.amount)} USDC`;

  return (
    <>
      <StepHeader title="Review" onBack={onBack} />

      <dl className="flex flex-col gap-1">
        <DetailRow label="Repaying">
          {repayment.mode === "full" ? `Up to ${amountText}` : amountText}
        </DetailRow>
        <RepaymentResult loan={loan} repayment={repayment} />
        <FeeRow fee={repayment.fee} />
      </dl>
      {repayment.mode === "full" && (
        <p className="text-sm text-muted-foreground">
          Interest adds up until the payment goes through, so this takes up to{" "}
          {amountText}. Whatever isn&apos;t needed comes straight back.
        </p>
      )}

      <ConfirmWithPasskeyButton onClick={onConfirm} />
    </>
  );
}

type RepaymentResultProps = { loan: Loan; repayment: Repayment };

function RepaymentResult({ loan, repayment }: RepaymentResultProps) {
  const { collateral } = loan.market;

  if (repayment.mode === "full") {
    return (
      <>
        <DetailRow label="You'll owe">Nothing</DetailRow>
        <DetailRow label="Collateral back">
          {formatTokenAmount(repayment.collateralBack, collateral.decimals)}{" "}
          {collateral.symbol}
        </DetailRow>
      </>
    );
  }

  return (
    <>
      <DetailRow label="You'll owe">
        {formatTokenAmount(loan.debt - repayment.amount)} USDC
      </DetailRow>
      <DetailRow label="Health after">
        <HealthValue health={repayment.health} />
      </DetailRow>
    </>
  );
}
