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
  approveOperator,
  type OperatorPermission,
} from "@/lib/business-account";
import { describePasskeyError } from "../../../passkey";
import { ConfirmWithPasskeyButton } from "../../flow-steps";
import { OperatorLimits } from "../../operator-limits";
import { saveApproval } from "./actions";

type ApproveOperatorDialogProps = {
  passkey: WebAuthnKey;
  accountAddress: Address;
  operatorId: string;
  operatorEmail: string;
  permission: OperatorPermission;
};

export function ApproveOperatorDialog({
  passkey,
  accountAddress,
  operatorId,
  operatorEmail,
  permission,
}: ApproveOperatorDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function approve() {
    setPending(true);
    setError(undefined);
    try {
      const approvalSignature = await approveOperator(
        passkey,
        accountAddress,
        permission,
      );
      await saveApproval(operatorId, approvalSignature);
      toast.success("Access approved", {
        description: `${operatorEmail} can now send payments.`,
      });
      setOpen(false);
    } catch (caught) {
      console.error(caught);
      setError(
        describePasskeyError(
          caught,
          "We couldn't approve this operator. Try again.",
        ),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" />}>
        Approve
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Approve operator</DialogTitle>
          <DialogDescription>
            <span className="break-all">{operatorEmail}</span> will be able to
            send payments from this account,
            within these limits, until access ends or you revoke it.
          </DialogDescription>
        </DialogHeader>

        <OperatorLimits
          paymentLimit={permission.paymentLimit}
          tokens={permission.tokens}
          expiresAt={permission.expiresAt}
        />

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <ConfirmWithPasskeyButton onClick={approve} pending={pending} />
      </DialogContent>
    </Dialog>
  );
}
