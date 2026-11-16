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

import { Key } from "iconoir-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { requireOwner } from "@/lib/auth";
import { hasBackupPasskey } from "@/lib/business-account";
import { AddBackupPasskeyButton } from "../../add-backup-passkey-button";
import { RecoverPasskeyAlert } from "./recover-passkey-alert";

export default async function SecurityPage() {
  const { email, account } = await requireOwner();
  const backupPasskeyIsOn = await hasBackupPasskey(account.address);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>
            Each time you sign in, we send a code to this email before you use
            your passkey.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Email</p>
          <p>{email}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Passkeys</CardTitle>
          <CardDescription>
            Use your device&apos;s fingerprint, face, or screen lock, or a
            security key, to sign in and approve payments.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-4">
          <ItemGroup className="gap-0">
            <Item className="px-0">
              <ItemMedia variant="icon" className="size-8 rounded-lg bg-muted">
                <Key />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>Passkey</ItemTitle>
                <ItemDescription>
                  Signs you in and approves payments
                </ItemDescription>
              </ItemContent>
            </Item>
            <Item className="px-0">
              <ItemMedia variant="icon" className="size-8 rounded-lg bg-muted">
                <Key />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>Backup passkey</ItemTitle>
                <ItemDescription>
                  {backupPasskeyIsOn
                    ? "Gets you back in if you lose your passkey"
                    : "Not added yet"}
                </ItemDescription>
              </ItemContent>
            </Item>
          </ItemGroup>
          {!backupPasskeyIsOn && (
            <AddBackupPasskeyButton
              email={email}
              passkey={account.passkey}
              accountAddress={account.address}
            />
          )}
          {backupPasskeyIsOn && (
            <RecoverPasskeyAlert
              email={email}
              accountAddress={account.address}
              passkeyId={account.passkey.authenticatorId}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
