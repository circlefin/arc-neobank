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

import type { WebAuthnKey } from "@zerodev/webauthn-key";
import type { Address } from "viem";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AddBackupPasskeyButton } from "./add-backup-passkey-button";

type AccountCardProps = {
  email: string;
  passkey: WebAuthnKey;
  accountAddress: Address;
  hasBackupPasskey: boolean;
};

export function AccountCard({
  email,
  passkey,
  accountAddress,
  hasBackupPasskey,
}: AccountCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Business account</CardTitle>
        <CardDescription className="font-mono break-all">
          {accountAddress}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-4">
        <ol className="flex flex-col gap-2">
          <li className="flex items-center gap-2">
            <Badge variant="outline" className="size-5 p-0 tracking-normal">
              1
            </Badge>
            Your passkey signs you in and approves payments
          </li>
          <li className="flex items-center gap-2 text-muted-foreground">
            <Badge variant="outline" className="size-5 p-0 tracking-normal">
              2
            </Badge>
            {hasBackupPasskey
              ? "Backup passkey is on. Use it to get back in if you lose your passkey."
              : "Add a backup passkey on another device, like your phone"}
          </li>
        </ol>
        {!hasBackupPasskey && (
          <AddBackupPasskeyButton
            email={email}
            passkey={passkey}
            accountAddress={accountAddress}
          />
        )}
      </CardContent>
    </Card>
  );
}
