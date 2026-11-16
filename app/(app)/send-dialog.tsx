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
  Community,
  OpenNewWindow,
  SendDiagonal,
} from "iconoir-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  erc20Abi,
  getAddress,
  isAddress,
  isAddressEqual,
  type Address,
} from "viem";
import { useReadContract } from "wagmi";
import { PAYMENT_MEMO_MAX_LENGTH } from "@/app/constants";
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
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import {
  failOperation,
  type OperationError,
  type OperationReceipt,
} from "@/lib/app-kit/core";
import { executeSend } from "@/lib/app-kit/send";
import { ARC } from "@/lib/chains";
import type { Contact } from "@/lib/contacts";
import {
  formatAddress,
  formatTokenAmount,
  parseAmount,
} from "@/lib/format";
import { reportError } from "@/lib/monitoring";
import { TOKEN_ADDRESSES, TOKENS, type Token } from "@/lib/tokens";
import { AmountField } from "./amount-field";
import { useBusinessWallet, useRefreshBalances } from "./business-wallet";
import { DetailRow } from "./details-section";
import {
  ConfirmWithPasskeyButton,
  FailureStep,
  ProcessingStep,
  StepHeader,
  SuccessStep,
} from "./flow-steps";
import { TokenLabel, TokenSelect } from "./token-select";
import { addPaymentMemo } from "./transactions/actions";
import { useIdempotencyKey } from "./use-idempotency-key";

// What an Operator's permission lets them pay. Owners have no limits.
export type SendLimits = { paymentLimit: bigint; tokens: readonly Token[] };

type SendDialogProps = {
  accountAddress: Address;
  contacts: Contact[];
  limits: SendLimits | null;
};

export function SendDialog({ accountAddress, contacts, limits }: SendDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button type="button" variant="outline" size="lg" />}
      >
        <SendDiagonal data-icon="inline-start" />
        Send
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <SendFlow
          accountAddress={accountAddress}
          contacts={contacts}
          limits={limits}
          onComplete={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

type SendStep = "details" | "review" | "processing" | "failed" | "sent";

type SendFlowProps = {
  accountAddress: Address;
  contacts: Contact[];
  limits: SendLimits | null;
  onComplete: () => void;
};

function SendFlow({
  accountAddress,
  contacts,
  limits,
  onComplete,
}: SendFlowProps) {
  const tokens = limits?.tokens ?? TOKENS;
  const wallet = useBusinessWallet();
  const refreshBalances = useRefreshBalances();
  const idempotencyKey = useIdempotencyKey();
  const [step, setStep] = useState<SendStep>("details");
  const [token, setToken] = useState<Token>(tokens[0]);
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const recipientAnchor = useComboboxAnchor();
  const [memo, setMemo] = useState("");
  const [failure, setFailure] = useState<OperationError | null>(null);
  const [receipt, setReceipt] = useState<OperationReceipt | null>(null);
  // Both are read up front, so switching currency doesn't wait on a read.
  const cashBalances = {
    USDC: useCashBalance(accountAddress, "USDC"),
    EURC: useCashBalance(accountAddress, "EURC"),
  };
  const cash = cashBalances[token];

  const sendAmount = parseAmount(amount);
  const balanceAfter = (cash.data ?? BigInt(0)) - sendAmount;
  const isOverBalance = balanceAfter < 0;
  const isOverLimit = limits !== null && sendAmount > limits.paymentLimit;
  const recipientProblem = describeRecipientProblem(recipient, accountAddress);
  const savedContact = isAddress(recipient)
    ? contacts.find((contact) => isAddressEqual(contact.address, recipient))
    : undefined;
  const recipientName = savedContact?.name ?? recipient;
  const shortRecipientName = savedContact?.name ?? formatAddress(recipient);
  const amountText = `${formatTokenAmount(sendAmount)} ${token}`;
  const trimmedMemo = memo.trim();

  function selectToken(next: Token) {
    setToken(next);
    setAmount("");
  }

  async function confirm() {
    setStep("processing");
    let sent: OperationReceipt;
    try {
      sent = await wallet.runOnce(idempotencyKey.key, (keyed) =>
        executeSend(keyed, {
          token,
          amount: sendAmount,
          recipient: getAddress(recipient),
        }),
      );
      setReceipt(sent);
      setStep("sent");
    } catch (caught) {
      setFailure(failOperation("send", caught, "The payment didn't go through."));
      setStep("failed");
      return;
    }
    if (trimmedMemo !== "") await saveMemo(sent.transactionHash);
    await cash.refetch();
    refreshBalances(sent);
  }

  // The payment went through either way, so a lost memo is reported on its own.
  async function saveMemo(transactionHash: string) {
    try {
      await addPaymentMemo(transactionHash, trimmedMemo);
    } catch (caught) {
      reportError({ area: "payment memo", error: caught });
      toast.error("Payment sent, but its memo wasn't saved.");
    }
  }

  if (step === "review") {
    return (
      <SendReview
        recipientName={recipientName}
        amountText={amountText}
        token={token}
        memo={trimmedMemo}
        balanceAfter={balanceAfter}
        onBack={() => setStep("details")}
        onConfirm={confirm}
      />
    );
  }

  if (step === "processing") {
    return (
      <ProcessingStep
        title="Sending payment"
        description={`Sending ${amountText} to ${shortRecipientName}. Confirm with your passkey if asked.`}
      />
    );
  }

  if (step === "failed" && failure) {
    return (
      <FailureStep
        title="Payment didn't go through"
        error={failure}
        onRetry={confirm}
        onBack={() => setStep("review")}
      />
    );
  }

  if (step === "sent" && receipt) {
    return (
      <SuccessStep
        title="Payment sent"
        description={`${amountText} to ${shortRecipientName}.`}
        onDone={onComplete}
      >
        <dl className="flex flex-col gap-1">
          <DetailRow label="To" valueClassName="text-right break-all">
            {recipientName}
          </DetailRow>
          <DetailRow label="Amount">{amountText}</DetailRow>
          {trimmedMemo !== "" && (
            <DetailRow label="Memo" valueClassName="text-right break-all">
              {trimmedMemo}
            </DetailRow>
          )}
        </dl>
        {receipt.explorerUrl && (
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            nativeButton={false}
            render={
              <a href={receipt.explorerUrl} target="_blank" rel="noreferrer" />
            }
          >
            View on Arc explorer
            <OpenNewWindow data-icon="inline-end" />
          </Button>
        )}
      </SuccessStep>
    );
  }

  if (cash.status === "pending") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Send money</DialogTitle>
        </DialogHeader>
        <Spinner className="mx-auto size-8 text-muted-foreground" />
      </>
    );
  }

  if (cash.status === "error") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Send money</DialogTitle>
          <DialogDescription role="alert">
            We couldn&apos;t read your balance. Try again.
          </DialogDescription>
        </DialogHeader>
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={() => cash.refetch()}
        >
          Try again
        </Button>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Send money</DialogTitle>
      </DialogHeader>

      <AmountField
        key={token}
        label="Sending"
        token={token}
        balance={cash.data}
        amount={amount}
        onAmountChange={setAmount}
        tokenAddon={
          tokens.length > 1 ? (
            <TokenSelect
              label="Currency to send"
              value={token}
              onValueChange={selectToken}
            />
          ) : (
            <TokenLabel token={token} />
          )
        }
      />
      {isOverBalance && (
        <p role="alert" className="text-sm text-destructive">
          That&apos;s more than you have available.
        </p>
      )}
      {limits && isOverLimit && !isOverBalance && (
        <p role="alert" className="text-sm text-destructive">
          That&apos;s more than your limit of{" "}
          {formatTokenAmount(limits.paymentLimit)} {token} per payment.
        </p>
      )}

      <Field data-invalid={recipientProblem !== null}>
        <FieldLabel htmlFor="send-recipient">To</FieldLabel>
        <InputGroup ref={recipientAnchor}>
          <InputGroupInput
            id="send-recipient"
            placeholder="Wallet address (0x…)"
            autoComplete="off"
            aria-invalid={recipientProblem !== null}
            value={recipient}
            onChange={(event) => setRecipient(event.target.value.trim())}
          />
          <InputGroupAddon align="inline-end">
            <Combobox
              items={contacts}
              value={savedContact ?? null}
              onValueChange={(contact: Contact | null) => {
                if (contact) setRecipient(contact.address);
              }}
              itemToStringLabel={(contact: Contact) => contact.name}
            >
              <ComboboxTrigger
                aria-label="Contacts"
                render={<InputGroupButton size="xs" variant="ghost" />}
              >
                <Community data-icon="inline-start" />
                Contacts
              </ComboboxTrigger>
              <ComboboxContent anchor={recipientAnchor}>
                <ComboboxInput
                  showTrigger={false}
                  placeholder="Search contacts"
                />
                <ComboboxEmpty>
                  {contacts.length === 0
                    ? "No contacts yet"
                    : "No matching contact"}
                </ComboboxEmpty>
                <ComboboxList>
                  {(contact: Contact) => (
                    <ComboboxItem key={contact.id} value={contact}>
                      {contact.name}
                      <span className="ml-auto font-mono text-xs text-muted-foreground">
                        {formatAddress(contact.address)}
                      </span>
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </InputGroupAddon>
        </InputGroup>
        {recipientProblem && <FieldError>{recipientProblem}</FieldError>}
      </Field>

      <Field>
        <FieldLabel htmlFor="send-memo">Memo (optional)</FieldLabel>
        <Input
          id="send-memo"
          placeholder="Invoice 1042"
          maxLength={PAYMENT_MEMO_MAX_LENGTH}
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
        />
      </Field>

      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={
          sendAmount === BigInt(0) ||
          isOverBalance ||
          isOverLimit ||
          recipient === "" ||
          recipientProblem !== null
        }
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

// Payments come from cash on Arc only.
function useCashBalance(accountAddress: Address, token: Token) {
  return useReadContract({
    address: TOKEN_ADDRESSES[token],
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [accountAddress],
    chainId: ARC.viem.id,
  });
}

function describeRecipientProblem(recipient: string, accountAddress: Address) {
  if (recipient === "") return null;
  if (!isAddress(recipient)) return "That isn't a valid wallet address.";
  if (isAddressEqual(recipient, accountAddress)) {
    return "That's this account's own address.";
  }
  return null;
}

type SendReviewProps = {
  recipientName: string;
  amountText: string;
  token: Token;
  memo: string;
  balanceAfter: bigint;
  onBack: () => void;
  onConfirm: () => void;
};

function SendReview({
  recipientName,
  amountText,
  token,
  memo,
  balanceAfter,
  onBack,
  onConfirm,
}: SendReviewProps) {
  return (
    <>
      <StepHeader title="Review" onBack={onBack} />

      <dl className="flex flex-col gap-1">
        <DetailRow label="To" valueClassName="text-right break-all">
          {recipientName}
        </DetailRow>
        <DetailRow label="Amount">{amountText}</DetailRow>
        {memo !== "" && (
          <DetailRow label="Memo" valueClassName="text-right break-all">
            {memo}
          </DetailRow>
        )}
        <DetailRow label="Fee" valueClassName="text-success">
          Free
        </DetailRow>
        <DetailRow label="Balance after">
          {formatTokenAmount(balanceAfter)} {token}
        </DetailRow>
      </dl>

      <ConfirmWithPasskeyButton onClick={onConfirm} />
    </>
  );
}
