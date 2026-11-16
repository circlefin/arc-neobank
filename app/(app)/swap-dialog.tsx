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

import { ArrowRight, CoinsSwap, DataTransferBoth } from "iconoir-react";
import { useState } from "react";
import { toast } from "sonner";
import { parseUnits } from "viem";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { failOperation, type OperationError } from "@/lib/app-kit/core";
import { executeSwap, quoteSwap, type SwapQuote } from "@/lib/app-kit/swap";
import { formatPercent, formatTokenAmount, parseAmount } from "@/lib/format";
import type { Token } from "@/lib/tokens";
import { AmountField } from "./amount-field";
import { useBusinessWallet, useRefreshBalances } from "./business-wallet";
import { DetailRow, DetailsSection } from "./details-section";
import {
  ConfirmWithPasskeyButton,
  FailureStep,
  ProcessingStep,
  StepHeader,
  viewTransactionAction,
} from "./flow-steps";
import { TokenSelect } from "./token-select";
import { useIdempotencyKey } from "./use-idempotency-key";
import { useQuote } from "./use-quote";

// A percent with two decimals, read as basis points.
const BASIS_POINT_DECIMALS = 2;
const SLIPPAGE_PATTERN = /^\d{0,2}\.?\d{0,2}$/;
const SLIPPAGE_PRESETS = ["0.1", "0.5", "1"];
const DEFAULT_SLIPPAGE = "0.5";

function otherToken(token: Token): Token {
  return token === "USDC" ? "EURC" : "USDC";
}

function toBasisPoints(percentText: string) {
  if (!/\d/.test(percentText)) return BigInt(0);
  return parseUnits(percentText, BASIS_POINT_DECIMALS);
}

type Balances = Record<Token, bigint>;

// Price impact above this is called out before the user confirms.
const HIGH_PRICE_IMPACT_BASIS_POINTS = BigInt(100);

export function SwapDialog({ balances }: { balances: Balances }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button type="button" variant="outline" size="lg" />}
      >
        <CoinsSwap data-icon="inline-start" />
        Swap
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <SwapFlow balances={balances} onComplete={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

type SwapStep = "details" | "review" | "processing" | "failed";

type SwapFlowProps = { balances: Balances; onComplete: () => void };

function SwapFlow({ balances, onComplete }: SwapFlowProps) {
  const wallet = useBusinessWallet();
  const refreshBalances = useRefreshBalances();
  const idempotencyKey = useIdempotencyKey();
  const [step, setStep] = useState<SwapStep>("details");
  const [from, setFrom] = useState<Token>("USDC");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE);
  const [failure, setFailure] = useState<OperationError | null>(null);

  const to = otherToken(from);
  const amountIn = parseAmount(amount);
  const slippageBasisPoints = toBasisPoints(slippage);
  const isOverBalance = amountIn > balances[from];
  const request = { from, to, amountIn, slippageBasisPoints };
  const quoteState = useQuote(
    amountIn > BigInt(0) && !isOverBalance
      ? `${from}:${amountIn}:${slippageBasisPoints}`
      : null,
    () => quoteSwap(wallet, request),
  );
  const quote = quoteState.status === "ready" ? quoteState.quote : null;
  const amountInText = `${formatTokenAmount(amountIn)} ${from}`;

  function selectFrom(next: Token) {
    setFrom(next);
    setAmount("");
  }

  async function confirm(confirmed: SwapQuote) {
    setStep("processing");
    try {
      const receipt = await wallet.runOnce(idempotencyKey.key, (keyed) =>
        executeSwap(keyed, confirmed),
      );
      toast.success("Swap complete", {
        description: `You swapped ${amountInText} for about ${formatTokenAmount(confirmed.expectedOut)} ${to}.`,
        action: viewTransactionAction(receipt.explorerUrl),
      });
      refreshBalances(receipt);
      onComplete();
    } catch (caught) {
      setFailure(failOperation("swap", caught, "The swap didn't go through."));
      setStep("failed");
    }
  }

  if (step === "review" && quote) {
    const expectedOutText = `${formatTokenAmount(quote.expectedOut)} ${to}`;
    return (
      <>
        <StepHeader title="Review" onBack={() => setStep("details")} />

        <dl className="flex flex-col gap-1">
          <DetailRow label="Swapping">{amountInText}</DetailRow>
          <DetailRow label="Receiving (est.)">{expectedOutText}</DetailRow>
          <DetailRow label="Exchange rate">
            1 {from} ≈ {formatTokenAmount(quote.rate)} {to}
          </DetailRow>
          <DetailRow label="Fee">
            {formatTokenAmount(quote.fee)} {from}
          </DetailRow>
          <DetailRow label="Network fee" valueClassName="text-success">
            Free
          </DetailRow>
          <DetailRow
            label="Price impact"
            valueClassName={
              quote.priceImpactBasisPoints > HIGH_PRICE_IMPACT_BASIS_POINTS
                ? "text-warning"
                : undefined
            }
          >
            {formatPercent(quote.priceImpactBasisPoints)}
          </DetailRow>
          <DetailRow label="Minimum received">
            {formatTokenAmount(quote.minimumOut)} {to}
          </DetailRow>
        </dl>

        <ConfirmWithPasskeyButton onClick={() => confirm(quote)} />
      </>
    );
  }

  if (step === "processing") {
    return (
      <ProcessingStep
        title="Swapping"
        description={`Swapping ${amountInText} for ${to}. Confirm with your passkey if asked.`}
      />
    );
  }

  if (step === "failed" && failure) {
    return (
      <FailureStep
        title="Swap didn't go through"
        error={failure}
        onRetry={quote ? () => confirm(quote) : undefined}
        onBack={() => setStep("review")}
      />
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Swap assets</DialogTitle>
      </DialogHeader>

      <AmountField
        key={from}
        label="Swapping"
        token={from}
        balance={balances[from]}
        amount={amount}
        onAmountChange={setAmount}
        tokenAddon={
          <TokenSelect
            label="Currency to swap"
            value={from}
            onValueChange={selectFrom}
          />
        }
      />
      {isOverBalance && (
        <p role="alert" className="text-sm text-destructive">
          That&apos;s more than you have available.
        </p>
      )}

      <div className="relative flex justify-center">
        <Separator className="absolute top-1/2" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Switch currencies"
          className="relative"
          onClick={() => selectFrom(to)}
        >
          <DataTransferBoth />
        </Button>
      </div>

      <Field>
        <div className="flex items-center justify-between">
          <FieldLabel htmlFor="swap-receiving">Receiving (est.)</FieldLabel>
          <FieldDescription className="text-xs">
            Available: {formatTokenAmount(balances[to])} {to}
          </FieldDescription>
        </div>
        <InputGroup className="h-12">
          <InputGroupInput
            id="swap-receiving"
            readOnly
            placeholder={quoteState.status === "loading" ? "Getting a quote…" : "0.00"}
            value={quote ? formatTokenAmount(quote.expectedOut) : ""}
            className="text-xl"
          />
          <InputGroupAddon align="inline-end">
            <TokenSelect
              label="Currency to receive"
              value={to}
              onValueChange={(next) => selectFrom(otherToken(next))}
            />
          </InputGroupAddon>
        </InputGroup>
      </Field>

      <DetailsSection title="Preferences" defaultOpen={false}>
        <Field>
          <FieldLabel htmlFor="swap-slippage">Slippage tolerance</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="swap-slippage"
              inputMode="decimal"
              value={slippage}
              onChange={(event) => {
                if (SLIPPAGE_PATTERN.test(event.target.value)) {
                  setSlippage(event.target.value);
                }
              }}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>%</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          <ToggleGroup
            variant="outline"
            className="w-full"
            value={[slippage]}
            onValueChange={(values) => {
              if (values[0] !== undefined) setSlippage(values[0]);
            }}
          >
            {SLIPPAGE_PRESETS.map((preset) => (
              <ToggleGroupItem key={preset} value={preset} className="flex-1">
                {preset}%
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
      </DetailsSection>

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
        Review
        <ArrowRight data-icon="inline-end" />
      </Button>
    </>
  );
}
