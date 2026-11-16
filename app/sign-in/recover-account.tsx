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
import { isBackupPasskeyFor, recoverAccount } from "@/lib/business-account";
import {
  confirmNewPasskey,
  createPasskey,
  describePasskeyError,
  forgetPasskey,
  requestBackupPasskey,
} from "../passkey";

type RecoverAccountProps = {
  email: string;
  accountAddress: Address;
  oldPasskeyId: string;
  onCancel: () => void;
};

export function RecoverAccount({
  email,
  accountAddress,
  oldPasskeyId,
  onCancel,
}: RecoverAccountProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function recover() {
    const backupPasskey = await requestBackupPasskey();
    if (!(await isBackupPasskeyFor(accountAddress, backupPasskey))) {
      setError(`That passkey isn't the backup for ${email}.`);
      return;
    }

    const newPasskey = await createPasskey(email, "main");
    await recoverAccount(accountAddress, backupPasskey, newPasskey);
    // Signing in with the new passkey is what proves to our server it's now the account's.
    await confirmNewPasskey(newPasskey);
    await forgetPasskey(oldPasskeyId);
    router.replace("/");
  }

  async function handleClick() {
    setPending(true);
    setError(undefined);
    try {
      await recover();
    } catch (caught) {
      console.error(caught);
      setError(
        describePasskeyError(
          caught,
          "We couldn't recover your account. Try again.",
        ),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <p className="text-center">
        Use your backup passkey. You&apos;ll then create a new passkey and sign in with it.
      </p>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col">
        <Button
          type="button"
          onClick={handleClick}
          disabled={pending}
          size="lg"
        >
          {pending ? "Recovering…" : "Use backup passkey"}
        </Button>
        <Button
          type="button"
          onClick={onCancel}
          disabled={pending}
          variant="link"
        >
          Back
        </Button>
      </div>
    </div>
  );
}
