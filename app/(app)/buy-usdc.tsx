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

import { WarningTriangle } from "iconoir-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogDescription } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  mountOnramp,
  requestOnrampSession,
  type OnrampStop,
} from "@/lib/app-kit/onramp";
import { confirmPasskey, describePasskeyError } from "../passkey";
import {
  ConfirmWithPasskeyButton,
  ProcessingStep,
  StepHeader,
  SuccessStep,
} from "./flow-steps";

type Problem = { message: string; canRetry: boolean };

const LOAD_FAILED: Problem = {
  message: "We couldn't load the purchase.",
  canRetry: true,
};

const PAYMENT_FAILED: Problem = {
  message: "Your payment didn't go through.",
  canRetry: true,
};

// Region and identity problems won't change on a retry, so they say so.
const PROBLEMS: Partial<Record<OnrampStop, Problem>> = {
  "unavailable-in-region": {
    message: "Buying USDC isn't available in your region yet.",
    canRetry: false,
  },
  "under-review": {
    message:
      "Your details are still being reviewed. You can buy USDC once they're approved.",
    canRetry: false,
  },
  rejected: {
    message: "We couldn't verify your details, so you can't buy USDC.",
    canRetry: false,
  },
  "payment-failed": PAYMENT_FAILED,
};

// Where the money is once the user pays. The dialog keeps it, so it survives closing this step.
export type PurchaseStatus = "none" | "pending" | "arrived";

type BuyUsdcProps = {
  userId: string;
  passkeyId: string;
  accountAddress: Address;
  purchase: PurchaseStatus;
  onPaid: () => void;
  onArrived: () => void;
  onFailed: () => void;
  onBack: () => void;
  onDone: () => void;
};

export function BuyUsdc({
  userId,
  passkeyId,
  accountAddress,
  purchase,
  onPaid,
  onArrived,
  onFailed,
  onBack,
  onDone,
}: BuyUsdcProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  // Read through a ref, so a new callback from the dialog doesn't remount the widget mid-purchase.
  const purchaseEvents = useRef({ onPaid, onArrived, onFailed });
  useEffect(() => {
    purchaseEvents.current = { onPaid, onArrived, onFailed };
  });
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string>();
  const [isReady, setIsReady] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  // Each attempt mounts the widget with a fresh session, since a session works only once.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!isConfirmed || !container) return;

    let widget: { close: () => void } | undefined;
    let isCancelled = false;
    let isPaid = false;

    function stop(reason: OnrampStop) {
      // A session that timed out before a payment just needs a new one. After a payment, keep waiting for it.
      if (reason === "timed-out") {
        if (!isPaid) setAttempt((current) => current + 1);
        return;
      }
      if (reason === "canceled") return;
      purchaseEvents.current.onFailed();
      setProblem(PROBLEMS[reason] ?? (isPaid ? PAYMENT_FAILED : LOAD_FAILED));
    }

    requestOnrampSession({ userId, accountAddress })
      .then((session) => {
        if (isCancelled) return;
        widget = mountOnramp({
          session,
          container,
          title: "Buy USDC",
          onReady: () => setIsReady(true),
          onStopped: stop,
          onPaid: (settles) => {
            isPaid = true;
            // Some payments land at once and never send a settled event.
            if (!settles) {
              purchaseEvents.current.onArrived();
              return;
            }
            purchaseEvents.current.onPaid();
          },
          onSettled: () => purchaseEvents.current.onArrived(),
        });
      })
      .catch((error: unknown) => {
        console.error("Failed to start the onramp", error);
        if (!isCancelled) setProblem(LOAD_FAILED);
      });

    return () => {
      isCancelled = true;
      widget?.close();
      setIsReady(false);
      setProblem(null);
    };
  }, [attempt, isConfirmed, userId, accountAddress]);

  async function confirm() {
    setIsConfirming(true);
    setPasskeyError(undefined);
    try {
      await confirmPasskey(passkeyId);
      setIsConfirmed(true);
    } catch (caught) {
      console.error(caught);
      setPasskeyError(
        describePasskeyError(
          caught,
          "We couldn't confirm your passkey. Try again.",
        ),
      );
    } finally {
      setIsConfirming(false);
    }
  }

  // A payment can settle just as the widget closes, with no event to tell us. Re-read on the way out.
  useEffect(() => () => router.refresh(), [router]);

  const stage = problem ? "none" : purchase;

  return (
    <>
      {stage === "pending" && (
        <ProcessingStep
          title="Adding money"
          description="Your payment is on its way. It can take a few minutes. You can close this, and we'll tell you when your USDC arrives."
        />
      )}
      {stage === "arrived" && (
        <SuccessStep
          title="Money added"
          description="Your USDC is in your account."
          onDone={onDone}
        />
      )}
      {stage === "none" && <StepHeader title="Buy USDC" onBack={onBack} />}
      {stage === "none" && !isConfirmed && (
        <>
          <DialogDescription>
            Confirm with your passkey to start. Then choose an amount and pay
            with your bank or card. The USDC goes straight to your account.
          </DialogDescription>
          {passkeyError && (
            <p role="alert" className="text-sm text-destructive">
              {passkeyError}
            </p>
          )}
          <ConfirmWithPasskeyButton onClick={confirm} pending={isConfirming} />
        </>
      )}
      {problem && (
        <Alert variant="destructive">
          <WarningTriangle />
          <AlertTitle>{problem.message}</AlertTitle>
          <AlertDescription>
            {problem.canRetry ? "Please try again." : "No money was taken."}
          </AlertDescription>
          {problem.canRetry && (
            <AlertAction>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAttempt((current) => current + 1)}
              >
                Try again
              </Button>
            </AlertAction>
          )}
        </Alert>
      )}
      {/* Stays mounted after a payment, so the widget can still tell us when the money lands. */}
      <div
        className={
          stage === "none" && isConfirmed && !problem
            ? "relative h-[min(40rem,70dvh)]"
            : "hidden"
        }
      >
        {/* The widget can't size itself, so this box sets its height. */}
        <div ref={containerRef} className="size-full overflow-hidden" />
        {!isReady && (
          <Spinner className="absolute inset-0 m-auto size-8 text-muted-foreground" />
        )}
      </div>
    </>
  );
}
