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
  ArrowSeparate,
  CheckCircle,
  Circle,
  XmarkCircle,
} from "iconoir-react";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  BRIDGE_STAGES,
  executeBridge,
  quoteBridge,
  resumeBridge,
  type BridgeOutcome,
  type InterruptedBridge,
  type BridgeQuote,
  type BridgeRoute,
  type BridgeStage,
  type StageStatus,
  type StageUpdate,
} from "@/lib/app-kit/bridge";
import { failOperation, type OperationError } from "@/lib/app-kit/core";
import type { ChainHoldings } from "@/lib/app-kit/treasury";
import {
  ARC,
  OTHER_CHAINS,
  SOLANA,
  isAppChain,
  type AppChain,
  type PayoutChain,
} from "@/lib/chains";
import { formatAddress, formatTokenAmount, parseAmount } from "@/lib/format";
import { isSolanaAddress } from "@/lib/solana";
import { AmountField } from "./amount-field";
import { useBusinessWallet, useRefreshBalances } from "./business-wallet";
import { DetailRow } from "./details-section";
import {
  ConfirmWithPasskeyButton,
  FailureStep,
  StepHeader,
  viewTransactionAction,
} from "./flow-steps";
import { TokenLabel } from "./token-select";
import { useIdempotencyKey } from "./use-idempotency-key";
import { useQuote } from "./use-quote";

type Direction = "out" | "in";

type MoveDialogProps = {
  // USDC cash on Arc.
  cash: bigint;
  // USDC the account holds on each other chain.
  chains: ChainHoldings[];
};

// Moves USDC between cash on Arc and the account on another chain, or out to a Solana address.
export function MoveDialog({ cash, chains }: MoveDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("details");

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // Closing mid-move would drop its progress.
        if (step !== "moving") setOpen(nextOpen);
      }}
      // A paused move stays, so reopening shows where it stopped and Resume.
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen && step !== "interrupted") setStep("details");
      }}
    >
      <DialogTrigger render={<Button type="button" variant="outline" size="lg" />}>
        <ArrowSeparate data-icon="inline-start" />
        Move
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={step !== "moving"}
        keepMounted={step === "interrupted"}
      >
        <MoveFlow
          cash={cash}
          chains={chains}
          step={step}
          onStepChange={setStep}
          onComplete={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

type Step = "details" | "review" | "moving" | "interrupted" | "failed";

type Stages = Record<BridgeStage, StageStatus>;

const WAITING_STAGES: Stages = {
  approve: "waiting",
  burn: "waiting",
  fetchAttestation: "waiting",
  mint: "waiting",
};

type MoveFlowProps = MoveDialogProps & {
  step: Step;
  onStepChange: (step: Step) => void;
  onComplete: () => void;
};

function MoveFlow({ cash, chains, step, onStepChange: setStep, onComplete }: MoveFlowProps) {
  const wallet = useBusinessWallet();
  const refreshBalances = useRefreshBalances();
  const idempotencyKey = useIdempotencyKey();
  const [direction, setDirection] = useState<Direction>("out");
  const [other, setOther] = useState<AppChain | PayoutChain>(OTHER_CHAINS[0]);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [stages, setStages] = useState<Stages>(WAITING_STAGES);
  const [interrupted, setInterrupted] = useState<InterruptedBridge | null>(null);
  const [failure, setFailure] = useState<OperationError | null>(null);

  // Only the account's own chains can send into Arc, so Solana is always out of Arc.
  const destinations = direction === "out" ? [...OTHER_CHAINS, SOLANA] : OTHER_CHAINS;
  const from: AppChain = direction === "out" || !isAppChain(other) ? ARC : other;
  const to: AppChain | PayoutChain = direction === "out" ? other : ARC;
  const balance =
    from === ARC
      ? cash
      : (chains.find(({ chainId }) => chainId === from.viem.id)?.wallet ?? BigInt(0));
  const amountValue = parseAmount(amount);
  const isOverBalance = amountValue > balance;
  const recipientProblem =
    !isAppChain(to) && recipient !== "" && !isSolanaAddress(recipient)
      ? "That isn't a valid Solana address."
      : null;
  const route: BridgeRoute | null = isAppChain(to)
    ? { from, to, amount: amountValue }
    : isSolanaAddress(recipient)
      ? { from, to, recipient, amount: amountValue }
      : null;
  const quoteState = useQuote(
    route && amountValue > BigInt(0) && !isOverBalance
      ? `${from.kitChain}:${to.kitChain}:${"recipient" in route ? route.recipient : ""}:${amountValue}`
      : null,
    () => {
      if (!route) throw new Error("Enter where to send the money.");
      return quoteBridge(wallet, route);
    },
  );
  const quote = quoteState.status === "ready" ? quoteState.quote : null;

  function trackStage({ stage, status }: StageUpdate) {
    setStages((current) => ({ ...current, [stage]: status }));
  }

  async function run(move: () => Promise<BridgeOutcome>, confirmed: BridgeQuote) {
    setStep("moving");
    try {
      const outcome = await move();
      if (outcome.status === "interrupted") {
        if (outcome.failedStage) trackStage({ stage: outcome.failedStage, status: "failed" });
        setInterrupted(outcome);
        setStep("interrupted");
        return;
      }
      toast.success("Money moved", {
        description: `${formatTokenAmount(confirmed.received)} USDC arrived ${describeDestination(confirmed)}.`,
        action: viewTransactionAction(outcome.explorerUrl),
      });
      refreshBalances(outcome.arcReceipt);
      onComplete();
    } catch (caught) {
      setFailure(failOperation("bridge", caught, "The move didn't go through."));
      setStep("failed");
    }
  }

  function start(confirmed: BridgeQuote) {
    setStages(WAITING_STAGES);
    void run(async () => {
      const outcome = await wallet.runOnce(idempotencyKey.key, (keyed) =>
        executeBridge(keyed, confirmed, trackStage),
      );
      // An earlier try already went through, so all there is is its receipt.
      return "status" in outcome ? outcome : { status: "done", explorerUrl: outcome.explorerUrl };
    }, confirmed);
  }

  function resume(confirmed: BridgeQuote, outcome: InterruptedBridge) {
    void run(() => resumeBridge(wallet, outcome.result, trackStage), confirmed);
  }

  if (step === "review" && quote) {
    return (
      <>
        <StepHeader title="Review" onBack={() => setStep("details")} />
        <dl className="flex flex-col gap-1">
          <DetailRow label="From">Your account on {from.label}</DetailRow>
          <DetailRow label="To">
            {"recipient" in quote ? (
              <span className="break-all">{quote.recipient} on {quote.to.label}</span>
            ) : (
              `Your account on ${quote.to.label}`
            )}
          </DetailRow>
          <DetailRow label="Amount">{formatTokenAmount(quote.amount)} USDC</DetailRow>
          <DetailRow label="Fee">{formatTokenAmount(quote.fee)} USDC</DetailRow>
          <DetailRow label="Network fee" valueClassName="text-success">
            Free
          </DetailRow>
          <DetailRow label="You receive">
            {formatTokenAmount(quote.received)} USDC
          </DetailRow>
          <DetailRow label="Estimated time">{quote.estimatedDuration}</DetailRow>
        </dl>
        <ConfirmWithPasskeyButton onClick={() => start(quote)} />
      </>
    );
  }

  if ((step === "moving" || step === "interrupted") && quote) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>
            {step === "moving" ? "Moving money" : "Your move paused"}
          </DialogTitle>
          <DialogDescription>
            {step === "moving"
              ? `Moving ${formatTokenAmount(quote.amount)} USDC from ${quote.from.label} to ${quote.to.label}. Keep this open until it's done.`
              : "Your money is safe. Resume to finish the move from where it stopped. Nothing is sent twice."}
          </DialogDescription>
        </DialogHeader>
        <StageList stages={stages} from={quote.from} to={quote.to} />
        {step === "interrupted" && interrupted && (
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => resume(quote, interrupted)}
          >
            Resume
          </Button>
        )}
      </>
    );
  }

  if (step === "failed" && failure) {
    return (
      <FailureStep
        title="Money wasn't moved"
        error={failure}
        onRetry={quote ? () => start(quote) : undefined}
        onBack={() => setStep("review")}
      />
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Move money</DialogTitle>
        <DialogDescription>
          Move USDC between your cash on Arc and your account on another chain, or send it
          out to a Solana address.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-2">
        <Field>
          <FieldLabel htmlFor="move-direction">Direction</FieldLabel>
          <Select
            value={direction}
            onValueChange={(next) => {
              if (next === "out" || next === "in") {
                setDirection(next);
                // Solana can only receive, so going into Arc starts from the first own chain.
                if (next === "in" && !isAppChain(other)) setOther(OTHER_CHAINS[0]);
                setAmount("");
              }
            }}
          >
            <SelectTrigger id="move-direction" className="w-full">
              <SelectValue>
                {(value) => (value === "out" ? "Out of Arc" : "Into Arc")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectItem value="out">Out of Arc</SelectItem>
              <SelectItem value="in">Into Arc</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="move-chain">
            {direction === "out" ? "To" : "From"}
          </FieldLabel>
          <Select
            value={String(other.kitChain)}
            onValueChange={(kitChain) => {
              const next = destinations.find((chain) => chain.kitChain === kitChain);
              if (next) {
                setOther(next);
                setAmount("");
              }
            }}
          >
            <SelectTrigger id="move-chain" className="w-full">
              <SelectValue>{() => other.label}</SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {destinations.map((chain) => (
                <SelectItem key={chain.kitChain} value={chain.kitChain}>
                  {chain.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {!isAppChain(to) && (
        <Field data-invalid={recipientProblem !== null}>
          <FieldLabel htmlFor="move-recipient">Solana address</FieldLabel>
          <Input
            id="move-recipient"
            placeholder="Wallet address"
            autoComplete="off"
            aria-invalid={recipientProblem !== null}
            value={recipient}
            onChange={(event) => setRecipient(event.target.value.trim())}
          />
          {recipientProblem && <FieldError>{recipientProblem}</FieldError>}
        </Field>
      )}

      <AmountField
        key={`${direction}:${other.kitChain}`}
        label="Amount"
        token="USDC"
        balance={balance}
        amount={amount}
        onAmountChange={setAmount}
        tokenAddon={<TokenLabel token="USDC" />}
      />
      {isOverBalance && (
        <p role="alert" className="text-sm text-destructive">
          That&apos;s more than you have on {from.label}.
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

type StageListProps = { stages: Stages; from: AppChain; to: AppChain | PayoutChain };

function StageList({ stages, from, to }: StageListProps) {
  const labels: Record<BridgeStage, string> = {
    approve: "Approve USDC",
    burn: `Send from ${from.label}`,
    fetchAttestation: "Confirm the transfer",
    mint: `Deliver on ${to.label}`,
  };

  return (
    <ol className="flex flex-col gap-2">
      {BRIDGE_STAGES.map((stage) => (
        <li key={stage} className="flex items-center gap-2">
          <StageIcon status={stages[stage]} />
          <span className={stages[stage] === "waiting" ? "text-muted-foreground" : undefined}>
            {labels[stage]}
          </span>
        </li>
      ))}
    </ol>
  );
}

function StageIcon({ status }: { status: StageStatus }) {
  if (status === "active") return <Spinner className="size-4" />;
  if (status === "done") return <CheckCircle className="size-4 text-success" />;
  if (status === "failed") return <XmarkCircle className="size-4 text-destructive" />;
  return <Circle className="size-4 text-muted-foreground" />;
}

function describeDestination(quote: BridgeQuote) {
  return "recipient" in quote
    ? `at ${formatAddress(quote.recipient)} on ${quote.to.label}`
    : `in your account on ${quote.to.label}`;
}
