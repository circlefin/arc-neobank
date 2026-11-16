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

import { ArrowRight, HandCash } from "iconoir-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  executeBorrow,
  quoteBorrow,
  type BorrowMarket,
  type BorrowQuote,
  type Credit,
  type Loan,
} from "@/lib/app-kit/borrow";
import { failOperation, type OperationError } from "@/lib/app-kit/core";
import { formatPercent, formatTokenAmount, parseAmount } from "@/lib/format";
import { AmountField } from "./amount-field";
import { useBusinessWallet, useRefreshBalances } from "./business-wallet";
import { DetailRow, DetailsSection, FeeRow } from "./details-section";
import {
  ConfirmWithPasskeyButton,
  FailureStep,
  ProcessingStep,
  StepHeader,
  viewTransactionAction,
} from "./flow-steps";
import { HealthValue, LiquidationPrice } from "./loan-health";
import { TokenLabel } from "./token-select";
import { useIdempotencyKey } from "./use-idempotency-key";
import { useQuote } from "./use-quote";

type Step = "choose-market" | "amount" | "review" | "processing" | "failed";

type BorrowDialogProps = { credit: Credit; className?: string };

export function BorrowDialog({ credit, className }: BorrowDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="lg"
            className={className}
          />
        }
      >
        <HandCash data-icon="inline-start" />
        Borrow
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <BorrowFlow credit={credit} onComplete={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

type BorrowFlowProps = { credit: Credit; onComplete: () => void };

function BorrowFlow({ credit, onComplete }: BorrowFlowProps) {
  const wallet = useBusinessWallet();
  const refreshBalances = useRefreshBalances();
  const idempotencyKey = useIdempotencyKey();
  const [step, setStep] = useState<Step>("choose-market");
  const [marketId, setMarketId] = useState(credit.markets[0]?.id);
  const [amount, setAmount] = useState("");
  const [failure, setFailure] = useState<OperationError | null>(null);

  const market = credit.markets.find(({ id }) => id === marketId);
  const loan = findLoan(credit, market);
  const borrowAmount = parseAmount(amount);
  const isOverLimit = market !== undefined && borrowAmount > market.borrowLimit;
  const quoteState = useQuote(
    market && borrowAmount > BigInt(0) && !isOverLimit
      ? `${market.id}:${borrowAmount}`
      : null,
    () =>
      quoteBorrow(wallet.address, requireMarket(market), loan, borrowAmount),
  );
  const quote = quoteState.status === "ready" ? quoteState.quote : null;
  const amountText = `${formatTokenAmount(borrowAmount)} USDC`;

  async function confirm(confirmed: BorrowQuote) {
    const borrowing = requireMarket(market);
    setStep("processing");
    try {
      const receipt = await wallet.runOnce(idempotencyKey.key, (keyed) =>
        executeBorrow(keyed, borrowing, loan, confirmed.amount),
      );
      toast.success("Money borrowed", {
        description: `${amountText} is in your account.`,
        action: viewTransactionAction(receipt.explorerUrl),
      });
      refreshBalances(receipt);
      onComplete();
    } catch (caught) {
      setFailure(
        failOperation("borrow", caught, "The borrow didn't go through."),
      );
      setStep("failed");
    }
  }

  if (step === "amount" && market) {
    return (
      <BorrowAmount
        market={market}
        amount={amount}
        onAmountChange={setAmount}
        quote={quote}
        quoteError={quoteState.status === "error" ? quoteState.error : null}
        isQuoting={quoteState.status === "loading"}
        onBack={() => setStep("choose-market")}
        onContinue={() => {
          idempotencyKey.renew();
          setStep("review");
        }}
      />
    );
  }

  if (step === "review" && market && quote) {
    return (
      <BorrowReview
        market={market}
        loan={loan}
        amountText={amountText}
        quote={quote}
        onBack={() => setStep("amount")}
        onConfirm={() => confirm(quote)}
      />
    );
  }

  if (step === "processing" && market) {
    return (
      <ProcessingStep
        title="Borrowing"
        description={`Depositing your ${market.collateral.symbol} and borrowing ${amountText}. Confirm with your passkey if asked.`}
      />
    );
  }

  if (step === "failed" && failure) {
    return (
      <FailureStep
        title="Borrow didn't go through"
        error={failure}
        onRetry={quote ? () => confirm(quote) : undefined}
        onBack={() => setStep("review")}
      />
    );
  }

  return (
    <ChooseMarket
      credit={credit}
      market={market}
      onMarketChange={(next) => {
        setMarketId(next);
        setAmount("");
      }}
      onContinue={() => setStep("amount")}
    />
  );
}

function findLoan({ loans }: Credit, market: BorrowMarket | undefined) {
  return loans.find((loan) => loan.market.id === market?.id);
}

// The steps after choosing only show once a market is chosen.
function requireMarket(market: BorrowMarket | undefined) {
  if (!market) throw new Error("No market is chosen.");
  return market;
}

type ChooseMarketProps = {
  credit: Credit;
  market: BorrowMarket | undefined;
  onMarketChange: (marketId: string) => void;
  onContinue: () => void;
};

function ChooseMarket({
  credit,
  market,
  onMarketChange,
  onContinue,
}: ChooseMarketProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Borrow USDC</DialogTitle>
        <DialogDescription>
          Pick what to borrow against. You keep it, and get it back when you
          repay.
        </DialogDescription>
      </DialogHeader>

      {credit.markets.length === 0 ? (
        <Empty className="p-2">
          <EmptyDescription>
            There&apos;s nothing to borrow against right now.
          </EmptyDescription>
        </Empty>
      ) : (
        <RadioGroup value={market?.id} onValueChange={onMarketChange}>
          {credit.markets.map((option) => (
            <FieldLabel key={option.id} htmlFor={option.id}>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>
                    Against {option.collateral.symbol}
                    <Badge variant="outline">
                      {formatPercent(option.borrowApyBasisPoints)} APY
                    </Badge>
                  </FieldTitle>
                  <FieldDescription>
                    {findLoan(credit, option)
                      ? "Adds to your loan in this market"
                      : `Deposit ${option.collateral.symbol} and borrow USDC`}
                  </FieldDescription>
                </FieldContent>
                <RadioGroupItem
                  id={option.id}
                  value={option.id}
                  className="sr-only"
                />
              </Field>
            </FieldLabel>
          ))}
        </RadioGroup>
      )}

      {market && (
        <DetailsSection title="Market details">
          <DetailRow label="Protocol">{market.protocol}</DetailRow>
          <DetailRow label="Collateral">{market.collateral.symbol}</DetailRow>
          <DetailRow label="Borrow rate">
            {formatPercent(market.borrowApyBasisPoints)} APY
          </DetailRow>
          <DetailRow label="Liquidation threshold">
            {formatPercent(market.liquidationThresholdBasisPoints)}
          </DetailRow>
          <DetailRow label="Available to borrow">
            {formatTokenAmount(market.liquidity)} USDC
          </DetailRow>
          <DetailRow label={`${market.collateral.symbol} in your account`}>
            {formatTokenAmount(
              market.collateral.walletBalance,
              market.collateral.decimals,
            )}{" "}
            {market.collateral.symbol}
          </DetailRow>
        </DetailsSection>
      )}

      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={!market}
        onClick={onContinue}
      >
        Continue
        <ArrowRight data-icon="inline-end" />
      </Button>
    </>
  );
}

type BorrowAmountProps = {
  market: BorrowMarket;
  amount: string;
  onAmountChange: (amount: string) => void;
  quote: BorrowQuote | null;
  quoteError: OperationError | null;
  isQuoting: boolean;
  onBack: () => void;
  onContinue: () => void;
};

function BorrowAmount({
  market,
  amount,
  onAmountChange,
  quote,
  quoteError,
  isQuoting,
  onBack,
  onContinue,
}: BorrowAmountProps) {
  const { collateral } = market;
  const isOverLimit = parseAmount(amount) > market.borrowLimit;

  return (
    <>
      <StepHeader title="How much are you borrowing?" onBack={onBack} />

      <AmountField
        label="Borrowing"
        token="USDC"
        balance={market.borrowLimit}
        amount={amount}
        onAmountChange={onAmountChange}
        tokenAddon={<TokenLabel token="USDC" />}
      />
      {market.borrowLimit === BigInt(0) && (
        <p className="text-sm text-muted-foreground">
          Add {collateral.symbol} to your account to borrow against it.
        </p>
      )}
      {isOverLimit && (
        <p role="alert" className="text-sm text-destructive">
          That&apos;s more than your collateral supports.
        </p>
      )}
      {quoteError && (
        <p role="alert" className="text-sm text-destructive">
          {quoteError.message}
        </p>
      )}

      {quote && (
        <DetailsSection title="Your loan after">
          <DetailRow label="Collateral added">
            {formatTokenAmount(quote.collateralAdded, collateral.decimals)}{" "}
            {collateral.symbol}
          </DetailRow>
          <DetailRow label="Health after">
            <HealthValue health={quote.health} />
          </DetailRow>
          <DetailRow label="Liquidation price">
            <LiquidationPrice
              market={market}
              price={quote.health.liquidationPrice}
            />
          </DetailRow>
        </DetailsSection>
      )}

      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={!quote || isOverLimit}
        onClick={onContinue}
      >
        {isQuoting ? "Getting a quote…" : "Review"}
        <ArrowRight data-icon="inline-end" />
      </Button>
    </>
  );
}

type BorrowReviewProps = {
  market: BorrowMarket;
  loan: Loan | undefined;
  amountText: string;
  quote: BorrowQuote;
  onBack: () => void;
  onConfirm: () => void;
};

function BorrowReview({
  market,
  loan,
  amountText,
  quote,
  onBack,
  onConfirm,
}: BorrowReviewProps) {
  const { collateral } = market;

  return (
    <>
      <StepHeader title="Review" onBack={onBack} />

      <dl className="flex flex-col gap-1">
        <DetailRow label="Borrowing">{amountText}</DetailRow>
        <DetailRow label="Collateral added">
          {formatTokenAmount(quote.collateralAdded, collateral.decimals)}{" "}
          {collateral.symbol}
        </DetailRow>
        <DetailRow label="Borrow rate">
          {formatPercent(market.borrowApyBasisPoints)} APY
        </DetailRow>
        {loan && (
          <DetailRow label="Health now">
            <HealthValue health={loan.health} />
          </DetailRow>
        )}
        <DetailRow label="Health after">
          <HealthValue health={quote.health} />
        </DetailRow>
        <DetailRow label="Liquidation price">
          <LiquidationPrice
            market={market}
            price={quote.health.liquidationPrice}
          />
        </DetailRow>
        <FeeRow fee={quote.fee} />
      </dl>

      <ConfirmWithPasskeyButton onClick={onConfirm} />
    </>
  );
}
