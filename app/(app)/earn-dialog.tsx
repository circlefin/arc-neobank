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

import { ArrowRight, Reports } from "iconoir-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { ItemMedia } from "@/components/ui/item";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { failOperation, type OperationError } from "@/lib/app-kit/core";
import { depositToVault, quoteDepositFee, type Vault } from "@/lib/app-kit/earn";
import {
  BASIS_POINTS_PER_WHOLE,
  formatPercent,
  formatTokenAmount,
  parseAmount,
} from "@/lib/format";
import type { Token } from "@/lib/tokens";
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
import { TokenLabel, TOKEN_ICONS } from "./token-select";
import { useIdempotencyKey } from "./use-idempotency-key";
import { useQuote } from "./use-quote";

const MONTHS_PER_YEAR = BigInt(12);
const DAYS_PER_YEAR = BigInt(365);

type Step = "choose-vault" | "deposit" | "review" | "processing" | "failed";

type EarnDialogProps = {
  // Best APY first.
  vaults: Vault[];
  balances: Record<Token, bigint>;
};

export function EarnDialog({ vaults, balances }: EarnDialogProps) {
  const featured = vaults.at(0);
  if (!featured) {
    return (
      // A disabled button gets no pointer events, so the span carries the tooltip.
      <Tooltip>
        <TooltipTrigger render={<span tabIndex={0} />}>
          <Button type="button" variant="outline" size="lg" className="w-full" disabled>
            <Reports data-icon="inline-start" />
            Earn
          </Button>
        </TooltipTrigger>
        <TooltipContent>Earn isn&apos;t available right now</TooltipContent>
      </Tooltip>
    );
  }
  return <EarnFlow vaults={vaults} featured={featured} balances={balances} />;
}

function EarnFlow({ vaults, featured, balances }: EarnDialogProps & { featured: Vault }) {
  const wallet = useBusinessWallet();
  const refreshBalances = useRefreshBalances();
  const idempotencyKey = useIdempotencyKey();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("choose-vault");
  const [vault, setVault] = useState<Vault>(featured);
  const [acknowledged, setAcknowledged] = useState(false);
  const [amount, setAmount] = useState("");
  const [failure, setFailure] = useState<OperationError | null>(null);

  function reset() {
    setStep("choose-vault");
    setVault(featured);
    setAcknowledged(false);
    setAmount("");
  }

  const amountValue = parseAmount(amount);
  const amountText = `${formatTokenAmount(amountValue)} ${vault.asset}`;
  const quoteState = useQuote(
    amountValue > BigInt(0) && amountValue <= balances[vault.asset]
      ? `${vault.address}:${amount}`
      : null,
    () => quoteDepositFee(wallet, vault, amountValue),
  );
  const fee = quoteState.status === "ready" ? quoteState.quote : null;

  async function confirm() {
    setStep("processing");
    try {
      const receipt = await wallet.runOnce(idempotencyKey.key, (keyed) =>
        depositToVault(keyed, vault, amountValue),
      );
      toast.success("Deposit complete", {
        description: `${amountText} is now earning in ${vault.name}.`,
        action: viewTransactionAction(receipt.explorerUrl),
      });
      refreshBalances(receipt);
      setOpen(false);
    } catch (caught) {
      setFailure(failOperation("earn deposit", caught, "The deposit didn't go through."));
      setStep("failed");
    }
  }

  return (
    // Resets once the close animation ends, so the first step doesn't flash.
    <Dialog
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(open) => {
        if (!open) reset();
      }}
    >
      <DialogTrigger
        render={<Button type="button" variant="outline" size="lg" />}
      >
        <Reports data-icon="inline-start" />
        Earn
        <Badge variant="success">
          {formatPercent(featured.apyBasisPoints)} APY
        </Badge>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {step === "choose-vault" && (
          <ChooseVault
            vaults={vaults}
            vault={vault}
            onVaultChange={setVault}
            acknowledged={acknowledged}
            onAcknowledgedChange={setAcknowledged}
            onContinue={() => setStep("deposit")}
          />
        )}
        {step === "deposit" && (
          <Deposit
            vault={vault}
            balance={balances[vault.asset]}
            amount={amount}
            onAmountChange={setAmount}
            hasQuote={fee !== null}
            quoteError={quoteState.status === "error" ? quoteState.error : null}
            isQuoting={quoteState.status === "loading"}
            onBack={() => setStep("choose-vault")}
            onContinue={() => {
              idempotencyKey.renew();
              setStep("review");
            }}
          />
        )}
        {step === "review" && fee !== null && (
          <DepositReview
            vault={vault}
            amountText={amountText}
            fee={fee}
            onBack={() => setStep("deposit")}
            onConfirm={confirm}
          />
        )}
        {step === "processing" && (
          <ProcessingStep
            title="Depositing"
            description={`Moving ${amountText} into ${vault.name}. Confirm with your passkey if asked.`}
          />
        )}
        {step === "failed" && failure && (
          <FailureStep
            title="Deposit didn't go through"
            error={failure}
            onRetry={confirm}
            onBack={() => setStep("review")}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type ChooseVaultProps = {
  vaults: Vault[];
  vault: Vault;
  onVaultChange: (vault: Vault) => void;
  acknowledged: boolean;
  onAcknowledgedChange: (acknowledged: boolean) => void;
  onContinue: () => void;
};

function ChooseVault({
  vaults,
  vault,
  onVaultChange,
  acknowledged,
  onAcknowledgedChange,
  onContinue,
}: ChooseVaultProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>You are about to earn more</DialogTitle>
        <DialogDescription>
          Put idle USDC or EURC in a savings vault and earn yield on it.
        </DialogDescription>
      </DialogHeader>

      <RadioGroup
        value={vault.address}
        onValueChange={(address) => {
          const next = vaults.find((option) => option.address === address);
          if (next) onVaultChange(next);
        }}
      >
        {vaults.map((option) => {
          const Icon = TOKEN_ICONS[option.asset];
          return (
            <FieldLabel key={option.address} htmlFor={option.address}>
              <Field orientation="horizontal">
                <ItemMedia variant="icon" className="size-8">
                  <Icon className="size-8" strokeWidth={1.5} />
                </ItemMedia>
                <FieldContent>
                  <FieldTitle>
                    {option.name}
                    <Badge variant="success">
                      {formatPercent(option.apyBasisPoints)} APY
                    </Badge>
                  </FieldTitle>
                  <FieldDescription>
                    {option.protocol} · {option.asset} ·{" "}
                    {formatTokenAmount(option.liquidity)} available ·{" "}
                    <span className={option.risk === "Low" ? undefined : "text-warning"}>
                      {option.risk} risk
                    </span>
                  </FieldDescription>
                </FieldContent>
                <RadioGroupItem
                  id={option.address}
                  value={option.address}
                  className="sr-only"
                />
              </Field>
            </FieldLabel>
          );
        })}
      </RadioGroup>

      <DetailsSection title="Vault details">
        <DetailRow label="Protocol">{vault.protocol}</DetailRow>
        {vault.curator && <DetailRow label="Curator">{vault.curator}</DetailRow>}
        <DetailRow label="Asset">{vault.asset}</DetailRow>
        <DetailRow label="Available to withdraw">
          {formatTokenAmount(vault.liquidity)} {vault.asset}
        </DetailRow>
        <DetailRow
          label="Risk"
          valueClassName={vault.risk === "Low" ? undefined : "text-warning"}
        >
          {vault.risk}
        </DetailRow>
        {vault.riskNotes.map((note) => (
          <p key={note} className="text-xs text-muted-foreground">
            {note}
          </p>
        ))}
      </DetailsSection>

      <Field orientation="horizontal">
        <Checkbox
          id="earn-acknowledgement"
          checked={acknowledged}
          onCheckedChange={onAcknowledgedChange}
        />
        <FieldLabel htmlFor="earn-acknowledgement" className="font-normal">
          I understand returns change over time and my money goes into
          protocols run by others.
        </FieldLabel>
      </Field>

      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={!acknowledged}
        onClick={onContinue}
      >
        Continue
        <ArrowRight data-icon="inline-end" />
      </Button>
    </>
  );
}

type DepositProps = {
  vault: Vault;
  balance: bigint;
  amount: string;
  onAmountChange: (amount: string) => void;
  hasQuote: boolean;
  quoteError: OperationError | null;
  isQuoting: boolean;
  onBack: () => void;
  onContinue: () => void;
};

function Deposit({
  vault,
  balance,
  amount,
  onAmountChange,
  hasQuote,
  quoteError,
  isQuoting,
  onBack,
  onContinue,
}: DepositProps) {
  const amountValue = parseAmount(amount);
  const isOverBalance = amountValue > balance;
  const annualYield =
    (amountValue * vault.apyBasisPoints) / BASIS_POINTS_PER_WHOLE;

  return (
    <>
      <StepHeader title="How much are you depositing?" onBack={onBack} />

      <AmountField
        label="Depositing"
        token={vault.asset}
        balance={balance}
        amount={amount}
        onAmountChange={onAmountChange}
        tokenAddon={<TokenLabel token={vault.asset} />}
      />
      {isOverBalance && (
        <p role="alert" className="text-sm text-destructive">
          That&apos;s more than you have available.
        </p>
      )}
      {quoteError && (
        <p role="alert" className="text-sm text-destructive">
          {quoteError.message}
        </p>
      )}

      <DetailsSection title="Projected yield">
        <DetailRow label="Projected daily yield">
          {formatTokenAmount(annualYield / DAYS_PER_YEAR)} {vault.asset}
        </DetailRow>
        <DetailRow label="Projected monthly yield">
          {formatTokenAmount(annualYield / MONTHS_PER_YEAR)} {vault.asset}
        </DetailRow>
        <DetailRow label="Projected annual yield">
          {formatTokenAmount(annualYield)} {vault.asset}
        </DetailRow>
      </DetailsSection>

      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={!hasQuote || isOverBalance}
        onClick={onContinue}
      >
        {isQuoting ? "Getting a quote…" : "Review"}
        <ArrowRight data-icon="inline-end" />
      </Button>
    </>
  );
}

type DepositReviewProps = {
  vault: Vault;
  amountText: string;
  fee: bigint;
  onBack: () => void;
  onConfirm: () => void;
};

function DepositReview({
  vault,
  amountText,
  fee,
  onBack,
  onConfirm,
}: DepositReviewProps) {
  return (
    <>
      <StepHeader title="Review" onBack={onBack} />

      <dl className="flex flex-col gap-1">
        <DetailRow label="Vault">{vault.name}</DetailRow>
        <DetailRow label="Amount">{amountText}</DetailRow>
        <DetailRow label="APY (variable)">
          {formatPercent(vault.apyBasisPoints)}
        </DetailRow>
        <FeeRow fee={fee} token={vault.asset} />
        <DetailRow label="Withdraw">Any time, in part or in full</DetailRow>
      </dl>

      <ConfirmWithPasskeyButton onClick={onConfirm} />
    </>
  );
}
