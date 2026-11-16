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

import { UserPlus } from "iconoir-react";
import { useState } from "react";
import { toast } from "sonner";
import { OPERATOR_ACCESS_DAYS } from "@/app/constants";
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
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AMOUNT_PATTERN, parseAmount } from "@/lib/format";
import { TOKENS, type Token } from "@/lib/tokens";
import { TokenLabel } from "../../token-select";
import { sendOperatorInvite } from "./actions";

type AccessDays = (typeof OPERATOR_ACCESS_DAYS)[number];

const DEFAULT_ACCESS_DAYS: AccessDays = 30;

export function InviteOperatorDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" />}>
        <UserPlus data-icon="inline-start" />
        Invite operator
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <InviteOperatorForm onComplete={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function InviteOperatorForm({ onComplete }: { onComplete: () => void }) {
  const [email, setEmail] = useState("");
  const [paymentLimit, setPaymentLimit] = useState("");
  const [tokens, setTokens] = useState<Token[]>([...TOKENS]);
  const [accessDays, setAccessDays] = useState<AccessDays>(DEFAULT_ACCESS_DAYS);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  function toggleToken(token: Token, checked: boolean) {
    setError(undefined);
    setTokens(
      checked
        ? TOKENS.filter((option) => option === token || tokens.includes(option))
        : tokens.filter((option) => option !== token),
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const problem = await sendOperatorInvite({
        email,
        paymentLimit,
        tokens,
        accessDays,
      });
      if (problem) {
        setError(problem);
        return;
      }
      toast.success("Invite saved", {
        description: `Ask ${email} to sign in with that email to join.`,
      });
      onComplete();
    } catch (caught) {
      console.error(caught);
      setError("We couldn't save the invite. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Invite operator</DialogTitle>
        <DialogDescription>
          Operators can only send payments, within the limits you set here.
        </DialogDescription>
      </DialogHeader>

      <Field>
        <FieldLabel htmlFor="operator-email">Email</FieldLabel>
        <Input
          id="operator-email"
          type="email"
          required
          autoComplete="off"
          value={email}
          onChange={(event) => {
            setError(undefined);
            setEmail(event.target.value);
          }}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="operator-limit">Limit per payment</FieldLabel>
        <InputGroup>
          <InputGroupInput
            id="operator-limit"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={paymentLimit}
            onChange={(event) => {
              if (AMOUNT_PATTERN.test(event.target.value)) {
                setError(undefined);
                setPaymentLimit(event.target.value);
              }
            }}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText>per payment</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription>
          The same amount applies in each currency.
        </FieldDescription>
      </Field>

      <FieldSet>
        <FieldLegend variant="label">Currencies</FieldLegend>
        {TOKENS.map((token) => (
          <Field key={token} orientation="horizontal">
            <Checkbox
              id={`operator-token-${token}`}
              checked={tokens.includes(token)}
              onCheckedChange={(checked) => toggleToken(token, checked)}
            />
            <FieldLabel
              htmlFor={`operator-token-${token}`}
              className="font-normal"
            >
              <TokenLabel token={token} />
            </FieldLabel>
          </Field>
        ))}
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">Access ends after</FieldLegend>
        <ToggleGroup
          variant="outline"
          className="w-full"
          value={[String(accessDays)]}
          onValueChange={(values) => {
            const days = OPERATOR_ACCESS_DAYS.find(
              (option) => String(option) === values[0],
            );
            if (!days) return;
            setError(undefined);
            setAccessDays(days);
          }}
        >
          {OPERATOR_ACCESS_DAYS.map((days) => (
            <ToggleGroupItem key={days} value={String(days)} className="flex-1">
              {days} days
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FieldSet>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={
          pending ||
          email === "" ||
          parseAmount(paymentLimit) === BigInt(0) ||
          tokens.length === 0
        }
      >
        {pending ? "Saving invite…" : "Save invite"}
      </Button>
    </form>
  );
}
