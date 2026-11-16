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

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Address } from "viem";
import { Button } from "@/components/ui/button";
import { signOut } from "../actions";
import {
  confirmNewPasskey,
  createPasskey,
  describePasskeyError,
  requestPasskey,
} from "../passkey";
import { RecoverAccount } from "./recover-account";

// For a user without an account. Invited, the new passkey joins that business instead of
// opening one. Revoked, only a new invite lets them back in.
export type OperatorAccess =
  | { status: "invited"; businessName: string | null }
  | { status: "revoked" }
  | null;

type PasskeyStepProps = {
  email: string;
  account: { address: Address; passkeyId: string } | null;
  operatorAccess: OperatorAccess;
  hasBackupPasskey: boolean;
};

export function PasskeyStep({
  email,
  account,
  operatorAccess,
  hasBackupPasskey,
}: PasskeyStepProps) {
  const router = useRouter();
  const [recovering, setRecovering] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  if (account && recovering) {
    return (
      <RecoverAccount
        email={email}
        accountAddress={account.address}
        oldPasskeyId={account.passkeyId}
        onCancel={() => setRecovering(false)}
      />
    );
  }

  async function handleClick() {
    setPending(true);
    setError(undefined);
    try {
      // Our server opens or signs into the account only once the passkey signs a login.
      if (account) {
        await requestPasskey();
      } else {
        await confirmNewPasskey(await createPasskey(email, "main"));
      }
      router.replace("/");
    } catch (caught) {
      console.error(caught);
      setError(
        describePasskeyError(
          caught,
          "Something went wrong with your passkey. Try again.",
        ),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <p className="text-center break-words">
        {instructions(email, account !== null, operatorAccess)}
      </p>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col">
        {operatorAccess?.status !== "revoked" && (
          <Button
            type="button"
            onClick={handleClick}
            disabled={pending}
            size="lg"
          >
            {buttonLabel(account !== null, pending)}
          </Button>
        )}

        <div className="flex flex-wrap justify-center">
          {hasBackupPasskey && (
            <Button
              type="button"
              onClick={() => setRecovering(true)}
              disabled={pending}
              variant="link"
            >
              Lost your passkey?
            </Button>
          )}

          <form action={signOut}>
            <Button type="submit" disabled={pending} variant="link">
              Use a different email
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function instructions(
  email: string,
  hasAccount: boolean,
  operatorAccess: OperatorAccess,
) {
  if (hasAccount) return `Use your passkey to sign in as ${email}.`;
  if (operatorAccess?.status === "invited") {
    const business = operatorAccess.businessName ?? "a business account";
    return `You're invited to pay from ${business}. Create a passkey for ${email}, then use it once to confirm.`;
  }
  if (operatorAccess?.status === "revoked") {
    return "Your access to the business account was removed. Ask the owner to invite you again.";
  }
  return `Create a passkey to secure ${email}, then use it once to confirm.`;
}

function buttonLabel(hasAccount: boolean, pending: boolean) {
  if (hasAccount) return pending ? "Signing in…" : "Use passkey";
  return pending ? "Setting up passkey…" : "Create passkey";
}
