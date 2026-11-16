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
import { useState } from "react";
import { toast } from "sonner";
import type { Address } from "viem";
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
  revokeOperator,
  type OperatorPermission,
} from "@/lib/business-account";
import { describePasskeyError } from "../../../passkey";
import { ConfirmWithPasskeyButton, ProcessingStep } from "../../flow-steps";
import { removeOperator } from "./actions";

type RevokeOperatorDialogProps = {
  passkey: WebAuthnKey;
  accountAddress: Address;
  operatorId: string;
  operatorEmail: string;
  // Set once approved. The account removes it onchain with a passkey, so the approval can't be used.
  approvedPermission: OperatorPermission | null;
  // As of page load, so it only picks the button. Revoking checks again.
  needsPasskey: boolean;
};

export function RevokeOperatorDialog({
  passkey,
  accountAddress,
  operatorId,
  operatorEmail,
  approvedPermission,
  needsPasskey,
}: RevokeOperatorDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function revoke() {
    setPending(true);
    setError(undefined);
    try {
      if (approvedPermission) {
        await revokeOperator(passkey, accountAddress, approvedPermission);
      }
      await removeOperator(operatorId);
      toast.success("Access revoked", {
        description: `${operatorEmail} can no longer send payments.`,
      });
      setOpen(false);
    } catch (caught) {
      console.error(caught);
      setError(
        describePasskeyError(caught, "We couldn't revoke access. Try again."),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button type="button" variant="destructive" size="sm" />}
      >
        Revoke
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {pending && needsPasskey ? (
          <ProcessingStep
            title="Revoking access"
            description={`Removing ${operatorEmail}'s permission from your account.`}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Revoke access</DialogTitle>
              <DialogDescription>
                <span className="break-all">{operatorEmail}</span> will lose
                access to this account right away.
              </DialogDescription>
            </DialogHeader>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            {needsPasskey ? (
              <ConfirmWithPasskeyButton onClick={revoke} pending={pending} />
            ) : (
              <Button
                type="button"
                variant="destructive"
                size="lg"
                className="w-full"
                onClick={revoke}
                disabled={pending}
              >
                {pending ? "Revoking…" : "Revoke access"}
              </Button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
