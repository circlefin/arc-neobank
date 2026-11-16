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

import { ArrowLeft, CheckCircle, Key, WarningTriangle } from "iconoir-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import type { OperationError } from "@/lib/app-kit/core";

type StepHeaderProps = { title: string; onBack: () => void };

export function StepHeader({ title, onBack }: StepHeaderProps) {
  return (
    <DialogHeader className="flex-row items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Back"
        onClick={onBack}
      >
        <ArrowLeft />
      </Button>
      <DialogTitle>{title}</DialogTitle>
    </DialogHeader>
  );
}

type ConfirmWithPasskeyButtonProps = {
  onClick: () => void;
  pending?: boolean;
  disabled?: boolean;
};

export function ConfirmWithPasskeyButton({
  onClick,
  pending = false,
  disabled = false,
}: ConfirmWithPasskeyButtonProps) {
  return (
    <Button
      type="button"
      size="lg"
      className="w-full"
      onClick={onClick}
      disabled={pending || disabled}
    >
      <Key data-icon="inline-start" />
      {pending ? "Confirming…" : "Confirm with passkey"}
    </Button>
  );
}

// The toast's link to the transaction, when the explorer has one.
export function viewTransactionAction(explorerUrl: string | undefined) {
  if (!explorerUrl) return undefined;
  return { label: "View", onClick: () => window.open(explorerUrl, "_blank") };
}

type ProcessingStepProps = { title: string; description: string };

export function ProcessingStep({ title, description }: ProcessingStepProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <Spinner className="mx-auto size-8 text-muted-foreground" />
    </>
  );
}

type FailureStepProps = {
  title: string;
  error: OperationError;
  onRetry?: () => void;
  onBack: () => void;
};

// What went wrong in plain words, with the raw error kept for developers.
export function FailureStep({ title, error, onRetry, onBack }: FailureStepProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <WarningTriangle className="size-5 text-destructive" />
          {title}
        </DialogTitle>
        <DialogDescription role="alert">{error.message}</DialogDescription>
      </DialogHeader>
      <Collapsible>
        <CollapsibleTrigger
          render={<Button type="button" variant="link" size="xs" className="px-0" />}
        >
          Developer details
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap break-all">
            {error.detail}
          </pre>
        </CollapsibleContent>
      </Collapsible>
      <div className="flex flex-col gap-2">
        {error.canRetry && onRetry && (
          <Button type="button" size="lg" className="w-full" onClick={onRetry}>
            Try again
          </Button>
        )}
        <Button type="button" variant="outline" size="lg" className="w-full" onClick={onBack}>
          Back
        </Button>
      </div>
    </>
  );
}

type SuccessStepProps = {
  title: string;
  description: string;
  onDone: () => void;
  // A receipt: what was done, and where to see it.
  children?: React.ReactNode;
};

export function SuccessStep({
  title,
  description,
  onDone,
  children,
}: SuccessStepProps) {
  return (
    <>
      <CheckCircle
        aria-hidden
        strokeWidth={1}
        className="mx-auto size-16 text-success"
      />
      <DialogHeader className="text-center">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      {children}
      <Button type="button" size="lg" className="w-full" onClick={onDone}>
        Done
      </Button>
    </>
  );
}
