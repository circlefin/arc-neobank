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

import type { WebAuthnKey } from "@zerodev/webauthn-key";
import { Key } from "iconoir-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { Address } from "viem";
import { Button } from "@/components/ui/button";
import { addBackupPasskey } from "@/lib/business-account";
import { createPasskey, describePasskeyError } from "../passkey";

type AddBackupPasskeyButtonProps = {
  email: string;
  passkey: WebAuthnKey;
  accountAddress: Address;
};

export function AddBackupPasskeyButton({
  email,
  passkey,
  accountAddress,
}: AddBackupPasskeyButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function handleClick() {
    setPending(true);
    setError(undefined);
    try {
      const backupPasskey = await createPasskey(email, "backup");
      await addBackupPasskey(passkey, accountAddress, backupPasskey);
      toast.success("Backup passkey added", {
        description: "Use it to get back in if you lose your passkey.",
      });
      // The page reads the backup passkey from the chain, so reload it.
      router.refresh();
    } catch (caught) {
      console.error(caught);
      setError(
        describePasskeyError(
          caught,
          "We couldn't add your backup passkey. Try again.",
        ),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="button" onClick={handleClick} disabled={pending} size="lg">
        <Key data-icon="inline-start" />
        {pending ? "Adding backup passkey…" : "Add backup passkey"}
      </Button>
    </div>
  );
}
