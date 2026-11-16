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
  ArrowRight,
  Cash,
  PlusCircle,
  ReceiveDollars,
  Wallet,
} from "iconoir-react";
import type { Icon } from "@/lib/icon";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { failOperation, type OperationError } from "@/lib/app-kit/core";
import type { ChainHoldings } from "@/lib/app-kit/treasury";
import { depositToUnifiedBalance } from "@/lib/app-kit/unified-balance";
import { readCashBalances } from "@/lib/business-account";
import { requireChainById } from "@/lib/chains";
import { formatTokenAmount, parseAmount } from "@/lib/format";
import { AmountField } from "./amount-field";
import { useBusinessWallet, useRefreshBalances } from "./business-wallet";
import { BuyUsdc, type PurchaseStatus } from "./buy-usdc";
import { DetailRow } from "./details-section";
import {
  ConfirmWithPasskeyButton,
  FailureStep,
  ProcessingStep,
  StepHeader,
  viewTransactionAction,
} from "./flow-steps";
import { TokenLabel } from "./token-select";
import { getUnifiedBalanceSigner } from "./unified-balance-key";
import { useIdempotencyKey } from "./use-idempotency-key";

type FundingMethod = {
  value: "local-currency" | "crypto";
  title: string;
  description: string;
  icon: Icon;
};

const FUNDING_METHODS: FundingMethod[] = [
  {
    value: "local-currency",
    title: "Local currency",
    description: "Buy USDC with your bank or card",
    icon: Cash,
  },
  {
    value: "crypto",
    title: "Crypto",
    description: "Move USDC from another chain",
    icon: Wallet,
  },
];

type Step = "choose-method" | FundingMethod["value"];

// How often to check for bought USDC once the widget is gone and can't tell us.
const ARRIVAL_CHECK_MILLISECONDS = 5_000;

const ARRIVED_TOAST = {
  title: "Money added",
  description: "Your USDC is in your account.",
};

type AddMoneyDialogProps = {
  userId: string;
  passkeyId: string;
  accountAddress: Address;
  usdcBalance: bigint;
  // USDC the account holds on each other chain.
  sources: ChainHoldings[];
};

export function AddMoneyDialog({
  userId,
  passkeyId,
  accountAddress,
  usdcBalance,
  sources,
}: AddMoneyDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("choose-method");
  const [method, setMethod] = useState(FUNDING_METHODS[0]);
  const [purchase, setPurchase] = useState<PurchaseStatus>("none");
  // The USDC balance when the user paid, so we can tell when the money lands.
  const [balanceWhenPaid, setBalanceWhenPaid] = useState(BigInt(0));

  const isOpen = useRef(open);
  useEffect(() => {
    isOpen.current = open;
  }, [open]);

  const arrive = useCallback(() => {
    router.refresh();
    // An open dialog shows the success step. A closed one gets a toast instead.
    if (isOpen.current) {
      setPurchase("arrived");
      return;
    }
    toast.success(ARRIVED_TOAST.title, {
      description: ARRIVED_TOAST.description,
    });
    setPurchase("none");
  }, [router]);

  const pay = useCallback(() => {
    setBalanceWhenPaid(usdcBalance);
    setPurchase("pending");
  }, [usdcBalance]);

  const fail = useCallback(() => setPurchase("none"), []);

  // Covers the dialog being closed mid-payment, and a settled event that never comes.
  useEffect(() => {
    if (purchase !== "pending") return;
    const interval = setInterval(async () => {
      try {
        const { USDC } = await readCashBalances(accountAddress);
        if (USDC > balanceWhenPaid) arrive();
      } catch (error) {
        console.error("Failed to check for bought USDC", error);
      }
    }, ARRIVAL_CHECK_MILLISECONDS);
    return () => clearInterval(interval);
  }, [purchase, accountAddress, balanceWhenPaid, arrive]);

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen && purchase === "pending") {
      toast.info("Adding money", {
        description: "We'll tell you when your USDC arrives.",
      });
    }
  }

  function reset() {
    setStep("choose-method");
    setMethod(FUNDING_METHODS[0]);
    if (purchase === "arrived") setPurchase("none");
  }

  return (
    // Resets once the close animation ends, so the first step doesn't flash.
    <Dialog
      open={open}
      onOpenChange={changeOpen}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) reset();
      }}
    >
      <DialogTrigger render={<Button type="button" size="lg" />}>
        <PlusCircle data-icon="inline-start" />
        Add money
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {step === "choose-method" ? (
          <ChooseMethod
            method={method}
            onMethodChange={setMethod}
            onContinue={() => setStep(method.value)}
          />
        ) : step === "local-currency" ? (
          <BuyUsdc
            userId={userId}
            passkeyId={passkeyId}
            accountAddress={accountAddress}
            purchase={purchase}
            onPaid={pay}
            onArrived={arrive}
            onFailed={fail}
            onBack={() => setStep("choose-method")}
            onDone={() => setOpen(false)}
          />
        ) : (
          <CryptoDeposit
            passkeyId={passkeyId}
            sources={sources}
            onBack={() => setStep("choose-method")}
            onComplete={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type ChooseMethodProps = {
  method: FundingMethod;
  onMethodChange: (method: FundingMethod) => void;
  onContinue: () => void;
};

function ChooseMethod({
  method,
  onMethodChange,
  onContinue,
}: ChooseMethodProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>How do you want to add money?</DialogTitle>
      </DialogHeader>
      <ReceiveDollars
        aria-hidden
        strokeWidth={1}
        className="mx-auto size-24 text-muted-foreground"
      />
      <DialogDescription>
        Buy USDC with money from your bank, or move USDC you already hold on
        another chain into your account.
      </DialogDescription>
      <RadioGroup
        value={method.value}
        onValueChange={(value) => {
          const next = FUNDING_METHODS.find((option) => option.value === value);
          if (next) onMethodChange(next);
        }}
      >
        {FUNDING_METHODS.map((option) => (
          <FieldLabel key={option.value} htmlFor={option.value}>
            <Field orientation="horizontal">
              <ItemMedia variant="icon" className="size-8 rounded-lg bg-muted">
                <option.icon />
              </ItemMedia>
              <FieldContent>
                <FieldTitle>{option.title}</FieldTitle>
                <FieldDescription>{option.description}</FieldDescription>
              </FieldContent>
              <RadioGroupItem
                id={option.value}
                value={option.value}
                className="sr-only"
              />
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
      <Button type="button" size="lg" className="w-full" onClick={onContinue}>
        Continue
      </Button>
    </>
  );
}

type DepositStep = "details" | "review" | "processing" | "failed";

type CryptoDepositProps = {
  passkeyId: string;
  sources: ChainHoldings[];
  onBack: () => void;
  onComplete: () => void;
};

function CryptoDeposit({ passkeyId, sources, onBack, onComplete }: CryptoDepositProps) {
  const wallet = useBusinessWallet();
  const refreshBalances = useRefreshBalances();
  const idempotencyKey = useIdempotencyKey();
  const [step, setStep] = useState<DepositStep>("details");
  // Start on the chain holding the most USDC.
  const [source, setSource] = useState(
    () => [...sources].sort((first, second) => (second.wallet > first.wallet ? 1 : -1))[0],
  );
  const [amount, setAmount] = useState("");
  const [failure, setFailure] = useState<OperationError | null>(null);
  const amountText = `${formatTokenAmount(parseAmount(amount))} USDC`;

  function selectSource(next: ChainHoldings) {
    setSource(next);
    setAmount("");
  }

  async function confirm() {
    setStep("processing");
    try {
      // Authorized with the first deposit on a chain, so Unified Balance can move to cash later.
      const signer = await getUnifiedBalanceSigner(passkeyId);
      const chain = requireChainById(source.chainId);
      const receipt = await wallet.runOnce(idempotencyKey.key, (keyed) =>
        depositToUnifiedBalance(keyed, { chain, amount: parseAmount(amount), signer }),
      );
      toast.success("Money on its way", {
        description: `${amountText} from ${source.label} joins your Unified Balance once ${source.label} confirms it, usually within 20 minutes.`,
        action: viewTransactionAction(receipt.explorerUrl),
      });
      refreshBalances(receipt, chain);
      onComplete();
    } catch (caught) {
      setFailure(failOperation("unified balance deposit", caught, "The deposit didn't go through."));
      setStep("failed");
    }
  }

  if (step === "failed" && failure) {
    return (
      <FailureStep
        title="Money wasn't added"
        error={failure}
        onRetry={confirm}
        onBack={() => setStep("review")}
      />
    );
  }

  if (step === "details") {
    return (
      <DepositDetails
        sources={sources}
        source={source}
        onSourceChange={selectSource}
        amount={amount}
        onAmountChange={setAmount}
        onBack={onBack}
        onContinue={() => {
          idempotencyKey.renew();
          setStep("review");
        }}
      />
    );
  }

  if (step === "review") {
    return (
      <DepositReview
        source={source}
        amountText={amountText}
        onBack={() => setStep("details")}
        onConfirm={confirm}
      />
    );
  }

  return (
    <ProcessingStep
      title="Adding money"
      description={`Moving ${amountText} from ${source.label} into your Unified Balance. Confirm with your passkey if asked.`}
    />
  );
}

type DepositDetailsProps = {
  sources: ChainHoldings[];
  source: ChainHoldings;
  onSourceChange: (source: ChainHoldings) => void;
  amount: string;
  onAmountChange: (amount: string) => void;
  onBack: () => void;
  onContinue: () => void;
};

function DepositDetails({
  sources,
  source,
  onSourceChange,
  amount,
  onAmountChange,
  onBack,
  onContinue,
}: DepositDetailsProps) {
  const amountValue = parseAmount(amount);
  const isOverBalance = amountValue > source.wallet;

  return (
    <>
      <StepHeader title="Add money from another chain" onBack={onBack} />

      <Field>
        <FieldLabel htmlFor="deposit-chain">From</FieldLabel>
        <Select
          value={String(source.chainId)}
          onValueChange={(chainId) => {
            const next = sources.find(
              (option) => String(option.chainId) === chainId,
            );
            if (next) onSourceChange(next);
          }}
        >
          <SelectTrigger id="deposit-chain" className="w-full">
            <SelectValue>{() => source.label}</SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {sources.map((option) => (
              <SelectItem key={option.chainId} value={String(option.chainId)}>
                {option.label} · {formatTokenAmount(option.wallet)} USDC
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <AmountField
        key={source.chainId}
        label="Amount"
        token="USDC"
        balance={source.wallet}
        amount={amount}
        onAmountChange={onAmountChange}
        tokenAddon={<TokenLabel token="USDC" />}
      />
      {isOverBalance && (
        <p role="alert" className="text-sm text-destructive">
          That&apos;s more than you have on {source.label}.
        </p>
      )}

      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={amountValue === BigInt(0) || isOverBalance}
        onClick={onContinue}
      >
        Review
        <ArrowRight data-icon="inline-end" />
      </Button>
    </>
  );
}

type DepositReviewProps = {
  source: ChainHoldings;
  amountText: string;
  onBack: () => void;
  onConfirm: () => void;
};

function DepositReview({
  source,
  amountText,
  onBack,
  onConfirm,
}: DepositReviewProps) {
  return (
    <>
      <StepHeader title="Review" onBack={onBack} />

      <dl className="flex flex-col gap-1">
        <DetailRow label="From">{source.label}</DetailRow>
        <DetailRow label="To">Unified Balance</DetailRow>
        <DetailRow label="Amount">{amountText}</DetailRow>
        <DetailRow label="Network fee" valueClassName="text-success">
          Free
        </DetailRow>
        <DetailRow label="Ready to spend">
          After {source.label} confirms, usually within 20 minutes
        </DetailRow>
      </dl>

      <ConfirmWithPasskeyButton onClick={onConfirm} />
    </>
  );
}
